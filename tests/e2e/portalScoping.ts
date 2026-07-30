/**
 * Reading a mirrored user stylesheet back, for the containment assertion in
 * `theming.spec.ts`.
 *
 * Deliberately a module of its own, free of `@playwright/test`, for one reason:
 * the containment check is a security-adjacent gate, and a gate has to be shown
 * to fail on the thing it is watching for. Inside a `page.evaluate` callback
 * nothing here could be exercised without a browser and a stack; out here it is
 * ordinary code with ordinary tests (`tests/unit/portalScoping.test.ts`), which
 * is where the probe lives — including the case that matters, a selector that
 * really does escape the container.
 */

/**
 * Splits a selector list on its TOP-LEVEL commas only.
 *
 * `String.split(',')` is wrong here and wrong in a way that specifically bites
 * this change: the user-layer rewrite emits `.liebe-portal-root:is(S)`, so
 * commas inside `:is()` — and inside `:not()`, `:where()`, `:nth-child(… of …)`
 * and any attribute value — are exactly what the mirrored sheet is now full of.
 * A naive split turns one correctly-bounded selector into fragments like
 * `.liebe-portal-root:is(.a` and `.b)`.
 *
 * Both directions of that are bad, and the second is worse. A fragment can fail
 * the boundedness check and report a leak that does not exist; or it can fail to
 * look like anything at all and quietly pass, which turns the negative test into
 * a gate with a hole. The whole point of the assertion is that it would notice.
 */
export function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index]

    if (character === '\\') {
      index += 1
    } else if (character === '"' || character === "'") {
      index = endOfString(selectorText, index)
    } else if (character === '(' || character === '[') {
      depth += 1
    } else if (character === ')' || character === ']') {
      depth -= 1
    } else if (character === ',' && depth === 0) {
      parts.push(selectorText.slice(start, index))
      start = index + 1
    }
  }

  parts.push(selectorText.slice(start))

  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/** Index of the closing quote of the string starting at `start`. */
function endOfString(text: string, start: number): number {
  const quote = text[start]

  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === quote) return index
  }

  return text.length
}

/**
 * The two shapes the rewrite emits: the container as the subject, and a
 * descendant of it as the subject. Anything after the closing parenthesis is
 * the pseudo-element tail, which does not move the subject.
 */
const BOUNDED_PREFIXES = ['.liebe-portal-root:is(', '.liebe-portal-root :is(']

/**
 * The selectors that are NOT confined to the portal container — what a real
 * leak looks like from the outside.
 *
 * Matched against the exact shapes the rewrite produces rather than against
 * "starts with `.liebe-portal-root`", because that looser reading passes things
 * that genuinely escape: `.liebe-portal-root ~ .x` selects a SIBLING of the
 * container, and `.liebe-portal-root-ish` is a different class entirely. The
 * assertion is worth only as much as the predicate under it.
 */
export function unboundedSelectors(selectors: string[]): string[] {
  return selectors.filter(
    (selector) => !BOUNDED_PREFIXES.some((prefix) => selector.startsWith(prefix))
  )
}
