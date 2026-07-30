import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { splitSelectorList, unboundedSelectors } from '../e2e/portalScoping'
import { sanitizeCustomCss } from '~/theme/customCss'

/**
 * The containment assertion in `tests/e2e/theming.spec.ts` is a
 * security-adjacent gate: it is what says a `body { display: none }` carried in
 * an imported dashboard cannot reach the Home Assistant frontend. A gate is
 * worth only as much as its predicate, and the predicate cannot be exercised
 * from inside a `page.evaluate` without a browser and a stack — so it lives in
 * a module of its own and is probed here, on both sides: green on what the
 * rewrite actually emits, red on a selector that genuinely escapes.
 */

/** The selectors a browser would hand back from the mirrored sheet. */
function mirroredSelectorTexts(css: string): string[] {
  const { portalCss } = sanitizeCustomCss(css, { baseUrl: 'https://ha.example/local/liebe/' })
  const texts: string[] = []
  postcss.parse(portalCss).walkRules((rule) => {
    texts.push(rule.selector)
  })
  return texts
}

describe('splitSelectorList', () => {
  it('splits on top-level commas', () => {
    expect(splitSelectorList('.a, .b > .c')).toEqual(['.a', '.b > .c'])
  })

  it('keeps a comma inside a functional pseudo-class', () => {
    // The case that bites this change specifically: the rewrite emits `:is(…)`,
    // so commas inside parentheses are what the mirrored sheet is now full of.
    expect(splitSelectorList('.liebe-portal-root:is(.a, .b)')).toEqual([
      '.liebe-portal-root:is(.a, .b)',
    ])
    expect(splitSelectorList(':not(.a, .b), :nth-child(2n + 1 of .c, .d)')).toEqual([
      ':not(.a, .b)',
      ':nth-child(2n + 1 of .c, .d)',
    ])
  })

  it('keeps a comma inside an attribute value', () => {
    expect(splitSelectorList('[data-x="a,b"], .c')).toEqual(['[data-x="a,b"]', '.c'])
  })

  it('does not treat an escaped quote as opening a string', () => {
    expect(splitSelectorList('.a\\"b, .c')).toEqual(['.a\\"b', '.c'])
  })

  it('drops nothing and invents nothing on an empty list', () => {
    expect(splitSelectorList('')).toEqual([])
    expect(splitSelectorList('.a,,')).toEqual(['.a'])
  })
})

describe('unboundedSelectors', () => {
  it('passes what the rewrite actually emits, including the hostile case', () => {
    // The exact configuration the e2e negative test seeds. `body` survives
    // sanitization intact — nothing about it fetches — and comes out bounded.
    const selectors = mirroredSelectorTexts(
      'body { display: none } .liebe-root { --liebe-c-ok: #010203; }'
    ).flatMap(splitSelectorList)

    expect(selectors.length).toBeGreaterThan(0)
    expect(unboundedSelectors(selectors)).toEqual([])
  })

  it('goes red on a selector that genuinely escapes the container', () => {
    // The probe. Each of these is a real escape and each would pass a looser
    // "starts with .liebe-portal-root" reading: a sibling combinator selects
    // OUTSIDE the container, and a longer class name is a different class.
    const escapes = ['body', '.liebe-portal-root ~ .x', '.liebe-portal-root-ish .y', 'html']

    expect(unboundedSelectors(escapes)).toEqual(escapes)
  })

  it('is what a naive comma split would have broken', () => {
    // Before the top-level split, one correctly-bounded selector became two
    // fragments and the check reported a leak that did not exist. The other
    // direction is worse and is why this is asserted rather than assumed: a
    // fragment that matches nothing at all would have passed silently.
    const bounded = '.liebe-portal-root:is(.a, .b)'

    expect(unboundedSelectors(bounded.split(','))).not.toEqual([])
    expect(unboundedSelectors(splitSelectorList(bounded))).toEqual([])
  })
})
