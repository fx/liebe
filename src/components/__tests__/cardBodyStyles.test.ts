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
 * And the anatomy sheet, for the one fact the forced placements turn on: a
 * slider has no length of its own on either axis, so what a shape has to supply
 * is a containing block with a DEFINITE size on the axis the control runs along.
 */
const anatomy = stripComments(read('../anatomy/anatomy.css'))

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

/**
 * The specificity weight of the one rule in the body sheet whose selector
 * matches — classes plus attribute selectors, which is all these rules use.
 *
 * Found in the sheet rather than passed in as a literal: a comparison between
 * two hand-written selectors is arithmetic on constants and keeps agreeing
 * after the sheet has moved on.
 */
function weighOf(pattern: RegExp): number {
  const matches = rulesIn(body).filter(({ selector }) => pattern.test(selector))
  expect(matches, `no rule matching ${pattern}`).toHaveLength(1)

  return (matches[0].selector.match(/\.[\w-]+|\[[^\]]*\]/g) ?? []).length
}

/**
 * The one rule in the body sheet whose selector matches, with the position it
 * holds in the sheet.
 *
 * Selected by pattern rather than by exact selector, and on a
 * whitespace-normalised copy, because Prettier wraps a long descendant selector
 * across lines — a literal string comparison would depend on where it chose to
 * break. The index is here because two rules of equal weight are settled by
 * source order, which is a fact about the sheet that a weight comparison cannot
 * express.
 */
function ruleMatching(pattern: RegExp): {
  selector: string
  declarations: string
  order: number
} {
  const matches = rulesIn(body)
    .map((rule, order) => ({ ...rule, selector: rule.selector.replace(/\s+/g, ' '), order }))
    .filter(({ selector }) => pattern.test(selector))

  expect(matches, `no rule matching ${pattern}`).toHaveLength(1)
  return matches[0]
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

describe('a forced slider placement gets a definite axis to run along', () => {
  /**
   * `sliderPlacement: horizontal | vertical` puts the slider on an axis its
   * shape was not built to host (docs/specs/entity-cards/options/common.md —
   * "Shared slider placement"), and the orientation prop alone does not produce
   * one: a slider has no length of its own, so `block-size: 100%` and
   * `inline-size: 100%` are what give it one, and a percentage resolves only
   * against a containing block with a definite size on that axis.
   *
   * This is exactly the class of claim jsdom cannot make — it applies no
   * stylesheet and lays nothing out, so a bare orientation flip renders an
   * identical DOM and passes every rendered assertion while the track is
   * invisible. The browser-level half is
   * `tests/e2e/forced-slider-placement.spec.ts`.
   */
  it('starts from a slider with no length of its own, on either axis', () => {
    // The premise, read off the anatomy sheet rather than assumed: without
    // these two declarations there would be nothing for the rules below to
    // resolve against, and nothing for a missing definite size to break.
    expect(anatomy).toMatch(
      /\.liebe-slider\[data-orientation='vertical'\]\s*\{[^}]*block-size:\s*100%;/
    )
    expect(anatomy).toMatch(
      /\.liebe-slider\[data-orientation='horizontal'\]\s*\{[^}]*inline-size:\s*100%;/
    )
  })

  it('gives a vertical control on a row line the body’s leftover height', () => {
    // The line is otherwise as tall as the icon circle inside it — a height
    // derived from content, which a percentage cannot resolve against. `flex: 1
    // 1 auto` makes it the body's leftover instead, and `min-block-size: 0`
    // stops a `full` tier's secondary content being pushed off the tile.
    const line = ruleMatching(
      /^\.liebe-card-body\[data-control-orientation='vertical'\] > \.liebe-card-body-line$/
    ).declarations

    expect(line).toContain('flex: 1 1 auto;')
    expect(line).toContain('min-block-size: 0;')
  })

  it('hands that height to the control slot, and keeps the control its own width', () => {
    const slot = ruleMatching(
      /data-control-orientation='vertical'\].* > \.liebe-card-controls$/
    ).declarations

    // The long axis: the slot takes the whole line rather than being centred in
    // it, which is the same contract the `tall` band's slot carries.
    expect(slot).toContain('align-self: stretch;')
    // And the cross axis is `grow: 0, shrink: 1` — a 42px control on a row with
    // hundreds of pixels to spare stays 42px rather than becoming a track only
    // its thumb can be grabbed by, and gives way on a row that cannot afford
    // it rather than pushing the line past the tile's edge.
    expect(slot).toContain('flex: 0 1 auto;')
    expect(slot).toContain('inline-size: auto;')
    // Without this the shrink above is inert: a flex item's automatic minimum
    // size is its content, and this slot's content has a fixed thickness.
    expect(slot).toContain('min-inline-size: 0;')
    // The vertical slider's centring rule, applied inside the slot.
    expect(slot).toContain('justify-content: center;')
  })

  it('makes the forced control itself cross-axis flexible, not only its slot', () => {
    /*
     * "A control rendered at a one-cell-wide tier MUST be cross-axis flexible:
     * it takes the content region's width, and its geometry token names the
     * size it prefers rather than the size it always has"
     * (docs/specs/design-system — "Cross-axis fit").
     *
     * The slot shrinking is half a fix on its own: the anatomy sheet sizes a
     * vertical track at exactly the token, so a rigid control inside a
     * shrinking slot moves the overflow one box inwards. `max-inline-size`
     * keeps the token's meaning — the thickness the control PREFERS — while
     * letting the row decide when it cannot be afforded.
     */
    const control = ruleMatching(/data-control-orientation='vertical'\].*\.liebe-slider-thumb$/)

    expect(control.declarations).toContain('inline-size: 100%;')
    expect(control.declarations).toContain('max-inline-size: var(--liebe-control-height);')

    /*
     * The track AND the thumb, in one rule, because relaxing either alone
     * leaves the other overhanging: the vertical thumb is a 3px bar spanning
     * the control's thickness, absolutely positioned and centred by Radix, so a
     * rigid 42px thumb inside a narrowed root hangs past the track on both
     * sides and is clipped by the tile — the original defect surviving in the
     * one part that still had a fixed width.
     */
    expect(control.selector).toMatch(/> \.liebe-slider,/)

    // The premise, from the anatomy sheet: both thicknesses this relaxes are
    // fixed, so a rule that only shrank the slot would change nothing.
    expect(anatomy).toMatch(
      /\.liebe-slider\[data-orientation='vertical'\]\s*\{[^}]*inline-size:\s*var\(--liebe-control-height\);/
    )
    expect(anatomy).toMatch(
      /\.liebe-slider\[data-orientation='vertical'\] \.liebe-slider-thumb\s*\{[^}]*inline-size:\s*var\(--liebe-control-height\);/
    )
  })

  it('outranks the `fill` sizing it has to override, by weight rather than by order', () => {
    // Both rules address the same slot and are otherwise equally specific, so
    // without the extra attribute selector the winner would be whichever was
    // written last — one reorder away from silently reversing.
    expect(
      weighOf(/data-control-orientation='vertical'\][^,{]*liebe-card-controls$/)
    ).toBeGreaterThan(
      weighOf(/^\.liebe-card-body\[data-control-size='fill'\][^,{]*liebe-card-controls$/)
    )
  })

  it('lets the meta take the width the control stopped taking, until an alignment says otherwise', () => {
    // Otherwise the vertical slider sits against the name with the free space
    // piled up beyond it, rather than on the tile's trailing edge.
    const meta = ruleMatching(
      /^\.liebe-card-body\[data-control-orientation='vertical'\] > \.liebe-card-body-line > \.liebe-meta$/
    )
    expect(meta.declarations).toContain('flex: 1 1 auto;')

    /*
     * And change 0032 still wins where a card stored an alignment: the
     * contract there is that the content block moves as a whole, which needs
     * the meta back at `0 1 auto` so the line has free space to distribute.
     * Equal weight, so this is settled by source order — asserted, because it
     * is the whole of what holds it.
     */
    const aligned = ruleMatching(
      /^\.liebe-card\[data-align-h\] \.liebe-card-body-line > \.liebe-meta$/
    )
    expect(aligned.declarations).toContain('flex: 0 1 auto;')
    expect(
      weighOf(/^\.liebe-card-body\[data-control-orientation='vertical'\][^,{]*liebe-meta$/)
    ).toBe(weighOf(/^\.liebe-card\[data-align-h\] \.liebe-card-body-line > \.liebe-meta$/))
    expect(meta.order).toBeLessThan(aligned.order)
  })

  it('spans the tall band for a horizontal control, which otherwise has no width to fill', () => {
    // The band hugs its content by default — that is what puts a 42px vertical
    // slider on the tile's midline — and inside a fit-content box a horizontal
    // track's `inline-size: 100%` resolves against a width measured from that
    // same track. This is the collapse `stretchControlBand` exists for, applied
    // without the card having to ask for it twice.
    expect(
      ruleMatching(
        /^\.liebe-card-body\[data-control-orientation='horizontal'\] > \.liebe-card-body-fill$/
      ).declarations
    ).toContain('align-self: stretch;')
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
    // the tall band's centring — plus the forced-placement slot, which is a
    // card's own stored option rather than an alignment and belongs on this
    // list for the same reason the `fill` exception does.
    expect(unscoped.map((selector) => selector.replace(/\s+/g, ' '))).toEqual([
      '.liebe-card-body',
      ".liebe-card-body[data-arrangement='stack']",
      ".liebe-card-body[data-arrangement='tall']",
      '.liebe-card-body-line',
      '.liebe-card-body-line > .liebe-card-controls',
      ".liebe-card-body[data-control-size='fill'] > .liebe-card-body-line > .liebe-card-controls",
      '.liebe-card-body-fill',
      '.liebe-card-body-fill > .liebe-card-controls',
      ".liebe-card-body[data-control-size][data-control-orientation='vertical'] > .liebe-card-body-line > .liebe-card-controls",
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

    expect(weighOf(/\[data-align-h\][^,{]*liebe-card-body-fill/)).toBeGreaterThan(
      weighOf(/\[data-align-h='end'\] \.liebe-card-controls$/)
    )
  })

  it('outranks the arrangement rules it has to override', () => {
    // The alignment rule carries three selector components against the
    // arrangement rule's two, so the cascade settles it without importance —
    // which the layers would reverse anyway.
    //
    // Both weights are read off the sheet rather than off literals written
    // here: two literals compared against each other are arithmetic, and would
    // go on agreeing after the rules they name had changed or gone.
    expect(weighOf(/\[data-align-v='start'\] \.liebe-card-body$/)).toBeGreaterThan(
      weighOf(/^\.liebe-card-body\[data-arrangement='tall'\]$/)
    )
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

describe('the icon-only tile’s accessible label', () => {
  it('clips the icon-only tile’s label without removing it from the a11y tree', () => {
    // The one thing `iconOnly` hides rather than omits. Everything else it
    // suppresses is genuinely absent from the DOM, so a rendered test can see
    // it; *how* this one is hidden is a property of these declarations, which
    // jsdom cannot see at all.
    const label = ruleBody(body, '.liebe-card-body-label')

    expect(label).toContain('clip-path: inset(50%);')
    expect(label).toContain('inline-size: 1px;')
    expect(label).toContain('block-size: 1px;')
    expect(label).toContain('overflow: hidden;')
    // Out of the tile's flow, so the glyph centres as it would with nothing
    // beside it.
    expect(label).toContain('position: absolute;')

    /*
     * The three "simplifications" that would each undo the point: every one of
     * them hides the text visually AND takes the node out of the accessibility
     * tree, which is the one outcome this rule exists to avoid
     * (docs/specs/entity-cards/options/common.md — "Visual suppression never
     * removes accessible semantics").
     */
    expect(label).not.toMatch(/\bdisplay:\s*none/)
    expect(label).not.toMatch(/\bvisibility:\s*hidden/)
    expect(label).not.toMatch(/\b(inline-size|block-size|width|height):\s*0/)
  })
})
