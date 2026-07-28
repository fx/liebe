import { describe, it, expect } from 'vitest'
import {
  WEATHER_OPTION_DEFAULTS,
  migrateWeatherCardConfig,
  readWeatherOptions,
  weatherOptionsConfigSchema,
} from '../weatherOptions'
import { dashboardConfigSchema } from '../configSchema'

/**
 * The weather card's option contract (docs/specs/entity-cards/options/
 * weather.md).
 *
 * Two things are being pinned. First, that a value which does not validate
 * resolves to its default at RENDER rather than failing — the forward-
 * compatibility rule every option module follows. Second, that the legacy
 * `preset` keeps selecting a variant, which the option doc states as a MUST and
 * which is the rename convention 1 names as its own example.
 */

describe('readWeatherOptions', () => {
  it('leaves an unconfigured card exactly as it shipped', () => {
    expect(readWeatherOptions(undefined)).toEqual(WEATHER_OPTION_DEFAULTS)
    expect(readWeatherOptions({})).toEqual(WEATHER_OPTION_DEFAULTS)
    // The two new keys default to what the card already did, which is why this
    // change ships no pinning migration: there is no existing card whose
    // behaviour the defaults change.
    expect(WEATHER_OPTION_DEFAULTS.secondaryInfo).toBe('humidity')
    expect(WEATHER_OPTION_DEFAULTS.showConditionBackground).toBe(true)
  })

  it('reads every stored value back', () => {
    const stored = {
      variant: 'detailed',
      temperatureUnit: 'fahrenheit',
      secondaryInfo: 'wind',
      showConditionBackground: false,
      showHourlyForecast: false,
      forecastHours: 8,
      showDailyForecast: false,
      forecastDays: 6,
    }

    expect(readWeatherOptions(stored)).toEqual(stored)
  })

  it('resolves a legacy preset as the variant', () => {
    expect(readWeatherOptions({ preset: 'modern' }).variant).toBe('modern')
    // Both keys present — a document migrated once and then given the legacy
    // key back — resolves to the current one.
    expect(readWeatherOptions({ preset: 'modern', variant: 'minimal' }).variant).toBe('minimal')
  })

  it('falls back to a default for a value it cannot interpret', () => {
    expect(readWeatherOptions({ variant: 'minimalist' }).variant).toBe('default')
    expect(readWeatherOptions({ variant: 7 }).variant).toBe('default')
    expect(readWeatherOptions({ preset: 'nope' }).variant).toBe('default')
    expect(readWeatherOptions({ temperatureUnit: 'kelvin' }).temperatureUnit).toBe('auto')
    expect(readWeatherOptions({ secondaryInfo: 'windspeed' }).secondaryInfo).toBe('humidity')
    // A truthy non-boolean is not a `true`: the key is a boolean or it is
    // absent, and "false" would otherwise turn the background back on.
    expect(readWeatherOptions({ showConditionBackground: 'false' }).showConditionBackground).toBe(
      true
    )
  })
})

describe('migrateWeatherCardConfig', () => {
  it('renames a stored preset to the current key', () => {
    expect(migrateWeatherCardConfig({ preset: 'detailed', temperatureUnit: 'celsius' })).toEqual({
      variant: 'detailed',
      temperatureUnit: 'celsius',
    })
  })

  it('drops the legacy key when the current one is already there', () => {
    expect(migrateWeatherCardConfig({ preset: 'detailed', variant: 'minimal' })).toEqual({
      variant: 'minimal',
    })
  })

  it('returns a config with nothing to rename unchanged, by reference', () => {
    const config = { variant: 'modern', secondaryInfo: 'uv' }

    expect(migrateWeatherCardConfig(config)).toBe(config)
  })

  it('turns an absent config into an empty one', () => {
    // Both callers always have an object; taking `undefined` here is what keeps
    // the guard out of each of them, where it would be a branch no route
    // reaches.
    expect(migrateWeatherCardConfig(undefined)).toEqual({})
  })

  it('carries a value it does not recognise through the rename', () => {
    // Resolving what a variant name MEANS is the card's job at render; the
    // loader's job is only that the value ends up under the current key.
    expect(migrateWeatherCardConfig({ preset: 'from-a-later-build' })).toEqual({
      variant: 'from-a-later-build',
    })
  })
})

describe('the weather fragment of the item schema', () => {
  it('rejects a secondaryInfo no build has', () => {
    expect(weatherOptionsConfigSchema.safeParse({ secondaryInfo: 'windspeed' }).success).toBe(false)
    expect(weatherOptionsConfigSchema.safeParse({ secondaryInfo: 'wind' }).success).toBe(true)
    expect(weatherOptionsConfigSchema.safeParse({ showConditionBackground: 'no' }).success).toBe(
      false
    )
  })

  /*
   * `variant` is shared with the climate card, whose legal values are entirely
   * different, and the item config schema is ONE shape for every domain. So
   * neither card's enum may be validated there — a stored `variant: dial` and a
   * stored `variant: minimal` both have to import.
   */
  it('accepts both domains’ variants, because the item shape is shared', () => {
    const document = (variant: string) => ({
      version: '1.3.0',
      screens: [
        {
          id: 's',
          name: 'S',
          type: 'grid' as const,
          grid: {
            items: [
              {
                id: 'i',
                type: 'entity' as const,
                entityId: 'weather.home',
                config: { variant },
                x: 0,
                y: 0,
                width: 2,
                height: 2,
              },
            ],
          },
        },
      ],
    })

    expect(dashboardConfigSchema.safeParse(document('minimal')).success).toBe(true)
    expect(dashboardConfigSchema.safeParse(document('dial')).success).toBe(true)
  })
})
