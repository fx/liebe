import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-level assertions on the forecast stylesheet.
 *
 * jsdom applies no stylesheet, and what matters here are properties of the
 * DECLARATIONS rather than of a computed value: is the sheet layered so a theme
 * can still reach it, do the columns share a rhythm that does not derive from
 * their content, does the high–low emphasis survive an appearance where colour
 * carries nothing. Same pattern as `anatomy/__tests__/anatomyStyles.test.ts`.
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
 * — which names the very things these tests look for — can neither satisfy an
 * assertion nor break one.
 */
const source = read('../WeatherForecast.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first rule whose selector list ends with the given selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  const [, body] = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source) ?? []
  expect(body, `no rule for ${selector}`).toBeDefined()
  return body
}

describe('the forecast stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would be the one piece of the forecast no theme could
    // restyle (docs/specs/theming/index.md).
    expect(source).toContain(
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    )

    const withoutLayerStatements = source.replace(/@layer[^{]*;/g, '')
    const inLayer = /@layer liebe-base \{([\s\S]*)\}\s*$/.exec(withoutLayerStatements)?.[1] ?? ''
    // Every selector in the sheet is inside that one block.
    expect(withoutLayerStatements.replace(/@layer liebe-base \{[\s\S]*\}\s*$/, '').trim()).toBe('')
    expect(inLayer).toContain('.weather-forecast-strip')
  })

  it('gives the columns one rhythm that does not derive from their content', () => {
    /*
     * The option doc's rule: "equal-width columns whose width does not derive
     * from their content, so '2 PM' and '10 AM' columns align". Equal tracks
     * come from the grid, and the `minmax(0, …)` floor is what lets a track be
     * narrower than its content wants instead of the widest label setting every
     * column's width.
     */
    const strip = ruleBody('.weather-forecast-strip')
    expect(strip).toContain('display: grid')
    expect(strip).toContain('grid-auto-columns: minmax(0, 1fr)')
    expect(strip).toContain('grid-auto-flow: column')

    // No column count in the sheet: how many columns there are is a capacity
    // decision (`forecastPresentation.ts`), never a style.
    expect(source).not.toMatch(/repeat\(/)
  })

  it('spends no width between the tracks the capacity rule counted', () => {
    /*
     * `floor(contentWidth / minColumnWidth)` is the option doc's formula and it
     * budgets columns only — so a gap between tracks is width the rule cannot
     * see, and every track pays for it. At 220px the rule picks five 44px
     * hourly columns; four 4px gaps would leave 40.8px each, which is the
     * shrink-below-the-floor the rule exists to prevent. Separation comes from
     * padding inside the track instead.
     */
    const strip = ruleBody('.weather-forecast-strip')
    expect(strip).toContain('column-gap: 0')
    expect(strip).not.toMatch(/^\s*gap:/m)
    // The row gap survives: `tall` spaces its rows down an axis no capacity
    // rule budgets.
    expect(strip).toContain('row-gap: var(--space-1)')
    expect(ruleBody('.weather-forecast-column')).toContain('padding-inline')
  })

  it('runs the tall tier’s strip down the tile instead', () => {
    const vertical = ruleBody("[data-orientation='vertical'] > .weather-forecast-strip")
    expect(vertical).toContain('grid-auto-flow: row')
  })

  it('gives the section label eyebrow typography', () => {
    // 11px / 650 / uppercase / 0.09em tracking, faint colour
    // (docs/specs/design-system — "Typography").
    const label = ruleBody('.weather-forecast-label')
    expect(label).toContain('font-size: 11px')
    expect(label).toContain('font-weight: 650')
    expect(label).toContain('letter-spacing: 0.09em')
    expect(label).toContain('text-transform: uppercase')
    expect(label).toContain('color: var(--liebe-faint)')
  })

  it('carries the high–low emphasis in weight, not in colour or opacity', () => {
    /*
     * Over condition artwork every foreground is some white, so a colour
     * difference cannot carry the pair — and fading the low would spend
     * contrast the scrim was strengthened to buy (change 0030 PR 1 measured the
     * artwork foreground at 7.0:1 over the worst ground a photograph can
     * present). Weight and the Radix size step cost none.
     */
    expect(ruleBody('.weather-forecast-high')).toContain('font-weight: 700')
    expect(ruleBody('.weather-forecast-low')).toContain('font-weight: 400')
    expect(ruleBody('.weather-forecast-low')).not.toContain('opacity')
    expect(ruleBody('.weather-forecast-low')).not.toContain('color')
  })

  it('sets the temperatures in tabular figures', () => {
    // Numeric displays MUST use `tabular-nums` (docs/specs/design-system —
    // "Typography"), which is also what keeps a column of readings aligned.
    expect(ruleBody('.weather-forecast-temps')).toContain('font-variant-numeric: tabular-nums')
  })

  it('collapses the slot a fully-omitted forecast leaves behind', () => {
    // An empty flex child still collects the body's gap, so omitting every
    // column would otherwise leave a band of blank space where the strip was.
    expect(ruleBody('.weather-card-extra:empty')).toContain('display: none')
  })

  it('pins no colour of its own', () => {
    /*
     * Every colour on this card arrives through the token contract — including
     * over artwork, where the scope re-points the tokens (`WeatherCard.css`).
     * A literal here would be a declaration no theme could reach, and one the
     * artwork scope could not override.
     */
    expect(source).not.toMatch(/color:\s*(#|rgb|hsl|white|black)/i)
  })
})
