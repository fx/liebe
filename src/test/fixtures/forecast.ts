/**
 * Forecast factories: raw `weather.get_forecasts` entries, service responses,
 * and seeded cache entries.
 *
 * Shared infrastructure for the weather stories and tests that land with 0020 —
 * so they consume the shape the pipeline actually produces rather than inventing
 * their own. Excluded from coverage scope: this is development tooling, not
 * product code.
 */
import { parseForecastResponse, type ForecastType } from '~/services/forecastData'
import { forecastStoreActions } from '~/store/forecastStore'

/** Frozen "now" so fixture forecasts are deterministic across renders. */
export const FIXTURE_FORECAST_START = Date.parse('2026-07-25T12:00:00.000Z')

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 24 * MS_PER_HOUR

/** A raw forecast entry, exactly as it arrives inside a service response. */
export type RawForecastEntry = Record<string, unknown>

export interface ForecastSeriesOptions {
  /** Number of entries generated. Defaults to the factory's own default. */
  count?: number
  /** Timestamp of the first entry. Defaults to {@link FIXTURE_FORECAST_START}. */
  start?: number
}

const CONDITIONS = ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'clear-night']

function conditionAt(index: number): string {
  return CONDITIONS[index % CONDITIONS.length]
}

/** An hourly forecast: a temperature curve with per-hour precipitation odds. */
export function createHourlyForecast(options: ForecastSeriesOptions = {}): RawForecastEntry[] {
  const { count = 12, start = FIXTURE_FORECAST_START } = options
  return Array.from({ length: count }, (_, index) => ({
    datetime: new Date(start + index * MS_PER_HOUR).toISOString(),
    condition: conditionAt(index),
    temperature: Math.round((18 + Math.sin((index / count) * Math.PI * 2) * 6) * 10) / 10,
    precipitation: index % 4 === 0 ? 0.4 : 0,
    precipitation_probability: (index * 7) % 100,
    humidity: 50 + (index % 5) * 3,
    wind_speed: 6 + (index % 3) * 2,
  }))
}

/** A daily forecast: one entry per day with a high and a low. */
export function createDailyForecast(options: ForecastSeriesOptions = {}): RawForecastEntry[] {
  const { count = 5, start = FIXTURE_FORECAST_START } = options
  return Array.from({ length: count }, (_, index) => ({
    datetime: new Date(start + index * MS_PER_DAY).toISOString(),
    condition: conditionAt(index),
    temperature: 24 + (index % 3),
    templow: 13 + (index % 4),
    precipitation: index % 3 === 0 ? 1.2 : 0,
    precipitation_probability: (index * 13) % 100,
  }))
}

/**
 * A twice-daily forecast: a daytime and a nighttime half per day, the shape an
 * integration advertising only `FORECAST_TWICE_DAILY` returns. `count` days
 * become `count * 2` entries, day first.
 *
 * The halves are anchored to LOCAL morning and evening, as Home Assistant's own
 * are — the daily derivation groups by local calendar day, so a fixture written
 * in UTC would split its pairs across days wherever the suite runs offset.
 */
export function createTwiceDailyForecast(options: ForecastSeriesOptions = {}): RawForecastEntry[] {
  const { count = 4, start = FIXTURE_FORECAST_START } = options
  const anchor = new Date(start)
  const localMidday = (index: number, hour: number) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + index, hour).toISOString()

  return Array.from({ length: count }, (_, index) => [
    {
      datetime: localMidday(index, 8),
      condition: conditionAt(index),
      temperature: 24 + (index % 3),
      is_daytime: true,
    },
    {
      datetime: localMidday(index, 20),
      condition: 'clear-night',
      temperature: 13 + (index % 4),
      is_daytime: false,
    },
  ]).flat()
}

/**
 * A `weather.get_forecasts` response, in the `{ context, response }` envelope a
 * response-service call returns over the WebSocket API.
 */
export function createForecastResponse(
  entityId: string,
  forecast: RawForecastEntry[]
): Record<string, unknown> {
  return {
    context: { id: 'fixture-context', parent_id: null, user_id: null },
    response: { [entityId]: { forecast } },
  }
}

/**
 * Seed a forecast directly into the cache, for stories that need forecast
 * content without a Home Assistant connection behind it. Raw entries go through
 * the real parser, so what is seeded is what a fetch would have produced.
 */
export function seedWeatherForecast(
  entityId: string,
  forecast: RawForecastEntry[],
  type: ForecastType = 'daily'
): void {
  forecastStoreActions.patchEntry(entityId, type, {
    forecast: parseForecastResponse(createForecastResponse(entityId, forecast), entityId) ?? [],
    isLoading: false,
    error: null,
    unsupported: false,
    updatedAt: Date.now(),
  })
}

/**
 * Seed the answer the pipeline resolves for an entity whose integration cannot
 * forecast this type at all.
 *
 * A separate helper rather than an argument, because `unsupported` is not an
 * empty forecast and the two render for different reasons: an empty one may
 * fill on the next refresh, an unsupported one never will and is not asked for
 * again (`WeatherForecastService.maintain`). A story that wants "this card has
 * no forecast" wants this one.
 */
export function seedUnsupportedForecast(entityId: string, type: ForecastType = 'daily'): void {
  forecastStoreActions.patchEntry(entityId, type, {
    forecast: [],
    isLoading: false,
    error: null,
    unsupported: true,
    updatedAt: Date.now(),
  })
}
