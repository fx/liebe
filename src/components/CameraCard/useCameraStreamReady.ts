import { useEffect, useState } from 'react'

export type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => HTMLElement
}

type LoadCardHelpers = () => Promise<CardHelpers>

interface WindowWithCardHelpers {
  loadCardHelpers?: LoadCardHelpers
}

const HELPERS_POLL_INTERVAL_MS = 250
const HELPERS_POLL_ATTEMPTS = 20
const WHEN_DEFINED_TIMEOUT_MS = 10_000

// The bootstrap ladder runs once per app: N camera cards share one promise so
// only a single throwaway card is ever created.
let ladderPromise: Promise<'ready' | 'unavailable'> | null = null

function getLoadCardHelpers(): LoadCardHelpers | undefined {
  return (window as unknown as WindowWithCardHelpers).loadCardHelpers
}

// window.loadCardHelpers may not exist yet on a deep link into the panel
// (HA's frontend defines it lazily). Poll for it briefly before giving up.
function waitForLoadCardHelpers(): Promise<LoadCardHelpers | null> {
  return new Promise((resolve) => {
    let attempts = 0
    const check = () => {
      const loadCardHelpers = getLoadCardHelpers()
      if (typeof loadCardHelpers === 'function') {
        resolve(loadCardHelpers)
        return
      }
      attempts += 1
      if (attempts >= HELPERS_POLL_ATTEMPTS) {
        resolve(null)
        return
      }
      setTimeout(check, HELPERS_POLL_INTERVAL_MS)
    }
    check()
  })
}

function whenDefinedWithTimeout(tagName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), WHEN_DEFINED_TIMEOUT_MS)
    customElements.whenDefined(tagName).then(() => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

async function runBootstrapLadder(entityId: string): Promise<'ready' | 'unavailable'> {
  if (customElements.get('ha-camera-stream')) {
    return 'ready'
  }

  const loadCardHelpers = await waitForLoadCardHelpers()
  if (!loadCardHelpers) {
    // Standalone dev (no HA frontend) or the helpers never appeared.
    return 'unavailable'
  }

  try {
    const helpers = await loadCardHelpers()
    // Throwaway card: creating a live picture-entity card makes the HA
    // frontend import the module chunk that defines <ha-camera-stream>. The
    // card element itself is never attached to the DOM.
    helpers.createCardElement({
      type: 'picture-entity',
      entity: entityId,
      camera_view: 'live',
    })
    const defined = await whenDefinedWithTimeout('ha-camera-stream')
    return defined ? 'ready' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export function ensureCameraStreamElement(entityId: string): Promise<'ready' | 'unavailable'> {
  if (!ladderPromise) {
    ladderPromise = runBootstrapLadder(entityId)
  }
  return ladderPromise
}

// Test-only: jsdom cannot reset the custom-element registry between tests, but
// the ladder cache must be resettable so each test can exercise the ladder.
export function resetCameraStreamReadyForTests(): void {
  ladderPromise = null
}

export function useCameraStreamReady(entityId: string): CameraStreamReadiness {
  const [readiness, setReadiness] = useState<CameraStreamReadiness>('loading')

  useEffect(() => {
    let cancelled = false
    ensureCameraStreamElement(entityId).then((result) => {
      if (!cancelled) {
        setReadiness(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [entityId])

  return readiness
}
