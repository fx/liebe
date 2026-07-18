// Machinery for forcing the HA frontend to define one of its lazily-loaded
// custom elements (e.g. <ha-camera-stream>) from inside a custom panel: poll
// window.loadCardHelpers into existence, create a throwaway Lovelace card whose
// rendering imports the module chunk that defines the element, then wait for
// customElements.whenDefined with a timeout.

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

// Single-flight per element tag: N consumers share one promise, so only a
// single throwaway card is ever created per tag (the first caller's trigger
// config wins for that tag).
const ladderPromises = new Map<string, Promise<boolean>>()

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

async function runBootstrapLadder(
  tag: string,
  triggerCardConfig: Record<string, unknown>
): Promise<boolean> {
  if (customElements.get(tag)) {
    return true
  }

  const loadCardHelpers = await waitForLoadCardHelpers()
  if (!loadCardHelpers) {
    // Standalone dev (no HA frontend) or the helpers never appeared.
    return false
  }

  try {
    const helpers = await loadCardHelpers()
    // Throwaway card: creating a live card makes the HA frontend import the
    // module chunk that defines the requested element. The card element
    // itself is never attached to the DOM.
    helpers.createCardElement(triggerCardConfig)
    return await whenDefinedWithTimeout(tag)
  } catch {
    return false
  }
}

/**
 * Ensure the HA frontend has defined `tag`, using `triggerCardConfig` as the
 * throwaway Lovelace card that forces the defining chunk to load. Resolves
 * true once the element is defined, false when it cannot be bootstrapped.
 *
 * Only successful (true) resolutions stay cached. A false resolution can be
 * transient (loadCardHelpers poll window missed on a slow HA load, whenDefined
 * timeout), so caching it would pin every later consumer to 'unavailable'
 * until a full page reload — instead the entry is evicted so the next caller
 * retries the ladder.
 */
export function ensureHaElement(
  tag: string,
  triggerCardConfig: Record<string, unknown>
): Promise<boolean> {
  let promise = ladderPromises.get(tag)
  if (!promise) {
    promise = runBootstrapLadder(tag, triggerCardConfig).then((defined) => {
      if (!defined) {
        ladderPromises.delete(tag)
      }
      return defined
    })
    ladderPromises.set(tag, promise)
  }
  return promise
}

// Test-only: jsdom cannot reset the custom-element registry between tests, but
// the ladder cache must be resettable so each test can exercise the ladder.
export function resetEnsureHaElementForTests(): void {
  ladderPromises.clear()
}
