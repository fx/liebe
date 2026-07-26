import { describe, it, expect } from 'vitest'
import {
  CARD_COLOR_OPTIONS,
  CARD_DISPLAY_DEFAULTS,
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

  describe('defaults', () => {
    it('leave an unconfigured card exactly as it was', () => {
      expect(CARD_DISPLAY_DEFAULTS).toEqual({
        name: '',
        icon: '',
        hideName: false,
        hideState: false,
        color: 'auto',
      })
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
        }).success
      ).toBe(true)
      expect(cardDisplayConfigSchema.safeParse({ hideState: true }).success).toBe(true)
    })

    it('rejects a wrong-typed value rather than coercing it', () => {
      expect(cardDisplayConfigSchema.safeParse({ hideName: 'yes' }).success).toBe(false)
      expect(cardDisplayConfigSchema.safeParse({ name: 3 }).success).toBe(false)
      expect(cardDisplayConfigSchema.safeParse({ color: 'amber' }).success).toBe(false)
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
        })
      ).toEqual({
        name: 'Reading lamp',
        icon: 'Bulb',
        hideName: true,
        hideState: true,
        color: 'ok',
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
