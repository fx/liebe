import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  schedulePipelineTask,
  resetSchedulerForTests,
  schedulerIntervalCountForTests,
  schedulerTaskCountForTests,
  SCHEDULER_FAST_TICK_MS,
  SCHEDULER_SLOW_TICK_MS,
} from '../pipelineScheduler'
import { EntityHistoryService } from '../entityHistory'
import { WeatherForecastService } from '../weatherForecast'
import { historyStoreActions } from '~/store/historyStore'
import { forecastStoreActions } from '~/store/forecastStore'
import { entityStoreActions } from '~/store/entityStore'
import {
  FORECAST_REFRESH_MS,
  WEATHER_FEATURE_FORECAST_DAILY,
  WEATHER_FEATURE_FORECAST_HOURLY,
} from '../forecastData'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

// PR 2 probes: the coalesced scheduler MUST own one interval per rate class no
// matter how many members subscribe, and advancing past the longest member
// interval MUST produce the member calls. Fake timers throughout.

describe('pipelineScheduler', () => {
  afterEach(() => {
    resetSchedulerForTests()
    vi.useRealTimers()
  })

  it('coalesces N tasks on one wheel with one interval', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const runs = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    const releases = runs.map((run) => schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS, run))

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(schedulerIntervalCountForTests()).toBe(1)
    expect(schedulerTaskCountForTests()).toBe(4)

    // All four fire on the first tick — one wake, four members.
    act_advance(SCHEDULER_FAST_TICK_MS)
    for (const run of runs) expect(run).toHaveBeenCalledTimes(1)

    for (const release of releases) release()
    expect(schedulerIntervalCountForTests()).toBe(0)
  })

  it('runs slower members every Nth tick without their own timer', () => {
    vi.useFakeTimers()

    const fast = vi.fn()
    const slow = vi.fn()
    const releaseFast = schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS, fast)
    const releaseSlow = schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS * 2, slow)

    act_advance(SCHEDULER_FAST_TICK_MS)
    expect(fast).toHaveBeenCalledTimes(1)
    expect(slow).not.toHaveBeenCalled()

    act_advance(SCHEDULER_FAST_TICK_MS)
    expect(fast).toHaveBeenCalledTimes(2)
    expect(slow).toHaveBeenCalledTimes(1)

    releaseFast()
    releaseSlow()
  })

  it('keeps the fast and slow wheels on separate intervals', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const releaseFast = schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS, vi.fn())
    const releaseSlow = schedulePipelineTask('slow', SCHEDULER_SLOW_TICK_MS, vi.fn())

    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    expect(schedulerIntervalCountForTests()).toBe(2)

    releaseFast()
    releaseSlow()
  })

  it('a double release does not take another task down', () => {
    vi.useFakeTimers()

    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS, first)
    schedulePipelineTask('fast', SCHEDULER_FAST_TICK_MS, second)

    releaseFirst()
    releaseFirst()
    expect(schedulerTaskCountForTests()).toBe(1)

    act_advance(SCHEDULER_FAST_TICK_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('coalesced service wheels', () => {
  afterEach(() => {
    resetSchedulerForTests()
    vi.useRealTimers()
  })

  it('two history windows share one interval; advancing the TTL refetches both', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-25T12:00:00.000Z'))
    historyStoreActions.reset()
    entityStoreActions.reset()

    // Recorder wire shape the history suite's `response()` helper builds:
    // `{ entityId: [{ s, lu }] }`. Anything else parses to no samples.
    const NOW = Date.parse('2026-07-25T12:00:00.000Z')
    const series = {
      'sensor.a': [1, 2, 3].map((v, i) => ({ s: String(v), lu: (NOW - (2 - i) * 60_000) / 1000 })),
      'sensor.b': [4, 5, 6].map((v, i) => ({ s: String(v), lu: (NOW - (2 - i) * 60_000) / 1000 })),
    }
    const callWS = vi.fn().mockResolvedValue(series)
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    const service = new EntityHistoryService()
    service.setHass(hass)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    service.subscribe('sensor.a', 24)
    service.subscribe('sensor.b', 24)
    await vi.advanceTimersByTimeAsync(1)
    expect(callWS).toHaveBeenCalledTimes(2)

    // No per-window interval: the only new timer is the shared fast wheel.
    expect(schedulerIntervalCountForTests()).toBe(1)
    void setIntervalSpy

    // Advancing past the TTL wakes both windows through the one wheel.
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    expect(callWS).toHaveBeenCalledTimes(4)

    service.reset()
  })

  it('two forecasts share one interval; advancing the daily refresh refetches', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-25T12:00:00.000Z'))
    forecastStoreActions.reset()
    entityStoreActions.reset()

    // Wrapped `{ context, response }` shape — the same one the forecast
    // suite's `response()` helper builds. An unwrapped `{ result }` parses to
    // `unsupported`, and `refresh` never retries an unsupported entry.
    const response = {
      context: { id: 'ctx' },
      response: {
        'weather.home': {
          forecast: [
            { datetime: '2026-07-25T12:00:00+00:00', condition: 'sunny', temperature: 26 },
            { datetime: '2026-07-26T12:00:00+00:00', condition: 'rainy', temperature: 19 },
          ],
        },
      },
    }
    const callWS = vi.fn().mockResolvedValue(response)
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    const service = new WeatherForecastService()
    service.setHass(hass)

    entityStoreActions.updateEntity({
      entity_id: 'weather.home',
      state: 'sunny',
      attributes: {
        supported_features: WEATHER_FEATURE_FORECAST_DAILY | WEATHER_FEATURE_FORECAST_HOURLY,
      },
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      context: { id: 'ctx', parent_id: null, user_id: null },
    } as never)

    service.subscribe('weather.home', 'daily')
    service.subscribe('weather.home', 'hourly')
    await vi.advanceTimersByTimeAsync(1)
    expect(callWS).toHaveBeenCalledTimes(2)
    // Two forecasts, one slow wheel — no per-forecast timer.
    expect(schedulerIntervalCountForTests()).toBe(1)

    // Advancing past the longest member interval (daily 2h) refetches it.
    // Hourly (30min) fires 4x in that span; both ride the one slow wheel.
    await vi.advanceTimersByTimeAsync(FORECAST_REFRESH_MS.daily)
    const types = callWS.mock.calls.map(
      (call) => (call[0] as { service_data?: { type?: string } }).service_data?.type
    )
    expect(types.filter((type) => type === 'daily').length).toBe(2)
    expect(types.filter((type) => type === 'hourly').length).toBeGreaterThan(1)

    service.reset()
  })
})

/** Advance synchronously: the scheduler's wheels are sync callbacks. */
function act_advance(ms: number): void {
  // `vi.advanceTimersByTime` outside `act` warns under React, but these wheels
  // own no React state — the sync advance is the correct call.
  vi.advanceTimersByTime(ms)
}
