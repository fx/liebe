import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { domainColorTokens, domainColors } from '~/theme/tokens'

/**
 * Source-level assertions on the anatomy stylesheet, in the same spirit as
 * `src/theme/__tests__/tokens.test.ts`: jsdom applies no stylesheet, and the
 * properties that matter here are properties of the declarations — is the sheet
 * layered, does colour arrive through the triplet tokens, is anything pinned to
 * a literal — not of a computed value.
 */

/**
 * The specifier goes through a variable deliberately: Vite rewrites a *literal*
 * `new URL('./x', import.meta.url)` into an asset URL, which is no longer a
 * `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/**
 * Comments are stripped before anything is asserted, so the prose in the sheet
 * — which names the very things these tests forbid, `!important` among them —
 * can neither satisfy an assertion nor break one.
 */
const source = read('../anatomy.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The class names the theming spec makes public API. */
const CONTRACT_CLASSES = [
  'liebe-icon',
  'liebe-name',
  'liebe-state',
  'liebe-slider',
  'liebe-pill',
  'liebe-chip',
  'liebe-value',
  'liebe-spark',
]

/** Bodies of every rule whose selector list ends with the given selector. */
function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(
    ([, body]) => body
  )
}

/** Body of the first rule with the given selector. */
function ruleBody(selector: string): string {
  const [body] = ruleBodies(selector)
  expect(body, `no rule for ${selector}`).toBeDefined()
  return body
}

describe('anatomy stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would be the one piece of the anatomy no theme could
    // restyle.
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
    expect(source).toContain(statement)

    const body = source.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    // `!important` in the base layer would beat the theme and user layers that
    // are supposed to win.
    expect(source).not.toContain('!important')
  })

  it('styles every class the selector contract promises', () => {
    for (const className of CONTRACT_CLASSES) {
      expect(source, `no rule targets .${className}`).toMatch(new RegExp(`\\.${className}\\b`))
    }
  })
})

describe('domain colour', () => {
  it('resolves every triplet from its tokens', () => {
    for (const { name } of domainColors) {
      const { base, tint, text } = domainColorTokens(name)
      const rule = ruleBody(`[data-color='${name}']`)

      expect(rule).toContain(`--part-color: var(${base});`)
      expect(rule).toContain(`--part-tint: var(${tint});`)
      expect(rule).toContain(`--part-text: var(${text});`)
    }
  })

  it('never reaches for a Radix hue at the point of use', () => {
    // A part coloured straight from a Radix scale keeps that hue when a theme
    // remaps the triplet — the exact breakage the token indirection prevents.
    const hues = domainColors.map(({ scale }) => scale).join('|')
    expect(source).not.toMatch(new RegExp(`var\\(--(${hues})-`))
  })

  it('pins no colour literal', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(source).not.toMatch(/\brgba?\(/i)
  })

  it('applies one tint pattern to every tinted part', () => {
    const active = ruleBody(
      '.liebe-icon[data-active],\n  .liebe-pill[data-active],\n  .liebe-chip[data-active]'
    )
    expect(active).toContain('background: var(--part-tint);')
    expect(active).toContain('color: var(--part-color);')

    // Inactive carries no state, so it carries no hue either.
    const inactive = ruleBody('.liebe-icon,\n  .liebe-pill,\n  .liebe-chip')
    expect(inactive).toContain('background: var(--gray-a3);')
    expect(inactive).toContain('color: var(--liebe-faint);')
  })
})

describe('pill group', () => {
  it('turns the equal-share rule through ninety degrees when it is vertical', () => {
    // The horizontal group shares a row between equal columns; the vertical one
    // a column between equal rows. Same rule, other axis — which is what lets a
    // `tall` tile stack the pills instead of squeezing them (docs/specs/
    // design-system — "Size-adaptive layouts").
    const horizontal = ruleBody('.liebe-pill-group')
    expect(horizontal).toContain('grid-auto-columns: 1fr;')
    expect(horizontal).toContain('grid-auto-flow: column;')

    const vertical = ruleBody(".liebe-pill-group[data-orientation='vertical']")
    expect(vertical).toContain('grid-auto-flow: row;')
    expect(vertical).toContain('grid-auto-rows: 1fr;')
  })
})

describe('embedded slider', () => {
  it('gives the track, the fill and the leading edge the three tint roles', () => {
    // The slider is the tint pattern laid along an axis: neutral ground, 20%
    // tint, saturated mark. Reading anything but the triplet for the last two
    // would leave the control on its old hue when a theme remaps the domain.
    expect(ruleBody('.liebe-slider-track')).toContain('background: var(--liebe-track);')
    expect(ruleBody('.liebe-slider[data-active] .liebe-slider-fill')).toContain(
      'background: var(--part-tint);'
    )
    expect(ruleBody('.liebe-slider[data-active] .liebe-slider-thumb')).toContain(
      'background: var(--part-color);'
    )
  })

  it('stays neutral while inactive, on the same 5% the pattern gives every part', () => {
    expect(ruleBody('.liebe-slider-fill')).toContain('background: var(--gray-a3);')
    expect(ruleBody('.liebe-slider-thumb')).toContain('background: var(--liebe-faint);')
  })

  it('rounds the leading edge from the control-radius token, not a literal', () => {
    // A literal here would leave the thumb rounded under a square-control
    // theme that reshaped the track around it.
    expect(ruleBody('.liebe-slider-thumb')).toContain('border-radius: var(--liebe-control-radius);')
  })

  it('sizes both orientations from the control-height token', () => {
    // Horizontal and vertical are one component and one stylesheet, keyed off
    // the attribute Radix stamps — the spec asks the anatomy for both axes.
    expect(ruleBody(".liebe-slider[data-orientation='horizontal']")).toContain(
      'block-size: var(--liebe-control-height);'
    )
    expect(ruleBody(".liebe-slider[data-orientation='vertical']")).toContain(
      'inline-size: var(--liebe-control-height);'
    )
  })

  it('transitions the fill colour and nothing else', () => {
    // Radix sets the fill's size inline from the live value; transitioning it
    // would make the fill trail the finger dragging it.
    expect(ruleBody('.liebe-slider-fill')).toContain('transition: background-color 280ms ease-out;')
    expect(ruleBody('.liebe-slider-thumb')).toContain(
      'transition: background-color 280ms ease-out;'
    )
  })

  it('gives the fill and the leading edge only their cross-axis size', () => {
    // The long axis belongs to Radix, which positions both from the live value;
    // declaring it here would fight the drag.
    expect(ruleBody(".liebe-slider[data-orientation='horizontal'] .liebe-slider-fill")).toBe(
      '\n    block-size: 100%;\n  '
    )
    expect(ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-fill")).toBe(
      '\n    inline-size: 100%;\n  '
    )
    expect(ruleBody(".liebe-slider[data-orientation='horizontal'] .liebe-slider-thumb")).toContain(
      'block-size: var(--liebe-control-height);'
    )
    expect(ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-thumb")).toContain(
      'inline-size: var(--liebe-control-height);'
    )
  })

  it('reads the value out in the neutral foreground, off the pointer', () => {
    // Text on a tinted surface takes the neutral foreground, like chip and pill
    // labels; and every pixel of the track has to stay draggable.
    const readout = ruleBody('.liebe-slider-readout')
    expect(readout).toContain('color: var(--liebe-fg);')
    expect(readout).toContain('font-family: var(--liebe-font-numeric);')
    expect(readout).toContain('font-variant-numeric: tabular-nums;')
    expect(readout).toContain('pointer-events: none;')
  })

  it('shows a held-back slider as disabled without recolouring it', () => {
    const disabled = ruleBody('.liebe-slider[data-disabled]')
    expect(disabled).toContain('cursor: not-allowed;')
    expect(disabled).toContain('opacity: 0.5;')
  })

  it('keeps the focus ring the anatomy gives every interactive part', () => {
    // Neutral rather than the domain hue, for the contrast reason the pill and
    // chip rule documents — so the thumb joins that rule instead of adding one.
    expect(
      ruleBody(
        '.liebe-pill:focus-visible,\n  button.liebe-chip:focus-visible,\n  .liebe-slider-thumb:focus-visible'
      )
    ).toContain('outline: 2px solid var(--liebe-fg);')
  })
})

describe('touch targets', () => {
  /**
   * The spec's rule for discrete controls is "≥44px in at least one dimension".
   * Both interactive parts meet it on the inline axis, deliberately: meeting it
   * on the block axis would push them past the height their token states, and a
   * tappable chip would then stand taller than the read-only chip beside it.
   *
   * Measured in Chromium under a coarse pointer: `button.liebe-chip` emptied of
   * content lays out at 44×34, and the same button with `min-inline-size`
   * dropped collapses to 24px — so this declaration is what holds the target
   * open, and nothing else will if it goes.
   */
  it('gives each interactive part a ≥44px hit area on the inline axis', () => {
    expect(ruleBody('button.liebe-chip')).toContain('min-inline-size: 44px;')
    expect(ruleBody('.liebe-pill')).toContain('min-inline-size: 44px;')
  })

  it('leaves the chip painted at the height its token states', () => {
    // The target must not be bought by growing the chip: the block axis stays
    // on the token, and the floor lands on `button.liebe-chip` alone so a
    // read-only chip is never widened to match a tappable one.
    const chip = ruleBodies('.liebe-chip').find((body) => body.includes('block-size'))

    expect(chip).toBeDefined()
    expect(chip).toContain('block-size: var(--liebe-chip-height);')
    expect(chip).toContain('min-block-size: var(--liebe-chip-height);')
    expect(chip).not.toContain('min-inline-size')
  })
})

describe('motion', () => {
  it('transitions state changes at the one duration the spec gives', () => {
    const durations = [...source.matchAll(/(\d+)ms/g)].map(([, value]) => value)
    expect(durations.length).toBeGreaterThan(0)
    expect([...new Set(durations)]).toEqual(['280'])
  })

  it('drops the transitions under reduced motion', () => {
    const reducedMotion = ruleBody('@media (prefers-reduced-motion: reduce)')
    expect(reducedMotion).toContain('.liebe-icon,')
    // Every part that declares a transition has to appear here, or reduced
    // motion becomes a promise the sheet only half keeps.
    expect(reducedMotion).toContain('.liebe-slider-fill,')
    expect(reducedMotion).toContain('.liebe-slider-thumb,')
    expect(reducedMotion).toContain('transition: none;')
  })
})
