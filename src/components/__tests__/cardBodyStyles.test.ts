import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-level assertions on the card body — the sheet that turns `CardBody`'s
 * four slots into the tier shapes, in the same spirit as
 * `cardShellStyles.test.ts` and `anatomy/__tests__/anatomyStyles.test.ts`.
 *
 * The body's shape is the one part of a tier that jsdom cannot see at all: it
 * applies no stylesheet and lays nothing out, so `data-arrangement` and
 * `data-control-size` are the whole of what a rendered test can check (they are
 * pinned by `controlCardTierLayouts.test.tsx`). Where a control lands *inside*
 * the shape the attribute selected is a property of these declarations, and this
 * file is where that is checkable — the vertical slider sitting against a
 * `tall` tile's leading edge was exactly such a defect, invisible to every
 * rendered assertion (docs/changes/0028-slider-rendering-fixes.md).
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
 * Comments are stripped before anything is asserted, so the prose in the sheets
 * — which names the very declarations these tests look for — can neither satisfy
 * an assertion nor break one.
 */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const body = stripComments(read('../CardBody.css'))
/**
 * The shell's sheet is read too, for the one cross-sheet fact the centring
 * depends on: `.liebe-card-controls` is declared there, and it is *because* that
 * row spans the band that the band's own centring cannot reach the control
 * inside it.
 */
const shell = stripComments(read('../GridCard.css'))

/** Body of the first rule with the given selector, in the given sheet. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `no rule for ${selector}`).not.toBeNull()
  return match![1]
}

describe('card body stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would put card layout beyond a theme's reach.
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    expect(body).toContain(statement)

    const rules = body.replace(statement, '').trim()
    expect(rules.startsWith('@layer liebe-base {')).toBe(true)
    expect(rules.endsWith('}')).toBe(true)
    expect(rules.indexOf('@layer')).toBe(rules.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    expect(body).not.toContain('!important')
  })
})

describe('the tall arrangement centres its vertical control', () => {
  /**
   * "A vertical slider MUST also render horizontally centred within whatever
   * region hosts it, not pinned to the region's leading edge"
   * (docs/specs/design-system — "Card anatomy").
   *
   * TWO declarations hold that rule, and this block asserts both in the order
   * they take effect, because only the first is load-bearing as the sheet stands
   * today. Measured in Chromium on the rendered `tall` light, cover, fan and
   * `input_number` cards (88px cell → 64px body, 42px control):
   *
   *   - as shipped                             slider centre − region centre = 0
   *   - band stretched, row centring kept      0
   *   - band stretched, row centring dropped   −11 (half the leftover width)
   *
   * So `align-items: center` is what centres the control now — it makes the band
   * a fit-content item that hugs the 42px control — and the row's own centring is
   * the guard that keeps the rule true if the band is ever stretched. Asserting
   * only the guard would have been a test that passes with the rule broken.
   */
  it('centres the band itself, which is what puts the control on the tile’s midline', () => {
    const tall = ruleBody(body, ".liebe-card-body[data-arrangement='tall']")
    expect(tall).toContain('align-items: center;')
  })

  it('also centres inside the band, so a stretched band cannot left-flush the control', () => {
    // `.liebe-card-controls` spans whatever box it is in (`inline-size: 100%`),
    // so a stretched band would hand the control a full-width row to sit at the
    // leading edge of — this is what stops that.
    expect(ruleBody(shell, '.liebe-card-controls')).toContain('inline-size: 100%;')

    const band = ruleBody(body, '.liebe-card-body-fill > .liebe-card-controls')
    expect(band).toContain('justify-content: center;')
    // The block axis is the band's own purpose, asserted with it: the control
    // only gets the height the icon and the meta leave by stretching into it.
    expect(band).toContain('align-self: stretch;')
  })

  it('takes the room the icon and the meta leave, without pushing them off the tile', () => {
    // The band's own contract, which the centring above rides on: it grows into
    // the leftover height and shrinks rather than overflowing (a flex item's
    // automatic minimum size is its content).
    const band = ruleBody(body, '.liebe-card-body-fill')
    expect(band).toContain('flex: 1 1 auto;')
    expect(band).toContain('min-block-size: 0;')
  })
})

describe('the row line', () => {
  it('keeps its own distribution, which the band’s centring must not reach', () => {
    /*
     * `row` and `full` put the control on the line, where a content-width
     * control is sized against the tile's trailing edge and a filling one takes
     * the free space from its leading edge. Neither is centred, and the centring
     * above is scoped to the band precisely so it cannot become so: the two
     * selectors are siblings under `.liebe-card-body`, and a rule written on
     * `.liebe-card-controls` alone would have restyled every row.
     */
    expect(ruleBody(body, '.liebe-card-body-line > .liebe-card-controls')).toContain(
      'justify-content: flex-end;'
    )
    expect(
      ruleBody(
        body,
        ".liebe-card-body[data-control-size='fill'] > .liebe-card-body-line > .liebe-card-controls"
      )
    ).toContain('justify-content: normal;')
  })
})
