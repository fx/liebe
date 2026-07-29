import { describe, it, expect } from 'vitest'
import { resolveCardHue } from '../GridCard'
import { CARD_DISPLAY_DEFAULTS, type CardDisplayOptions } from '~/store/cardDisplay'

/**
 * Which colour wins when the entity, the user and the card's own state all have
 * an opinion. Three rules from three documents meet on one property, so they
 * are composed in one place and pinned in one place.
 */
const display = (overrides: Partial<CardDisplayOptions> = {}): CardDisplayOptions => ({
  ...CARD_DISPLAY_DEFAULTS,
  ...overrides,
})

const BULB = 'rgb(64, 120, 255)'

describe('resolveCardHue', () => {
  it('lets the bulb through under color: auto', () => {
    expect(resolveCardHue(BULB, display({ color: 'auto' }), false)).toBe(BULB)
  })

  it('gives way to an explicit colour', () => {
    // "An explicit universal `color` MUST win over everything, including the
    // bulb-derived color" — docs/specs/entity-cards/options/light.md.
    expect(resolveCardHue(BULB, display({ color: 'cool' }), false)).toBeUndefined()
  })

  it('is suppressed outright by a danger state', () => {
    // The danger floor reverts `color` to `auto`, so without this the floor
    // would hand the card straight back to the tint it just took away — and a
    // hue arriving from an entity appears nowhere in the configuration, so it
    // is the harder of the two to audit, not the easier.
    expect(resolveCardHue(BULB, display({ color: 'auto' }), true)).toBeUndefined()
    expect(resolveCardHue(BULB, display({ color: 'cool' }), true)).toBeUndefined()
  })

  it('resolves to nothing when the card offers no colour', () => {
    // An `onoff` light, or any card that never passes one.
    expect(resolveCardHue(undefined, display({ color: 'auto' }), false)).toBeUndefined()
  })
})
