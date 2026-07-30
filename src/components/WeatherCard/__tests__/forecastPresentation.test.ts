import { describe, it, expect } from 'vitest'
import {
  DAILY_MIN_COLUMN_WIDTH,
  dailyForecastCapacity,
  forecastColumnLabel,
  forecastColumns,
  horizontalForecastCapacity,
  HOURLY_MIN_COLUMN_WIDTH,
  hourlyForecastCapacity,
  planForecastSections,
  toForecastColumn,
} from '../forecastPresentation'
import { WEATHER_OPTION_DEFAULTS, type WeatherOptions } from '~/store/weatherOptions'
import { parseForecastResponse, type ForecastEntry } from '~/services/forecastData'
import { createDailyForecast, createForecastResponse, createHourlyForecast } from '~/test/fixtures'

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

  it('bounds a horizontal strip by the configured hours where no width was observed', () => {
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

/**
 * The width-aware half of capacity (option doc — "Forecast presentation":
 * "Horizontal capacity is `min(configured, floor(contentWidth /
 * minColumnWidth))`").
 *
 * The two minimums are the CONTRACT's numbers, not the implementation's, which
 * is why they are pinned by value here rather than read from the module and
 * compared to themselves.
 */
describe('the minimum column widths', () => {
  it('are the option doc’s 44px hourly and 60px daily', () => {
    expect(HOURLY_MIN_COLUMN_WIDTH).toBe(44)
    expect(DAILY_MIN_COLUMN_WIDTH).toBe(60)
  })
})

describe('horizontalForecastCapacity', () => {
  it('draws what fits at the minimum width and omits the rest from the end', () => {
    // 200px holds four 44px columns with 24px to spare, and a fifth would put
    // every column under the legible floor — so the fifth is omitted, not
    // shrunk (the standing omit-never-clip rule).
    expect(horizontalForecastCapacity(12, 200, HOURLY_MIN_COLUMN_WIDTH)).toBe(4)
    expect(horizontalForecastCapacity(12, 219, HOURLY_MIN_COLUMN_WIDTH)).toBe(4)
    expect(horizontalForecastCapacity(12, 220, HOURLY_MIN_COLUMN_WIDTH)).toBe(5)
  })

  it('keeps the configured count as the upper bound however wide the tile', () => {
    // A 2000px tile holds 45 hourly columns; the user asked for four.
    expect(horizontalForecastCapacity(4, 2000, HOURLY_MIN_COLUMN_WIDTH)).toBe(4)
  })

  it('omits the section outright when not even one column fits', () => {
    /*
     * The pathological tile: a 16-column screen honoured at 960px lays out a
     * 43px cell, and a theme with a 44px inline inset leaves no content region
     * at all. Both degrade to "no section", which is the same whole-section
     * omission the availability rules already produce — a forecast-less card
     * rather than an illegible one.
     */
    expect(horizontalForecastCapacity(12, 43, HOURLY_MIN_COLUMN_WIDTH)).toBe(0)
    expect(horizontalForecastCapacity(12, 0, HOURLY_MIN_COLUMN_WIDTH)).toBe(0)
    // A content box the theme has inset past its own edge is still no room,
    // never a negative count.
    expect(horizontalForecastCapacity(12, -20, HOURLY_MIN_COLUMN_WIDTH)).toBe(0)
  })

  it('imposes no bound at all when the width was never observed', () => {
    /*
     * `undefined` is not zero. It is a tree that has not been laid out (jsdom,
     * a host with no `ResizeObserver`, the first render before the observer's
     * initial callback), and reading it as "no room" would report that content
     * does not fit on the strength of a measurement that never happened.
     */
    expect(horizontalForecastCapacity(12, undefined, HOURLY_MIN_COLUMN_WIDTH)).toBe(12)
  })
})

describe('capacity once the shell has measured', () => {
  it('narrows a horizontal hourly strip to the columns that fit', () => {
    expect(hourlyForecastCapacity('full', { width: 6, height: 4 }, 12, 300)).toEqual({
      capacity: 6,
      orientation: 'horizontal',
    })
    expect(hourlyForecastCapacity('row', { width: 2, height: 1 }, 4, 100).capacity).toBe(2)
    expect(hourlyForecastCapacity('row', { width: 2, height: 1 }, 4, 30).capacity).toBe(0)
  })

  it('leaves a vertical strip to its height', () => {
    /*
     * A `tall` strip is one column wide by definition, so how many hours it
     * draws is a question about the tile's HEIGHT that a content width cannot
     * answer. A width narrower than a whole hourly column changes nothing here.
     */
    expect(hourlyForecastCapacity('tall', { width: 1, height: 6 }, 4, 20)).toEqual({
      capacity: 4,
      orientation: 'vertical',
    })
  })

  it('narrows the daily row at its own wider minimum', () => {
    // 240px is five hourly columns and four daily ones: a daily column carries
    // a weekday, a glyph and a high–low pair, so it needs more room.
    expect(dailyForecastCapacity('full', 7, 240)).toBe(4)
    expect(dailyForecastCapacity('full', 7, 59)).toBe(0)
    // Still a `full`-only section, whatever the tile measures.
    expect(dailyForecastCapacity('row', 7, 2000)).toBe(0)
  })

  it('plans the drawing with the width and the subscription without it', () => {
    const span = { width: 4, height: 3 }

    /*
     * The two calls a card makes. Without a width the plan enables both
     * sections, which is what gates the subscription (the option doc gates a
     * request on the tier and the option, never on the width). With a width
     * that holds nothing, the same options leave both sections disabled — so a
     * tile too narrow to draw a column draws none, while the forecast it
     * already subscribed to stays in the cache rather than flickering out of it
     * as the tile is resized.
     */
    const forSubscription = planForecastSections('full', span, options())
    expect(forSubscription.hourly.enabled).toBe(true)
    expect(forSubscription.daily.enabled).toBe(true)

    const forDrawing = planForecastSections('full', span, options(), 30)
    expect(forDrawing.hourly).toEqual({ enabled: false, capacity: 0, orientation: 'horizontal' })
    expect(forDrawing.daily).toEqual({ enabled: false, capacity: 0 })

    // And in between: room for the hours but not for a whole day.
    const narrow = planForecastSections('full', span, options(), 100)
    expect(narrow.hourly.capacity).toBe(2)
    expect(narrow.daily.capacity).toBe(1)
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
  /*
   * A label is rendered in the VIEWER's locale, so no assertion here may name
   * the glyphs it comes out as: `2 PM` and `Sat` are one locale's answer, and a
   * test asserting them passes on this machine and fails on a runner whose ICU
   * default is not English — or is not Latin at all.
   *
   * What can be asserted in any locale is the PROPERTY the formatting choice
   * gives the label, which is also the thing worth pinning. Both are periodic:
   * an hour label repeats every 24 hours and changes every hour, a weekday
   * label repeats every 7 days and changes every day. That distinguishes
   * `hour: 'numeric'` from a full timestamp and `weekday: 'short'` from a
   * calendar date — which "looks like two to five Latin letters" never did.
   *
   * Dates are built with the local calendar constructor rather than by adding
   * milliseconds, so a DST transition inside the window cannot shift the local
   * hour out from under the claim.
   */
  const at = (year: number, month: number, day: number, hour: number) =>
    new Date(year, month, day, hour, 0).getTime()

  it('labels an hour by its hour, so it repeats daily and changes hourly', () => {
    const twoPm = forecastColumnLabel(at(2026, 6, 25, 14), 'hourly')

    expect(twoPm).toBeDefined()
    // The same hour on another day is the same label…
    expect(forecastColumnLabel(at(2026, 6, 26, 14), 'hourly')).toBe(twoPm)
    // …the next hour is not…
    expect(forecastColumnLabel(at(2026, 6, 25, 15), 'hourly')).not.toBe(twoPm)
    // …and minutes are below the granularity the strip labels.
    expect(forecastColumnLabel(at(2026, 6, 25, 14) + 59 * 60_000, 'hourly')).toBe(twoPm)
  })

  it('labels a day by its weekday, so it repeats weekly and changes daily', () => {
    const saturday = forecastColumnLabel(at(2026, 6, 25, 12), 'daily')

    expect(saturday).toBeDefined()
    // Seven days on is the same weekday and therefore the same label, which a
    // date-based label would fail.
    expect(forecastColumnLabel(at(2026, 6, 25 + 7, 12), 'daily')).toBe(saturday)
    // The hour is below the granularity a day column labels.
    expect(forecastColumnLabel(at(2026, 6, 25, 23), 'daily')).toBe(saturday)
  })

  it('gives consecutive periods distinct labels', () => {
    const labels = [0, 1, 2].map((offset) =>
      forecastColumnLabel(at(2026, 6, 25 + offset, 12), 'daily')
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
