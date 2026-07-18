import { useEffect, useState } from 'react'
import { ensureHaElement, isHaFrontendContext } from '~/utils/haFrontend'

export type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

// Re-attempt cadence while 'unavailable' inside an HA frontend context. A
// transient bootstrap miss (loadCardHelpers poll window missed on a slow HA
// load, whenDefined timeout) must not pin an already-mounted card to the still
// image forever: attempts are cheap (failures are evicted from the ladder
// cache; successes and the already-defined short-circuit resolve instantly),
// so no attempt cap is needed.
export const BOOTSTRAP_RETRY_INTERVAL_MS = 15_000

function bootstrapCameraStream(entityId: string): Promise<boolean> {
  return ensureHaElement('ha-camera-stream', {
    type: 'picture-entity',
    entity: entityId,
    camera_view: 'live',
  })
}

// Bootstrap <ha-camera-stream> via the shared HA frontend ladder: a throwaway
// live picture-entity card forces the frontend to import the chunk that
// defines the element. 'ready' renders the element, 'unavailable' falls back
// to the still image, 'loading' keeps the connecting state.
export function useCameraStreamReady(entityId: string): CameraStreamReadiness {
  const [readiness, setReadiness] = useState<CameraStreamReadiness>('loading')

  useEffect(() => {
    let cancelled = false
    bootstrapCameraStream(entityId).then((defined) => {
      if (!cancelled) {
        setReadiness(defined ? 'ready' : 'unavailable')
      }
    })
    return () => {
      cancelled = true
    }
  }, [entityId])

  // While 'unavailable' in an HA context, keep re-attempting the ladder so a
  // card mounted during a transient miss converges with later-mounted
  // streaming cards once the frontend catches up. Standalone is excluded: it
  // can never become an HA frontend (ensureHaElement caches that negative
  // permanently), so retrying would be pointless churn.
  useEffect(() => {
    if (readiness !== 'unavailable' || !isHaFrontendContext()) return
    let cancelled = false
    const id = setInterval(() => {
      void bootstrapCameraStream(entityId).then((defined) => {
        if (!cancelled && defined) {
          setReadiness('ready')
        }
      })
    }, BOOTSTRAP_RETRY_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [readiness, entityId])

  return readiness
}
