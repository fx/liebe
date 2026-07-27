import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useWeatherForecast } from '../useWeatherForecast'
import { weatherForecastService } from '../../services/weatherForecast'
import {
  WEATHER_FEATURE_FORECAST_TWICE_DAILY,
  type ForecastType,
} from '../../services/forecastData'
import { forecastStore } from '../../store/forecastStore'
import { entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'
import { HomeAssistantProvider, type HomeAssistant } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import {
  createDailyForecast,
  createForecastResponse,
  createTwiceDailyForecast,
} from '~/test/fixtures'

const ENTITY = 'weather.home'

function makeWeatherEntity(supportedFeatures: number): HassEntity {
  return {
    entity_id: ENTITY,
    state: 'sunny',
    attributes: { supported_features: supportedFeatures },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

describe('useWeatherForecast', () => {
  let hass: HomeAssistant
  let callWS: ReturnType<typeof vi.fn>

  function wrapper({ children }: { children: ReactNode }) {
    return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
  }

  beforeEach(() => {
    weatherForecastService.reset()
    entityStoreActions.reset()
    callWS = vi.fn().mockResolvedValue(createForecastResponse(ENTITY, createDailyForecast()))
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
  })

  afterEach(() => {
    weatherForecastService.reset()
  })

  it('fetches on mount and returns the forecast', async () => {
    const { result } = renderHook(() => useWeatherForecast(ENTITY), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.forecast).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(callWS).toHaveBeenCalledTimes(1)
    expect(callWS.mock.calls[0][0]).toMatchObject({ service_data: { type: 'daily' } })
    expect(result.current.forecast).toHaveLength(5)
    expect(result.current.forecast[0]).toMatchObject({ condition: 'sunny', temperature: 24 })
    expect(result.current.error).toBeNull()
    expect(result.current.unsupported).toBe(false)
  })

  it('does not subscribe without an entity id', () => {
    const { result } = renderHook(() => useWeatherForecast(''), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.forecast).toEqual([])
    expect(callWS).not.toHaveBeenCalled()
  })

  it('shares one fetch between two consumers of the same forecast', async () => {
    const { result } = renderHook(
      () => [useWeatherForecast(ENTITY), useWeatherForecast(ENTITY)] as const,
      { wrapper }
    )

    await waitFor(() => expect(result.current[0].isLoading).toBe(false))
    expect(callWS).toHaveBeenCalledTimes(1)
    expect(result.current[1].forecast).toBe(result.current[0].forecast)
  })

  it('refetches when the requested type changes', async () => {
    const { result, rerender } = renderHook(
      ({ type }: { type: ForecastType }) => useWeatherForecast(ENTITY, { type }),
      { wrapper, initialProps: { type: 'daily' as ForecastType } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    callWS.mockResolvedValue(createForecastResponse(ENTITY, createDailyForecast({ count: 2 })))
    rerender({ type: 'hourly' })

    await waitFor(() => expect(result.current.forecast).toHaveLength(2))
    expect(callWS).toHaveBeenCalledTimes(2)
    expect(callWS.mock.calls[1][0]).toMatchObject({ service_data: { type: 'hourly' } })
  })

  it('reads a junk type as no preference rather than crashing', async () => {
    const { result } = renderHook(
      // A dashboard document this build cannot fully interpret still reaches the
      // render path, so an unknown option value is read, not rejected.
      () => useWeatherForecast(ENTITY, { type: 'fortnightly' as unknown as ForecastType }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(callWS.mock.calls[0][0]).toMatchObject({ service_data: { type: 'daily' } })
    expect(result.current.forecast).toHaveLength(5)
  })

  it('derives a daily view for a twice-daily-only integration', async () => {
    entityStoreActions.updateEntity(makeWeatherEntity(WEATHER_FEATURE_FORECAST_TWICE_DAILY))
    callWS.mockResolvedValue(createForecastResponse(ENTITY, createTwiceDailyForecast({ count: 3 })))

    const { result } = renderHook(() => useWeatherForecast(ENTITY, { type: 'daily' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(callWS.mock.calls[0][0]).toMatchObject({ service_data: { type: 'twice_daily' } })
    expect(result.current.unsupported).toBe(false)
    expect(result.current.forecast).toHaveLength(3)
    expect(result.current.forecast[0]).toMatchObject({ temperature: 24, templow: 13 })
  })

  it('resolves unsupported without an error when the entity has no forecast', async () => {
    callWS.mockRejectedValue({ code: 'not_found', message: 'Service not found.' })

    const { result } = renderHook(() => useWeatherForecast(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.unsupported).toBe(true))

    expect(result.current.error).toBeNull()
    expect(result.current.forecast).toEqual([])
  })

  it('surfaces a failure instead of throwing', async () => {
    callWS.mockRejectedValue(new Error('provider timed out'))

    const { result } = renderHook(() => useWeatherForecast(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.error).toBe('provider timed out'))

    expect(result.current.unsupported).toBe(false)
  })

  it('reports a missing Home Assistant without subscribing to nothing', async () => {
    const { result } = renderHook(() => useWeatherForecast(ENTITY), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HomeAssistantProvider hass={null}>{children}</HomeAssistantProvider>
      ),
    })

    await waitFor(() => expect(result.current.error).toBe('Home Assistant not connected'))
    expect(result.current.forecast).toEqual([])
  })

  it('keeps the subscription across a new hass object', async () => {
    const { result, rerender } = renderHook(() => useWeatherForecast(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Home Assistant hands down a new object on every state change in the house;
    // none of them is a reason to refetch the forecast.
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    rerender()

    expect(callWS).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes on unmount', async () => {
    const { result, unmount } = renderHook(() => useWeatherForecast(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()

    // The cached forecast outlives the card that asked for it: a remount inside
    // the refresh interval renders immediately.
    expect(Object.keys(forecastStore.state.entries)).toEqual([`${ENTITY}|daily`])
  })
})
