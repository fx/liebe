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
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
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

      expect(rule).toContain(`--liebe-part-color: var(${base});`)
      expect(rule).toContain(`--part-tint: var(${tint});`)
      expect(rule).toContain(`--part-text: var(${text});`)
      expect(rule).toContain(`--part-glyph: var(${text});`)
    }
  })

  /**
   * The published half of the resolution, and what a theme is entitled to read.
   *
   * A theme that wants a part's own hue used to have to restate this whole
   * ten-way mapping, because the only names carrying the answer were
   * `--part-*` — internal plumbing the anatomy reserves the right to rename
   * (docs/changes/0036-theming-contract-gaps.md PR 3). The contract token is
   * declared per part instead, and the internal one is DERIVED from it: two
   * declarations of one hue would be a pair that can silently disagree, and the
   * disagreement would show as a theme colouring a part differently from the
   * part itself.
   */
  it('publishes the resolved hue as a contract token the internals derive from', () => {
    for (const { name } of domainColors) {
      const rule = ruleBody(`[data-color='${name}']`)
      expect(rule).toContain(`--liebe-part-color: var(${domainColorTokens(name).base});`)
      expect(rule).toContain('--part-color: var(--liebe-part-color);')
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

    // Inactive carries no state, so it carries no hue either.
    const inactive = ruleBody('.liebe-icon,\n  .liebe-pill,\n  .liebe-chip')
    expect(inactive).toContain('background: var(--gray-a3);')
    expect(inactive).toContain('color: var(--liebe-faint);')
  })

  /**
   * The glyph is drawn in the domain's TEXT step, in BOTH appearances, and the
   * "both" is the whole of change 0035 PR 5. PR 2 established the light half —
   * a step-9 glyph on a 20% tint of itself over the light card measures 1.40:1
   * for amber and 2.50:1 for green, and no tint alpha fixes it — and left dark
   * on the base hue, believing the tint lands dark enough for the saturated
   * step to read. Measured per hue per theme, it does not: `media` misses at
   * 2.80:1 under Default, and `ok`, `alert` and `media` miss at 2.89, 2.47 and
   * 2.17 under Liquid Glass. So there is no per-appearance switch left to
   * assert — the appearance-awareness lives in the `-text` token, which every
   * theme pins per appearance. Asserted on the declarations because jsdom
   * applies no stylesheet; the figures come from decoded pixels, in the PR.
   */
  describe('the glyph on its tint', () => {
    it('takes the glyph role, not the saturated solid one', () => {
      const active = ruleBody(
        '.liebe-icon[data-active],\n  .liebe-pill[data-active],\n  .liebe-chip[data-active]'
      )
      expect(active).toContain('color: var(--part-glyph);')
      expect(active).not.toContain('color: var(--part-color);')
    })

    it('resolves the glyph role to the text step for every triplet', () => {
      for (const { name } of domainColors) {
        const { text, base } = domainColorTokens(name)
        const rule = ruleBody(`[data-color='${name}']`)

        expect(rule).toContain(`--part-glyph: var(${text});`)
        // And not the base hue, which is what dark used to take and what the
        // measurement above rules out. `--liebe-part-color` and `--part-color`
        // still carry the base, so this has to be read off the glyph line
        // rather than off the rule as a whole.
        const glyphLine = rule.split(';').find((line) => line.includes('--part-glyph'))
        expect(glyphLine).not.toContain(`var(${base})`)
      }
    })

    it('keys nothing in this sheet off the appearance', () => {
      /*
       * The rule this pins is an EXCLUSION, and it is what the collapse buys.
       * An appearance selector as an ANCESTOR of a part leaks through nested
       * themes: a light `<Theme>` inside a dark root — the workshop's
       * appearance split, the panel's fullscreen modal — is still a descendant
       * of the dark root, so a dark rule written that way keeps matching inside
       * the light pane. PR 2 avoided that by declaring per appearance on the
       * theme root; PR 5 removes the need entirely, because the token resolves
       * at the nearest root by itself. So this sheet should now mention the
       * appearance NOWHERE — a reintroduced selector of either shape is the
       * defect, and asserting "none" is what forbids both.
       */
      expect([...source.matchAll(/\.dark|\.light\b/g)]).toEqual([])
    })
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

/**
 * The label on a pill or a chip, which the tint pattern deliberately does not
 * colour: the pattern's hue is calibrated for a glyph at 3:1 and a 12.5px label
 * needs 4.5:1, which no end of the triplet clears on a 20% tint.
 *
 * A theme that fills the part solid rather than tinting it has a different
 * ground under the same label, and until change 0036 PR 3 had no way to say so
 * — the two colours were literals behind `liebe-pill-label` / `liebe-chip-label`,
 * internal class names the selector contract explicitly withholds. Reading them
 * from tokens is the fix, and the tokens defaulting to the two values that were
 * literals here is what makes it inert for every theme that does not fill.
 */
describe('the label on a part', () => {
  it('takes its colour from a token in each state, defaulting to the old neutral', () => {
    // The default is a `var()` FALLBACK rather than a declaration on the root,
    // and that is the load-bearing half. A custom property is substituted at
    // the element that declares it, so `--liebe-part-label: var(--liebe-muted)`
    // on `.liebe-root` would resolve the neutral there and inherit the answer —
    // dropping a `--liebe-muted` set anywhere between the root and the label,
    // which these two rules honoured when the neutral was written here and the
    // rest of the sheet still does. Unset, the fallback resolves at the label.
    expect(ruleBody('.liebe-pill-label,\n  .liebe-chip-label')).toContain(
      'color: var(--liebe-part-label, var(--liebe-muted));'
    )
    expect(
      ruleBody(
        '.liebe-pill[data-active] .liebe-pill-label,\n  .liebe-chip[data-active] .liebe-chip-label'
      )
    ).toContain('color: var(--liebe-part-label-active, var(--liebe-fg));')
  })

  it('reaches the neutral only through the token', () => {
    // The point of the tokens is that these two rules stop deciding. A bare
    // `color: var(--liebe-muted)` left behind in either — the form they both
    // had — would be a label a theme still could not recolour, which is the
    // whole defect. The neutral may appear only as the token's fallback.
    const rules = [
      ruleBody('.liebe-pill-label,\n  .liebe-chip-label'),
      ruleBody(
        '.liebe-pill[data-active] .liebe-pill-label,\n  .liebe-chip[data-active] .liebe-chip-label'
      ),
    ]
    for (const rule of rules) {
      expect(rule).not.toContain('color: var(--liebe-muted);')
      expect(rule).not.toContain('color: var(--liebe-fg);')
    }
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

  it('leaves the long axis of the fill and the leading edge to Radix', () => {
    // Radix positions both from the live value, with an inset pair on the main
    // axis; declaring that axis here would fight the drag.
    const horizontalFill = ruleBody(
      ".liebe-slider[data-orientation='horizontal'] .liebe-slider-fill"
    )
    expect(horizontalFill).not.toMatch(/\binline-size:|\binset-inline/)

    const verticalFill = ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-fill")
    expect(verticalFill).not.toMatch(/\bblock-size:|\binset-block/)

    expect(ruleBody(".liebe-slider[data-orientation='horizontal'] .liebe-slider-thumb")).toContain(
      'block-size: var(--liebe-control-height);'
    )
    expect(ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-thumb")).toContain(
      'inline-size: var(--liebe-control-height);'
    )
  })

  it('covers the whole cross-axis of the track in both orientations', () => {
    // "In **both** orientations the fill MUST cover the track's full cross-axis"
    // (docs/specs/design-system — "Card anatomy"). Asserted on the declarations
    // rather than on a measured box because jsdom lays nothing out; the
    // browser-level measurement is `tests/e2e/slider-fill-geometry.spec.ts`.
    expect(ruleBody(".liebe-slider[data-orientation='horizontal'] .liebe-slider-fill")).toContain(
      'block-size: 100%;'
    )
    expect(ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-fill")).toContain(
      'inset-inline: 0;'
    )
  })

  it('anchors the vertical fill to the track rather than to the text flow', () => {
    /*
     * The vertical fill is absolutely positioned, so with no inline inset its
     * inline position comes from the static position — text flow — and the
     * `text-align: center` a `tall` card body sets moved a full-width fill to
     * the track's midline, where the track's `overflow: hidden` clipped the half
     * hanging past its edge. `inset-inline` pins both edges to the track, so no
     * inherited property can move it again, and there is no cross-axis size
     * declaration left to disagree with the insets.
     */
    const verticalFill = ruleBody(".liebe-slider[data-orientation='vertical'] .liebe-slider-fill")
    expect(verticalFill).toContain('inset-inline: 0;')
    expect(verticalFill).not.toMatch(/\binline-size:/)

    // And the fill has to be the absolutely-positioned box those insets resolve
    // against the track for — the track is what establishes the containing block.
    expect(ruleBody('.liebe-slider-fill')).toContain('position: absolute;')
    expect(ruleBody('.liebe-slider-track')).toContain('position: relative;')
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
