import { describe, it, expect, afterEach } from 'vitest'
import {
  formatTemperature,
  formatWindBearing,
  getConditionEmoji,
  getConditionGlyph,
  getTemperatureDisplay,
  getWeatherBackground,
  getWeatherTextColor,
  getWeatherTextStyles,
  readWeatherNumber,
  readWeatherReading,
  resolveConditionBackground,
  resolveSecondaryReading,
  resolveUnavailableStatus,
  supplementalReadings,
  WEATHER_ARTWORK_FG,
} from '../presentation'
import { WEATHER_SECONDARY_INFO } from '~/store/weatherOptions'

/**
 * The weather card's presentation rules, as pure functions.
 *
 * This file exists because the entity-cards spec recorded the condition
 * background — `getWeatherBackground`, the `__LIEBE_ASSET_BASE_URL__` prefix and
 * the white-text treatment — as shipped-but-untested (docs/specs/entity-cards/
 * index.md — "Open Questions"), and because `secondaryInfo`'s fallback order is
 * specified per value and per absence, which is a table rather than a render.
 *
 * The shapes asserted here are the ones a real Home Assistant produces and this
 * build has to survive rather than the ones it was written against: a condition
 * string no version of Liebe has met, an attribute published as `null` or as a
 * numeric string, a bearing given as a name instead of degrees.
 */

/**
 * A condition string no vocabulary uses, for the cases about an UNRECOGNISED
 * one.
 *
 * Synthetic on purpose. `exceptional`, `hail`, `lightning` and `pouring` all
 * read like placeholders but are real Home Assistant conditions
 * (`homeassistant/components/weather/__init__.py`), and a test that pinned one
 * of them into the unknown path would assert a true thing about a false
 * premise: it passes, it survives mutation probing, and it quietly stops
 * describing anything the moment that condition is mapped properly.
 */
const UNKNOWN_CONDITION = 'zorptastic'

const attributes = {
  temperature: 22,
  temperature_unit: '°C',
  humidity: 65,
  wind_speed: 12,
  wind_speed_unit: 'km/h',
  apparent_temperature: 19,
  uv_index: 4,
  pressure: 1013,
}

const input = { attributes, temperatureUnit: 'auto' as const }

describe('resolveUnavailableStatus', () => {
  it('names which of the two lifecycle states arrived', () => {
    // Not one shared literal: the states mean different faults, and the status
    // line is the only place a viewer can tell them apart (change 0037 PR 1).
    expect(resolveUnavailableStatus('unavailable')).toBe('UNAVAILABLE')
    expect(resolveUnavailableStatus('unknown')).toBe('UNKNOWN')
  })

  it('declines a state that reports actual weather', () => {
    /*
     * `undefined` is the caller's gate as well as its label — a variant draws the
     * inert card exactly when this answers — so declining is what keeps a real
     * condition on the ordinary card. `unavailable` is not a weather condition
     * and no HA integration publishes one shaped like it, so the two arms
     * partition the domain rather than leaving a middle.
     */
    for (const state of ['sunny', 'rainy', 'exceptional', UNKNOWN_CONDITION, '']) {
      expect(resolveUnavailableStatus(state)).toBeUndefined()
    }
  })
})

describe('readWeatherNumber', () => {
  it('reads numbers and numeric strings, and declines everything else', () => {
    expect(readWeatherNumber(21.4)).toBe(21.4)
    expect(readWeatherNumber(0)).toBe(0)
    // A template-backed weather entity publishes whatever its template
    // rendered, which is routinely a string.
    expect(readWeatherNumber('21.4')).toBe(21.4)

    /*
     * Everything below coerces to a NUMBER under `Number()` or `Math.round()` —
     * `null` and `''` to 0, `true` to 1 — which is the whole point: declining
     * them is the difference between omitting a reading and inventing one.
     */
    expect(readWeatherNumber(null)).toBeUndefined()
    expect(readWeatherNumber(undefined)).toBeUndefined()
    expect(readWeatherNumber('')).toBeUndefined()
    expect(readWeatherNumber('  ')).toBeUndefined()
    expect(readWeatherNumber('unknown')).toBeUndefined()
    expect(readWeatherNumber(true)).toBeUndefined()
    expect(readWeatherNumber(Number.NaN)).toBeUndefined()
    expect(readWeatherNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(readWeatherNumber({ value: 3 })).toBeUndefined()
    expect(readWeatherNumber([3])).toBeUndefined()
  })
})

describe('getTemperatureDisplay', () => {
  it('shows the entity’s own unit under auto', () => {
    expect(getTemperatureDisplay(22, '°C', 'auto')).toEqual({ value: 22, unit: '°C' })
    expect(getTemperatureDisplay(72, '°F', 'auto')).toEqual({ value: 72, unit: '°F' })
  })

  it('converts in both directions and leaves a matching unit alone', () => {
    expect(getTemperatureDisplay(22, '°C', 'fahrenheit')).toEqual({ value: 71.6, unit: '°F' })
    expect(getTemperatureDisplay(72, '°F', 'celsius')?.value).toBeCloseTo(22.22, 2)
    expect(getTemperatureDisplay(22, '°C', 'celsius')).toEqual({ value: 22, unit: '°C' })
    expect(getTemperatureDisplay(72, '°F', 'fahrenheit')).toEqual({ value: 72, unit: '°F' })
  })

  it('reads an entity publishing no unit as Celsius', () => {
    expect(getTemperatureDisplay(22, undefined, 'auto')).toEqual({ value: 22, unit: '°C' })
    expect(getTemperatureDisplay(22, '', 'fahrenheit')).toEqual({ value: 71.6, unit: '°F' })
  })

  it('has nothing to show for a temperature the entity did not report', () => {
    expect(getTemperatureDisplay(undefined, '°C', 'auto')).toBeUndefined()
    expect(getTemperatureDisplay(null, '°C', 'auto')).toBeUndefined()
    expect(getTemperatureDisplay('unavailable', '°C', 'fahrenheit')).toBeUndefined()
  })

  it('formats a reading as one string', () => {
    expect(formatTemperature({ value: 21.6, unit: '°C' })).toBe('22°C')
  })
})

describe('formatWindBearing', () => {
  it('names a bearing in degrees', () => {
    expect(formatWindBearing(0)).toBe('N')
    expect(formatWindBearing(90)).toBe('E')
    expect(formatWindBearing(220)).toBe('SW')
    // 350° rounds past the last point and must wrap back to N rather than
    // index past the end of the table.
    expect(formatWindBearing(350)).toBe('N')
    expect(formatWindBearing(720)).toBe('N')
    expect(formatWindBearing(-90)).toBe('W')
  })

  it('passes an already-named point through, and omits what it cannot read', () => {
    expect(formatWindBearing('NW')).toBe('NW')
    expect(formatWindBearing(undefined)).toBeUndefined()
    expect(formatWindBearing(null)).toBeUndefined()
    expect(formatWindBearing('')).toBeUndefined()
  })
})

describe('secondary info', () => {
  it('formats each of the five kinds', () => {
    expect(readWeatherReading('humidity', input)).toMatchObject({ value: '65%', text: '65%' })
    expect(readWeatherReading('wind', input)).toMatchObject({
      value: '12 km/h',
      text: 'Wind 12 km/h',
    })
    expect(readWeatherReading('feels-like', input)).toMatchObject({
      value: '19°C',
      text: 'Feels like 19°C',
    })
    expect(readWeatherReading('uv', input)).toMatchObject({ value: '4', text: 'UV 4' })
    expect(readWeatherReading('pressure', input)).toMatchObject({
      value: '1013 hPa',
      text: 'Pressure 1013 hPa',
    })
  })

  it('names the wind direction when the entity reports one', () => {
    expect(
      readWeatherReading('wind', { ...input, attributes: { ...attributes, wind_bearing: 220 } })
        ?.value
    ).toBe('12 km/h SW')
  })

  it('renders a wind reading the entity gives no unit for, with no dangling space', () => {
    expect(readWeatherReading('wind', { ...input, attributes: { wind_speed: 12 } })?.value).toBe(
      '12'
    )
  })

  it('assumes hPa only when the entity publishes no pressure unit', () => {
    expect(
      readWeatherReading('pressure', {
        ...input,
        attributes: { pressure: 29.9, pressure_unit: 'inHg' },
      })?.value
    ).toBe('30 inHg')
  })

  it('converts the feels-like value with the rest of the card', () => {
    expect(
      readWeatherReading('feels-like', { attributes, temperatureUnit: 'fahrenheit' })?.value
    ).toBe('66°F')
  })

  it('features the configured attribute when the entity publishes it', () => {
    for (const kind of WEATHER_SECONDARY_INFO) {
      expect(resolveSecondaryReading(kind, input)?.kind).toBe(kind)
    }
  })

  /*
   * The fallback order in full: humidity → wind → feels-like → uv → pressure,
   * "starting from `humidity`" whatever was configured. Each case removes every
   * attribute earlier in the chain, so the assertion pins the ORDER and not
   * merely that some fallback happened.
   */
  it('falls back through the whole order, starting at humidity', () => {
    /** The entity with the first four of the chain removed. */
    const pressureOnly = {
      temperature: attributes.temperature,
      temperature_unit: attributes.temperature_unit,
      pressure: attributes.pressure,
    }

    // Configured `uv`, entity has no `uv_index`: humidity, per the doc's own
    // scenario.
    expect(
      resolveSecondaryReading('uv', {
        ...input,
        attributes: { ...attributes, uv_index: undefined },
      })?.kind
    ).toBe('humidity')

    expect(
      resolveSecondaryReading('uv', {
        ...input,
        attributes: { ...attributes, uv_index: null, humidity: null },
      })?.kind
    ).toBe('wind')

    expect(
      resolveSecondaryReading('uv', {
        ...input,
        attributes: { ...pressureOnly, apparent_temperature: 19 },
      })?.kind
    ).toBe('feels-like')

    expect(
      resolveSecondaryReading('humidity', {
        ...input,
        attributes: { ...pressureOnly, uv_index: 4 },
      })?.kind
    ).toBe('uv')

    expect(resolveSecondaryReading('humidity', { ...input, attributes: pressureOnly })?.kind).toBe(
      'pressure'
    )
  })

  it('omits the line entirely when the entity publishes none of the five', () => {
    expect(
      resolveSecondaryReading('humidity', {
        ...input,
        attributes: { temperature: 22, temperature_unit: '°C' },
      })
    ).toBeUndefined()
    expect(resolveSecondaryReading('humidity', { ...input, attributes: undefined })).toBeUndefined()
  })

  it('continues the detail line without repeating the featured value', () => {
    const featured = resolveSecondaryReading('humidity', input)

    expect(supplementalReadings(featured, input).map((reading) => reading.kind)).toEqual([
      'feels-like',
      'wind',
    ])
    expect(
      supplementalReadings(resolveSecondaryReading('wind', input), input).map((r) => r.kind)
    ).toEqual(['feels-like', 'humidity'])
    // A featured kind that is not one of the three leaves all three in place.
    expect(
      supplementalReadings(resolveSecondaryReading('pressure', input), input).map((r) => r.kind)
    ).toEqual(['feels-like', 'wind', 'humidity'])
    // And a card with no featured reading at all still has none to repeat.
    expect(supplementalReadings(undefined, { ...input, attributes: {} })).toEqual([])
  })
})

describe('condition glyphs', () => {
  it('resolves each condition family, and something for one it has never met', () => {
    expect(getConditionEmoji('sunny')).toBe('☀️')
    expect(getConditionEmoji('clear-night')).toBe('☀️')
    expect(getConditionEmoji('light-rain')).toBe('🌧️')
    expect(getConditionEmoji('partlycloudy')).toBe('☁️')
    expect(getConditionEmoji('heavy-snow')).toBe('❄️')
    expect(getConditionEmoji('thunderstorm')).toBe('⛈️')
    /*
     * Forward compatibility: an unknown or non-string condition must still
     * produce a glyph rather than throwing inside a card's render. The value
     * has to be one no vocabulary uses — `hail` and `exceptional` are both real
     * Home Assistant conditions, and pinning a recognised state into the
     * unknown path would assert the wrong thing is unknown.
     */
    expect(getConditionEmoji(UNKNOWN_CONDITION)).toBe('🌤️')
    expect(getConditionEmoji(undefined)).toBe('🌤️')

    expect(getConditionGlyph('sunny').displayName).toBe('Sun')
    expect(getConditionGlyph('rainy').displayName).toBe('CloudRain')
    expect(getConditionGlyph('drizzle').displayName).toBe('CloudDrizzle')
    expect(getConditionGlyph('snowy').displayName).toBe('CloudSnow')
    expect(getConditionGlyph('lightning').displayName).toBe('Zap')
    expect(getConditionGlyph(UNKNOWN_CONDITION).displayName).toBe('Cloud')
    expect(getConditionGlyph(null).displayName).toBe('Cloud')
  })

  it('warns rather than showing weather for Home Assistant’s exceptional state', () => {
    /*
     * `exceptional` is not a kind of weather. It is
     * `ATTR_CONDITION_EXCEPTIONAL` in
     * `homeassistant/components/weather/__init__.py` — severe weather, or an
     * integration saying it cannot report — so a generic cloud tells the viewer
     * the opposite of what the entity is saying.
     */
    expect(getConditionGlyph('exceptional').displayName).toBe('TriangleAlert')
    expect(getConditionEmoji('exceptional')).toBe('⚠️')
  })
})

describe('getWeatherBackground', () => {
  afterEach(() => {
    delete window.__LIEBE_ASSET_BASE_URL__
  })

  it('maps the condition vocabularies onto the shipped artwork', () => {
    // Home Assistant's own states.
    expect(getWeatherBackground('sunny')).toBe('/weather-backgrounds/clear-day.png')
    expect(getWeatherBackground('partlycloudy')).toBe('/weather-backgrounds/partly-cloudy-day.png')
    expect(getWeatherBackground('rainy')).toBe('/weather-backgrounds/rain.png')
    expect(getWeatherBackground('snowy')).toBe('/weather-backgrounds/snow.png')
    expect(getWeatherBackground('windy')).toBe('/weather-backgrounds/wind.png')
    expect(getWeatherBackground('fog')).toBe('/weather-backgrounds/fog.png')
    expect(getWeatherBackground('cloudy')).toBe('/weather-backgrounds/cloudy.png')
    // Pirate Weather's icon names, which share the map.
    expect(getWeatherBackground('possible-sleet-night')).toBe('/weather-backgrounds/sleet.png')
    expect(getWeatherBackground('dangerous-wind')).toBe('/weather-backgrounds/wind.png')
    expect(getWeatherBackground('clear-night')).toBe('/weather-backgrounds/clear-night.png')
  })

  it('normalizes case and surrounding space', () => {
    expect(getWeatherBackground('  RAINY  ')).toBe('/weather-backgrounds/rain.png')
  })

  it('resolves a compound condition it has no exact row for', () => {
    expect(getWeatherBackground('clearsky')).toBe('/weather-backgrounds/clear-day.png')
    expect(getWeatherBackground('clear-sky-night')).toBe('/weather-backgrounds/clear-night.png')
    expect(getWeatherBackground('rainshowers')).toBe('/weather-backgrounds/rain.png')
    expect(getWeatherBackground('snowshowers')).toBe('/weather-backgrounds/snow.png')
    expect(getWeatherBackground('partly-clouded-night')).toBe(
      '/weather-backgrounds/partly-cloudy-night.png'
    )
    expect(getWeatherBackground('mostly-clouded')).toBe(
      '/weather-backgrounds/partly-cloudy-day.png'
    )
    expect(getWeatherBackground('clouded-over')).toBe('/weather-backgrounds/cloudy.png')
    expect(getWeatherBackground('breezy-later')).toBe('/weather-backgrounds/wind.png')
    expect(getWeatherBackground('misty')).toBe('/weather-backgrounds/fog.png')
  })

  it('resolves nothing for a condition this build has never met', () => {
    // The vocabulary belongs to the integration, so an unmapped condition is a
    // normal state of affairs and not an error: the card stays on its themed
    // surface. The fixture is synthetic on purpose — see `UNKNOWN_CONDITION`.
    expect(getWeatherBackground(UNKNOWN_CONDITION)).toBeNull()
    expect(getWeatherBackground('')).toBeNull()
    expect(getWeatherBackground(undefined)).toBeNull()
    expect(getWeatherBackground(42)).toBeNull()
  })

  it('resolves nothing for the real conditions it ships no artwork for', () => {
    /*
     * These four ARE Home Assistant conditions
     * (`homeassistant/components/weather/__init__.py`), and none of them
     * reaches artwork: `exceptional` and `lightning` have no row and match no
     * substring rule, and `hail`/`pouring` are spelled nothing like the words
     * the substring rules look for. A card on any of them renders on the themed
     * surface, which is correct-but-thin: filling these gaps means new artwork,
     * which change 0020 puts out of scope.
     */
    for (const condition of ['exceptional', 'hail', 'lightning', 'pouring']) {
      expect(getWeatherBackground(condition)).toBeNull()
    }
  })

  it('answers only for the conditions it declares, not for its prototype', () => {
    /*
     * The key is the ENTITY's state, so any string reaches this table — and a
     * plain object literal answers for `Object.prototype`'s members, where
     * `CONDITION_BACKGROUNDS['constructor']` is a truthy function that would be
     * interpolated into a URL. This is the second instance of that shape on the
     * project; the climate card's `hvacModeConfig` is the first.
     */
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(getWeatherBackground(key)).toBeNull()
    }
  })

  it('prefixes every route with the published asset base URL', () => {
    window.__LIEBE_ASSET_BASE_URL__ = 'https://ha.example/local/liebe/'

    // The direct map, the substring rules — both, because the panel is served
    // from a different base path in production and a route resolving against
    // the origin root 404s there.
    expect(getWeatherBackground('rain')).toBe(
      'https://ha.example/local/liebe/weather-backgrounds/rain.png'
    )
    expect(getWeatherBackground('rainshowers')).toBe(
      'https://ha.example/local/liebe/weather-backgrounds/rain.png'
    )
  })

  it('falls back to the origin root when no base URL is published', () => {
    expect(getWeatherBackground('rain')).toBe('/weather-backgrounds/rain.png')
  })
})

describe('resolveConditionBackground', () => {
  it('paints the artwork when the option and the variant both allow it', () => {
    expect(resolveConditionBackground({ condition: 'rainy', showConditionBackground: true })).toBe(
      '/weather-backgrounds/rain.png'
    )
  })

  it('paints nothing when the option is off', () => {
    expect(
      resolveConditionBackground({ condition: 'rainy', showConditionBackground: false })
    ).toBeNull()
  })

  it('paints nothing for a variant that never does', () => {
    expect(
      resolveConditionBackground({
        condition: 'rainy',
        showConditionBackground: true,
        variantPaintsBackground: false,
      })
    ).toBeNull()
  })
})

describe('text treatment', () => {
  it('carries a shadow accent over artwork and nothing at all without one', () => {
    const plain = getWeatherTextStyles(false)
    expect(plain.text).toEqual({})
    expect(plain.icon).toEqual({})

    const over = getWeatherTextStyles(true)
    expect(over.text.textShadow).toContain('rgba(0,0,0,0.9)')
    expect(over.icon.filter).toContain('drop-shadow')

    // The emphasis variant is a stronger shadow; the two arms still differ.
    expect(getWeatherTextStyles(true, 'emphasis').text.textShadow).not.toBe(over.text.textShadow)
    expect(getWeatherTextStyles(true, 'default').text.textShadow).toBe(over.text.textShadow)
  })

  it('pins no colour, so the theme layer keeps reaching the text', () => {
    // The design-system rule requires the scrim AND that overlaid text stay
    // reachable by the theme layer. A `color: white` here is the second half
    // failing: it is a declaration no theme can restyle, and it was also what
    // let the card claim legibility that a 1.01:1 measurement disagreed with.
    const over = getWeatherTextStyles(true)
    expect(over.text.color).toBeUndefined()
    expect(over.icon.color).toBeUndefined()
    expect(getWeatherTextStyles(true, 'emphasis').text.color).toBeUndefined()
  })

  it('yields the Radix colour prop over artwork, and keeps it otherwise', () => {
    expect(getWeatherTextColor(true, 'gray')).toBeUndefined()
    expect(getWeatherTextColor(false, 'gray')).toBe('gray')
    expect(getWeatherTextColor(false)).toBeUndefined()
  })

  it('colours the nodes that must be told through the foreground token', () => {
    // A lucide glyph would otherwise keep `var(--gray-9)` on the photograph.
    // Naming the token rather than `white` is what keeps that one declaration
    // inside the theming channel — the value is the same while the artwork
    // scope is in force, and a theme can still restyle it.
    expect(WEATHER_ARTWORK_FG).toBe('var(--liebe-fg)')
  })
})
