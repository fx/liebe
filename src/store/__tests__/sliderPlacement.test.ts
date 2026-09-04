import { describe, it, expect } from 'vitest'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import {
  SLIDER_PLACEMENTS,
  SLIDER_PLACEMENT_DEFAULT,
  SLIDER_PLACEMENT_KEY,
  isBackgroundPlacement,
  readSliderOrientation,
  readSliderPlacement,
  resolveBackgroundDirection,
  resolveSliderOrientation,
  sliderPlacementConfigSchema,
  type SliderPlacement,
} from '../sliderPlacement'

/**
 * The shared `sliderPlacement` contract
 * (docs/specs/entity-cards/options/common.md — "Shared slider placement").
 *
 * Every expectation below is read off that document rather than off the
 * resolver: the point of a contract defined once for three cards is that the
 * cards agree with it, so a test transcribing what the function happens to
 * return would agree with a drift instead of catching it (REVIEW.md — "Tests
 * Pin Intent, Not Implementation").
 */

const TIERS: CardTier[] = ['glance', 'row', 'tall', 'full']

describe('readSliderPlacement', () => {
  it('defaults to `auto`, and an absent key is indistinguishable from it', () => {
    // "An absent key MUST be indistinguishable from `auto`" — so the two reads
    // below are one claim, and asserting only the first would leave a build
    // that treated absence as something else looking correct.
    expect(readSliderPlacement(undefined)).toBe('auto')
    expect(readSliderPlacement({})).toBe('auto')
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: 'auto' })).toBe('auto')
    expect(SLIDER_PLACEMENT_DEFAULT).toBe('auto')
  })

  it('reads back every value the contract declares', () => {
    // Driven from the declared list rather than from a literal set, so a value
    // added to the contract without a reader fails here instead of silently
    // resolving to `auto` for the rest of the option's life.
    for (const placement of SLIDER_PLACEMENTS) {
      expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: placement })).toBe(placement)
    }
  })

  it('falls back to `auto` for values outside the set', () => {
    // "Values outside the set fall back to `auto`" — the render path resolving
    // what it cannot interpret rather than refusing to draw a card, since a
    // value can reach localStorage by routes the import gate never saw.
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: 'side' })).toBe('auto')
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: 'HORIZONTAL' })).toBe('auto')
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: true })).toBe('auto')
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: null })).toBe('auto')
    expect(readSliderPlacement({ [SLIDER_PLACEMENT_KEY]: 3 })).toBe('auto')
  })
})

describe('the import gate', () => {
  it('accepts every declared value and rejects anything else', () => {
    // Strict at the gate where the render path is tolerant: an imported
    // `sliderPlacement: "side"` is a document asking for a placement no build
    // has, and its author is better told than quietly given something else
    // (docs/specs/dashboard-config/index.md — "Forward Compatibility").
    for (const placement of SLIDER_PLACEMENTS) {
      expect(
        sliderPlacementConfigSchema.safeParse({ [SLIDER_PLACEMENT_KEY]: placement }).success
      ).toBe(true)
    }

    expect(sliderPlacementConfigSchema.safeParse({}).success).toBe(true)
    expect(sliderPlacementConfigSchema.safeParse({ [SLIDER_PLACEMENT_KEY]: 'side' }).success).toBe(
      false
    )
  })

  it('declares the four values the option document names', () => {
    // The canonical list is a contract of its own — the option doc's table and
    // the design system's background placement both name these four, and a
    // build declaring three would reject a document the next one writes.
    expect([...SLIDER_PLACEMENTS]).toEqual(['auto', 'horizontal', 'vertical', 'background'])
  })
})

describe('resolveSliderOrientation', () => {
  it('renders no inline slider in `glance`, under every value', () => {
    /*
     * "The tier keeps deciding *whether* the slider renders (still never in
     * `glance` under these two values)". `background` is in this loop too: it
     * renders in every tier including `glance`, but as the card surface rather
     * than as an inline control, so this resolver — the inline answer — still
     * reports none.
     */
    for (const placement of SLIDER_PLACEMENTS) {
      expect(resolveSliderOrientation(placement, 'glance')).toBeUndefined()
    }
  })

  it('keeps each tier’s own placement under `auto`', () => {
    // "`auto` keeps the tier layouts' own placement — horizontal on the row
    // line in `row`/`full`, vertical filling the middle in `tall`". This is the
    // behaviour that predates the option, and reproducing it exactly is what
    // makes the key additive and lets it ship with no migration.
    expect(resolveSliderOrientation('auto', 'row')).toBe('horizontal')
    expect(resolveSliderOrientation('auto', 'full')).toBe('horizontal')
    expect(resolveSliderOrientation('auto', 'tall')).toBe('vertical')
  })

  it('forces the axis in every tier that shows a slider at all', () => {
    // "`horizontal` / `vertical` force the slider's orientation in every tier
    // that shows a slider at all" — including the tier that would have chosen
    // the other axis, which is the whole point of the option.
    expect(resolveSliderOrientation('vertical', 'row')).toBe('vertical')
    expect(resolveSliderOrientation('vertical', 'full')).toBe('vertical')
    expect(resolveSliderOrientation('vertical', 'tall')).toBe('vertical')

    expect(resolveSliderOrientation('horizontal', 'row')).toBe('horizontal')
    expect(resolveSliderOrientation('horizontal', 'full')).toBe('horizontal')
    expect(resolveSliderOrientation('horizontal', 'tall')).toBe('horizontal')
  })
  it('leaves `background` resolving to the tier’s own placement as the inline fallback', () => {
    /*
     * `background` is not an inline placement: the surface is what a card
     * checks with `isBackgroundPlacement` before reading an orientation. This
     * resolver keeps answering the tier's own placement, so a consumer that
     * never learned the surface renders a working card rather than none.
     * What it must NOT do is behave like a forced orientation, which is what
     * the comparison with `auto` pins.
     */
    for (const tier of TIERS) {
      expect(resolveSliderOrientation('background', tier)).toBe(
        resolveSliderOrientation('auto', tier)
      )
    }
  })

  it('answers for every value at every tier', () => {
    // Totality: the resolver is on the render path of three cards, so a value
    // and tier it had no answer for would be a blank control slot rather than
    // an error anyone could trace.
    const answers = SLIDER_PLACEMENTS.flatMap((placement: SliderPlacement) =>
      TIERS.map((tier) => resolveSliderOrientation(placement, tier))
    )

    expect(
      answers.every(
        (answer) => answer === undefined || answer === 'horizontal' || answer === 'vertical'
      )
    ).toBe(true)
  })
})

describe('readSliderOrientation', () => {
  it('is the two halves composed, for every value at every tier', () => {
    /*
     * The cards call this one rather than the pair, so what has to hold is that
     * it says the same thing — a convenience that quietly disagreed with the
     * contract would be worse than none, since the contract's own tests would
     * stay green while no card obeyed it.
     */
    for (const placement of SLIDER_PLACEMENTS) {
      for (const tier of TIERS) {
        expect(readSliderOrientation({ [SLIDER_PLACEMENT_KEY]: placement }, tier)).toBe(
          resolveSliderOrientation(placement, tier)
        )
      }
    }
  })

  it('treats an absent config the way it treats an absent key', () => {
    // A card rendered outside a placed item hands it nothing at all, and that
    // is the same request as an unconfigured card's: follow the tier.
    expect(readSliderOrientation(undefined, 'row')).toBe('horizontal')
    expect(readSliderOrientation({}, 'tall')).toBe('vertical')
  })
})

describe('isBackgroundPlacement', () => {
  it('answers true only for the background value', () => {
    expect(isBackgroundPlacement({ [SLIDER_PLACEMENT_KEY]: 'background' })).toBe(true)
    for (const placement of ['auto', 'horizontal', 'vertical'] as const) {
      expect(isBackgroundPlacement({ [SLIDER_PLACEMENT_KEY]: placement })).toBe(false)
    }
    expect(isBackgroundPlacement({})).toBe(false)
    expect(isBackgroundPlacement(undefined)).toBe(false)
    expect(isBackgroundPlacement({ [SLIDER_PLACEMENT_KEY]: 'sideways' })).toBe(false)
  })
})

describe('resolveBackgroundDirection', () => {
  it('runs left-to-right only when the span is wider than tall in cells', () => {
    // The design-system rule: never from measured pixels, squares included as
    // vertical (a bottom-up fill reads as a level).
    const cases: { span: CardSpan | undefined; direction: 'horizontal' | 'vertical' }[] = [
      { span: { width: 3, height: 1 }, direction: 'horizontal' },
      { span: { width: 2, height: 2 }, direction: 'vertical' },
      { span: { width: 1, height: 1 }, direction: 'vertical' },
      { span: { width: 1, height: 3 }, direction: 'vertical' },
      { span: undefined, direction: 'vertical' },
    ]
    for (const { span, direction } of cases) {
      expect(resolveBackgroundDirection(span)).toBe(direction)
    }
  })
})
