import { describe, it, expect } from 'vitest'
import {
  buildHistoryRequest,
  downsampleHistory,
  historyWindowMs,
  isNonNumericState,
  parseHistoryResponse,
  pruneSamples,
  type HistorySample,
} from '../historyData'

const T0 = Date.parse('2026-07-25T00:00:00.000Z')
const HOUR = 3_600_000

function samplesAt(...pairs: Array<[hours: number, value: number]>): HistorySample[] {
  return pairs.map(([hours, value]) => ({ t: T0 + hours * HOUR, value }))
}

describe('historyWindowMs', () => {
  it('converts hours to milliseconds', () => {
    expect(historyWindowMs(24)).toBe(86_400_000)
  })
})

describe('isNonNumericState', () => {
  it.each(['21.4', '-3', '0', '1e3'])('treats %s as numeric', (state) => {
    expect(isNonNumericState(state)).toBe(false)
  })

  it.each(['unavailable', 'unknown', 'none', '', 'UNAVAILABLE'])(
    'treats the transient state %s as inconclusive rather than unsupported',
    (state) => {
      expect(isNonNumericState(state)).toBe(false)
    }
  )

  it.each(['home', 'on', 'partlycloudy'])('reports %s as non-numeric', (state) => {
    expect(isNonNumericState(state)).toBe(true)
  })
})

describe('buildHistoryRequest', () => {
  it('asks the recorder for states only, without significant-change filtering', () => {
    expect(buildHistoryRequest('sensor.power', T0, T0 + HOUR)).toEqual({
      type: 'history/history_during_period',
      start_time: '2026-07-25T00:00:00.000Z',
      end_time: '2026-07-25T01:00:00.000Z',
      entity_ids: ['sensor.power'],
      minimal_response: true,
      no_attributes: true,
      // Intermediate samples ARE the data delta mode needs.
      significant_changes_only: false,
    })
  })
})

describe('parseHistoryResponse', () => {
  it('reads the compressed row shape', () => {
    const parsed = parseHistoryResponse(
      {
        'sensor.t': [
          { s: '21.4', lu: T0 / 1000 },
          { s: '21.9', lu: (T0 + HOUR) / 1000 },
        ],
      },
      'sensor.t'
    )
    expect(parsed).toEqual({
      samples: [
        { t: T0, value: 21.4 },
        { t: T0 + HOUR, value: 21.9 },
      ],
      nonNumeric: false,
    })
  })

  it('reads the uncompressed row shape, falling back to last_changed', () => {
    const parsed = parseHistoryResponse(
      {
        'sensor.t': [
          { state: '1', last_updated: '2026-07-25T00:00:00.000Z' },
          { state: '2', last_changed: '2026-07-25T01:00:00.000Z' },
        ],
      },
      'sensor.t'
    )
    expect(parsed.samples).toEqual([
      { t: T0, value: 1 },
      { t: T0 + HOUR, value: 2 },
    ])
  })

  it('drops unparseable rows without failing the parse', () => {
    const parsed = parseHistoryResponse(
      {
        'sensor.t': [
          { s: '1', lu: T0 / 1000 },
          // no state at all
          { lu: T0 / 1000 },
          // an empty state would parse as 0
          { s: '   ', lu: T0 / 1000 },
          { s: 'unavailable', lu: T0 / 1000 },
          // no usable timestamp
          { s: '9' },
          { s: '3', last_updated: 'not-a-date' },
          { s: '2', lu: (T0 + HOUR) / 1000 },
        ],
      },
      'sensor.t'
    )
    expect(parsed).toEqual({
      samples: [
        { t: T0, value: 1 },
        { t: T0 + HOUR, value: 2 },
      ],
      nonNumeric: false,
    })
  })

  it('reports an entity whose every state is non-numeric', () => {
    const parsed = parseHistoryResponse(
      {
        'device_tracker.phone': [
          { s: 'home', lu: T0 / 1000 },
          { s: 'not_home', lu: T0 / 1000 },
        ],
      },
      'device_tracker.phone'
    )
    expect(parsed).toEqual({ samples: [], nonNumeric: true })
  })

  it('does not report a window of nothing but unavailable as non-numeric', () => {
    // An integration that was down for the whole window says nothing about
    // whether the entity is graphable — resolving `unsupported` here would
    // blank a real sensor's graph until its integration came back.
    const parsed = parseHistoryResponse(
      {
        'sensor.t': [
          { s: 'unavailable', lu: T0 / 1000 },
          { s: 'unknown', lu: (T0 + HOUR) / 1000 },
        ],
      },
      'sensor.t'
    )
    expect(parsed).toEqual({ samples: [], nonNumeric: false })
  })

  it('does not report a numeric entity as non-numeric when its timestamps are unusable', () => {
    const parsed = parseHistoryResponse({ 'sensor.t': [{ s: '21.4' }] }, 'sensor.t')
    expect(parsed).toEqual({ samples: [], nonNumeric: false })
  })

  it('reports an absent or empty entity as neither samples nor non-numeric', () => {
    expect(parseHistoryResponse({}, 'sensor.t')).toEqual({ samples: [], nonNumeric: false })
    expect(parseHistoryResponse(null, 'sensor.t')).toEqual({ samples: [], nonNumeric: false })
    expect(parseHistoryResponse({ 'sensor.t': [] }, 'sensor.t')).toEqual({
      samples: [],
      nonNumeric: false,
    })
  })

  it('sorts samples oldest-first', () => {
    const parsed = parseHistoryResponse(
      {
        'sensor.t': [
          { s: '2', lu: (T0 + HOUR) / 1000 },
          { s: '1', lu: T0 / 1000 },
        ],
      },
      'sensor.t'
    )
    expect(parsed.samples.map((sample) => sample.value)).toEqual([1, 2])
  })
})

describe('pruneSamples', () => {
  it('keeps one sentinel from before the cutoff', () => {
    const samples = samplesAt([0, 1], [1, 2], [2, 3], [3, 4])
    expect(pruneSamples(samples, T0 + 2 * HOUR)).toEqual(samplesAt([1, 2], [2, 3], [3, 4]))
  })

  it('returns the same array when nothing has aged out', () => {
    const samples = samplesAt([0, 1], [1, 2])
    expect(pruneSamples(samples, T0)).toBe(samples)
    expect(pruneSamples(samples, T0 - HOUR)).toBe(samples)
    // The first sample is already the sentinel.
    expect(pruneSamples(samples, T0 + HOUR)).toBe(samples)
  })

  it('keeps the newest sample when every sample predates the cutoff', () => {
    const samples = samplesAt([0, 1], [1, 2], [2, 3])
    expect(pruneSamples(samples, T0 + 10 * HOUR)).toEqual(samplesAt([2, 3]))
  })

  it('handles an empty series', () => {
    const samples: HistorySample[] = []
    expect(pruneSamples(samples, T0)).toBe(samples)
  })
})

describe('downsampleHistory', () => {
  const window = { start: T0, end: T0 + 4 * HOUR }

  it('returns nothing for an empty series', () => {
    expect(downsampleHistory([], { ...window, points: 4, mode: 'sample' })).toEqual([])
  })

  it('bounds the series to the requested point count', () => {
    const samples = Array.from({ length: 500 }, (_, index) => ({
      t: T0 + index * 100,
      value: index,
    }))
    const result = downsampleHistory(samples, { ...window, points: 10, mode: 'sample' })
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('takes the bucket-end value while preserving the bucket extremes', () => {
    // Two samples per bucket: a spike and a settled value.
    const samples = samplesAt([0, 5], [0.5, 40], [1, 6], [1.5, 2], [2, 7], [3, 8])
    const result = downsampleHistory(samples, { ...window, points: 4, mode: 'sample' })
    expect(result).toEqual([
      { t: T0 + HOUR, value: 40, min: 5, max: 40 },
      { t: T0 + 2 * HOUR, value: 2, min: 2, max: 6 },
      { t: T0 + 3 * HOUR, value: 7, min: 7, max: 7 },
      { t: T0 + 4 * HOUR, value: 8, min: 8, max: 8 },
    ])
  })

  it('carries the last known value through buckets with no samples', () => {
    const samples = samplesAt([0, 5], [3, 9])
    const result = downsampleHistory(samples, { ...window, points: 4, mode: 'sample' })
    expect(result.map((point) => point.value)).toEqual([5, 5, 5, 9])
  })

  it('omits buckets that precede the first sample', () => {
    const samples = samplesAt([2.5, 12])
    const result = downsampleHistory(samples, { ...window, points: 4, mode: 'sample' })
    expect(result).toEqual([
      { t: T0 + 3 * HOUR, value: 12, min: 12, max: 12 },
      { t: T0 + 4 * HOUR, value: 12, min: 12, max: 12 },
    ])
  })

  it('clamps a sample landing exactly on the window end into the last bucket', () => {
    const samples = samplesAt([4, 3])
    const result = downsampleHistory(samples, { ...window, points: 4, mode: 'sample' })
    expect(result).toEqual([{ t: T0 + 4 * HOUR, value: 3, min: 3, max: 3 }])
  })

  it('always produces at least one bucket', () => {
    const samples = samplesAt([1, 4], [2, 6])
    expect(downsampleHistory(samples, { ...window, points: 0, mode: 'sample' })).toEqual([
      { t: T0 + 4 * HOUR, value: 6, min: 4, max: 6 },
    ])
  })

  it('survives a zero-length window without producing NaN coordinates', () => {
    const samples = samplesAt([0, 4])
    const result = downsampleHistory(samples, { start: T0, end: T0, points: 4, mode: 'sample' })
    expect(result).toHaveLength(4)
    expect(result.every((point) => Number.isFinite(point.t) && Number.isFinite(point.value))).toBe(
      true
    )
  })

  describe('delta mode', () => {
    it('sums a total_increasing counter reset-aware from the raw samples', () => {
      // The spec scenario: 0 -> 10 -> 0 -> 5 inside ONE bucket is 15, not the
      // 10 a min/max downsample would leave behind.
      const samples = samplesAt([0, 0], [0.2, 10], [0.4, 0], [0.6, 5])
      const result = downsampleHistory(samples, {
        ...window,
        points: 4,
        mode: 'delta',
        stateClass: 'total_increasing',
      })
      expect(result[0]).toEqual({ t: T0 + HOUR, value: 15, min: 15, max: 15 })
    })

    it('sums a total signed, so a decrease counts against the bucket', () => {
      const samples = samplesAt([0, 0], [0.2, 10], [0.4, 4])
      const result = downsampleHistory(samples, {
        ...window,
        points: 4,
        mode: 'delta',
        stateClass: 'total',
      })
      expect(result[0].value).toBe(4)
    })

    it('measures from the sample before the bucket, so boundary movement counts', () => {
      const samples = samplesAt([0.5, 100], [1.5, 130])
      const result = downsampleHistory(samples, {
        ...window,
        points: 4,
        mode: 'delta',
        stateClass: 'total_increasing',
      })
      expect(result.map((point) => point.value)).toEqual([0, 30, 0, 0])
    })

    it('measures from a sentinel that predates the window', () => {
      const samples = [{ t: T0 - HOUR, value: 100 }, ...samplesAt([0.5, 130])]
      const result = downsampleHistory(samples, {
        ...window,
        points: 4,
        mode: 'delta',
        stateClass: 'total_increasing',
      })
      expect(result[0].value).toBe(30)
    })

    it('reports no movement for buckets with no samples', () => {
      const samples = samplesAt([0, 5], [3.5, 9])
      const result = downsampleHistory(samples, {
        ...window,
        points: 4,
        mode: 'delta',
        stateClass: 'total',
      })
      expect(result.map((point) => point.value)).toEqual([0, 0, 0, 4])
    })

    it('reports min and max as the bucket movement itself', () => {
      const samples = samplesAt([0.1, 2], [0.2, 9])
      const [point] = downsampleHistory(samples, { ...window, points: 4, mode: 'delta' })
      expect(point).toEqual({ t: T0 + HOUR, value: 7, min: 7, max: 7 })
    })
  })
})
