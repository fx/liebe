/**
 * The design system's own content-box observation, shared across every card on
 * the screen.
 *
 * Spec: docs/specs/design-system/index.md — "Size-adaptive layouts", which asks
 * for **"a single shared observation, not a per-card one"**. Both halves of
 * that phrase are honoured here: the measurement belongs to the parts that own
 * the boxes — the shell's own content box, and the `tall` control band the body
 * lays out — rather than to any card (a card never measures the DOM —
 * docs/changes/0011-layout-tiers.md), and one `ResizeObserver` instance serves
 * every mounted tile rather than one per tile. A dashboard is a wall of cards,
 * so the difference between one observer with fifty targets and fifty observers
 * is real: the browser dispatches one callback batch per frame instead of fifty.
 *
 * **The band is not a card measuring itself.** "A capacity a card cannot derive
 * from [tier, span and content width] is one the design system owes it as
 * another such signal, never one the card measures for itself"
 * (docs/specs/design-system — "Cross-axis fit"), and the long-axis capacity of a
 * vertical control is exactly such a capacity: it is the tile's height less the
 * inset, the icon circle, the meta block and the gaps, none of which a card
 * knows. `CardBody` owns the band element, is one implementation shared by every
 * card, and publishes the capacity to the control decision — which is the signal
 * being supplied rather than a card reaching into the DOM.
 *
 * Deliberately module-scope. The observer has no state of its own beyond the
 * targets it is watching, and each subscriber gets only its own element's box,
 * so nothing is shared between two subscribers except the instrument.
 */

/**
 * A content box, on both axes.
 *
 * Both are published because two contracts read this instrument and each needs
 * a different axis: the shell's own box answers "how much width is left for
 * content" (`useCardContentWidth`), and the `tall` control band's answers "how
 * long is the vertical control the tier is about to render" — the long-axis
 * capacity change 0042's cross-axis-fit rules require and that nothing else can
 * derive, since the icon circle, the meta block and the gaps all come out of the
 * tile's height before the band is given what is left
 * (docs/specs/design-system/index.md — "Cross-axis fit").
 *
 * Logical names rather than `width`/`height` because the boxes are read as
 * cross axis and long axis, which is what `ResizeObserver` reports too.
 */
export interface ContentBoxSize {
  inlineSize: number
  blockSize: number
}

type ContentBoxListener = (size: ContentBoxSize) => void

const listeners = new Map<Element, ContentBoxListener>()

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
      listeners.get(entry.target)?.(
        size
          ? { inlineSize: size.inlineSize, blockSize: size.blockSize }
          : { inlineSize: entry.contentRect.width, blockSize: entry.contentRect.height }
      )
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
export function observeContentBox(
  element: Element,
  listener: ContentBoxListener
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
 * The inline half, for the shell — which is the only consumer that wants a
 * width and nothing else.
 *
 * A wrapper rather than a second registration, so the two consumers share one
 * `ResizeObserver` and one listener map. They never share a target: the shell
 * watches its own content box and the body watches the `tall` band, and the map
 * is keyed by element.
 */
export function observeContentWidth(
  element: Element,
  listener: (width: number) => void
): (() => void) | undefined {
  return observeContentBox(element, ({ inlineSize }) => listener(inlineSize))
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
