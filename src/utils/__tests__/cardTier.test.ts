import { describe, expect, it } from 'vitest'
import { deriveCardTier, scaleSpanToColumns, type CardTier } from '../cardTier'
import { getEffectiveColumns } from '../../../app/utils/responsive'

/**
 * The boundary table from docs/specs/design-system/index.md ("Size-adaptive
 * layouts"), asserted where it is decided. Every card's layout keys off this,
 * so the interesting cases are the boundaries themselves — 2 is wide, 1 is not
 * — rather than a comfortable span in the middle of each tier.
 */
describe('deriveCardTier', () => {
  const cases: Array<[number, number, CardTier]> = [
    // The four corners of the table.
    [1, 1, 'glance'],
    [2, 1, 'row'],
    [1, 2, 'tall'],
    [2, 2, 'full'],
    // The scenario the change document names: 3×1 is `row`, not `full` — width
    // alone never buys the second row of content.
    [3, 1, 'row'],
    [4, 1, 'row'],
    // …and its mirror: height alone never buys the horizontal layout.
    [1, 3, 'tall'],
    [1, 8, 'tall'],
    // Past both boundaries in every direction.
    [3, 2, 'full'],
    [2, 3, 'full'],
    [6, 4, 'full'],
  ]

  it.each(cases)('derives %i×%i as %s', (width, height, tier) => {
    expect(deriveCardTier({ width, height })).toBe(tier)
  })

  it('answers for a degenerate span rather than returning nothing', () => {
    // No grid produces these — the layout floors width at one cell — but the
    // function is total, and `glance` is the floor rather than `undefined`
    // leaking into a `data-tier` attribute.
    expect(deriveCardTier({ width: 0, height: 0 })).toBe('glance')
    expect(deriveCardTier({ width: -1, height: 1 })).toBe('glance')
  })
})

describe('scaleSpanToColumns', () => {
  it('leaves a span alone when the grid is at its stored column count', () => {
    expect(scaleSpanToColumns({ width: 3, height: 2 }, 12, 12)).toEqual({ width: 3, height: 2 })
  })

  it('scales width down with the column ratio', () => {
    // 12 stored columns shown in 4: a third of the width, so a 6-wide item is 2.
    expect(scaleSpanToColumns({ width: 6, height: 1 }, 12, 4)).toEqual({ width: 2, height: 1 })
  })

  it('scales width up when the grid has more columns than the screen stores', () => {
    expect(scaleSpanToColumns({ width: 3, height: 1 }, 8, 16)).toEqual({ width: 6, height: 1 })
  })

  it('rounds to the nearest cell', () => {
    // 5 × (8/12) = 3.33 → 3; 7 × (8/12) = 4.67 → 5.
    expect(scaleSpanToColumns({ width: 5, height: 1 }, 12, 8).width).toBe(3)
    expect(scaleSpanToColumns({ width: 7, height: 1 }, 12, 8).width).toBe(5)
  })

  it('never narrows an item below one cell', () => {
    // 1 × (4/16) rounds to 0, and a zero-width item is not a thing the grid can
    // lay out — the floor is the grid's own.
    expect(scaleSpanToColumns({ width: 1, height: 1 }, 16, 4).width).toBe(1)
  })

  it('never scales height, because rows do not scale with the breakpoint', () => {
    expect(scaleSpanToColumns({ width: 4, height: 3 }, 12, 4).height).toBe(3)
  })

  it('collapses a wide item to glance on a narrow grid', () => {
    // The case the effective span exists for: stored 2×1 on a 12-column screen,
    // rendered on a phone, is one cell wide and therefore a glance tile.
    const stored = { width: 2, height: 1 }
    expect(deriveCardTier(stored)).toBe('row')

    const effective = scaleSpanToColumns(stored, 12, getEffectiveColumns('mobile', 12))
    expect(effective).toEqual({ width: 1, height: 1 })
    expect(deriveCardTier(effective)).toBe('glance')
  })
})

describe('getEffectiveColumns', () => {
  it("keeps the screen's own column count at the wide breakpoints", () => {
    expect(getEffectiveColumns('desktop', 12)).toBe(12)
    expect(getEffectiveColumns('wide', 20)).toBe(20)
  })

  it("overrides it with the breakpoint's own count at the narrow ones", () => {
    expect(getEffectiveColumns('mobile', 12)).toBe(4)
    expect(getEffectiveColumns('tablet', 12)).toBe(8)
  })
})
