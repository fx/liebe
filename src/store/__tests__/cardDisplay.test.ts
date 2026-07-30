import { describe, it, expect } from 'vitest'
import {
  CARD_ALIGN_OPTIONS,
  CARD_COLOR_OPTIONS,
  CARD_DISPLAY_DEFAULTS,
  CARD_DISPLAY_KEYS,
  cardAlignSchema,
  cardColorSchema,
  cardDisplayConfigSchema,
  readCardDisplay,
  resolveCardColor,
} from '../cardDisplay'
import { domainColors } from '~/theme/tokens'

/**
 * The display half of the universal option contract
 * (docs/specs/entity-cards/options/common.md — "Universal options"): the
 * canonical `color` enum, the stored defaults, and the render-path reader that
 * has to survive a value it does not recognise without repairing it.
 */
describe('card display options', () => {
  describe('the color enum', () => {
    it('is the domain palette minus the brand colour, plus auto', () => {
      // Pinned rather than derived in the module, so adding a triplet to the
      // palette makes this fail rather than silently leaving the colour
      // unselectable — and so `brand`, which the design system reserves for the
      // Liebe mark, cannot drift into the card option surface.
      const palette = domainColors.map(({ name }) => name).filter((name) => name !== 'brand')

      expect([...CARD_COLOR_OPTIONS]).toEqual(['auto', ...palette])
    })

    it('rejects a colour outside the list', () => {
      expect(cardColorSchema.safeParse('amber').success).toBe(false)
      expect(cardColorSchema.safeParse('brand').success).toBe(false)
      expect(cardColorSchema.safeParse('light').success).toBe(true)
    })
  })

  describe('the alignment pair', () => {
    it('offers exactly the four values the contract names', () => {
      expect([...CARD_ALIGN_OPTIONS]).toEqual(['auto', 'start', 'center', 'end'])
    })

    it('rejects a value outside the closed set', () => {
      // `left`/`top` are the spellings a reader arrives with — the text
      // widget uses them — and they are deliberately not these.
      expect(cardAlignSchema.safeParse('left').success).toBe(false)
      expect(cardAlignSchema.safeParse('top').success).toBe(false)
      expect(cardAlignSchema.safeParse('stretch').success).toBe(false)
      expect(cardAlignSchema.safeParse('end').success).toBe(true)
    })

    it('defaults each axis to auto, which is the tier’s own arrangement', () => {
      expect(readCardDisplay({})).toMatchObject({
        alignHorizontal: 'auto',
        alignVertical: 'auto',
      })
    })

    it('takes each axis on its own', () => {
      // "A named value overrides only its own axis; the other axis keeps its
      // `auto` behavior."
      expect(readCardDisplay({ alignVertical: 'start' })).toMatchObject({
        alignHorizontal: 'auto',
        alignVertical: 'start',
      })
    })

    it('falls the axis back to auto for a value this build does not know', () => {
      // Render-path tolerance, per key: a document written by a newer build
      // renders with the tier's own arrangement on that axis rather than
      // failing, and nothing rewrites what was stored.
      expect(readCardDisplay({ alignHorizontal: 'justify', alignVertical: 'end' })).toMatchObject({
        alignHorizontal: 'auto',
        alignVertical: 'end',
      })
    })
  })

  describe('defaults', () => {
    it('leave an unconfigured card exactly as it was', () => {
      expect(CARD_DISPLAY_DEFAULTS).toEqual({
        name: '',
        icon: '',
        hideName: false,
        hideState: false,
        color: 'auto',
        alignHorizontal: 'auto',
        alignVertical: 'auto',
      })
    })

    it('has a default for every key the reader iterates', () => {
      // The reader starts from the defaults and overwrites per key, so a key
      // listed without a default would resolve to `undefined` for every card
      // rather than to the "leave it alone" value the option promises.
      expect(Object.keys(CARD_DISPLAY_DEFAULTS).sort()).toEqual([...CARD_DISPLAY_KEYS].sort())
    })

    it('reads them for a card with no config at all', () => {
      expect(readCardDisplay(undefined)).toEqual(CARD_DISPLAY_DEFAULTS)
      expect(readCardDisplay({})).toEqual(CARD_DISPLAY_DEFAULTS)
    })
  })

  describe('the config fragment', () => {
    it('accepts every key, and each one on its own', () => {
      expect(
        cardDisplayConfigSchema.safeParse({
          name: 'Reading lamp',
          icon: 'Bulb',
          hideName: true,
          hideState: true,
          color: 'heat',
          alignHorizontal: 'center',
          alignVertical: 'end',
        }).success
      ).toBe(true)
      expect(cardDisplayConfigSchema.safeParse({ hideState: true }).success).toBe(true)
      expect(cardDisplayConfigSchema.safeParse({ alignVertical: 'start' }).success).toBe(true)
    })

    it('rejects a wrong-typed value rather than coercing it', () => {
      expect(cardDisplayConfigSchema.safeParse({ hideName: 'yes' }).success).toBe(false)
      expect(cardDisplayConfigSchema.safeParse({ name: 3 }).success).toBe(false)
      expect(cardDisplayConfigSchema.safeParse({ color: 'amber' }).success).toBe(false)
      // The gate is where a closed enum stops being tolerant: a shared document
      // naming an alignment nothing implements has an author who needs to know.
      expect(cardDisplayConfigSchema.safeParse({ alignHorizontal: 'left' }).success).toBe(false)
    })
  })

  describe('readCardDisplay', () => {
    it('returns the stored values when they validate', () => {
      expect(
        readCardDisplay({
          name: 'Reading lamp',
          icon: 'Bulb',
          hideName: true,
          hideState: true,
          color: 'ok',
          alignHorizontal: 'end',
          alignVertical: 'start',
        })
      ).toEqual({
        name: 'Reading lamp',
        icon: 'Bulb',
        hideName: true,
        hideState: true,
        color: 'ok',
        alignHorizontal: 'end',
        alignVertical: 'start',
      })
    })

    it('ignores unrelated keys sharing the config object', () => {
      expect(
        readCardDisplay({ tapAction: 'toggle', enableBrightness: false, name: 'Desk' })
      ).toEqual({ ...CARD_DISPLAY_DEFAULTS, name: 'Desk' })
    })

    it('falls back per key, so one bad value does not cost the others', () => {
      // The render path resolving what it cannot interpret, for display only —
      // nothing here writes back (docs/specs/dashboard-config — "Forward
      // Compatibility").
      expect(readCardDisplay({ color: 'chartreuse', name: 'Desk', hideState: 'yes' })).toEqual({
        ...CARD_DISPLAY_DEFAULTS,
        name: 'Desk',
      })
    })
  })

  describe('a danger state', () => {
    const configured = {
      name: 'Back door',
      icon: 'Bulb',
      hideName: true,
      hideState: true,
      color: 'ok',
      alignHorizontal: 'end',
      alignVertical: 'start',
    }

    it('takes back everything that carries the warning', () => {
      // A jammed lock pinned to green with no state line would look fine while
      // the door is not (REVIEW.md — "Danger states must not be configurable
      // into looking calm").
      expect(readCardDisplay(configured, { danger: true })).toEqual({
        name: 'Back door',
        icon: '',
        hideName: false,
        hideState: false,
        color: 'auto',
        // Layout, not signalling: sliding the warning to the top of the tile
        // does not make it say anything less, so the floor leaves it in force
        // (docs/specs/entity-cards/options/common.md — "Content alignment").
        alignHorizontal: 'end',
        alignVertical: 'start',
      })
    })

    it('leaves the options alone when there is no danger', () => {
      expect(readCardDisplay(configured, { danger: false })).toEqual(configured)
      expect(readCardDisplay(configured)).toEqual(configured)
    })
  })

  describe('resolveCardColor', () => {
    it('keeps the card’s state-derived colour on auto', () => {
      expect(resolveCardColor('auto', 'heat')).toBe('heat')
      expect(resolveCardColor('auto', 'default')).toBe('default')
    })

    it('pins the stored triplet over the card’s own', () => {
      expect(resolveCardColor('media', 'heat')).toBe('media')
    })
  })
})
