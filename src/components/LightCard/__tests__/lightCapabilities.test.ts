import { describe, it, expect } from 'vitest'
import {
  supportsBrightness,
  supportsColor,
  supportsColorTemp,
  type LightCapabilityAttributes,
} from '../lightCapabilities'

/**
 * The capability matrix (docs/specs/entity-cards/options/light.md — common
 * convention 3, and "Brightness" for the `['white']`-only case the option doc
 * names explicitly).
 *
 * Two properties are worth more than the table itself and are asserted
 * separately below: an unrecognised mode must leave every question answerable
 * rather than throwing, and the modern attribute must be authoritative when it
 * is present — including when it says "no".
 */

const attributes = (value: Partial<LightCapabilityAttributes>): LightCapabilityAttributes => value

describe('brightness capability', () => {
  it.each([
    ['brightness'],
    ['white'],
    ['color_temp'],
    ['hs'],
    ['xy'],
    ['rgb'],
    ['rgbw'],
    ['rgbww'],
  ])('is declared by the %s mode', (mode) => {
    expect(supportsBrightness(attributes({ supported_color_modes: [mode] }))).toBe(true)
  })

  it('is absent from an onoff-only light', () => {
    expect(supportsBrightness(attributes({ supported_color_modes: ['onoff'] }))).toBe(false)
  })

  it('is found in a list that also carries modes this build does not know', () => {
    expect(supportsBrightness(attributes({ supported_color_modes: ['quantum_flux', 'rgb'] }))).toBe(
      true
    )
  })

  it('falls back to the legacy feature bit when no modes are declared', () => {
    expect(supportsBrightness(attributes({ supported_features: 1 }))).toBe(true)
    expect(supportsBrightness(attributes({ supported_features: 0 }))).toBe(false)
  })
})

describe('colour-temperature capability', () => {
  it('is declared by the color_temp mode alone', () => {
    expect(supportsColorTemp(attributes({ supported_color_modes: ['color_temp'] }))).toBe(true)
    expect(supportsColorTemp(attributes({ supported_color_modes: ['hs', 'rgb'] }))).toBe(false)
  })

  it('falls back to the legacy COLOR_TEMP bit', () => {
    expect(supportsColorTemp(attributes({ supported_features: 2 }))).toBe(true)
    expect(supportsColorTemp(attributes({ supported_features: 1 }))).toBe(false)
  })
})

describe('colour capability', () => {
  it.each([['hs'], ['xy'], ['rgb'], ['rgbw'], ['rgbww']])('is declared by the %s mode', (mode) => {
    expect(supportsColor(attributes({ supported_color_modes: [mode] }))).toBe(true)
  })

  it.each([['white'], ['color_temp'], ['brightness'], ['onoff']])(
    'is not declared by the %s mode, which produces a colour but does not take one',
    (mode) => {
      expect(supportsColor(attributes({ supported_color_modes: [mode] }))).toBe(false)
    }
  )

  it('falls back to the legacy COLOR bit', () => {
    expect(supportsColor(attributes({ supported_features: 16 }))).toBe(true)
    expect(supportsColor(attributes({ supported_features: 2 }))).toBe(false)
  })
})

describe('a light this build does not fully understand', () => {
  /*
   * The forward-compatibility case, and the reason it is worth its own block:
   * every assertion here is about the card STILL RENDERING. A throw from any of
   * these would not degrade one control, it would blank the whole tile.
   */

  it('answers every question about an entirely unknown mode without throwing', () => {
    const unknown = attributes({ supported_color_modes: ['holographic'] })

    expect(supportsBrightness(unknown)).toBe(false)
    expect(supportsColorTemp(unknown)).toBe(false)
    expect(supportsColor(unknown)).toBe(false)
  })

  it.each([
    ['a bare string', 'brightness'],
    ['an object', { brightness: true }],
    ['null', null],
    ['a number', 3],
  ])('treats %s in supported_color_modes as no declaration at all', (_label, value) => {
    // The sharp case: `'brightness'.some(...)` is a TypeError, so a broken
    // integration or a hand-edited YAML would take the card down rather than
    // cost it a slider. With no usable declaration the legacy bits decide, and
    // here they say the light dims.
    const broken = attributes({ supported_color_modes: value, supported_features: 1 })

    expect(supportsBrightness(broken)).toBe(true)
    expect(supportsColor(broken)).toBe(false)
  })

  it('drops a non-string member and reads the rest of the list', () => {
    expect(supportsColor(attributes({ supported_color_modes: [null, 'rgb'] }))).toBe(true)
  })

  it('ignores a non-numeric supported_features rather than masking NaN', () => {
    expect(supportsBrightness(attributes({ supported_features: 'yes' }))).toBe(false)
  })

  it('reads nothing at all as no capability', () => {
    expect(supportsBrightness(undefined)).toBe(false)
    expect(supportsColorTemp(undefined)).toBe(false)
    expect(supportsColor(undefined)).toBe(false)
    expect(supportsBrightness(attributes({}))).toBe(false)
  })
})

describe('the modern attribute against the legacy bits', () => {
  it('lets declared modes overrule a stale feature flag that disagrees', () => {
    /*
     * A modern integration publishes modes and may still carry a legacy
     * `supported_features` from an older version of itself. Consulting the bits
     * as a second chance would put a colour control on a bulb whose own modes
     * say it has none — so an empty answer from the modern list is a real "no",
     * not a reason to keep looking.
     */
    const modernOnOff = attributes({
      supported_color_modes: ['onoff'],
      supported_features: 1 | 2 | 16,
    })

    expect(supportsBrightness(modernOnOff)).toBe(false)
    expect(supportsColorTemp(modernOnOff)).toBe(false)
    expect(supportsColor(modernOnOff)).toBe(false)
  })

  it('treats an empty declared list as a declaration, not as silence', () => {
    expect(
      supportsBrightness(attributes({ supported_color_modes: [], supported_features: 1 }))
    ).toBe(false)
  })
})
