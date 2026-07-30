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

/**
 * Every style rule in a sheet, as selector and declarations.
 *
 * At-rules are skipped rather than parsed: a brace-free body cannot match a
 * block that opens another one, so `@layer`'s and `@media`'s own preludes drop
 * out and the rules nested inside them are matched on their own.
 */
function rulesIn(css: string): { selector: string; declarations: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }))
    .filter(({ selector }) => !selector.startsWith('@'))
}

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

describe('the alignment pair inside the body', () => {
  /**
   * The refinement half of change 0032: the tile's own rules reach every card,
   * and cannot move anything inside a body that already spans the tile — which
   * `.liebe-card-body` does on both axes.
   */
  it('keeps every arrangement’s own distribution for a card with no alignment stored', () => {
    // The `auto`-costs-nothing claim, stated where it can actually break: these
    // three declarations ARE what `auto` means, and an alignment rule written
    // over them rather than beside them would have changed every card at once.
    expect(ruleBody(body, '.liebe-card-body')).toContain('justify-content: center;')

    const stack = ruleBody(body, ".liebe-card-body[data-arrangement='stack']")
    expect(stack).toContain('align-items: center;')

    const tall = ruleBody(body, ".liebe-card-body[data-arrangement='tall']")
    expect(tall).toContain('justify-content: space-between;')
  })

  it('adds no rule that a card without the attributes can match', () => {
    const unscoped = rulesIn(body)
      .filter(({ declarations }) => /\b(justify-content|align-items)\s*:/.test(declarations))
      .map(({ selector }) => selector)
      .filter((selector) => !/\[data-align-[hv]/.test(selector))

    // Exactly the rules that were here before the pair — the arrangements' own
    // distribution, the row line's trailing edge and its `fill` exception, and
    // the tall band's centring.
    expect(unscoped).toEqual([
      '.liebe-card-body',
      ".liebe-card-body[data-arrangement='stack']",
      ".liebe-card-body[data-arrangement='tall']",
      '.liebe-card-body-line',
      '.liebe-card-body-line > .liebe-card-controls',
      ".liebe-card-body[data-control-size='fill'] > .liebe-card-body-line > .liebe-card-controls",
      '.liebe-card-body-fill',
      '.liebe-card-body-fill > .liebe-card-controls',
    ])
  })

  it('slides the whole body along the tile’s vertical axis', () => {
    // The body is a column in every arrangement, so one rule per value covers
    // `stack`, `tall` and the row shapes at once — including replacing `tall`'s
    // `space-between`, which is the arrangement most visibly its own.
    expect(ruleBody(body, ".liebe-card[data-align-v='start'] .liebe-card-body")).toContain(
      'justify-content: flex-start;'
    )
    expect(ruleBody(body, ".liebe-card[data-align-v='end'] .liebe-card-body")).toContain(
      'justify-content: flex-end;'
    )
  })

  it('slides the stacked arrangements along the cross axis', () => {
    expect(ruleBody(body, ".liebe-card[data-align-h='start'] .liebe-card-body")).toContain(
      'align-items: flex-start;'
    )
    expect(ruleBody(body, ".liebe-card[data-align-h='end'] .liebe-card-body")).toContain(
      'align-items: flex-end;'
    )
  })

  it('slides the row shapes along their line, and stops the meta eating the room', () => {
    // Both halves, because the first is inert without the second: the meta
    // grows into whatever the icon and the control leave, so an aligned row
    // would have no free space to distribute and would look unaligned.
    expect(ruleBody(body, ".liebe-card[data-align-h='end'] .liebe-card-body-line")).toContain(
      'justify-content: flex-end;'
    )
    expect(
      ruleBody(body, '.liebe-card[data-align-h] .liebe-card-body-line > .liebe-meta')
    ).toContain('flex: 0 1 auto;')
  })

  it('moves a control row’s content with the rest, rather than splitting the block', () => {
    // `.liebe-card-controls` spans whatever box it is in, so without this the
    // icon and the meta slide while a content-sized control — a pill group, a
    // switch — stays at the leading edge. The contract moves the content block
    // as a whole or not at all.
    expect(ruleBody(body, ".liebe-card[data-align-h='end'] .liebe-card-controls")).toContain(
      'justify-content: flex-end;'
    )
  })

  it('keeps the tall band’s own control centred, whatever the alignment', () => {
    // The band is a fit-content item that the cross-axis rule already carries;
    // letting the alignment reach inside it too would left-flush the vertical
    // slider inside a band that had already moved — the defect 0028 fixed.
    // This rule carries one more selector component than the three above, which
    // is what makes it win.
    const band = ruleBody(
      body,
      '.liebe-card[data-align-h] .liebe-card-body-fill > .liebe-card-controls'
    )
    expect(band).toContain('justify-content: center;')

    const weigh = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]*\]/g) ?? []).length
    expect(
      weigh('.liebe-card[data-align-h] .liebe-card-body-fill > .liebe-card-controls')
    ).toBeGreaterThan(weigh(".liebe-card[data-align-h='end'] .liebe-card-controls"))
  })

  it('outranks the arrangement rules it has to override', () => {
    // `.liebe-card[data-align-v='start'] .liebe-card-body` carries three
    // selector components against the arrangement rule's two, so the cascade
    // settles it without importance — which the layers would reverse anyway.
    const alignment = ".liebe-card[data-align-v='start'] .liebe-card-body"
    const arrangement = ".liebe-card-body[data-arrangement='tall']"
    const weigh = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]*\]/g) ?? []).length

    expect(weigh(alignment)).toBeGreaterThan(weigh(arrangement))
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
