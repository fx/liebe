import { describe, it, expect } from 'vitest'
import {
  CLIMATE_OPTION_DEFAULTS,
  climateOptionsConfigSchema,
  readClimateOptions,
} from '../climateOptions'

/**
 * Reading the climate card's stored options.
 *
 * The rule every reader here follows is the one `readCardDisplay` sets: a value
 * this build cannot interpret resolves to the key's default rather than being
 * rejected, and nothing is written back. Card config is hand-editable and
 * arrives from documents written by other builds, so the render path's job is
 * to render (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
describe('readClimateOptions', () => {
  it('answers with the documented defaults for a card with no options', () => {
    expect(readClimateOptions(undefined)).toEqual(CLIMATE_OPTION_DEFAULTS)
    expect(readClimateOptions({})).toEqual(CLIMATE_OPTION_DEFAULTS)
  })

  it('reads every option a card actually stores', () => {
    expect(
      readClimateOptions({
        variant: 'dial',
        showModePills: false,
        showPresets: true,
        showFanModes: true,
        showCurrentTemp: false,
        showHumidity: false,
        displayUnit: 'fahrenheit',
      })
    ).toEqual({
      variant: 'dial',
      showModePills: false,
      showPresets: true,
      showFanModes: true,
      showCurrentTemp: false,
      showHumidity: false,
      displayUnit: 'fahrenheit',
    })
  })

  it('falls back to the default for values it cannot interpret', () => {
    expect(
      readClimateOptions({
        variant: 'semi-dial',
        showModePills: 'yes',
        showPresets: 1,
        displayUnit: 'kelvin',
      })
    ).toEqual(CLIMATE_OPTION_DEFAULTS)
  })
})

describe('climateOptionsConfigSchema', () => {
  it('accepts the keys a card writes', () => {
    expect(
      climateOptionsConfigSchema.safeParse({ showPresets: true, displayUnit: 'celsius' }).success
    ).toBe(true)
  })

  it('rejects a display unit no build has', () => {
    // Import-gated rather than resolved at render: a document naming a unit
    // that does not exist is one its author needs telling about.
    expect(climateOptionsConfigSchema.safeParse({ displayUnit: 'kelvin' }).success).toBe(false)
  })

  it('leaves `variant` to the card registry', () => {
    /*
     * The item config schema is one shape shared by every domain, and `variant`
     * is also the weather card's key with an entirely different value set. An
     * enum here would reject every stored weather card, so which variants are
     * legal stays the registry's question.
     */
    expect(climateOptionsConfigSchema.safeParse({ variant: 'modern' }).success).toBe(true)
  })
})
