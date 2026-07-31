import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The LCARS fallback rung's arithmetic, checked over **every** colour rather
 * than over a sample.
 *
 * The rung stands in for `contrast-color()` on browsers that have relative
 * colour syntax and not the function, and its input is a live hue — any RGB a
 * lamp can report. `codex` review of change 0035 PR 7 made the objection this
 * file answers: a browser sweep over twenty hues cannot establish an algorithm
 * whose input is unbounded, and it proved the point by finding
 * `rgb(221, 5, 153)` — a colour none of the twenty covered, on which the first
 * version of the rung produced a mid grey at 1.00:1.
 *
 * So the claim is split in two, and neither half is the whole thing:
 * - **this file** proves the arithmetic is right for all 2^24 colours, in
 *   ordinary JavaScript, where exhausting the space costs a couple of seconds;
 * - **`tests/e2e/lcars-fallback-rung.spec.ts`** proves that CSS computes this
 *   arithmetic, by lifting the rule out of the live stylesheet and measuring it
 *   against `contrast-color()` in a real engine.
 *
 * A reconstruction is sound here for the reason AGENTS.md gives — it is
 * *confirming* an algorithm already located, not *finding* a mechanism — but
 * only as long as it stays the same algorithm. That is what
 * {@link CSS_CONSTANTS} is for: every number below is asserted to appear in the
 * stylesheet, so a constant changed in one place and not the other fails here
 * rather than drifting quietly into a proof about arithmetic nobody ships.
 */

/**
 * Indirected through a parameter, as `lcars.test.ts` and `tokens.test.ts` do and
 * for the same reason: Vite rewrites a LITERAL `new URL('./x.css',
 * import.meta.url)` into an asset reference, which is no longer a `file:` URL —
 * the inlined form throws `The URL must be of scheme file` under jsdom, which is
 * how the first version of this file failed.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const LCARS_CSS = read('../themes/lcars.css')

/** The crossover: the L solving (L + 0.05)² = 1.05 × 0.05. */
const CROSSOVER = 0.17913

/** WCAG relative-luminance coefficients. */
const COEFFICIENTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const

/** The sRGB transfer's constants, as the rung's power branch uses them. */
const TRANSFER = { offset: 0.055, divisor: 1.055, exponent: 2.4 } as const

/**
 * Every literal the reconstruction below depends on, each of which must be
 * present in the stylesheet for this file to be about the shipped rung.
 */
const CSS_CONSTANTS = [
  String(CROSSOVER),
  String(COEFFICIENTS.r),
  String(COEFFICIENTS.g),
  String(COEFFICIENTS.b),
  String(TRANSFER.offset),
  String(TRANSFER.divisor),
  String(TRANSFER.exponent),
]

/**
 * The rung's `@supports` block, isolated by brace counting so the assertions
 * below cannot match the disc rule above it — which reads the same token and
 * would satisfy a looser extraction.
 */
function fallbackRungBlock(): string {
  const start = LCARS_CSS.indexOf('@supports not (color: contrast-color(red))')
  expect(start, 'the fallback rung should still be nested under `not (contrast-color)`').not.toBe(
    -1
  )

  let depth = 0
  for (let index = start; index < LCARS_CSS.length; index++) {
    if (LCARS_CSS[index] === '{') depth++
    else if (LCARS_CSS[index] === '}') {
      depth--
      if (depth === 0) return LCARS_CSS.slice(start, index + 1)
    }
  }
  throw new Error('the fallback rung block is unterminated')
}

/** The transfer the rung applies: the power branch, with no linear segment. */
function approximateChannel(value: number): number {
  return ((value / 255 + TRANSFER.offset) / TRANSFER.divisor) ** TRANSFER.exponent
}

/** WCAG's own transfer, piecewise. */
function trueChannel(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('the LCARS fallback rung', () => {
  const block = fallbackRungBlock()

  it('is the arithmetic this file reconstructs', () => {
    for (const constant of CSS_CONSTANTS) {
      expect(block, `the rung should still use ${constant}`).toContain(constant)
    }
  })

  it('branches on a ceiling rather than on a steep ramp', () => {
    /*
     * The distinction is the whole of `codex`'s P1 finding and it is invisible
     * in the output for most colours, so it is asserted on the construct.
     * `clamp(0, delta * 100000, 255)` reads as a switch and is a ramp: any
     * luminance within 0.00255 of the crossover lands inside it and produces a
     * mid grey — a glyph at 1.00:1, worse than the fixed black the rung
     * replaced. `round(up, …)` is the ceiling, so the only reachable outputs are
     * 0 and 1.
     */
    expect(block, 'the branch must be a ceiling').toMatch(
      /round\(\s*up,\s*0\.17913 - var\(--lcars-part-luminance\),\s*1\s*\)/
    )
    expect(block, 'a ramp scaled into the channel range is not a branch').not.toMatch(
      /,\s*255\s*\)/
    )
  })

  it('reaches only black or white, and clears the text floor, for every one of the 2^24 colours', () => {
    // Per-channel lookup tables: the sweep is 16.7M colours and the transfer is
    // the expensive part, but it only ever sees 256 distinct inputs.
    const approximate = new Float64Array(256)
    const exact = new Float64Array(256)
    for (let value = 0; value < 256; value++) {
      approximate[value] = approximateChannel(value)
      exact[value] = trueChannel(value)
    }

    let worstAchieved = Infinity
    let worstColour = ''
    let worstPossible = Infinity
    let maxTransferError = 0
    let disagreements = 0

    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) {
        const partialTrue = COEFFICIENTS.r * exact[r] + COEFFICIENTS.g * exact[g]
        const partialApprox = COEFFICIENTS.r * approximate[r] + COEFFICIENTS.g * approximate[g]
        for (let b = 0; b < 256; b++) {
          const trueLuminance = partialTrue + COEFFICIENTS.b * exact[b]
          const rungLuminance = partialApprox + COEFFICIENTS.b * approximate[b]
          maxTransferError = Math.max(maxTransferError, rungLuminance - trueLuminance)

          // `clamp(0, round(up, x, 1), 1)`: strictly positive → 1, else 0.
          const channel = CROSSOVER - rungLuminance > 0 ? 1 : 0
          const achieved = contrast(trueLuminance, channel)
          if (achieved < worstAchieved) {
            worstAchieved = achieved
            worstColour = `rgb(${r}, ${g}, ${b})`
          }
          worstPossible = Math.min(
            worstPossible,
            Math.max(contrast(trueLuminance, 1), contrast(trueLuminance, 0))
          )
          if ((CROSSOVER - trueLuminance > 0 ? 1 : 0) !== channel) disagreements++
        }
      }
    }

    // The property that matters, and the one the rung exists for.
    expect(
      worstAchieved,
      `the worst foreground the rung picks is ${worstAchieved.toFixed(4)}:1 at ${worstColour}`
    ).toBeGreaterThanOrEqual(4.5)

    /*
     * The transfer approximation's cost, bounded rather than asserted away.
     * 4.5826 is what `contrast-color()` itself achieves at the crossover — no
     * black-or-white choice can beat it — so the rung gives up 0.012 of a ratio
     * to avoid tripling the CSS with a piecewise transfer.
     */
    expect(worstPossible).toBeCloseTo(4.5826, 3)
    expect(worstAchieved).toBeCloseTo(4.5707, 3)
    expect(maxTransferError).toBeLessThan(1e-3)

    /*
     * And the disagreements are confined to the band that error can reach, which
     * is what makes the bound above an explanation rather than a coincidence.
     */
    expect(disagreements).toBeGreaterThan(0)
    expect(disagreements / 2 ** 24).toBeLessThan(0.0001)
  })
})
