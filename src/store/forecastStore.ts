import { Store } from '@tanstack/store'
import type { ForecastEntry, ForecastType } from '../services/forecastData'

/**
 * One cached forecast: the result of a `weather.get_forecasts` call.
 *
 * Keyed by entity + the type the CONSUMER asked for, which is the unit of
 * subscription. It is not always the type that was fetched — a daily request
 * against a twice-daily-only integration is fetched as `twice_daily` and derived
 * before it lands here, so what the entry holds is always the requested view.
 */
export interface ForecastCacheEntry {
  entityId: string
  /** The requested granularity. */
  type: ForecastType
  /** The forecast entries, oldest first. */
  forecast: ForecastEntry[]
  isLoading: boolean
  error: string | null
  /** The entity or its integration provides no forecast of this type. */
  unsupported: boolean
  /**
   * When the entry last had an answer — a successful fetch or a failed one.
   * Refresh is judged against this, so a failure advancing it is what keeps a
   * disconnected dashboard from retrying on every tick.
   */
  updatedAt: number
}

export interface ForecastState {
  entries: Record<string, ForecastCacheEntry>
}

export const forecastStore = new Store<ForecastState>({ entries: {} })

/** Cache key for one entity's forecast of one requested type. */
export function forecastCacheKey(entityId: string, type: ForecastType): string {
  return `${entityId}|${type}`
}

export const forecastStoreActions = {
  /**
   * Merge a patch into one entry, creating it if absent. Only the patched entry's
   * identity changes, so the per-entry selector in `useWeatherForecast` leaves
   * every other card alone.
   */
  patchEntry(
    entityId: string,
    type: ForecastType,
    patch: Partial<Omit<ForecastCacheEntry, 'entityId' | 'type'>>
  ): void {
    const key = forecastCacheKey(entityId, type)
    forecastStore.setState((state) => {
      const base: ForecastCacheEntry = state.entries[key] ?? {
        entityId,
        type,
        forecast: [],
        isLoading: false,
        error: null,
        unsupported: false,
        updatedAt: 0,
      }
      return { ...state, entries: { ...state.entries, [key]: { ...base, ...patch } } }
    })
  },

  /** Drop every cached forecast. */
  reset(): void {
    forecastStore.setState(() => ({ entries: {} }))
  },
}
