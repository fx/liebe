import { useEffect } from 'react'
import { useStore } from '@tanstack/react-store'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { weatherForecastService } from '../services/weatherForecast'
import {
  normalizeForecastType,
  type ForecastEntry,
  type ForecastType,
} from '../services/forecastData'
import { forecastCacheKey, forecastStore } from '../store/forecastStore'

/** Shared empty forecast, so "nothing yet" is referentially stable. */
const EMPTY_FORECAST: ForecastEntry[] = []

export interface UseWeatherForecastOptions {
  /** Granularity to request. Defaults to `daily`. */
  type?: ForecastType
}

export interface WeatherForecastResult {
  /** The forecast entries, oldest first. */
  forecast: ForecastEntry[]
  isLoading: boolean
  /** Non-fatal: consumers render without forecast content. Never thrown. */
  error: string | null
  /** The entity or its integration provides no forecast of this type. */
  unsupported: boolean
}

/**
 * One weather entity's forecast, cached across consumers and refreshed on its
 * own interval (30 minutes hourly, 2 hours daily and twice-daily).
 *
 * Contract owner: docs/specs/entity-state/index.md — "Weather Forecast Hook".
 * An integration that offers only twice-daily data still answers a `daily`
 * request: the daily view is derived from it rather than resolved unsupported.
 */
export function useWeatherForecast(
  entityId: string,
  options: UseWeatherForecastOptions = {}
): WeatherForecastResult {
  // The type arrives from card configuration, and a document this build cannot
  // fully interpret still reaches the render path, so a value it does not know
  // is read as "no preference". Normalising at the boundary keeps junk out of
  // the cache key as well as out of the request.
  const type = normalizeForecastType(options.type)
  const hass = useHomeAssistantOptional()

  // Per-forecast slice: another entity's forecast landing in the store leaves
  // this selector's result identical, so the card does not re-render.
  const entry = useStore(forecastStore, (state) => state.entries[forecastCacheKey(entityId, type)])

  // Home Assistant hands down a NEW `hass` object on every state change, so this
  // must stay separate from the subscription below — folding them together would
  // tear the subscription down and refetch the forecast on every state change in
  // the house.
  useEffect(() => {
    weatherForecastService.setHass(hass)
  }, [hass])

  useEffect(() => {
    if (!entityId) return
    return weatherForecastService.subscribe(entityId, type)
  }, [entityId, type])

  return {
    forecast: entry?.forecast ?? EMPTY_FORECAST,
    // No entry yet means the first fetch has not resolved — which is loading,
    // unless there is no entity to load anything for.
    isLoading: entry?.isLoading ?? Boolean(entityId),
    error: entry?.error ?? null,
    unsupported: entry?.unsupported ?? false,
  }
}
