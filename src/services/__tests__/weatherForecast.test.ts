import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WeatherForecastService } from '../weatherForecast'
import {
  FORECAST_REFRESH_MS,
  WEATHER_FEATURE_FORECAST_DAILY,
  WEATHER_FEATURE_FORECAST_HOURLY,
  WEATHER_FEATURE_FORECAST_TWICE_DAILY,
} from '../forecastData'
import { forecastCacheKey, forecastStore, forecastStoreActions } from '../../store/forecastStore'
import { entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'

const NOW = Date.parse('2026-07-25T12:00:00.000Z')
const ENTITY = 'weather.home'
const DAILY_REFRESH = FORECAST_REFRESH_MS.daily

/** Local-time timestamps, because the daily derivation groups by local day. */
function localIso(day: number, hour: number): string {
  return new Date(2026, 6, day, hour, 0, 0).toISOString()
}

function response(forecast: unknown[], entityId = ENTITY): Record<string, unknown> {
  return { context: { id: 'ctx' }, response: { [entityId]: { forecast } } }
}

const DAILY_FORECAST = [
  { datetime: localIso(25, 12), condition: 'sunny', temperature: 26, templow: 14 },
  { datetime: localIso(26, 12), condition: 'rainy', temperature: 19, templow: 12 },
]

/** Settle the fetch chain without letting a refresh interval fire. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1)
}

function makeWeatherEntity(supportedFeatures?: number): HassEntity {
  return {
    entity_id: ENTITY,
    state: 'sunny',
    attributes: supportedFeatures === undefined ? {} : { supported_features: supportedFeatures },
    last_changed: new Date(NOW).toISOString(),
    last_updated: new Date(NOW).toISOString(),
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function entry(entityId = ENTITY, type: 'hourly' | 'daily' | 'twice_daily' = 'daily') {
  return forecastStore.state.entries[forecastCacheKey(entityId, type)]
}

describe('WeatherForecastService', () => {
  let service: WeatherForecastService
  let hass: HomeAssistant
  let callWS: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    forecastStoreActions.reset()
    entityStoreActions.reset()
    callWS = vi.fn().mockResolvedValue(response(DAILY_FORECAST))
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    service = new WeatherForecastService()
    service.setHass(hass)
  })

  afterEach(() => {
    service.reset()
    vi.useRealTimers()
  })

  describe('fetching', () => {
    it('fetches on first subscribe and stores the parsed forecast', async () => {
      service.subscribe(ENTITY, 'daily')
      expect(entry()?.isLoading).toBe(true)

      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
      expect(callWS.mock.calls[0][0]).toMatchObject({
        domain: 'weather',
        service: 'get_forecasts',
        service_data: { type: 'daily' },
        target: { entity_id: ENTITY },
      })
      expect(entry()?.forecast).toHaveLength(2)
      expect(entry()?.forecast[0]).toMatchObject({ condition: 'sunny', temperature: 26 })
      expect(entry()?.isLoading).toBe(false)
      expect(entry()?.error).toBeNull()
      expect(entry()?.updatedAt).toBe(NOW)
    })

    it('does not refetch for a second subscriber to a warm forecast', async () => {
      service.subscribe(ENTITY, 'daily')
      service.subscribe(ENTITY, 'daily')
      await flush()
      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('dedupes concurrent requests for the same forecast', async () => {
      let resolveFetch: (value: Record<string, unknown>) => void = () => {}
      callWS.mockReturnValueOnce(
        new Promise<Record<string, unknown>>((resolve) => {
          resolveFetch = resolve
        })
      )
      service.subscribe(ENTITY, 'daily')

      // A reconnect landing while the first fetch is in flight must join it
      // rather than issue a second request.
      service.handleReconnected()
      expect(callWS).toHaveBeenCalledTimes(1)

      resolveFetch(response(DAILY_FORECAST))
      await flush()
      expect(entry()?.forecast).toHaveLength(2)
    })

    it('keeps hourly and daily forecasts of one entity apart', async () => {
      entityStoreActions.updateEntity(
        makeWeatherEntity(WEATHER_FEATURE_FORECAST_DAILY | WEATHER_FEATURE_FORECAST_HOURLY)
      )
      service.subscribe(ENTITY, 'daily')
      service.subscribe(ENTITY, 'hourly')
      await flush()

      expect(callWS).toHaveBeenCalledTimes(2)
      expect(callWS.mock.calls[1][0]).toMatchObject({ service_data: { type: 'hourly' } })
      expect(entry(ENTITY, 'hourly')).toBeDefined()
    })

    it('serves a cached forecast that is still inside its refresh interval', async () => {
      service.subscribe(ENTITY, 'daily')()
      await flush()
      callWS.mockClear()

      vi.setSystemTime(NOW + DAILY_REFRESH - 1)
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })

    it('refetches a forecast that has aged past its refresh interval', async () => {
      service.subscribe(ENTITY, 'daily')()
      await flush()
      callWS.mockClear()

      vi.setSystemTime(NOW + DAILY_REFRESH)
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('refreshes a mounted forecast on its own interval', async () => {
      service.subscribe(ENTITY, 'daily')
      await flush()

      await vi.advanceTimersByTimeAsync(DAILY_REFRESH)

      expect(callWS).toHaveBeenCalledTimes(2)
    })
  })

  describe('unsupported resolution', () => {
    it('resolves a non-weather entity without asking the service', async () => {
      service.subscribe('sensor.outside_temperature', 'daily')
      await flush()

      expect(callWS).not.toHaveBeenCalled()
      expect(entry('sensor.outside_temperature')).toMatchObject({
        unsupported: true,
        error: null,
        forecast: [],
      })
    })

    it('resolves a type the entity does not advertise without asking', async () => {
      entityStoreActions.updateEntity(makeWeatherEntity(WEATHER_FEATURE_FORECAST_DAILY))
      service.subscribe(ENTITY, 'hourly')
      await flush()

      expect(callWS).not.toHaveBeenCalled()
      expect(entry(ENTITY, 'hourly')).toMatchObject({ unsupported: true, error: null })
    })

    it('resolves unsupported when the integration lacks the service', async () => {
      callWS.mockRejectedValue({ code: 'not_found', message: 'Service not found.' })
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(entry()).toMatchObject({ unsupported: true, error: null, isLoading: false })
    })

    it('resolves unsupported when the response says nothing about the entity', async () => {
      callWS.mockResolvedValue(response(DAILY_FORECAST, 'weather.somewhere_else'))
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(entry()).toMatchObject({ unsupported: true, error: null })
    })

    it('does not retry an unsupported forecast on the refresh interval', async () => {
      callWS.mockRejectedValue({ code: 'not_found' })
      service.subscribe(ENTITY, 'daily')
      await flush()
      expect(callWS).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(DAILY_REFRESH * 2)

      // The entity would need a different integration to grow a forecast, and
      // that arrives as a new panel session.
      expect(callWS).toHaveBeenCalledTimes(1)
    })
  })

  describe('twice-daily derivation', () => {
    beforeEach(() => {
      entityStoreActions.updateEntity(makeWeatherEntity(WEATHER_FEATURE_FORECAST_TWICE_DAILY))
      callWS.mockResolvedValue(
        response([
          { datetime: localIso(25, 8), condition: 'sunny', temperature: 26, is_daytime: true },
          {
            datetime: localIso(25, 20),
            condition: 'clear-night',
            temperature: 14,
            is_daytime: false,
          },
        ])
      )
    })

    it('answers a daily request from twice-daily data', async () => {
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(callWS.mock.calls[0][0]).toMatchObject({ service_data: { type: 'twice_daily' } })
      expect(entry()?.unsupported).toBe(false)
      expect(entry()?.forecast).toHaveLength(1)
      expect(entry()?.forecast[0]).toMatchObject({
        condition: 'sunny',
        temperature: 26,
        templow: 14,
      })
    })

    it('leaves a twice-daily request underived', async () => {
      service.subscribe(ENTITY, 'twice_daily')
      await flush()

      expect(entry(ENTITY, 'twice_daily')?.forecast).toHaveLength(2)
      expect(entry(ENTITY, 'twice_daily')?.forecast[1]).toMatchObject({ is_daytime: false })
    })
  })

  describe('failures', () => {
    it('reports a failed call without blanking what is already shown', async () => {
      service.subscribe(ENTITY, 'daily')
      await flush()
      const held = entry()?.forecast

      callWS.mockRejectedValue(new Error('provider timed out'))
      await vi.advanceTimersByTimeAsync(DAILY_REFRESH)

      expect(entry()).toMatchObject({ error: 'provider timed out', isLoading: false })
      expect(entry()?.forecast).toBe(held)
    })

    it('reports a rejection that carries no message', async () => {
      callWS.mockRejectedValue({ code: 'home_assistant_error' })
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(entry()?.error).toBe('Failed to load forecast')
      expect(entry()?.unsupported).toBe(false)
    })

    it('reports a missing connection rather than calling into nothing', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 'daily')
      await flush()

      expect(callWS).not.toHaveBeenCalled()
      expect(entry()?.error).toBe('Home Assistant not connected')
    })

    it('re-attempts a failed fetch at the refresh interval, not before', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 'daily')
      await flush()

      let writes = 0
      const subscription = forecastStore.subscribe(() => {
        writes += 1
      })
      await vi.advanceTimersByTimeAsync(DAILY_REFRESH - 2)
      // Each retry is a store write, and every store write re-renders the cards
      // watching it: a dashboard that has lost Home Assistant must go quiet.
      expect(writes).toBe(0)

      await vi.advanceTimersByTimeAsync(2)
      subscription.unsubscribe()
      expect(writes).toBe(1)
    })

    it('does not re-attempt for a remount while a failed attempt is still fresh', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 'daily')()
      await flush()

      let writes = 0
      const subscription = forecastStore.subscribe(() => {
        writes += 1
      })
      service.subscribe(ENTITY, 'daily')
      await flush()
      subscription.unsubscribe()

      // The failure advanced the entry's timestamp, so remounting the card is
      // not a way around the retry interval.
      expect(writes).toBe(0)
    })
  })

  describe('reconnection', () => {
    it('refetches every watched forecast when the connection returns', async () => {
      service.setHass(null)
      service.subscribe(ENTITY, 'daily')
      service.subscribe('weather.cabin', 'daily')
      await flush()
      callWS.mockClear()

      service.setHass(hass)
      await flush()

      expect(callWS).toHaveBeenCalledTimes(2)
    })

    it('does not refetch when the same connection is set again', async () => {
      service.subscribe(ENTITY, 'daily')
      await flush()
      callWS.mockClear()

      service.setHass(hass)
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })

    it('skips a forecast whose first fetch has not landed yet', async () => {
      callWS.mockReturnValueOnce(new Promise<Record<string, unknown>>(() => {}))
      service.subscribe(ENTITY, 'daily')
      forecastStoreActions.reset()
      callWS.mockClear()

      service.handleReconnected()
      await flush()

      expect(callWS).not.toHaveBeenCalled()
    })
  })

  describe('subscription lifecycle', () => {
    it('stops refreshing once the last subscriber leaves', async () => {
      const release = service.subscribe(ENTITY, 'daily')
      await flush()
      release()
      callWS.mockClear()

      await vi.advanceTimersByTimeAsync(DAILY_REFRESH * 2)

      expect(callWS).not.toHaveBeenCalled()
    })

    it('keeps refreshing while another subscriber remains', async () => {
      const release = service.subscribe(ENTITY, 'daily')
      service.subscribe(ENTITY, 'daily')
      await flush()
      release()
      callWS.mockClear()

      await vi.advanceTimersByTimeAsync(DAILY_REFRESH)

      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('ignores a release called twice', async () => {
      const release = service.subscribe(ENTITY, 'daily')
      service.subscribe(ENTITY, 'daily')
      await flush()
      release()
      release()
      callWS.mockClear()

      // The second release must not take the remaining subscriber's refresh
      // down with it.
      await vi.advanceTimersByTimeAsync(DAILY_REFRESH)
      expect(callWS).toHaveBeenCalledTimes(1)
    })

    it('ignores a release after the service was reset', async () => {
      const release = service.subscribe(ENTITY, 'daily')
      await flush()
      service.reset()

      expect(() => release()).not.toThrow()
    })
  })

  it('discards a fetch that resolves after a reset', async () => {
    let resolveFetch: (value: Record<string, unknown>) => void = () => {}
    callWS.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveFetch = resolve
      })
    )
    service.subscribe(ENTITY, 'daily')
    service.reset()

    resolveFetch(response(DAILY_FORECAST))
    await flush()

    // The answer to a question nobody is asking any more must not resurrect the
    // entry it was fetched for.
    expect(forecastStore.state.entries).toEqual({})
  })

  it('discards a fetch that rejects after a reset', async () => {
    let rejectFetch: (reason: Error) => void = () => {}
    callWS.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((_resolve, reject) => {
        rejectFetch = reject
      })
    )
    service.subscribe(ENTITY, 'daily')
    service.reset()

    rejectFetch(new Error('too late'))
    await flush()

    expect(forecastStore.state.entries).toEqual({})
  })

  it('clears every timer and cache on reset', async () => {
    service.subscribe(ENTITY, 'daily')
    await flush()
    service.reset()
    callWS.mockClear()

    await vi.advanceTimersByTimeAsync(DAILY_REFRESH * 2)

    expect(forecastStore.state.entries).toEqual({})
    expect(callWS).not.toHaveBeenCalled()
  })
})
