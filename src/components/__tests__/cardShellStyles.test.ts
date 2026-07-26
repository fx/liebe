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
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
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

    // An emptied meta stack still takes the row's gap otherwise.
    expect(ruleBody('.liebe-card[data-icon-only] .liebe-meta:empty')).toContain('display: none;')
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
