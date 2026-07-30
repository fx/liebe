import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The activation feedback's reduced-motion path, asserted on the *stylesheet*
 * rather than on a rendered card — in the same spirit as
 * `FanCard/__tests__/spinStyles.test.ts`, and for the same reason.
 *
 * jsdom applies no stylesheet and evaluates no media query, so
 * `prefers-reduced-motion` cannot be exercised by rendering. That is also
 * exactly why the gate lives in the sheet: it holds whatever the component
 * decides, so the thing worth pinning is that the rule is *there* and that
 * nothing else can switch the animation back on
 * (docs/specs/entity-cards/options/scene.md — "Activation feedback";
 * docs/specs/design-system — "Motion").
 *
 * The half that reduced motion must NOT touch — the check appearing at all and
 * holding its ~1.5s — is timing rather than style, and is pinned on fake timers
 * in `ActionCard.test.tsx`. The two halves together are the spec's rule: drop
 * the decoration, keep the evidence.
 */

/**
 * The specifier goes through a variable deliberately: Vite rewrites a *literal*
 * `new URL('./x', import.meta.url)` into an asset URL, which is no longer a
 * `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/** Comments stripped, so the prose cannot satisfy or break an assertion. */
const css = read('../ActionCard.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the reduced-motion block, if there is one. */
function reducedMotionBlock(): string | undefined {
  return css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\s*\})\s*\}/)?.[1]
}

describe('activation feedback stylesheet', () => {
  it('is layered so a theme can restyle it', () => {
    // An unlayered author rule outranks every cascade layer regardless of
    // specificity, which would make this the one part of the card a theme could
    // not reach (docs/specs/theming — "Application mechanism").
    expect(css).toContain(
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    )
    expect(css).toMatch(/@layer\s+liebe-base\s*\{/)
  })

  it('spins the in-flight glyph', () => {
    const rule = css.match(/\.liebe-action-spin\s*\{([^}]*)\}/)?.[1]

    expect(rule, 'no rule for .liebe-action-spin').toBeDefined()
    expect(rule).toContain('animation:')
    expect(rule).toContain('action-spin')
    expect(rule).toContain('infinite')
    expect(css).toMatch(/@keyframes\s+action-spin\s*\{/)
  })

  it('transitions the glyph swaps at the design system’s ~280ms ease-out', () => {
    const rule = css.match(/\.action-card \.liebe-icon > \*\s*\{([^}]*)\}/)?.[1]

    expect(rule, 'no transition rule for the icon slot').toBeDefined()
    expect(rule).toMatch(/transition:[^;]*280ms/)
    expect(rule).toContain('ease-out')
  })

  it('suppresses the spin under prefers-reduced-motion', () => {
    const block = reducedMotionBlock()

    expect(block, 'no prefers-reduced-motion block').toBeDefined()
    expect(block).toMatch(/\.liebe-action-spin\s*\{[^}]*animation:\s*none/)
  })

  it('suppresses the swap transition under prefers-reduced-motion', () => {
    const block = reducedMotionBlock()

    expect(block).toMatch(/\.action-card \.liebe-icon > \*\s*\{[^}]*transition:\s*none/)
  })

  it('leaves no second animation the reduced-motion block does not name', () => {
    // A leftover class would be motion the block above does not stop — the
    // failure mode `FanCard` shipped once with its three speed-band classes.
    const animated = [...css.matchAll(/animation:\s*([a-z-]+)/g)].map((match) => match[1])
    const declared = new Set(animated.filter((name) => name !== 'none'))

    expect([...declared]).toEqual(['action-spin'])
  })
})
