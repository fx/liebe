import { useEffect, useRef, useState } from 'react'
import { ensureHaElement, isHaFrontendContext } from '~/utils/haFrontend'

export type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

// Re-attempt schedule while 'unavailable' inside an HA frontend context. A
// transient bootstrap miss (loadCardHelpers poll window missed on a slow HA
// load, whenDefined timeout) must not pin an already-mounted card to the still
// image forever — but each attempt creates a throwaway Lovelace card and can
// wait up to 10 s on whenDefined, so on a frontend where the element can NEVER
// define, an uncapped fixed-interval loop would churn forever. Retries
// therefore back off exponentially from the base interval (15 s → 30 s → 60 s
// → ... capped at 5 min per gap) and stop for good after a total attempt cap:
// past it the card stays 'unavailable' permanently for this mount.
export const BOOTSTRAP_RETRY_INTERVAL_MS = 15_000
export const BOOTSTRAP_RETRY_MAX_DELAY_MS = 5 * 60_000
export const BOOTSTRAP_RETRY_MAX_ATTEMPTS = 10

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
  // Total retry attempts consumed by the backoff loop below; reset when the
  // entity changes (a genuinely new bootstrap target gets a fresh schedule).
  const retryAttemptsRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    retryAttemptsRef.current = 0
    bootstrapCameraStream(entityId).then((defined) => {
      if (!cancelled) {
        setReadiness(defined ? 'ready' : 'unavailable')
      }
    })
    return () => {
      cancelled = true
    }
  }, [entityId])

  // While 'unavailable' in an HA context, keep re-attempting the ladder (with
  // the backoff schedule above) so a card mounted during a transient miss
  // converges with later-mounted streaming cards once the frontend catches
  // up. Standalone is excluded: it can never become an HA frontend
  // (ensureHaElement caches that negative permanently), so retrying would be
  // pointless churn.
  useEffect(() => {
    if (readiness !== 'unavailable' || !isHaFrontendContext()) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const scheduleNext = () => {
      // Attempt cap reached: stay 'unavailable' permanently for this mount —
      // this frontend evidently cannot define the element.
      if (retryAttemptsRef.current >= BOOTSTRAP_RETRY_MAX_ATTEMPTS) return
      const delay = Math.min(
        BOOTSTRAP_RETRY_INTERVAL_MS * 2 ** retryAttemptsRef.current,
        BOOTSTRAP_RETRY_MAX_DELAY_MS
      )
      timeoutId = setTimeout(() => {
        timeoutId = null
        retryAttemptsRef.current += 1
        void bootstrapCameraStream(entityId).then((defined) => {
          if (cancelled) return
          if (defined) {
            setReadiness('ready')
          } else {
            scheduleNext()
          }
        })
      }, delay)
    }
    scheduleNext()
    return () => {
      cancelled = true
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [readiness, entityId])

  return readiness
}
