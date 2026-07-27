/**
 * Pure history data handling: the recorder request, the response parser, the
 * rolling-window prune, and the downsampler.
 *
 * Deliberately free of store, React, and Home Assistant imports — the e2e suite
 * feeds a REAL `history/history_during_period` payload from the dockerized
 * instance straight into `parseHistoryResponse`, which only works if this module
 * can be imported outside the panel bundle.
 *
 * Contract owner: docs/specs/entity-state/index.md — "History & Forecast Hooks".
 */

/** A raw numeric sample, from the recorder or from live state ingress. */
export interface HistorySample {
  /** Epoch milliseconds. */
  t: number
  value: number
}

/**
 * How a window of raw samples is reduced to one value per bucket.
 *
 * - `sample` — the reading as it stood at the end of the bucket, with the
 *   bucket's extremes preserved alongside it (a spike must survive
 *   downsampling).
 * - `delta` — how much the reading moved during the bucket, computed from the
 *   raw samples so a counter reset inside the bucket is still counted.
 */
export type HistoryMode = 'sample' | 'delta'

export interface HistoryPoint {
  /** Bucket end, epoch milliseconds — the instant `value` describes. */
  t: number
  value: number
  /** Lowest raw sample in the bucket (`=== value` in `delta` mode). */
  min: number
  /** Highest raw sample in the bucket (`=== value` in `delta` mode). */
  max: number
}

/** Default rolling window, in hours. */
export const DEFAULT_HISTORY_HOURS = 24

/**
 * Default bucket count. Cards are a few hundred pixels wide, so a hundred
 * points is already more than the sparkline can resolve; the cap is what keeps
 * a chatty entity's day of history from reaching the DOM sample by sample.
 */
export const DEFAULT_HISTORY_POINTS = 100

/**
 * Upper bound on the requested bucket count. A card is a few hundred CSS pixels
 * wide, so this is already an order of magnitude past what any graph can
 * resolve; it exists so a junk `points` cannot ask for an array the browser has
 * to allocate.
 */
export const MAX_HISTORY_POINTS = 5_000

/**
 * Upper bound on the window, in hours — one year. Far enough past any card's
 * use, and close enough to keep the window start a representable `Date`:
 * `buildHistoryRequest` throws on `toISOString()` once the start overflows.
 */
export const MAX_HISTORY_HOURS = 24 * 365

const MS_PER_HOUR = 3_600_000

/**
 * Clamp a requested window to something that can be turned into a time range.
 *
 * `hours` reaches here from card configuration, and a dashboard document this
 * build cannot fully interpret still renders (docs/specs/dashboard-config —
 * Forward Compatibility), so a junk value gets read rather than rejected. A
 * non-finite or non-positive request describes no window at all and falls back
 * to the default; anything else is capped. Fractions are kept — a half-hour
 * window is a legitimate ask.
 */
export function normalizeHistoryHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_HISTORY_HOURS
  return Math.min(hours, MAX_HISTORY_HOURS)
}

/**
 * Clamp a requested point count to a whole number of buckets.
 *
 * `points` is a maximum, so zero or fewer is a request for an empty series
 * rather than an error. A non-finite count is not a request at all and falls
 * back to the default.
 */
export function normalizeHistoryPoints(points: number): number {
  if (!Number.isFinite(points)) return DEFAULT_HISTORY_POINTS
  return Math.min(Math.max(Math.floor(points), 0), MAX_HISTORY_POINTS)
}

/** Window length in milliseconds, for a window length that may be junk. */
export function historyWindowMs(hours: number): number {
  return normalizeHistoryHours(hours) * MS_PER_HOUR
}

/**
 * States that carry no reading but say nothing about whether the entity is
 * numeric — every numeric entity passes through these on restart or when its
 * integration drops out.
 */
const TRANSIENT_STATES = new Set(['unavailable', 'unknown', 'none', ''])

/**
 * Whether a state proves the entity is not graphable. `unavailable` and friends
 * do not: they are transient, and treating them as `unsupported` would blank a
 * sensor's graph for as long as its integration is down.
 */
export function isNonNumericState(state: string): boolean {
  return !TRANSIENT_STATES.has(state.toLowerCase()) && !Number.isFinite(Number(state))
}

/** One row of a `history/history_during_period` response. */
export interface HistoryResponseRow {
  /** State, compressed form. */
  s?: string
  /** State, uncompressed form. */
  state?: string
  /** Last updated, compressed form: epoch SECONDS as a float. */
  lu?: number
  last_updated?: string
  last_changed?: string
}

export type HistoryResponse = Record<string, HistoryResponseRow[] | undefined>

export interface ParsedHistory {
  /** Numeric samples, oldest first. */
  samples: HistorySample[]
  /**
   * The entity reported states that prove it is not graphable, and never one
   * that parsed as a number. A window of nothing but `unavailable` does NOT
   * count — that is an integration that was down, not a text entity.
   */
  nonNumeric: boolean
}

/**
 * The WebSocket command for a window. `minimal_response`/`no_attributes` keep
 * the payload to states and timestamps — a day of a chatty sensor is otherwise
 * megabytes of repeated attributes — and significant-changes filtering is off
 * because it is exactly the intermediate samples `delta` mode needs.
 */
export function buildHistoryRequest(
  entityId: string,
  start: number,
  end: number
): Record<string, unknown> {
  return {
    type: 'history/history_during_period',
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  }
}

/** Epoch milliseconds for a row, whichever timestamp form it carries. */
function rowTime(row: HistoryResponseRow): number | undefined {
  if (typeof row.lu === 'number') return row.lu * 1000
  const iso = row.last_updated ?? row.last_changed
  if (iso === undefined) return undefined
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Numeric samples for one entity out of a recorder response.
 *
 * Non-numeric rows are dropped rather than failing the parse: a numeric sensor's
 * history routinely contains `unavailable` runs. An entity whose rows are ALL
 * non-numeric is reported as such, which is how a text entity resolves to
 * `unsupported` instead of to an empty graph.
 */
export function parseHistoryResponse(
  response: HistoryResponse | null | undefined,
  entityId: string
): ParsedHistory {
  const rows = response?.[entityId] ?? []
  const samples: HistorySample[] = []
  // Tracked separately from the sample count: a row can be numeric and still
  // produce no sample (an unusable timestamp), and that must not be read as
  // evidence the entity is non-numeric.
  let sawNumeric = false
  let sawNonNumeric = false

  for (const row of rows) {
    const state = row.s ?? row.state
    if (state === undefined) continue
    // `Number('')` is 0, so an empty state would otherwise parse as a reading.
    if (state.trim() === '') continue
    const value = Number(state)
    if (!Number.isFinite(value)) {
      // `unavailable`/`unknown` prove nothing; a real word does.
      sawNonNumeric ||= isNonNumericState(state)
      continue
    }
    sawNumeric = true
    const t = rowTime(row)
    if (t === undefined) continue
    samples.push({ t, value })
  }

  // The recorder returns rows in order, but the parse is a boundary: sorting
  // here is what lets everything downstream assume ascending time.
  samples.sort((a, b) => a.t - b.t)
  return { samples, nonNumeric: sawNonNumeric && !sawNumeric }
}

/**
 * Drop samples that have aged out of the rolling window, retaining ONE sample
 * from before the cutoff. That sentinel is what gives `delta`'s first bucket a
 * predecessor to measure against as the window advances — without it, every
 * window slide would silently discard the movement between the last pruned
 * sample and the first surviving one.
 *
 * Returns the input array unchanged when nothing ages out, so callers can use
 * reference equality to detect a no-op.
 */
export function pruneSamples(samples: HistorySample[], cutoff: number): HistorySample[] {
  const firstInWindow = samples.findIndex((sample) => sample.t >= cutoff)
  // Every sample is older than the cutoff: the newest one is the sentinel.
  const start = firstInWindow === -1 ? samples.length - 1 : firstInWindow - 1
  return start <= 0 ? samples : samples.slice(start)
}

export interface DownsampleOptions {
  /** Window start, epoch milliseconds. */
  start: number
  /** Window end, epoch milliseconds. */
  end: number
  /** Maximum number of buckets returned; normalised by `normalizeHistoryPoints`. */
  points: number
  mode: HistoryMode
  /** The entity's `state_class`; decides how `delta` treats a decrease. */
  stateClass?: string
}

/**
 * Movement across one bucket, measured from the raw samples.
 *
 * `previous` is the last sample before the bucket, so movement that happened
 * across the bucket boundary is attributed to the bucket it landed in.
 *
 * With `total_increasing` a decrease means the counter restarted, so the new
 * reading is itself the movement since the reset (`0 → 10 → 0 → 5` is 15, not
 * 10). With `total` a decrease is a legitimate signed value and is summed as-is.
 */
function bucketDelta(
  previous: HistorySample | undefined,
  bucket: HistorySample[],
  resetAware: boolean
): number {
  let total = 0
  let last = previous?.value
  for (const { value } of bucket) {
    if (last !== undefined) {
      const difference = value - last
      total += resetAware && difference < 0 ? value : difference
    }
    last = value
  }
  return total
}

/**
 * Reduce raw samples to at most `points` buckets across the window.
 *
 * A bucket with no samples of its own still gets a point: Home Assistant states
 * hold until the next change, so the carried value is the reading at that
 * bucket's end (`sample`) and no movement occurred (`delta`). Buckets before the
 * first sample are omitted — nothing is known about them.
 */
export function downsampleHistory(
  samples: HistorySample[],
  { start, end, points, mode, stateClass }: DownsampleOptions
): HistoryPoint[] {
  if (samples.length === 0) return []

  // `points` is a maximum, and it arrives from card configuration: a junk value
  // would otherwise make `bucketCount` non-finite, and `Array.from` either
  // allocates nonsense or throws on an invalid length.
  const bucketCount = normalizeHistoryPoints(points)
  if (bucketCount === 0) return []
  const width = Math.max(end - start, 1) / bucketCount
  const buckets: HistorySample[][] = Array.from({ length: bucketCount }, () => [])
  let carried: HistorySample | undefined

  for (const sample of samples) {
    if (sample.t < start) {
      carried = sample
      continue
    }
    // Clamped rather than dropped at the top end: Home Assistant's clock can
    // run ahead of the browser's, and discarding the newest reading is a worse
    // failure than attributing it to the last bucket.
    const index = Math.min(bucketCount - 1, Math.floor((sample.t - start) / width))
    buckets[index].push(sample)
  }

  const resetAware = stateClass === 'total_increasing'
  const result: HistoryPoint[] = []

  for (let index = 0; index < bucketCount; index += 1) {
    const bucket = buckets[index]
    const t = Math.round(start + width * (index + 1))

    if (bucket.length === 0) {
      if (carried === undefined) continue
      const value = mode === 'delta' ? 0 : carried.value
      result.push({ t, value, min: value, max: value })
      continue
    }

    if (mode === 'delta') {
      const value = bucketDelta(carried, bucket, resetAware)
      result.push({ t, value, min: value, max: value })
    } else {
      let min = bucket[0].value
      let max = bucket[0].value
      for (const { value } of bucket) {
        if (value < min) min = value
        if (value > max) max = value
      }
      result.push({ t, value: bucket[bucket.length - 1].value, min, max })
    }

    carried = bucket[bucket.length - 1]
  }

  return result
}
