import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EntityHistoryService, HISTORY_FRESHNESS_TTL_MS } from '../entityHistory'
import { historyCacheKey, historyStore, historyStoreActions } from '../../store/historyStore'
import { entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HistoryResponse, HistorySample } from '../historyData'

const NOW = Date.parse('2026-07-25T12:00:00.000Z')
const HOUR = 3_600_000
const ENTITY = 'sensor.power'

/**
 * Maintenance runs once per downsample bucket, floored at a minute. A 24h
 * window's bucket is longer than the freshness TTL, so every tick of one would
 * refetch — the timing tests use a one-hour window, whose bucket lands on the
 * floor and therefore ticks well inside the TTL.
 */
const SHORT_HOURS = 1
const MAINTENANCE_TICK_MS = 60_000

function response(samples: HistorySample[], entityId = ENTITY): HistoryResponse {
  return { [entityId]: samples.map(({ t, value }) => ({ s: String(value), lu: t / 1000 })) }
}

function seriesEndingAt(end: number, values: number[], step = 60_000): HistorySample[] {
  return values.map((value, index) => ({
    t: end - (values.length - 1 - index) * step,
    value,
  }))
}

/**
 * Settle the fetch chain WITHOUT letting a maintenance interval fire — running
 * pending timers would advance the mocked clock past the freshness TTL and
 * refetch, which is a different behaviour from the one under test.
 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1)
}

function makeEntity(entityId: string, state: string, lastUpdated = NOW): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: {},
    last_changed: new Date(lastUpdated).toISOString(),
    last_updated: new Date(lastUpdated).toISOString(),
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function entry(entityId = ENTITY, hours = 24) {
  return historyStore.state.entries[historyCacheKey(entityId, hours)]
}

describe('EntityHistoryService', () => {
  let service: EntityHistoryService
  let hass: HomeAssistant
  let callWS: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    historyStoreActions.reset()
    entityStoreActions.reset()
    callWS = vi.fn().mockResolvedValue(response(seriesEndingAt(NOW, [1, 2, 3])))
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    service = new EntityHistoryService()
    service.setHass(hass)
  })

  afterEach(() => {
    service.reset()
    vi.useRealTimers()
  })

  describe('fetching', () => {
    it('fetches the window on first subscribe and stores the parsed samples', async () => {
      service.subscribe(ENTITY, 24)
      expect(entry()?.isLoading).toBe(true)

      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
      expect(callWS.mock.calls[0][0]).toMatchObject({
        type: 'history/history_during_period',
        entity_ids: [ENTITY],
        start_time: new Date(NOW - 24 * HOUR).toISOString(),
      })
      expect(entry()?.samples).toEqual(seriesEndingAt(NOW, [1, 2, 3]))
      expect(entry()?.isLoading).toBe(false)
      expect(entry()?.updatedAt).toBe(NOW)
    })

    it('does not refetch for a second subscriber to a warm window', async () => {
      service.subscribe(ENTITY, 24)
      service.subscribe(ENTITY, 24)
      await flush()
      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('dedupes concurrent requests for the same window', async () => {
      let resolveFetch: (value: HistoryResponse) => void = () => {}
      callWS.mockReturnValueOnce(
        new Promise<HistoryResponse>((resolve) => {
          resolveFetch = resolve
        })
      )
      service.subscribe(ENTITY, 24)

      // A reconnect landing while the first fetch is still in flight must join
      // it rather than issue a second request.
      service.handleReconnected()
      expect(callWS).toHaveBeenCalledTimes(1)

      resolveFetch(response(seriesEndingAt(NOW, [1, 2, 3])))
      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
      expect(entry()?.samples).toHaveLength(3)
    })

    it('keys the cache by window, so a different window is its own fetch', async () => {
      service.subscribe(ENTITY, 24)
      service.subscribe(ENTITY, 6)
      await flush()

      expect(callWS).toHaveBeenCalledTimes(2)
      expect(entry(ENTITY, 24)).toBeDefined()
      expect(entry(ENTITY, 6)).toBeDefined()
    })

    it('surfaces a failure through the entry instead of throwing', async () => {
      callWS.mockRejectedValueOnce(new Error('websocket closed'))
      service.subscribe(ENTITY, 24)
      await flush()

      expect(entry()?.error).toBe('websocket closed')
      expect(entry()?.isLoading).toBe(false)
    })

    it('reports a non-Error rejection with a generic message', async () => {
      callWS.mockRejectedValueOnce('nope')
      service.subscribe(ENTITY, 24)
      await flush()

      expect(entry()?.error).toBe('Failed to load history')
    })

    it('keeps already-held samples when a refetch fails', async () => {
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      const held = entry(ENTITY, SHORT_HOURS)?.samples

      callWS.mockRejectedValueOnce(new Error('down'))
      await vi.advanceTimersByTimeAsync(HISTORY_FRESHNESS_TTL_MS + MAINTENANCE_TICK_MS)

      expect(entry(ENTITY, SHORT_HOURS)?.samples).toBe(held)
      expect(entry(ENTITY, SHORT_HOURS)?.error).toBe('down')
    })

    it('records an error when there is no connection to fetch through', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 24)
      await flush()

      expect(callWS).not.toHaveBeenCalled()
      expect(entry()?.error).toBe('Home Assistant not connected')
    })

    it('retries a window that was fetched before a connection existed', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 24)
      await flush()
      expect(entry()?.error).toBe('Home Assistant not connected')

      service.setHass(hass)
      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
      expect(entry()?.error).toBeNull()
      expect(entry()?.samples).toHaveLength(3)
    })

    it('does not refetch when a fresh hass object replaces the current one', async () => {
      service.subscribe(ENTITY, 24)
      await flush()
      callWS.mockClear()

      // Home Assistant re-supplies `hass` on every state change; that is not a
      // reconnection and must not cost a fetch.
      service.setHass(createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] }))
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })

    it('keeps live appends that landed while the fetch was in flight', async () => {
      let resolveFetch: (value: HistoryResponse) => void = () => {}
      callWS.mockReturnValueOnce(
        new Promise<HistoryResponse>((resolve) => {
          resolveFetch = resolve
        })
      )
      service.subscribe(ENTITY, 24)

      // A live sample arrives after the recorder's window closed.
      const late = NOW + 30_000
      vi.setSystemTime(late)
      service.ingest(makeEntity(ENTITY, '99', late))

      resolveFetch(response(seriesEndingAt(NOW, [1, 2, 3])))
      await flush()

      expect(entry()?.samples.at(-1)).toEqual({ t: late, value: 99 })
      expect(entry()?.samples).toHaveLength(4)
    })

    it('keeps a live tail when the recorder returns nothing at all', async () => {
      callWS.mockResolvedValueOnce({})
      historyStoreActions.patchEntry(ENTITY, 24, {
        samples: [{ t: NOW, value: 7 }],
        updatedAt: NOW,
      })
      service.subscribe(ENTITY, 24)
      await flush()

      expect(entry()?.samples).toEqual([{ t: NOW, value: 7 }])
    })
  })

  describe('unsupported entities', () => {
    it('resolves unsupported from the live state without fetching', async () => {
      entityStoreActions.updateEntity(makeEntity('device_tracker.phone', 'home'))
      service.subscribe('device_tracker.phone', 24)
      await flush()

      expect(callWS).not.toHaveBeenCalled()
      expect(entry('device_tracker.phone')?.unsupported).toBe(true)
    })

    it('does not treat an unavailable numeric entity as unsupported', async () => {
      entityStoreActions.updateEntity(makeEntity(ENTITY, 'unavailable'))
      service.subscribe(ENTITY, 24)
      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
      expect(entry()?.unsupported).toBe(false)
    })

    it('resolves unsupported from a history window of non-numeric states', async () => {
      callWS.mockResolvedValueOnce({
        'device_tracker.phone': [{ s: 'home', lu: NOW / 1000 }],
      })
      service.subscribe('device_tracker.phone', 24)
      await flush()

      expect(entry('device_tracker.phone')?.unsupported).toBe(true)
      expect(entry('device_tracker.phone')?.samples).toEqual([])
    })

    it('never refetches an unsupported window', async () => {
      entityStoreActions.updateEntity(makeEntity('device_tracker.phone', 'home'))
      const release = service.subscribe('device_tracker.phone', 24)
      await flush()
      release()

      service.subscribe('device_tracker.phone', 24)
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })
  })

  describe('live append', () => {
    beforeEach(async () => {
      service.subscribe(ENTITY, 24)
      await flush()
      callWS.mockClear()
    })

    it('appends a raw sample and bumps the version', () => {
      const before = entry()!.version
      const at = NOW + 60_000
      vi.setSystemTime(at)
      service.ingest(makeEntity(ENTITY, '42', at))

      expect(entry()?.samples.at(-1)).toEqual({ t: at, value: 42 })
      expect(entry()?.version).toBe(before + 1)
      expect(entry()?.updatedAt).toBe(at)
    })

    it('ignores entities nothing is subscribed to', () => {
      service.ingest(makeEntity('sensor.other', '5'))
      expect(entry('sensor.other')).toBeUndefined()
    })

    it('ignores non-numeric and blank states', () => {
      const before = entry()!.samples.length
      service.ingest(makeEntity(ENTITY, 'unavailable'))
      service.ingest(makeEntity(ENTITY, '   '))
      expect(entry()?.samples).toHaveLength(before)
    })

    it('falls back to the current time when last_updated is unusable', () => {
      const at = NOW + 120_000
      vi.setSystemTime(at)
      const entity = { ...makeEntity(ENTITY, '17'), last_updated: 'not-a-date' }
      service.ingest(entity)

      expect(entry()?.samples.at(-1)).toEqual({ t: at, value: 17 })
    })

    it('prunes samples that age out of the window as it appends', () => {
      const at = NOW + 25 * HOUR
      vi.setSystemTime(at)
      service.ingest(makeEntity(ENTITY, '8', at))

      // Only the appended sample plus the retained sentinel survive.
      expect(entry()?.samples).toEqual([
        { t: NOW, value: 3 },
        { t: at, value: 8 },
      ])
    })

    it('does not append to an unsupported window', async () => {
      entityStoreActions.updateEntity(makeEntity('device_tracker.phone', 'home'))
      service.subscribe('device_tracker.phone', 24)
      await flush()

      service.ingest(makeEntity('device_tracker.phone', '5'))
      expect(entry('device_tracker.phone')?.samples).toEqual([])
    })

    it('does not append before the window has an entry', () => {
      service.subscribe('sensor.fresh', 24)
      historyStoreActions.reset()
      service.ingest(makeEntity('sensor.fresh', '5'))
      expect(entry('sensor.fresh')).toBeUndefined()
    })
  })

  describe('freshness across unmounting', () => {
    it('refetches a window that went unwatched, so no gap is rendered', async () => {
      const release = service.subscribe(ENTITY, 24)
      await flush()
      release()
      callWS.mockClear()

      service.subscribe(ENTITY, 24)
      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('serves the cached window immediately while the refetch runs', async () => {
      const release = service.subscribe(ENTITY, 24)
      await flush()
      const cached = entry()!.samples
      release()

      service.subscribe(ENTITY, 24)
      expect(entry()?.samples).toEqual(cached)
    })

    it('prunes aged-out samples on resubscribe, keeping one sentinel', async () => {
      const release = service.subscribe(ENTITY, 24)
      await flush()
      release()

      vi.setSystemTime(NOW + 25 * HOUR)
      service.subscribe(ENTITY, 24)

      expect(entry()?.samples).toEqual([{ t: NOW, value: 3 }])
    })

    it('does not refetch while subscribers stay and the entry is fresh', async () => {
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      callWS.mockClear()

      // A maintenance tick, well inside the freshness TTL.
      await vi.advanceTimersByTimeAsync(MAINTENANCE_TICK_MS)

      expect(callWS).not.toHaveBeenCalled()
    })

    it('refetches periodically once a mounted window goes stale', async () => {
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      callWS.mockClear()

      await vi.advanceTimersByTimeAsync(HISTORY_FRESHNESS_TTL_MS + MAINTENANCE_TICK_MS)

      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('stops maintaining a window once its last subscriber leaves', async () => {
      const release = service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      release()
      callWS.mockClear()

      await vi.advanceTimersByTimeAsync(HISTORY_FRESHNESS_TTL_MS + MAINTENANCE_TICK_MS)

      expect(callWS).not.toHaveBeenCalled()
    })

    it('keeps maintaining while another subscriber remains', async () => {
      const first = service.subscribe(ENTITY, SHORT_HOURS)
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      callWS.mockClear()
      first()

      await vi.advanceTimersByTimeAsync(HISTORY_FRESHNESS_TTL_MS + MAINTENANCE_TICK_MS)

      expect(callWS).toHaveBeenCalled()
    })

    it('ignores a release called twice', async () => {
      const release = service.subscribe(ENTITY, SHORT_HOURS)
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      release()
      release()
      callWS.mockClear()

      // The second release must not have dropped the surviving subscriber's
      // count below zero and stranded the window unmaintained.
      await vi.advanceTimersByTimeAsync(HISTORY_FRESHNESS_TTL_MS + MAINTENANCE_TICK_MS)

      expect(callWS).toHaveBeenCalled()
    })

    it('ignores a release issued before the service was reset', async () => {
      const release = service.subscribe(ENTITY, 24)
      await flush()
      service.reset()
      service.setHass(hass)

      release()

      // The stale release must not have re-created bookkeeping: a fresh
      // subscribe still behaves like the first one.
      callWS.mockClear()
      service.subscribe(ENTITY, 24)
      await flush()
      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('keeps tracking an entity that still has another window open', async () => {
      const release = service.subscribe(ENTITY, 24)
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      release()

      service.ingest(makeEntity(ENTITY, '77'))

      expect(entry(ENTITY, SHORT_HOURS)?.samples.at(-1)?.value).toBe(77)
    })

    it('leaves an untouched series alone rather than rewriting it', async () => {
      service.subscribe(ENTITY, SHORT_HOURS)
      await flush()
      const held = entry(ENTITY, SHORT_HOURS)!.samples
      const { version } = entry(ENTITY, SHORT_HOURS)!

      await vi.advanceTimersByTimeAsync(MAINTENANCE_TICK_MS)

      expect(entry(ENTITY, SHORT_HOURS)?.samples).toBe(held)
      expect(entry(ENTITY, SHORT_HOURS)?.version).toBe(version)
    })
  })

  describe('reconnection', () => {
    it('refetches every watched window when the event stream restarts', async () => {
      service.subscribe(ENTITY, 24)
      service.subscribe('sensor.other', 6)
      await flush()
      callWS.mockClear()

      service.handleReconnected()
      await flush()

      expect(callWS).toHaveBeenCalledTimes(2)
    })

    it('skips a window whose first fetch has not landed yet', async () => {
      callWS.mockReturnValueOnce(new Promise<HistoryResponse>(() => {}))
      service.subscribe(ENTITY, 24)
      historyStoreActions.reset()
      callWS.mockClear()

      service.handleReconnected()
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })
  })

  describe('projection', () => {
    beforeEach(async () => {
      service.subscribe(ENTITY, 24)
      await flush()
    })

    it('returns a stable empty series when there is nothing to project', () => {
      const options = { mode: 'sample' as const, points: 10 }
      expect(service.project(undefined, options)).toBe(service.project(undefined, options))
      expect(service.project({ ...entry()!, samples: [] }, options)).toEqual([])
    })

    it('reuses the projection until the entry version changes', () => {
      const options = { mode: 'sample' as const, points: 10 }
      const first = service.project(entry(), options)
      expect(service.project(entry(), options)).toBe(first)

      const at = NOW + 60_000
      vi.setSystemTime(at)
      service.ingest(makeEntity(ENTITY, '42', at))

      expect(service.project(entry(), options)).not.toBe(first)
    })

    it('does not share a projection between different point counts', () => {
      // Spread across hours, so the two point counts really do land the samples
      // in a different number of buckets.
      const spread = { ...entry()!, samples: seriesEndingAt(NOW, [1, 2, 3], HOUR), version: 7 }
      const at50 = service.project(spread, { mode: 'sample', points: 50 })
      const at5 = service.project(spread, { mode: 'sample', points: 5 })

      expect(at50).not.toBe(at5)
      expect(at50.length).toBeGreaterThan(at5.length)
    })

    it('does not share a projection between modes', () => {
      const sampled = service.project(entry(), { mode: 'sample', points: 10 })
      const delta = service.project(entry(), { mode: 'delta', points: 10 })

      expect(sampled.at(-1)?.value).toBe(3)
      expect(delta.at(-1)?.value).toBe(2)
    })

    it('applies reset-aware summation for a total_increasing entity', () => {
      const counter = { ...entry()!, samples: seriesEndingAt(NOW, [0, 10, 0, 5]), version: 99 }
      const [point] = service.project(counter, {
        mode: 'delta',
        points: 1,
        stateClass: 'total_increasing',
      })

      expect(point.value).toBe(15)
    })

    it('does not share a projection between state classes', () => {
      const counter = { ...entry()!, samples: seriesEndingAt(NOW, [0, 10, 0, 5]), version: 99 }
      const increasing = service.project(counter, {
        mode: 'delta',
        points: 1,
        stateClass: 'total_increasing',
      })
      const total = service.project(counter, { mode: 'delta', points: 1, stateClass: 'total' })

      expect(increasing[0].value).toBe(15)
      expect(total[0].value).toBe(5)
    })
  })

  it('discards a fetch that resolves after a reset', async () => {
    let resolveFetch: (value: HistoryResponse) => void = () => {}
    callWS.mockReturnValueOnce(
      new Promise<HistoryResponse>((resolve) => {
        resolveFetch = resolve
      })
    )
    service.subscribe(ENTITY, 24)
    service.reset()

    resolveFetch(response(seriesEndingAt(NOW, [1, 2, 3])))
    await flush()

    // The answer to a question nobody is asking any more must not resurrect
    // the window it was fetched for.
    expect(historyStore.state.entries).toEqual({})
  })

  it('discards a fetch that rejects after a reset', async () => {
    let rejectFetch: (reason: Error) => void = () => {}
    callWS.mockReturnValueOnce(
      new Promise<HistoryResponse>((_resolve, reject) => {
        rejectFetch = reject
      })
    )
    service.subscribe(ENTITY, 24)
    service.reset()

    rejectFetch(new Error('too late'))
    await flush()

    expect(historyStore.state.entries).toEqual({})
  })

  it('clears every timer and cache on reset', async () => {
    service.subscribe(ENTITY, 24)
    await flush()
    service.reset()
    callWS.mockClear()

    await vi.advanceTimersByTimeAsync(HOUR)

    expect(historyStore.state.entries).toEqual({})
    expect(callWS).not.toHaveBeenCalled()
  })
})
