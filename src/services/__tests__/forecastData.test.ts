import { describe, it, expect } from 'vitest'
import {
  buildForecastRequest,
  deriveDailyFromTwiceDaily,
  DEFAULT_FORECAST_TYPE,
  FORECAST_REFRESH_MS,
  isForecastStale,
  isUnsupportedForecastError,
  isWeatherEntity,
  normalizeForecastType,
  parseForecastResponse,
  resolveForecastType,
  WEATHER_FEATURE_FORECAST_DAILY,
  WEATHER_FEATURE_FORECAST_HOURLY,
  WEATHER_FEATURE_FORECAST_TWICE_DAILY,
  type ForecastEntry,
} from '../forecastData'

const ENTITY = 'weather.home'

/**
 * Local-time ISO timestamps. The daily derivation groups by LOCAL calendar day,
 * so a fixture written in UTC would pair differently depending on where the
 * suite runs.
 */
function localIso(day: number, hour: number): string {
  return new Date(2026, 6, day, hour, 0, 0).toISOString()
}

function response(forecast: unknown[], entityId = ENTITY): Record<string, unknown> {
  return { context: { id: 'ctx' }, response: { [entityId]: { forecast } } }
}

function parse(forecast: unknown[], entityId = ENTITY): ForecastEntry[] {
  const parsed = parseForecastResponse(response(forecast, entityId), entityId)
  if (!parsed) throw new Error('expected a parsed forecast')
  return parsed
}

/** Parse then derive — the pipeline the service runs for a daily request. */
function derive(forecast: unknown[]): ForecastEntry[] {
  return deriveDailyFromTwiceDaily(parse(forecast))
}

describe('normalizeForecastType', () => {
  it.each(['hourly', 'daily', 'twice_daily'] as const)('keeps the known type %s', (type) => {
    expect(normalizeForecastType(type)).toBe(type)
  })

  it.each([undefined, null, 'weekly', 3, {}])('falls back to the default for %s', (value) => {
    expect(normalizeForecastType(value)).toBe(DEFAULT_FORECAST_TYPE)
  })
})

describe('isWeatherEntity', () => {
  it('accepts the weather domain and rejects everything else', () => {
    expect(isWeatherEntity(ENTITY)).toBe(true)
    expect(isWeatherEntity('sensor.outside_temperature')).toBe(false)
  })
})

describe('buildForecastRequest', () => {
  it('calls the response-service with the requested type', () => {
    expect(buildForecastRequest(ENTITY, 'hourly')).toEqual({
      type: 'call_service',
      domain: 'weather',
      service: 'get_forecasts',
      service_data: { type: 'hourly' },
      target: { entity_id: ENTITY },
      // Without this the service runs and returns nothing at all.
      return_response: true,
    })
  })
})

describe('resolveForecastType', () => {
  it('attempts the requested type when the entity advertises nothing', () => {
    expect(resolveForecastType('hourly', undefined)).toBe('hourly')
    expect(resolveForecastType('daily', 'not a number')).toBe('daily')
  })

  it('reads a templated numeric feature mask', () => {
    expect(resolveForecastType('hourly', String(WEATHER_FEATURE_FORECAST_HOURLY))).toBe('hourly')
  })

  it('resolves hourly only when the hourly feature is advertised', () => {
    expect(resolveForecastType('hourly', WEATHER_FEATURE_FORECAST_HOURLY)).toBe('hourly')
    expect(resolveForecastType('hourly', WEATHER_FEATURE_FORECAST_DAILY)).toBeNull()
  })

  it('resolves twice-daily only when the twice-daily feature is advertised', () => {
    expect(resolveForecastType('twice_daily', WEATHER_FEATURE_FORECAST_TWICE_DAILY)).toBe(
      'twice_daily'
    )
    expect(resolveForecastType('twice_daily', WEATHER_FEATURE_FORECAST_DAILY)).toBeNull()
  })

  it('fetches twice-daily for a daily request the integration cannot answer directly', () => {
    expect(resolveForecastType('daily', WEATHER_FEATURE_FORECAST_DAILY)).toBe('daily')
    expect(resolveForecastType('daily', WEATHER_FEATURE_FORECAST_TWICE_DAILY)).toBe('twice_daily')
  })

  it('resolves nothing when the entity advertises no forecast at all', () => {
    expect(resolveForecastType('daily', 0)).toBeNull()
    expect(resolveForecastType('hourly', 0)).toBeNull()
  })
})

describe('isUnsupportedForecastError', () => {
  it('treats a missing service as unsupported', () => {
    expect(isUnsupportedForecastError({ code: 'not_found', message: 'Service not found.' })).toBe(
      true
    )
    expect(isUnsupportedForecastError({ code: 'service_not_found' })).toBe(true)
  })

  it('treats an unsupported-feature error as unsupported', () => {
    expect(
      isUnsupportedForecastError(new Error('Entity weather.home does not support this service.'))
    ).toBe(true)
  })

  it('treats a transport failure as an error, not as unsupported', () => {
    expect(isUnsupportedForecastError(new Error('Connection lost'))).toBe(false)
    expect(isUnsupportedForecastError({ code: 'home_assistant_error' })).toBe(false)
    expect(isUnsupportedForecastError('nope')).toBe(false)
    expect(isUnsupportedForecastError(null)).toBe(false)
  })
})

describe('parseForecastResponse', () => {
  it('reads the forecast out of the service-response envelope', () => {
    const entries = parse([
      { datetime: localIso(25, 12), condition: 'sunny', temperature: 24, templow: 13 },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      condition: 'sunny',
      temperature: 24,
      templow: 13,
      timestamp: Date.parse(localIso(25, 12)),
    })
  })

  it('accepts a response that was already unwrapped', () => {
    const entries = parseForecastResponse({ [ENTITY]: { forecast: [] } }, ENTITY)
    expect(entries).toEqual([])
  })

  it('carries fields it does not know through untouched', () => {
    const [entry] = parse([{ datetime: localIso(25, 12), uv_index: 7, wind_bearing: 'NNW' }])
    expect(entry.uv_index).toBe(7)
    expect(entry.wind_bearing).toBe('NNW')
  })

  it('orders entries by time regardless of how they arrived', () => {
    const entries = parse([
      { datetime: localIso(27, 12) },
      { datetime: localIso(25, 12) },
      { datetime: localIso(26, 12) },
    ])
    expect(entries.map((entry) => entry.datetime)).toEqual([
      localIso(25, 12),
      localIso(26, 12),
      localIso(27, 12),
    ])
  })

  it('coerces a templated numeric temperature', () => {
    const [entry] = parse([{ datetime: localIso(25, 12), temperature: '21.5' }])
    expect(entry.temperature).toBe(21.5)
  })

  it.each([
    ['a non-numeric string', 'warm'],
    ['a blank string', '   '],
    ['a null', null],
    ['a non-finite number', Number.POSITIVE_INFINITY],
  ])('drops %s temperature rather than rendering it', (_label, temperature) => {
    const [entry] = parse([{ datetime: localIso(25, 12), temperature }])
    expect('temperature' in entry).toBe(false)
  })

  it('drops a non-string condition and a non-boolean is_daytime', () => {
    const [entry] = parse([{ datetime: localIso(25, 12), condition: 3, is_daytime: 'yes' }])
    expect('condition' in entry).toBe(false)
    expect('is_daytime' in entry).toBe(false)
  })

  it('drops entries that cannot be placed in time', () => {
    const entries = parse([
      { datetime: localIso(25, 12) },
      { datetime: 'tomorrow' },
      { datetime: 1_700_000 },
      { condition: 'sunny' },
      'not an object',
    ])
    expect(entries).toHaveLength(1)
  })

  it.each([
    ['a non-object response', 'nope'],
    ['a response about another entity', { response: { 'weather.other': { forecast: [] } } }],
    ['a non-object bucket', { response: { [ENTITY]: 'nothing' } }],
    ['a bucket with no forecast array', { response: { [ENTITY]: { forecast: 'none' } } }],
  ])('reports %s as no forecast at all', (_label, raw) => {
    expect(parseForecastResponse(raw, ENTITY)).toBeNull()
  })
})

describe('deriveDailyFromTwiceDaily', () => {
  it('takes the high and condition from the day and the low from its night', () => {
    const derived = derive([
      { datetime: localIso(25, 8), condition: 'sunny', temperature: 26, is_daytime: true },
      { datetime: localIso(25, 20), condition: 'clear-night', temperature: 14, is_daytime: false },
      { datetime: localIso(26, 8), condition: 'rainy', temperature: 19, is_daytime: true },
      { datetime: localIso(26, 20), condition: 'cloudy', temperature: 11, is_daytime: false },
    ])

    expect(derived).toHaveLength(2)
    expect(derived[0]).toMatchObject({
      condition: 'sunny',
      temperature: 26,
      templow: 14,
      datetime: localIso(25, 8),
    })
    expect(derived[1]).toMatchObject({ condition: 'rainy', temperature: 19, templow: 11 })
    // The derived entries are days, not halves of one.
    expect('is_daytime' in derived[0]).toBe(false)
  })

  it('pairs halves that arrive out of order', () => {
    const derived = derive([
      { datetime: localIso(25, 20), condition: 'clear-night', temperature: 14, is_daytime: false },
      { datetime: localIso(26, 8), condition: 'rainy', temperature: 19, is_daytime: true },
      { datetime: localIso(25, 8), condition: 'sunny', temperature: 26, is_daytime: true },
    ])

    expect(derived.map((entry) => entry.datetime)).toEqual([localIso(25, 8), localIso(26, 8)])
    expect(derived[0]).toMatchObject({ condition: 'sunny', temperature: 26, templow: 14 })
  })

  it("prefers the night's own templow over its temperature", () => {
    const [day] = derive([
      { datetime: localIso(25, 8), temperature: 26, is_daytime: true },
      { datetime: localIso(25, 20), temperature: 17, templow: 12, is_daytime: false },
    ])
    expect(day.templow).toBe(12)
  })

  it('sorts the entries it is handed before grouping them', () => {
    const at = (day: number, hour: number, rest: Partial<ForecastEntry>): ForecastEntry => ({
      datetime: localIso(day, hour),
      timestamp: Date.parse(localIso(day, hour)),
      ...rest,
    })
    // Handed over unsorted, as anything that did not come through
    // `parseForecastResponse` would be: the later day first, and the day's two
    // daytime entries in reverse.
    const derived = deriveDailyFromTwiceDaily([
      at(26, 8, { condition: 'rainy', temperature: 19, is_daytime: true }),
      at(25, 10, { condition: 'cloudy', temperature: 22, is_daytime: true }),
      at(25, 8, { condition: 'sunny', temperature: 26, is_daytime: true }),
    ])

    expect(derived.map((entry) => entry.datetime)).toEqual([localIso(25, 8), localIso(26, 8)])
    expect(derived[0]).toMatchObject({ condition: 'sunny', temperature: 26 })
  })

  it('keeps a day whose night half is missing, with no invented low', () => {
    const [day] = derive([
      { datetime: localIso(25, 8), condition: 'sunny', temperature: 26, is_daytime: true },
    ])
    expect(day).toMatchObject({ condition: 'sunny', temperature: 26 })
    expect('templow' in day).toBe(false)
  })

  it("falls back to the daytime entry's own templow when there is no night half", () => {
    const [day] = derive([
      { datetime: localIso(25, 8), temperature: 26, templow: 15, is_daytime: true },
    ])
    expect(day.templow).toBe(15)
  })

  it('keeps a leading night-only day with its low but no high', () => {
    const derived = derive([
      { datetime: localIso(25, 20), condition: 'clear-night', temperature: 14, is_daytime: false },
      { datetime: localIso(26, 8), condition: 'sunny', temperature: 26, is_daytime: true },
      { datetime: localIso(26, 20), condition: 'clear-night', temperature: 13, is_daytime: false },
    ])

    expect(derived).toHaveLength(2)
    // A nighttime reading is not the day's high, so the day carries none rather
    // than misreporting one; the reading it does carry is the low.
    expect(derived[0]).toMatchObject({ condition: 'clear-night', templow: 14 })
    expect('temperature' in derived[0]).toBe(false)
    expect(derived[1]).toMatchObject({ temperature: 26, templow: 13 })
  })

  it('treats an entry with no is_daytime flag as the day', () => {
    const [day] = derive([
      { datetime: localIso(25, 8), condition: 'sunny', temperature: 26 },
      { datetime: localIso(25, 20), temperature: 14, is_daytime: false },
    ])
    expect(day).toMatchObject({ condition: 'sunny', temperature: 26, templow: 14 })
  })

  it('keeps the earlier of duplicate halves', () => {
    const [day] = derive([
      { datetime: localIso(25, 8), condition: 'sunny', temperature: 26, is_daytime: true },
      { datetime: localIso(25, 10), condition: 'rainy', temperature: 22, is_daytime: true },
      { datetime: localIso(25, 20), temperature: 14, is_daytime: false },
      { datetime: localIso(25, 22), temperature: 9, is_daytime: false },
    ])
    expect(day).toMatchObject({ condition: 'sunny', temperature: 26, templow: 14 })
  })

  it('derives nothing from an empty forecast', () => {
    expect(deriveDailyFromTwiceDaily([])).toEqual([])
  })
})

describe('isForecastStale', () => {
  it('measures against the type its own refresh interval', () => {
    const now = Date.parse('2026-07-25T12:00:00.000Z')
    expect(isForecastStale(now - FORECAST_REFRESH_MS.hourly + 1, 'hourly', now)).toBe(false)
    expect(isForecastStale(now - FORECAST_REFRESH_MS.hourly, 'hourly', now)).toBe(true)
    // The same age is still fresh for a daily forecast, which refreshes slower.
    expect(isForecastStale(now - FORECAST_REFRESH_MS.hourly, 'daily', now)).toBe(false)
  })
})
