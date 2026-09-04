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
  /**
   * The `@property` registration, which is the one thing in this sheet that
   * MUST sit outside the layer block — see the two assertions below for why,
   * and `GridCard.css`'s own note at the declaration.
   */
  const PROPERTY_RULE = /@property\s+--liebe-icon-tile-tint\s*\{[^}]*\}/

  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would be the one piece of the shell no theme could
    // restyle.
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    expect(css).toContain(statement)

    // The `@property` registration is lifted out before this is judged, and
    // that is not an exemption being carved for it: it registers a NAME rather
    // than declaring anything, so there is no declaration for a theme to lose
    // to. Every rule that styles something still has to be inside the block.
    const body = css.replace(statement, '').replace(PROPERTY_RULE, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('registers the tint property OUTSIDE every layer, where a parser will honour it', () => {
    // `@property` is a top-level at-rule. Nested inside `@layer` a parser is
    // entitled to ignore it, leaving the property unregistered and the tint's
    // transition inert — and nothing cheap can see that happen: the rule still
    // serialises into the built sheet either way, so "it survived the bundler"
    // is not evidence it was honoured.
    //
    // Asserted as a POSITION rather than as presence, because presence is what
    // the nested form also satisfies. `@property` must appear before the layer
    // block opens, which is the only place in this sheet that is outside one.
    const property = css.match(PROPERTY_RULE)
    expect(property, 'no @property registration for the tint colour').not.toBeNull()

    expect(css.indexOf(property![0])).toBeLessThan(css.indexOf('@layer liebe-base {'))
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

  it('centres the option’s own icon-only tile on a marker of its own', () => {
    // `data-icon-tile` is what the `iconOnly` option stamps, and it is
    // deliberately a second attribute rather than a second producer of the one
    // above: the derived attribute is on every legacy `hideName` +
    // `hideState` card, so a rule that means "the user asked for the icon-only
    // presentation" — this centring and the state tint below — needs a
    // selector that reaches none of them
    // (docs/specs/entity-cards/options/common.md — "Scenario: Existing
    // hideName+hideState tiles are unaffected").
    const iconTile = ruleBody('.liebe-card[data-icon-tile]')
    expect(iconTile).toContain('display: flex;')
    expect(iconTile).toContain('align-items: center;')
    expect(iconTile).toContain('justify-content: center;')

    // And the two are genuinely separate selectors: neither rule's selector
    // list mentions the other attribute, so a theme (or the tint that follows)
    // can target one without the other.
    const centring = rulesIn(css).filter(({ selector }) =>
      /^\.liebe-card\[data-icon-(only|tile)\]$/.test(selector)
    )
    expect(centring).toHaveLength(2)
  })

  describe('the icon-only tile’s state tint', () => {
    /**
     * Whitespace-insensitive, because Prettier wraps a long `color-mix()`
     * across four lines and an assertion pinned to one line would be pinning
     * the formatter rather than the declaration.
     */
    const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

    /** Every rule whose body declares part of the tint. */
    const tintRules = rulesIn(css).filter(({ declarations }) =>
      /--liebe-icon-tile-tint/.test(declarations)
    )

    it('paints the wash OVER the card surface rather than in place of it', () => {
      // The spec's wording is load-bearing: the tint renders "over the card
      // surface" (docs/specs/design-system — "Card anatomy"). The tokens it
      // reads are washes — ~20% active, ~5% inactive — so assigning one to the
      // background, which is how the selection state does it, would REPLACE
      // `--liebe-card-bg` and leave the tile showing whatever is behind the
      // card. A single-colour gradient composites it over the background
      // colour instead, which is also what keeps it honest under a theme whose
      // own surface is translucent.
      const tile = flat(ruleBody('.liebe-card[data-icon-tile]'))

      expect(tile).toContain(
        'background-image: linear-gradient(var(--liebe-icon-tile-tint), var(--liebe-icon-tile-tint));'
      )
    })

    it('restates the surface, which a transparent card does not have', () => {
      // `WeatherCardMinimal` passes `transparent` and forwards `iconOnly`, and
      // `[data-transparent]` clears the tile's background — so without this the
      // wash would composite over the dashboard ground, taking the glyph
      // contrast calibrated against the surface with it. An icon-only tile IS
      // the state surface, so it takes the surface token back.
      expect(ruleBody('.liebe-card[data-icon-tile]')).toContain(
        'background-color: var(--liebe-card-bg);'
      )
    })

    it('outranks the transparent card’s cleared surface', () => {
      // The rule above only wins if it is read after the one it is correcting:
      // `[data-transparent]` and `[data-icon-tile]` are the same specificity,
      // so source order alone decides which background the tile keeps.
      const at = (selector: string) => {
        const index = css.indexOf(`${selector} {`)
        expect(index, `rule not found in the sheet: ${selector}`).toBeGreaterThan(-1)
        return index
      }

      expect(at('.liebe-card[data-icon-tile]')).toBeGreaterThan(at('.liebe-card[data-transparent]'))
    })

    it('reads the triplet’s own tint token, so a theme pinning one is honoured', () => {
      // `--part-tint` is what `anatomy.css` maps `data-color` onto, and what a
      // bulb's live colour overrides inline — one resolution for the tile and
      // for the glyph on it. Deriving the wash from the base hue instead would
      // render this tile differently from every icon circle and pill on a
      // theme that pins a `-tint` companion, which the triplet contract allows
      // (docs/specs/theming — "Stable selector contract").
      expect(flat(ruleBody('.liebe-card[data-icon-tile][data-active]'))).toContain(
        '--liebe-icon-tile-tint: color-mix( in srgb, var(--part-tint) var(--liebe-icon-tile-strength), transparent );'
      )

      const hues = domainColors.map(({ scale }) => scale).join('|')
      for (const { declarations } of tintRules) {
        expect(declarations).not.toMatch(new RegExp(`var\\(--(${hues})-`))
      }
    })

    it('rests an inactive tile on the neutral wash instead of a hue', () => {
      expect(ruleBody('.liebe-card[data-icon-tile]')).toContain(
        '--liebe-icon-tile-tint: var(--gray-a3);'
      )
    })

    it('modulates the tint by the level, off a floor that keeps a dim tile visible', () => {
      // "A level-bearing active entity … SHOULD modulate the tint's strength
      // with its level so a dimmed lamp reads dimmer than a full one"
      // (docs/specs/design-system — "Card anatomy").
      //
      // Both halves of the expression are asserted because each answers a
      // different requirement: the `1` fallback is what leaves a card with no
      // level — a switch, a lock — carrying the undimmed tint, and the 40%
      // floor is what keeps a lamp at 1% visibly on rather than fading its one
      // remaining state signal to nothing.
      expect(flat(ruleBody('.liebe-card[data-icon-tile]'))).toContain(
        '--liebe-icon-tile-strength: calc(40% + 60% * var(--liebe-icon-tile-level, 1));'
      )
    })

    it('reaches no legacy hideName+hideState tile, at the level of the sheet', () => {
      // The regression the contract's unchanged-tiles scenario names
      // (docs/specs/entity-cards/options/common.md — "Scenario: Existing
      // hideName+hideState tiles are unaffected"). Asserted over EVERY rule
      // that declares any part of the tint rather than over the two this
      // change wrote, because the defect it guards against is a later rule
      // adding the derived attribute to a tint selector list — which no
      // assertion naming today's selectors could see.
      expect(tintRules.length).toBeGreaterThan(0)
      for (const { selector } of tintRules) {
        expect(selector, selector).toContain('[data-icon-tile]')
        expect(selector, selector).not.toContain('data-icon-only')
      }
    })

    it('takes the glyph off a doubled tint by dropping the circle’s own', () => {
      // The glyph's 3:1 clearance is calibrated against ONE 20% tint over the
      // card surface (change 0035 PR 2). Stacking the circle's tint on the
      // tile's would put it on a ground nothing has measured, so the circle
      // stops carrying one here — its colour, which is what makes the glyph
      // read, is untouched.
      const circle = ruleBody('.liebe-card[data-icon-tile] .liebe-icon')
      expect(circle).toContain('background: none;')
      expect(circle).not.toMatch(/\bcolor:/)
    })

    it('moves the tint at the duration the motion rule gives, and not under reduced motion', () => {
      // A gradient layer cannot fade — `background-image` is animatable only
      // discretely — so the colour it is built from is REGISTERED, which makes
      // the property itself interpolable and carries the gradient with it.
      // Without the registration the transition below is inert, so the two are
      // asserted together.
      const registration = ruleBody('@property --liebe-icon-tile-tint')
      expect(registration).toContain("syntax: '<color>';")
      expect(registration).toContain('inherits: false;')

      expect(flat(ruleBody('.liebe-card[data-icon-tile]'))).toContain(
        '--liebe-icon-tile-tint 280ms ease-out'
      )

      // And the redeclared `transition` outranks `.liebe-card`'s, so the
      // reduced-motion block has to name the marker itself: without it the
      // tint would keep fading for a user who asked for no motion.
      expect(ruleBody('@media (prefers-reduced-motion: reduce)')).toContain(
        '.liebe-card[data-icon-tile],'
      )
    })
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

      // Three rules distribute content and are not part of the pair: the two
      // icon-only tiles — the derived one and the option's own — and the row a
      // card puts its control in. Both icon-only rules centre, and both are
      // scoped to an attribute the shell stamps only for the configuration
      // that produced them, so neither can reach an unconfigured card either.
      expect(unscoped).toEqual([
        '.liebe-card[data-icon-only]',
        '.liebe-card[data-icon-tile]',
        '.liebe-card-controls',
      ])
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

      // Each selector of each list, separately: a rule written as a list would
      // otherwise satisfy this on its first line while its second reached into
      // a card's interior.
      const selectors = tileRules.flatMap((rule) => rule.split(',').map((one) => one.trim()))
      expect(selectors.length).toBeGreaterThanOrEqual(tileRules.length)

      for (const selector of selectors) {
        // Every one of them ends at the tile — no descendant part, so nothing
        // here depends on what a card renders inside.
        expect(selector, selector).toMatch(/^\.liebe-card\[data-align-[hv][^ ]*$/)
      }
    })

    it('follows the icon-only rule, so an aligned icon-only tile takes the alignment', () => {
      // Both selectors carry one class and one attribute, so source order is
      // what decides — an icon-only tile with `alignVertical: start` must end
      // up with its glyph at the top rather than centred.
      //
      // Each rule is found by matching PARSED SELECTORS rather than raw text.
      // Keying on the substring `'[data-icon-only] {'` made the assertion turn
      // on brace whitespace, so a reformat would have failed it while the
      // ordering it is about stayed correct; going through `rulesIn` removes
      // the braces from the question entirely.
      //
      // Exactly one rule each, which is the guard against the opposite
      // mistake: a pattern loosened one step too far matches everything, and
      // the comparison is then between two arbitrary positions in the sheet —
      // green, and about nothing. It earned its keep immediately: matching raw
      // text for `[data-align-h|v]` hit the shared rule TWICE, once per
      // selector in its list.
      const at = (pattern: RegExp) => {
        const matching = rulesIn(css).filter(({ selector }) => pattern.test(selector))
        expect(matching, `expected exactly one rule matching ${pattern}`).toHaveLength(1)

        /*
         * Where that rule OPENS — its selector followed by its brace.
         *
         * `indexOf(selector)` is what this said first, and it could not fail:
         * `.liebe-card[data-icon-only]` is a prefix of
         * `.liebe-card[data-icon-only] .liebe-meta:empty`, which sits above the
         * alignment block and does not move, so `indexOf` kept reporting the
         * old position and the comparison stayed green while the icon-only rule
         * sat at the bottom of the sheet. Requiring the brace is what tells a
         * rule apart from one whose selector merely starts the same way —
         * without bringing brace *whitespace* back into the question.
         */
        const escaped = matching[0].selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
        const index = css.search(new RegExp(`${escaped}\\s*\\{`))
        expect(index, `rule not found in the sheet: ${matching[0].selector}`).toBeGreaterThan(-1)

        return index
      }

      // `[data-align-h]` / `[data-align-v]` bare — the pair's shared rule, not
      // the per-value ones, whose attribute selectors carry a value.
      expect(at(/\[data-align-[hv]\](,|$)/)).toBeGreaterThan(at(/\[data-icon-only\]$/))
      // The option's own marker sits under the same rule: "an icon-only tile
      // with `alignVertical: start` shows its icon at the top of the tile"
      // (docs/specs/entity-cards/options/common.md — the alignment pair "MUST
      // compose with `hideName`/`hideState`/`iconOnly`").
      expect(at(/\[data-align-[hv]\](,|$)/)).toBeGreaterThan(at(/\[data-icon-tile\]$/))
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

  it('routes centre-tile pointer input to the background surface, not the body', () => {
    // `CardBody` fills the tile and paints after the absolutely-positioned
    // slider, so without routing a centre-tile drag hit-tests the transparent
    // body and Radix never sees a value change — the panel paints a fill no
    // drag can move. The body goes pointer-transparent while a background
    // surface is mounted; real embedded controls opt back in. Asserted on
    // the declarations because jsdom lays nothing out and `elementFromPoint`
    // is not implemented there; the browser-level proof is the e2e drag
    // asserting a committed HA brightness.
    const [routing] = ruleBodies(
      ".liebe-card:has(> .liebe-slider[data-placement='background']) > :not(.liebe-slider)"
    )
    expect(routing, 'no background hit-routing rule').toBeDefined()
    expect(routing).toContain('pointer-events: none;')
  })

  it('keeps real embedded controls clickable over a background surface', () => {
    // The opt-back-in half of the rule above: pills, buttons, form controls
    // and every interactive ARIA role — including the background slider
    // itself — take `pointer-events: auto` again, so a `full`-tier secondary
    // control still operates. Plain text, icons and meta stay transparent so
    // a drag starting on them reaches the slider. The selector spans lines
    // (Prettier), so it is matched loosely rather than by exact text.
    const optIn = rulesIn(css).find(
      ({ selector, declarations }) =>
        declarations.includes('pointer-events: auto;') && selector.includes("[role='slider']")
    )
    expect(optIn, 'no control opt-back-in rule').toBeDefined()
    expect(optIn!.declarations).toContain('pointer-events: auto;')
    expect(optIn!.selector).toContain("[role='slider']")
    expect(optIn!.selector).toContain("[role='button']")
    expect(optIn!.selector).toContain('button')
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
