import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { domainColors } from '~/theme/tokens'

/**
 * Source-level assertions on the card shell, in the same spirit as
 * `src/components/anatomy/__tests__/anatomyStyles.test.ts`: jsdom applies no
 * stylesheet, and what matters here are properties of the *declarations* — is
 * the sheet layered, does the surface come from tokens, is any themable
 * property still set inline — not of a computed value.
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
 * Comments are stripped before anything is asserted, so the prose — which names
 * the very things these tests forbid, `!important` and inline `backgroundColor`
 * among them — can neither satisfy an assertion nor break one.
 */
const css = read('../GridCard.css').replace(/\/\*[\s\S]*?\*\//g, '')
const shell = read('../GridCard.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

/**
 * Every style rule in the sheet, as selector and declarations.
 *
 * At-rules are skipped rather than parsed: a brace-free body cannot match a
 * block that opens another one, so `@layer`'s, `@media`'s and `@keyframes`'
 * own preludes drop out and the rules nested inside them are matched on their
 * own.
 */
function rulesIn(sheet: string): { selector: string; declarations: string }[] {
  return [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }))
    .filter(({ selector }) => !selector.startsWith('@'))
}

/** Bodies of every rule whose selector list ends with the given selector. */
function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(([, body]) => body)
}

/** Body of the first rule with the given selector. */
function ruleBody(selector: string): string {
  const [body] = ruleBodies(selector)
  expect(body, `no rule for ${selector}`).toBeDefined()
  return body
}

describe('card shell stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would be the one piece of the shell no theme could
    // restyle.
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    expect(css).toContain(statement)

    const body = css.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    expect(css).not.toContain('!important')
  })

  it('builds the tile out of the surface tokens and nothing else', () => {
    const tile = ruleBody('.liebe-card')

    for (const declaration of [
      'background: var(--liebe-card-bg);',
      'border: var(--liebe-card-border);',
      'border-radius: var(--liebe-card-radius);',
      'box-shadow: var(--liebe-card-shadow);',
      'backdrop-filter: var(--liebe-card-blur);',
      'padding: var(--liebe-card-padding);',
      'color: var(--liebe-fg);',
    ]) {
      expect(tile).toContain(declaration)
    }

    // The spec's tile clips its content.
    expect(tile).toContain('overflow: hidden;')
  })

  it('pins no colour literal', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/i)
  })

  it('never reaches for a Radix hue at the point of use', () => {
    // A shell coloured straight from a Radix scale keeps that hue when a theme
    // remaps the triplet — the exact breakage the token indirection prevents.
    const hues = domainColors.map(({ scale }) => scale).join('|')
    expect(css).not.toMatch(new RegExp(`var\\(--(${hues})-`))
    expect(css).not.toMatch(/var\(--accent-/)
  })

  it('colours the two hue-carrying states through the triplets', () => {
    // Selection is one of the UI accents the design system lets carry hue; an
    // error is an alert. Both go through `--liebe-c-*`, so a theme remapping
    // those hues moves the card chrome with everything else.
    const selected = ruleBody('.liebe-card[data-selected]')
    expect(selected).toContain('background: var(--liebe-c-default-tint);')
    expect(selected).toContain('outline: 2px solid var(--liebe-c-default);')

    expect(ruleBody('.liebe-card[data-error]')).toContain(
      'outline: 2px solid var(--liebe-c-alert);'
    )
  })

  it('marks an unavailable card, and does it without dimming the text', () => {
    // The state is drawn, and drawn neutrally: it is not one of the two the
    // design system lets carry hue. It is asserted here because the treatment
    // was invisible before — `opacity-50` was a Tailwind class name in a
    // project with no Tailwind, so it resolved to no rule and an unavailable
    // card was indistinguishable from an available one.
    const unavailable = ruleBody('.liebe-card[data-unavailable]')
    expect(unavailable).toContain('outline: 1px dotted var(--liebe-faint);')

    // No `opacity`: halving the surface contrast would drop the name and state
    // lines under the 4.5:1 floor, which is a worse card than an undimmed one.
    // docs/specs/design-system records this as the sanctioned treatment.
    expect(unavailable).not.toMatch(/\bopacity:/)
  })

  it('marks state with an outline rather than a border', () => {
    // The token contract pins the card's border to `--liebe-card-border`, and
    // an outline takes no layout space — so a card does not resize as it is
    // selected, and a theme that adds a border of its own keeps it.
    for (const state of ['[data-selected]', '[data-error]', '[data-unavailable]']) {
      const body = ruleBody(`.liebe-card${state}`)
      expect(body, state).toMatch(/outline:/)
      expect(body, state).not.toMatch(/\bborder(-color|-width)?:/)
    }
  })

  it('floors each tier through a token rather than a literal', () => {
    // The floor is geometry like the radius and the padding, so it belongs to
    // the token contract: a theme that enlarges the icon circle and the inset
    // has to be able to raise the box they sit in, and a literal here would be
    // the one dimension of the tile it could not reach.
    expect(ruleBody(".liebe-card[data-tier='row']")).toContain(
      'min-block-size: var(--liebe-card-min-height-row);'
    )
    expect(ruleBody(".liebe-card[data-tier='full']")).toContain(
      'min-block-size: var(--liebe-card-min-height-tall);'
    )
  })

  it('strips the surface entirely for a transparent card', () => {
    const transparent = ruleBody('.liebe-card[data-transparent]')
    expect(transparent).toContain('background: none;')
    expect(transparent).toContain('box-shadow: none;')
    expect(transparent).toContain('padding: 0;')
  })

  it('centres the icon-only tile', () => {
    // `hideName` and `hideState` together must stay a valid layout with a
    // centred icon (docs/specs/entity-cards/options/common.md), and the
    // centring belongs in the sheet rather than inline so a theme can restyle
    // it with everything else.
    const iconOnly = ruleBody('.liebe-card[data-icon-only]')
    expect(iconOnly).toContain('display: flex;')
    expect(iconOnly).toContain('align-items: center;')
    expect(iconOnly).toContain('justify-content: center;')

    // An emptied meta stack still takes the row's gap otherwise: measured in a
    // real engine, putting it back into the row moves the centred icon 6px off
    // centre, half the stack's 12px gap.
    //
    // The selector is `:empty`, and this assertion names it rather than a
    // looser `.liebe-meta` match on purpose — a rule that hid the stack
    // unconditionally would take the surviving line with it when only one of
    // the two is hidden. What `:empty` needs in exchange is that the wrapper
    // really has no child nodes once both slots render `null`, which is a
    // property of the components rather than of this file; it is asserted on
    // the rendered DOM in `GridCard.display.test.tsx` ("leaves the meta stack
    // matching :empty when both lines go").
    expect(ruleBody('.liebe-card[data-icon-only] .liebe-meta:empty')).toContain('display: none;')
  })

  describe('the alignment pair', () => {
    it('leaves the unaligned tile in block flow, which is what makes auto free', () => {
      // The load-bearing half of "`auto` renders exactly as before": the tile
      // itself declares no box model, so the rules below are the ONLY thing
      // that can move a card's content — and each of them needs an attribute
      // the shell stamps for a non-`auto` value only.
      const tile = ruleBody('.liebe-card')

      expect(tile).not.toMatch(/\bdisplay:/)
      expect(tile).not.toMatch(/\b(flex-direction|justify-content|align-items|place-content):/)
    })

    it('every rule it adds is scoped to an attribute a non-auto value stamps', () => {
      // Stated over the whole sheet rather than rule by rule, because the risk
      // is a rule that forgot the scope — one unscoped `display: flex` on
      // `.liebe-card` would restyle every card on every dashboard, which is
      // precisely the failure `auto` exists to rule out.
      const unscoped = rulesIn(css)
        .filter(({ declarations }) =>
          /\b(justify-content|align-items|flex-direction)\s*:/.test(declarations)
        )
        .map(({ selector }) => selector)
        .filter((selector) => !/\[data-align-[hv]/.test(selector))

      // Two pre-existing rules distribute content and are not part of the
      // pair: the icon-only tile, and the row a card puts its control in.
      expect(unscoped).toEqual(['.liebe-card[data-icon-only]', '.liebe-card-controls'])
    })

    it('turns the tile into a column, so each axis means one thing', () => {
      // A row direction would swap what the two properties below control the
      // moment a card renders more than one child, which is a mapping no card
      // should have to know about.
      // Matched on the last selector of the pair's shared rule — `ruleBody`
      // finds a rule whose selector list ENDS with what it is given, so this
      // survives the list being rewrapped.
      const tile = ruleBody('.liebe-card[data-align-v]')

      expect(tile).toContain('display: flex;')
      expect(tile).toContain('flex-direction: column;')
    })

    it('maps the horizontal axis onto the cross axis and the vertical onto the main one', () => {
      expect(ruleBody(".liebe-card[data-align-h='start']")).toContain('align-items: flex-start;')
      expect(ruleBody(".liebe-card[data-align-h='center']")).toContain('align-items: center;')
      expect(ruleBody(".liebe-card[data-align-h='end']")).toContain('align-items: flex-end;')

      expect(ruleBody(".liebe-card[data-align-v='start']")).toContain(
        'justify-content: flex-start;'
      )
      expect(ruleBody(".liebe-card[data-align-v='center']")).toContain('justify-content: center;')
      expect(ruleBody(".liebe-card[data-align-v='end']")).toContain('justify-content: flex-end;')
    })

    it('places the tile’s own content box, which is what reaches a card with no body', () => {
      // The seam has to be the tile: a card that renders its own interior — the
      // climate `dial` variant renders no `CardBody`, and legacy climate cards
      // are pinned onto it — would be inert under body-only rules.
      const tileRules = rulesIn(css)
        .map(({ selector }) => selector)
        .filter((selector) => /\[data-align-[hv]/.test(selector))

      for (const selector of tileRules) {
        // Every one of them ends at the tile — no descendant selector, so
        // nothing here depends on what a card renders inside.
        expect(selector.replace(/,\s*/g, ' ').split(/\s+/), selector).not.toContain('.liebe-meta')
        expect(selector, selector).toMatch(/^[^ ]*\.liebe-card\[data-align-[hv][^ ]*$/m)
      }
    })

    it('follows the icon-only rule, so an aligned icon-only tile takes the alignment', () => {
      // Both selectors carry one class and one attribute, so source order is
      // what decides — an icon-only tile with `alignVertical: start` must end
      // up with its glyph at the top rather than centred.
      expect(css.indexOf('[data-align-h]')).toBeGreaterThan(css.indexOf('[data-icon-only] {'))
    })
  })

  it('transitions state changes at the duration the spec gives', () => {
    expect(ruleBody('.liebe-card')).toContain('background-color 280ms ease-out')
  })

  it('keeps press feedback within the spec ceiling, and off the camera card', () => {
    // ≤100ms for a press. The camera is exempt because the transform would
    // establish a containing block that re-traps its in-place fullscreen
    // overlay — see docs/changes/0008.
    const press = ruleBody('.liebe-card:not(.camera-card):active')
    expect(press).toContain('transform: scale(0.98);')
    expect(press).toContain('transition: transform 100ms ease-out;')
  })

  it('drops every animation under reduced motion', () => {
    const reduced = ruleBody('@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('.liebe-card,')
    expect(reduced).toContain('animation: none;')
    expect(reduced).toContain('transition: none;')
  })
})

describe('card shell component', () => {
  /**
   * The whole point of PR 4: an inline `style` declaration outranks every
   * cascade layer, so a themable visual property set inline is unreachable by
   * a theme or by user CSS, whatever the engine does later
   * (docs/specs/theming — "Application mechanism"). What the shell may still
   * set inline is data or affordance, never design.
   */
  it('sets no themable visual property inline', () => {
    // The portal overlay further down the file is not part of the shell's
    // surface, so the assertion is scoped to the card element's own style
    // object. `indexOf` has to start FROM the declaration: the first
    // `return (` in the file belongs to the ESC-handler cleanup, well above
    // it, which would slice backwards to an empty string and make every
    // assertion below vacuously true.
    const start = shell.indexOf('const cardStyle')
    expect(start, 'cardStyle declaration not found').toBeGreaterThan(-1)
    const cardStyle = shell.slice(start, shell.indexOf('return (', start))

    // Anchor: if the slice ever collapses again, this fails loudly instead of
    // silently passing everything.
    expect(cardStyle).toContain('cursor')

    for (const property of [
      'backgroundColor',
      'background:',
      'borderColor',
      'borderWidth',
      'borderRadius',
      'boxShadow',
      'fontFamily',
      'fontSize',
      'letterSpacing',
      'textTransform',
    ]) {
      expect(cardStyle, property).not.toContain(property)
    }
  })

  it('names no Radix hue at the point of use', () => {
    const hues = domainColors.map(({ scale }) => scale).join('|')
    expect(shell).not.toMatch(new RegExp(`var\\(--(${hues})-`))
  })

  it('stamps the contract classes on the tile', () => {
    // `liebe-card` is public API (docs/specs/theming — "Stable selector
    // contract"); `grid-card` is the internal alias existing selectors use.
    expect(shell).toContain("`liebe-card grid-card${className ? ` ${className}` : ''}`")
  })
})
