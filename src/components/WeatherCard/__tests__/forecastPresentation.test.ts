import { describe, it, expect } from 'vitest'
import {
  dailyForecastCapacity,
  forecastColumnLabel,
  forecastColumns,
  hourlyForecastCapacity,
  planForecastSections,
  toForecastColumn,
} from '../forecastPresentation'
import { WEATHER_OPTION_DEFAULTS, type WeatherOptions } from '~/store/weatherOptions'
import { parseForecastResponse } from '~/services/forecastData'
import { createDailyForecast, createForecastResponse, createHourlyForecast } from '~/test/fixtures'
import type { ForecastEntry } from '~/services/forecastData'

/**
 * The forecast layout rules, as pure functions.
 *
 * Tier gating and the upper-bound rule are a table, so they are tested as one
 * rather than through sixteen renders. The entries come from the 0015 fixture
 * factories through the real parser, so what is measured here is the shape the
 * pipeline actually produces rather than one invented for the test.
 */

const ENTITY = 'weather.home'

function entries(raw: Record<string, unknown>[]): ForecastEntry[] {
  return parseForecastResponse(createForecastResponse(ENTITY, raw), ENTITY) ?? []
}

const options = (overrides: Partial<WeatherOptions> = {}): WeatherOptions => ({
  ...WEATHER_OPTION_DEFAULTS,
  ...overrides,
})

describe('hourlyForecastCapacity', () => {
  it('gives a 1×1 tile no strip at all', () => {
    expect(hourlyForecastCapacity('glance', { width: 1, height: 1 }, 4).capacity).toBe(0)
  })

  it('bounds a horizontal strip by the configured hours only', () => {
    expect(hourlyForecastCapacity('row', { width: 2, height: 1 }, 4)).toEqual({
      capacity: 4,
      orientation: 'horizontal',
    })
    expect(hourlyForecastCapacity('full', { width: 6, height: 4 }, 12)).toEqual({
      capacity: 12,
      orientation: 'horizontal',
    })
  })

  it('runs a tall tile’s strip down it, bounded by the cells left over', () => {
    // Icon, readout and meta take the first two cells; each cell after that
    // carries one hour.
    expect(hourlyForecastCapacity('tall', { width: 1, height: 2 }, 4)).toEqual({
      capacity: 0,
      orientation: 'vertical',
    })
    expect(hourlyForecastCapacity('tall', { width: 1, height: 4 }, 4).capacity).toBe(2)
    expect(hourlyForecastCapacity('tall', { width: 1, height: 8 }, 4).capacity).toBe(4)
    // The option is still the upper bound when the tile has more room than it.
    expect(hourlyForecastCapacity('tall', { width: 1, height: 8 }, 2).capacity).toBe(2)
  })

  it('promises a tall tile no room when it was told no span', () => {
    // A card rendered outside a grid cannot be told it fits, so it omits —
    // which is the omit-never-clip rule applied to an unknown, not a guess.
    expect(hourlyForecastCapacity('tall', undefined, 4).capacity).toBe(0)
    // The horizontal tiers do not depend on height and are unaffected.
    expect(hourlyForecastCapacity('row', undefined, 4).capacity).toBe(4)
  })

  it('reads a fractional span down to whole cells', () => {
    expect(hourlyForecastCapacity('tall', { width: 1, height: 4.8 }, 4).capacity).toBe(2)
  })
})

describe('dailyForecastCapacity', () => {
  it('is a full-tier section and nothing else', () => {
    expect(dailyForecastCapacity('full', 4)).toBe(4)
    for (const tier of ['glance', 'row', 'tall'] as const) {
      expect(dailyForecastCapacity(tier, 4)).toBe(0)
    }
  })
})

describe('planForecastSections', () => {
  it('switches a section off when its option is off, room or no room', () => {
    const plan = planForecastSections('full', { width: 4, height: 3 }, options())
    expect(plan.hourly.enabled).toBe(true)
    expect(plan.daily.enabled).toBe(true)

    const hidden = planForecastSections(
      'full',
      { width: 4, height: 3 },
      options({ showHourlyForecast: false, showDailyForecast: false })
    )
    expect(hidden.hourly.enabled).toBe(false)
    expect(hidden.daily.enabled).toBe(false)
  })

  it('switches a section off when the tier has no room, option or no option', () => {
    const glance = planForecastSections('glance', { width: 1, height: 1 }, options())
    expect(glance.hourly.enabled).toBe(false)
    expect(glance.daily.enabled).toBe(false)

    // `row` keeps the hourly strip and loses only the multi-day row.
    const row = planForecastSections('row', { width: 3, height: 1 }, options())
    expect(row.hourly.enabled).toBe(true)
    expect(row.daily.enabled).toBe(false)
  })
})

describe('forecastColumns', () => {
  const hourly = entries(createHourlyForecast({ count: 12 }))

  it('draws at most the configured count', () => {
    expect(forecastColumns(hourly, 4)).toHaveLength(4)
    expect(forecastColumns(hourly, 12)).toHaveLength(12)
  })

  it('renders what arrived and never pads to the count', () => {
    // The upper-bound rule: an integration that sent two hours produces two
    // columns, not four with two blanks.
    expect(forecastColumns(entries(createHourlyForecast({ count: 2 })), 4)).toHaveLength(2)
    expect(forecastColumns([], 4)).toEqual([])
  })

  it('draws nothing at all for a section with no room', () => {
    expect(forecastColumns(hourly, 0)).toEqual([])
    expect(forecastColumns(hourly, -1)).toEqual([])
  })

  it('keeps the pipeline’s order — oldest first', () => {
    const columns = forecastColumns(hourly, 5)
    const timestamps = columns.map((entry) => entry.timestamp)

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))
  })
})

describe('toForecastColumn', () => {
  const [daily] = entries(createDailyForecast({ count: 1 }))

  it('converts both temperatures into the card’s unit', () => {
    const celsius = toForecastColumn(daily, {
      granularity: 'daily',
      entityUnit: '°C',
      temperatureUnit: 'auto',
    })
    expect(celsius.high).toEqual({ value: 24, unit: '°C' })
    expect(celsius.low).toEqual({ value: 13, unit: '°C' })

    // The option doc requires EVERY temperature the card renders to follow
    // `temperatureUnit`, forecast values included, so the card never mixes
    // units across the readings it shows at once.
    const fahrenheit = toForecastColumn(daily, {
      granularity: 'daily',
      entityUnit: '°C',
      temperatureUnit: 'fahrenheit',
    })
    expect(fahrenheit.high?.unit).toBe('°F')
    expect(fahrenheit.high?.value).toBeCloseTo(75.2, 1)
    expect(fahrenheit.low?.value).toBeCloseTo(55.4, 1)
  })

  it('leaves out a temperature the entry does not carry', () => {
    const hourly = entries(createHourlyForecast({ count: 1 }))[0]
    const column = toForecastColumn(hourly, {
      granularity: 'hourly',
      entityUnit: '°C',
      temperatureUnit: 'auto',
    })

    // An hourly entry is one reading with no low to pair it with.
    expect(column.high).toBeDefined()
    expect(column.low).toBeUndefined()
  })

  it('never presents a night’s low as the day’s high', () => {
    /*
     * The shape `deriveDailyFromTwiceDaily` emits for a day whose daytime half
     * is missing — the leading half of a forecast fetched in the evening. It
     * carries a low and NO temperature on purpose, and a column that filled the
     * high slot from the low would reintroduce exactly the misreport the
     * derivation avoids.
     */
    const nightOnly: ForecastEntry = {
      datetime: '2026-07-25T20:00:00.000Z',
      timestamp: Date.parse('2026-07-25T20:00:00.000Z'),
      condition: 'clear-night',
      templow: 12,
    }

    const column = toForecastColumn(nightOnly, {
      granularity: 'daily',
      entityUnit: '°C',
      temperatureUnit: 'auto',
    })

    expect(column.high).toBeUndefined()
    expect(column.low).toEqual({ value: 12, unit: '°C' })
  })
})

describe('forecastColumnLabel', () => {
  it('names an hour and a weekday from the entry’s own instant', () => {
    // Built in local time so the assertion holds wherever the suite runs; the
    // rendering itself is the viewer's locale, which is either clock.
    const at = new Date(2026, 6, 25, 14, 0).getTime()

    expect(forecastColumnLabel(at, 'hourly')).toMatch(/^(14|2\s?PM)$/i)
    expect(forecastColumnLabel(at, 'daily')).toMatch(/^[A-Za-z.]{2,5}$/)
  })

  it('gives consecutive periods distinct labels', () => {
    const day = new Date(2026, 6, 25, 12, 0).getTime()
    const labels = [0, 1, 2].map((offset) =>
      forecastColumnLabel(day + offset * 86_400_000, 'daily')
    )

    expect(new Set(labels).size).toBe(3)
  })

  it('has no label for an instant that is not one', () => {
    // The pipeline's parser drops an entry whose `datetime` will not parse, so
    // this is the belt to that braces: no label rather than "Invalid Date".
    expect(forecastColumnLabel(Number.NaN, 'hourly')).toBeUndefined()
    expect(forecastColumnLabel(Number.POSITIVE_INFINITY, 'daily')).toBeUndefined()
  })
})
