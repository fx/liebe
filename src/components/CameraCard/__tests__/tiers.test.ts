import { describe, it, expect } from 'vitest'
import { resolveCameraTier } from '../tiers'
import { deriveCardTier, type CardTier } from '~/utils/cardTier'

/**
 * The camera's tier behaviour (docs/specs/entity-cards/options/camera.md —
 * "Tier layouts"), which is behaviour rather than layout: what changes below
 * 2×2 is whether a stream exists at all.
 */

const ALL_TIERS: readonly CardTier[] = ['glance', 'row', 'tall', 'full']

describe('resolveCameraTier', () => {
  it('answers for every tier', () => {
    // Total, because `deriveCardTier` is: a span with no entry here would be a
    // card with no layout.
    for (const tier of ALL_TIERS) {
      expect(resolveCameraTier(tier), tier).toBeDefined()
    }
  })

  it('mounts the live feed only at full', () => {
    expect(resolveCameraTier('full').live).toBe(true)
  })

  it.each(['glance', 'row', 'tall'] as const)('degrades %s to a still thumbnail', (tier) => {
    expect(resolveCameraTier(tier).live).toBe(false)
  })

  it('puts the state line only where there is width for it', () => {
    // `row` is the only degraded tier that is more than one cell wide.
    expect(resolveCameraTier('row').showState).toBe(true)
    expect(resolveCameraTier('glance').showState).toBe(false)
    expect(resolveCameraTier('tall').showState).toBe(false)
  })

  it('gives each degraded tier the shape its table row describes', () => {
    expect(resolveCameraTier('glance').arrangement).toBe('stack')
    expect(resolveCameraTier('row').arrangement).toBe('row')
    expect(resolveCameraTier('tall').arrangement).toBe('tall')
  })

  it.each([
    ['1×1', 1, 1, false],
    ['2×1', 2, 1, false],
    ['1×2', 1, 2, false],
    // The doc's own boundary: 2×2 is the minimum useful size for a live camera.
    ['2×2', 2, 2, true],
    ['4×2', 4, 2, true],
  ])('a %s span is live: %s', (_label, width, height, live) => {
    // Composed with the real derivation rather than asserting on tier names, so
    // the boundary this card cares about is pinned to a SPAN — which is what the
    // option doc states and what a reader would check.
    expect(
      resolveCameraTier(deriveCardTier({ width: width as number, height: height as number })).live
    ).toBe(live)
  })
})
