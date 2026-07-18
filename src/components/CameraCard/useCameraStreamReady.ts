import { useEffect, useState } from 'react'
import { ensureHaElement } from '~/utils/haFrontend'

export type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

// Bootstrap <ha-camera-stream> via the shared HA frontend ladder: a throwaway
// live picture-entity card forces the frontend to import the chunk that
// defines the element. 'ready' renders the element, 'unavailable' falls back
// to the still image, 'loading' keeps the connecting state.
export function useCameraStreamReady(entityId: string): CameraStreamReadiness {
  const [readiness, setReadiness] = useState<CameraStreamReadiness>('loading')

  useEffect(() => {
    let cancelled = false
    ensureHaElement('ha-camera-stream', {
      type: 'picture-entity',
      entity: entityId,
      camera_view: 'live',
    }).then((defined) => {
      if (!cancelled) {
        setReadiness(defined ? 'ready' : 'unavailable')
      }
    })
    return () => {
      cancelled = true
    }
  }, [entityId])

  return readiness
}
