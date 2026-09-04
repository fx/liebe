import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { entityStore, entityStoreActions } from '~/store/entityStore'
import { StaleEntityMonitor } from '../staleEntityMonitor'
import { resetSchedulerForTests, schedulerIntervalCountForTests } from '../pipelineScheduler'

// The staleness check rides the shared fast wheel (PR 2): one scheduler entry,
// not a private 60s interval — and the wheel count, not the monitor's word,
// proves it. Fake timers throughout.

function makeEntity(entityId: string, lastUpdated: number) {
  return {
    entity_id: entityId,
    state: 'on',
    attributes: {},
    last_changed: new Date(lastUpdated).toISOString(),
    last_updated: new Date(lastUpdated).toISOString(),
    context: { id: 'ctx', parent_id: null, user_id: null },
  } as never
}

const NOW = Date.parse('2026-07-25T12:00:00.000Z')

describe('StaleEntityMonitor on the shared wheel', () => {
  let monitor: StaleEntityMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    entityStoreActions.reset()
    monitor = new StaleEntityMonitor()
  })

  afterEach(() => {
    monitor.stop()
    resetSchedulerForTests()
    vi.useRealTimers()
  })

  it('owns no private interval: one shared wheel entry after start', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    monitor.start()

    // Exactly one real timer — the shared fast wheel, not a monitor-owned one.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(schedulerIntervalCountForTests()).toBe(1)
  })

  it('marks a quiet entity stale on start and stops on release', () => {
    entityStoreActions.setConnected(true)
    entityStoreActions.updateEntity(makeEntity('light.room', NOW - 10 * 60_000))
    entityStoreActions.subscribeToEntity('light.room')

    monitor.start()
    // Initial check runs synchronously on start.
    expect(entityStore.state.staleEntities.has('light.room')).toBe(true)

    monitor.stop()
    expect(schedulerIntervalCountForTests()).toBe(0)
  })

  it('a restart holds one schedule, and stop is idempotent', () => {
    monitor.start()
    // Restart: stop releases the entry (empty wheel tears down), start
    // re-creates it — but only ever one wheel at a time.
    monitor.start()
    expect(schedulerIntervalCountForTests()).toBe(1)

    monitor.stop()
    monitor.stop()
    expect(schedulerIntervalCountForTests()).toBe(0)
  })
})

describe('connection health on the shared wheel', () => {
  it('connect starts one wheel for health; disconnect stops it', async () => {
    vi.useFakeTimers()
    try {
      const { HassConnectionManager } = await import('../hassConnection')
      const manager = new HassConnectionManager()
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

      // Minimal hass: subscription resolves, socket open.
      const hass = {
        connection: {
          subscribeEvents: vi.fn().mockResolvedValue(vi.fn()),
          subscribeMessage: vi.fn().mockResolvedValue(vi.fn()),
          socket: { readyState: 1 },
        },
      } as never

      await manager.connect(hass)
      // One wheel shared by health (history untouched here) — and exactly
      // one real timer created for it.
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      expect(schedulerIntervalCountForTests()).toBe(1)

      await manager.disconnect()
      expect(schedulerIntervalCountForTests()).toBe(0)
    } finally {
      resetSchedulerForTests()
      vi.useRealTimers()
    }
  })
})
