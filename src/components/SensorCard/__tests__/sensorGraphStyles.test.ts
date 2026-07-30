import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listTokenNames } from '~/theme/tokens'

/**
 * Source-level assertions on the sensor card's graph geometry, in the same
 * spirit as `components/__tests__/cardShellStyles.test.ts` and
 * `anatomy/__tests__/anatomyStyles.test.ts`.
 *
 * This is the one part of the tier table jsdom cannot answer at all: it applies
 * no stylesheet and lays nothing out, so "a 3×3 card draws a taller graph than a
 * 2×2" is not observable from a rendered test — the rendered tests can only see
 * that the region exists and which `data-region` it took
 * (`SensorCard.test.tsx`). Whether that region grows, and whether any height is
 * still pinned to a literal, are properties of these declarations, and this file
 * is where they are checkable. A fixed 72px band shipped for a whole change
 * cycle because nothing looked here
 * (docs/changes/0031-sensor-graph-fill.md).
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
 * the very literals these tests forbid, `72px` among them — can neither satisfy
 * an assertion nor break one.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

const graphCss = stripComments(read('../SensorCard.css'))
const bodyCss = stripComments(read('../../CardBody.css'))
const tokensCss = stripComments(read('../../../styles/tokens.css'))
const dialogSource = stripComments(read('../../EntityDetailDialog/DetailHistory.tsx'))

/** Body of the first rule with the given selector, in the given sheet. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  const [, body] = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`)) ?? []
  expect(body, `no rule for ${selector}`).toBeDefined()
  return body!
}

describe('sensor graph stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would put the graph's box beyond a theme's reach.
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
    expect(graphCss).toContain(statement)

    const body = graphCss.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    expect(graphCss).not.toContain('!important')
  })

  it('grows the full-tier graph into the height the tile has left', () => {
    // The tier rule's "large graph": the region takes what the value line and
    // the min/max footer leave, so the added height of a taller tile reaches the
    // graph instead of becoming dead space above and below it.
    const full = ruleBody(graphCss, ".liebe-sensor-graph[data-region='full']")
    expect(full).toContain('flex: 1 1 auto;')
    // A flex item's automatic minimum size is its content, so without this the
    // SVG's intrinsic height would stop it shrinking on a short tile.
    expect(full).toContain('min-block-size: 0;')
    // And nothing pins it: a `block-size` here is the 72px band this change
    // exists to remove, whatever value it carries.
    expect(full).not.toMatch(/(?<!min-|max-)block-size\s*:/)
  })

  it('pins no graph height to a literal', () => {
    // Every fixed graph dimension that remains is a token a theme can reach
    // (docs/specs/design-system — "Token contract"). A px literal anywhere in
    // this sheet is a height no theme can change, which is how the `full` band
    // and the `row` band both came to be unreachable.
    expect(graphCss).not.toMatch(/\d\s*px/)
    expect(ruleBody(graphCss, ".liebe-sensor-graph[data-region='inline']")).toContain(
      'block-size: var(--liebe-graph-height-inline);'
    )
  })

  it('stretches the tall band across the tile', () => {
    // The band's width collapsed to the big value's text, because the box
    // `CardBody` puts a filling `tall` control in is sized to fit its content.
    expect(ruleBody(graphCss, '.liebe-card-body-fill:has(> .liebe-sensor-band)')).toContain(
      'align-self: stretch;'
    )
  })

  it('reserves the space the extremes will actually take', () => {
    // The footer renders empty while the window is loading, so the flexible
    // graph above it cannot borrow the space and then shrink when the extremes
    // land. Two lines rather than one, because "Min 0.0 °C · Max 9.0 °C" is
    // wider than the sensor card's default 2×2 tile — the commonest `full` size
    // wraps, and a one-line reservation would under-reserve exactly there.
    const footer = ruleBody(graphCss, '.liebe-sensor-graph-footer')
    expect(footer).toContain('min-block-size: 2lh;')
    // And nothing truncates the reading to make it fit: the tier table requires
    // both extrema, so the text wraps inside the reserved box rather than
    // ellipsizing out of it.
    expect(footer).not.toContain('text-overflow')
    expect(footer).not.toContain('nowrap')
  })

  it('grows inside the card body without changing what any other card gets', () => {
    // The premise the `flex` above rests on: the body is a full-height column,
    // so "the height the tile has left" is a quantity that exists.
    const body = ruleBody(bodyCss, '.liebe-card-body')
    expect(body).toContain('block-size: 100%;')
    expect(body).toContain('flex-direction: column;')
    // And the growth is the graph's alone. Every card renders `extra` children
    // into this body, so a blanket rule on the body's children would grow
    // content on cards that never asked for it.
    expect(bodyCss).not.toMatch(/\.liebe-card-body\s*>\s*\*/)
    expect(bodyCss).not.toContain('liebe-sensor')
  })
})

describe('graph height tokens', () => {
  it('declares both fixed heights at the literals they replace', () => {
    // Same values as before the tokens existed, so no theme and no card changes
    // appearance on this change (docs/changes/0031-sensor-graph-fill.md).
    expect(tokensCss).toContain('--liebe-graph-height-inline: 32px;')
    expect(tokensCss).toContain('--liebe-graph-height-dialog: 96px;')
  })

  it('catalogues both, so the workshop and the custom-CSS editor document them', () => {
    expect(listTokenNames()).toContain('--liebe-graph-height-inline')
    expect(listTokenNames()).toContain('--liebe-graph-height-dialog')
  })

  it('sizes the detail dialog graph from its token', () => {
    // The dialog's height is fixed by contract — it is the one graph that does
    // not grow — but fixed is not the same as unreachable.
    expect(dialogSource).toContain("'var(--liebe-graph-height-dialog)'")
    expect(dialogSource).not.toMatch(/\d\s*px/)
  })
})
