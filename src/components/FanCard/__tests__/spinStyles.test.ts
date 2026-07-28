import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FAN_SPIN_FIXED_S } from '../speedSteps'

/**
 * The fan glyph's spin, asserted on the *stylesheet* rather than on a computed
 * value — in the same spirit as `__tests__/cardShellStyles.test.ts`, and for a
 * sharper reason here.
 *
 * jsdom applies no stylesheet and evaluates no media query, so
 * `prefers-reduced-motion` cannot be exercised by rendering. That is also
 * exactly why the gate lives in the sheet: it holds whatever the component
 * decides, so the thing worth pinning is that the rule is *there* and that
 * nothing else can switch the animation back on
 * (docs/specs/entity-cards/options/fan.md — "Icon animation";
 * docs/specs/design-system — "Motion").
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
const css = read('../../../styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the reduced-motion block, if there is one. */
function reducedMotionBlock(): string | undefined {
  const match = css.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\s*\})\s*\}/
  )
  return match?.[1]
}

describe('fan spin stylesheet', () => {
  it('animates the glyph from a duration the card supplies', () => {
    const rule = css.match(/\.liebe-fan-spin\s*\{([^}]*)\}/)?.[1]

    expect(rule, 'no rule for .liebe-fan-spin').toBeDefined()
    expect(rule).toContain('animation:')
    expect(rule).toContain('fan-spin')
    expect(rule).toContain('var(--liebe-fan-spin-duration')
    expect(rule).toContain('infinite')
  })

  it('falls back to the fixed rate when no duration is supplied', () => {
    // A card that forgot the custom property still spins, at the same rate a
    // fan with no percentage gets.
    const rule = css.match(/\.liebe-fan-spin\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rule).toContain(`var(--liebe-fan-spin-duration, ${FAN_SPIN_FIXED_S}s)`)
  })

  it('suppresses the spin under prefers-reduced-motion', () => {
    const block = reducedMotionBlock()

    expect(block, 'no prefers-reduced-motion block').toBeDefined()
    expect(block).toContain('.liebe-fan-spin')
    expect(block).toMatch(/\.liebe-fan-spin\s*\{[^}]*animation:\s*none/)
  })

  it('leaves no second spin class an option could reach for', () => {
    // The card used to pick between `fan-spin-slow` / `-medium` / `-fast`; a
    // leftover class would be an animation the reduced-motion block above does
    // not name, and therefore does not stop.
    expect(css).not.toContain('fan-spin-slow')
    expect(css).not.toContain('fan-spin-medium')
    expect(css).not.toContain('fan-spin-fast')
  })
})
