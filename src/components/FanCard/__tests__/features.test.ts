import { describe, it, expect } from 'vitest'
import { FAN_FEATURE, fanHasPresets, readFanFeatures, readFanPresetModes } from '../features'

/**
 * What the fan says it can do — the input every option is gated against, since
 * an option can only ever hide a capability, never add one (common contract,
 * convention 3).
 *
 * The shapes matter more than the bits: `supported_features` reaches a card as
 * whatever an integration, a template, or a hand-written YAML put there.
 */
describe('readFanFeatures', () => {
  it('names Home Assistant’s FanEntityFeature bits', () => {
    expect(FAN_FEATURE).toEqual({ SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8 })
  })

  it('reads each bit independently', () => {
    expect(readFanFeatures({ supported_features: 1 })).toEqual({
      speed: true,
      oscillate: false,
      direction: false,
      preset: false,
    })
    expect(readFanFeatures({ supported_features: 15 })).toEqual({
      speed: true,
      oscillate: true,
      direction: true,
      preset: true,
    })
    expect(readFanFeatures({ supported_features: 9 })).toMatchObject({
      speed: true,
      preset: true,
      oscillate: false,
      direction: false,
    })
  })

  it('answers in booleans, never in masked bits', () => {
    // React prints a numeric `0` as the text "0", so a masked bit gating JSX
    // with `&&` stamps a stray zero on the card.
    for (const value of Object.values(readFanFeatures({ supported_features: 1 }))) {
      expect(typeof value).toBe('boolean')
    }
  })

  it('advertises nothing for a mask it cannot read', () => {
    // `"9" & 1` is `1` in JavaScript, so a coercing read would hand a full
    // feature set to an entity whose `supported_features` is a string — the
    // controls would render, and every command they send would be rejected by
    // an entity that never claimed to support them.
    for (const supported_features of [undefined, null, '9', 'lots', NaN, Infinity, {}, [1]]) {
      expect(readFanFeatures({ supported_features })).toEqual({
        speed: false,
        oscillate: false,
        direction: false,
        preset: false,
      })
    }
    expect(readFanFeatures(undefined)).toEqual({
      speed: false,
      oscillate: false,
      direction: false,
      preset: false,
    })
  })

  it('truncates a fractional mask rather than rejecting it', () => {
    expect(readFanFeatures({ supported_features: 9.7 })).toMatchObject({
      speed: true,
      preset: true,
    })
  })
})

describe('readFanPresetModes', () => {
  it('keeps the modes a pill can be labelled with', () => {
    expect(readFanPresetModes({ preset_modes: ['auto', 'sleep'] })).toEqual(['auto', 'sleep'])
  })

  it('drops everything a pill cannot be labelled with', () => {
    // `preset_modes` arrives from YAML as whatever was written there.
    expect(readFanPresetModes({ preset_modes: [1, null, 'sleep', {}, undefined] })).toEqual([
      'sleep',
    ])
  })

  it('answers with nothing for a list that is not one', () => {
    for (const preset_modes of [undefined, null, 'auto', 42, {}]) {
      expect(readFanPresetModes({ preset_modes })).toEqual([])
    }
    expect(readFanPresetModes(undefined)).toEqual([])
  })
})

describe('fanHasPresets', () => {
  it('needs the bit and at least one usable mode', () => {
    expect(fanHasPresets({ supported_features: 8, preset_modes: ['auto'] })).toBe(true)
    // The bit without a list, which HA entities really do publish.
    expect(fanHasPresets({ supported_features: 8 })).toBe(false)
    expect(fanHasPresets({ supported_features: 8, preset_modes: [] })).toBe(false)
    // A list without the bit.
    expect(fanHasPresets({ supported_features: 1, preset_modes: ['auto'] })).toBe(false)
  })

  it('is false for a list of modes no pill could be labelled with', () => {
    /*
     * The defect this exists to prevent: the configuration form gated
     * `showPresets` on `preset_modes.length` while the renderers filtered to
     * strings, so this fan was offered the option and turning it on produced a
     * card that could never render a preset control.
     */
    expect(fanHasPresets({ supported_features: 8, preset_modes: [1, null] })).toBe(false)
  })

  it('agrees with what the renderers would have to draw', () => {
    // The invariant, stated once: the option is offered exactly when there is
    // something to render. Anything else is an option that does nothing.
    for (const preset_modes of [undefined, [], [1, null], ['auto'], ['auto', 2]]) {
      const attributes = { supported_features: 8, preset_modes }
      expect(fanHasPresets(attributes)).toBe(readFanPresetModes(attributes).length > 0)
    }
  })
})
