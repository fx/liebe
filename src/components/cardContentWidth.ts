/**
 * The card shell's content-width observation, shared across every shell on the
 * screen.
 *
 * Spec: docs/specs/design-system/index.md — "Size-adaptive layouts", which asks
 * for **"a single shared observation, not a per-card one"**. Both halves of
 * that phrase are honoured here: the measurement is the SHELL's rather than any
 * card's (a card never measures the DOM — docs/changes/0011-layout-tiers.md),
 * and one `ResizeObserver` instance serves every mounted tile rather than one
 * per tile. A dashboard is a wall of cards, so the difference between one
 * observer with fifty targets and fifty observers is real: the browser
 * dispatches one callback batch per frame instead of fifty.
 *
 * Deliberately module-scope. The observer has no state of its own beyond the
 * targets it is watching, and each subscriber gets only its own element's
 * width, so nothing is shared between two shells except the instrument.
 */

type ContentWidthListener = (width: number) => void

const listeners = new Map<Element, ContentWidthListener>()

/**
 * Created on first use, not at module load: importing this file from a
 * non-browser environment (the unit suite before its stub is installed, a
 * server render) must not construct anything.
 */
let observer: ResizeObserver | undefined

function ensureObserver(): ResizeObserver | undefined {
  // A guard rather than an assumption — jsdom implements no `ResizeObserver`,
  // and an absent one must leave the signal unobserved rather than throw on the
  // way to a card.
  if (typeof ResizeObserver === 'undefined') return undefined

  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      // `contentBoxSize` is the modern shape; `contentRect` is the same box in
      // the older one, so the fallback is not a different measurement.
      const [size] = entry.contentBoxSize ?? []
      listeners.get(entry.target)?.(size ? size.inlineSize : entry.contentRect.width)
    }
  })

  return observer
}

/**
 * Watch one element's content box, and stop watching it.
 *
 * Returns a cleanup rather than exposing an `unobserve`, so a caller cannot
 * unregister the listener and leave the target observed — which would leave the
 * shared observer waking for a callback that goes nowhere. Returns `undefined`
 * where there is no observer to use, which is how a caller learns its width
 * will never arrive.
 */
export function observeContentWidth(
  element: Element,
  listener: ContentWidthListener
): (() => void) | undefined {
  const shared = ensureObserver()
  if (!shared) return undefined

  listeners.set(element, listener)
  shared.observe(element)

  return () => {
    listeners.delete(element)
    shared.unobserve(element)
  }
}

/**
 * Drop the shared observer, so the next subscriber builds one from the current
 * `ResizeObserver`.
 *
 * A test seam, and it exists because the sharing is real: the instance is
 * memoised across the whole module, so a spec that installs its own
 * `ResizeObserver` would otherwise be served the one a previous spec's global
 * produced — a stale instrument reporting nothing, which reads exactly like the
 * feature being broken. Nothing in the panel calls this; the global does not
 * change while a panel is running.
 */
export function resetContentWidthObserver(): void {
  observer?.disconnect()
  observer = undefined
  listeners.clear()
}
