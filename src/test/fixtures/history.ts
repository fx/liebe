/**
 * History factories: raw samples, recorder responses, and seeded cache entries.
 *
 * Shared infrastructure for the graph stories and tests that land with the
 * sensor and weather cards (0018/0020) — so they consume the same shapes the
 * pipeline produces rather than inventing their own. Excluded from coverage
 * scope: this is development tooling, not product code.
 */
import type { HistoryResponse, HistorySample } from '~/services/historyData'
import { historyStoreActions } from '~/store/historyStore'

/** Frozen "now" so fixture windows are deterministic across renders. */
export const FIXTURE_HISTORY_END = Date.parse('2026-07-25T12:00:00.000Z')

const MS_PER_HOUR = 3_600_000

export interface HistorySeriesOptions {
  /** Window length in hours. Defaults to 24. */
  hours?: number
  /** Number of samples generated across the window. Defaults to 48. */
  count?: number
  /** Timestamp of the newest sample. Defaults to {@link FIXTURE_HISTORY_END}. */
  end?: number
}

/**
 * Evenly spaced samples across a window, from a value function of the sample's
 * position (0 at the oldest, 1 at the newest).
 */
export function createHistorySamples(
  value: (progress: number, index: number) => number,
  options: HistorySeriesOptions = {}
): HistorySample[] {
  const { hours = 24, count = 48, end = FIXTURE_HISTORY_END } = options
  const start = end - hours * MS_PER_HOUR
  const step = (end - start) / Math.max(1, count - 1)
  return Array.from({ length: count }, (_, index) => ({
    t: Math.round(start + step * index),
    value: value(count === 1 ? 1 : index / (count - 1), index),
  }))
}

/**
 * A day of indoor temperature: a diurnal curve around 21°C with a small
 * measurement wobble, so a sparkline drawn from it has both a shape and
 * bucket extremes to preserve.
 */
export function createTemperatureHistory(options: HistorySeriesOptions = {}): HistorySample[] {
  return createHistorySamples(
    (progress, index) =>
      Math.round((21 + Math.sin(progress * Math.PI * 2) * 3 + (index % 3) * 0.2) * 10) / 10,
    options
  )
}

/**
 * A `total_increasing` energy counter that RESETS partway through — the case
 * min/max downsampling erases and `delta` mode exists to handle.
 */
export function createEnergyCounterHistory(options: HistorySeriesOptions = {}): HistorySample[] {
  return createHistorySamples((_, index) => {
    const run = index % 12
    return Math.round(run * 0.35 * 100) / 100
  }, options)
}

/**
 * A recorder response in the compressed shape `history/history_during_period`
 * returns for `minimal_response` + `no_attributes` requests: `s` for the state,
 * `lu` for last-updated as epoch SECONDS.
 */
export function createHistoryResponse(entityId: string, samples: HistorySample[]): HistoryResponse {
  return {
    [entityId]: samples.map(({ t, value }) => ({ s: String(value), lu: t / 1000 })),
  }
}

/** A response carrying non-numeric states — how an entity resolves `unsupported`. */
export function createNonNumericHistoryResponse(
  entityId: string,
  states: string[] = ['home', 'not_home', 'home'],
  options: HistorySeriesOptions = {}
): HistoryResponse {
  const samples = createHistorySamples(() => 0, { ...options, count: states.length })
  return {
    [entityId]: samples.map(({ t }, index) => ({ s: states[index], lu: t / 1000 })),
  }
}

/**
 * Seed a history window directly into the cache, for stories that need a graph
 * without a Home Assistant connection behind it.
 */
export function seedEntityHistory(entityId: string, samples: HistorySample[], hours = 24): void {
  historyStoreActions.patchEntry(entityId, hours, {
    samples,
    version: 1,
    isLoading: false,
    error: null,
    unsupported: false,
    updatedAt: Date.now(),
  })
}
