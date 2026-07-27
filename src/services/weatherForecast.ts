import type { HomeAssistant } from '../contexts/HomeAssistantContext'
import { entityStore } from '../store/entityStore'
import { forecastCacheKey, forecastStore, forecastStoreActions } from '../store/forecastStore'
import {
  buildForecastRequest,
  deriveDailyFromTwiceDaily,
  FORECAST_REFRESH_MS,
  isForecastStale,
  isUnsupportedForecastError,
  isWeatherEntity,
  parseForecastResponse,
  resolveForecastType,
  type ForecastType,
} from './forecastData'

/**
 * Owns the forecasts of the weather entities cards are currently showing.
 *
 * Same shape as `EntityHistoryService`, minus the parts a forecast does not
 * have: there is no live ingress to append (the recorder does not stream
 * forecasts), so freshness is purely the refresh interval, and there is no
 * projection level — the fetched view IS the requested view.
 *
 * A module-level singleton for the same reason the rest of the pipeline is one:
 * the panel re-supplies `hass` constantly and the cache must outlive React's
 * render lifecycle.
 */
export class WeatherForecastService {
  private hass: HomeAssistant | null = null
  /** Live subscriber count per requested forecast. */
  private subscribers = new Map<string, number>()
  private inflight = new Map<string, Promise<void>>()
  private refreshTimers = new Map<string, ReturnType<typeof setInterval>>()
  /**
   * Bumped by `reset()`. A fetch already in flight resolves into a service that
   * no longer wants it, and without this it would resurrect the forecast it was
   * fetching and evict a fresh fetch's in-flight entry.
   */
  private generation = 0

  setHass(hass: HomeAssistant | null): void {
    // Gaining a connection is the same situation as regaining one: anything
    // fetched without it holds an error rather than data, and nothing else would
    // retry it before the next refresh tick.
    const gained = hass !== null && this.hass === null
    this.hass = hass
    if (gained) this.handleReconnected()
  }

  /**
   * Register interest in one entity's forecast, returning the unsubscribe. The
   * first subscriber triggers the fetch (or the freshness check on a warm entry)
   * and starts the refresh timer; the last one to leave stops it.
   */
  subscribe(entityId: string, type: ForecastType): () => void {
    const key = forecastCacheKey(entityId, type)
    const count = (this.subscribers.get(key) ?? 0) + 1
    this.subscribers.set(key, count)

    if (count === 1) {
      this.maintain(entityId, type)
      this.startRefresh(entityId, type)
    }

    let released = false
    return () => {
      // Guard against a double release: React invokes a cleanup once, but a
      // caller holding the function must not be able to drive the count negative
      // and take another consumer's subscription down with it.
      if (released) return
      released = true
      const current = this.subscribers.get(key)
      // The service was reset out from under this subscriber; there is no
      // bookkeeping left to unwind, and recreating some would be worse.
      if (current === undefined) return

      if (current > 1) {
        this.subscribers.set(key, current - 1)
        return
      }
      this.subscribers.delete(key)
      this.stopRefresh(key)
    }
  }

  /**
   * The connection came back. Whatever the providers published while the socket
   * was down is only reachable by asking again.
   */
  handleReconnected(): void {
    for (const key of this.subscribers.keys()) {
      const entry = forecastStore.state.entries[key]
      if (!entry) continue
      void this.fetch(entry.entityId, entry.type)
    }
  }

  /** Drop all state. Test-only seam — the singleton is module-global. */
  reset(): void {
    this.generation += 1
    for (const timer of this.refreshTimers.values()) clearInterval(timer)
    this.refreshTimers.clear()
    this.subscribers.clear()
    this.inflight.clear()
    this.hass = null
    forecastStoreActions.reset()
  }

  /** Fetch if there is nothing cached, or if what is cached has aged out. */
  private maintain(entityId: string, type: ForecastType): void {
    const entry = forecastStore.state.entries[forecastCacheKey(entityId, type)]
    if (!entry) {
      void this.fetch(entityId, type)
      return
    }
    // An entity that has no forecast of this type does not grow one by waiting;
    // it would need a new integration, which arrives as a new panel session.
    if (entry.unsupported) return
    if (isForecastStale(entry.updatedAt, type, Date.now())) void this.fetch(entityId, type)
  }

  private startRefresh(entityId: string, type: ForecastType): void {
    const key = forecastCacheKey(entityId, type)
    this.stopRefresh(key)
    this.refreshTimers.set(
      key,
      setInterval(() => this.maintain(entityId, type), FORECAST_REFRESH_MS[type])
    )
  }

  private stopRefresh(key: string): void {
    const timer = this.refreshTimers.get(key)
    if (!timer) return
    clearInterval(timer)
    this.refreshTimers.delete(key)
  }

  /** Deduped fetch: concurrent requests for one forecast share a single call. */
  private fetch(entityId: string, type: ForecastType): Promise<void> {
    const key = forecastCacheKey(entityId, type)
    const existing = this.inflight.get(key)
    if (existing) return existing

    const generation = this.generation
    const request = this.runFetch(entityId, type, generation).finally(() => {
      if (generation === this.generation) this.inflight.delete(key)
    })
    this.inflight.set(key, request)
    return request
  }

  private async runFetch(entityId: string, type: ForecastType, generation: number): Promise<void> {
    // Nothing but a weather entity has a forecast, and the service would reject
    // the call rather than answer it.
    if (!isWeatherEntity(entityId)) {
      this.markUnsupported(entityId, type)
      return
    }

    const { hass } = this
    if (!hass) {
      // `updatedAt` advances on the failure too, or the refresh tick would judge
      // the entry stale every time and retry for as long as the connection is
      // down. `setHass` retries the moment a connection returns, so nothing waits
      // on the interval for the case that actually resolves this.
      forecastStoreActions.patchEntry(entityId, type, {
        isLoading: false,
        error: 'Home Assistant not connected',
        updatedAt: Date.now(),
      })
      return
    }

    // What the entity advertises decides both whether the request is answerable
    // and, for a daily request against a twice-daily-only integration, what is
    // actually fetched.
    const supportedFeatures = entityStore.state.entities[entityId]?.attributes?.supported_features
    const fetchType = resolveForecastType(type, supportedFeatures)
    if (fetchType === null) {
      this.markUnsupported(entityId, type)
      return
    }

    forecastStoreActions.patchEntry(entityId, type, { isLoading: true, error: null })

    try {
      const raw = await hass.callWS(buildForecastRequest(entityId, fetchType))
      // The service may have been reset while this was in flight; writing the
      // answer to a question nobody is asking any more would resurrect the entry
      // it was fetched for.
      if (generation !== this.generation) return

      const parsed = parseForecastResponse(raw, entityId)
      // The call succeeded but said nothing about this entity — the shape "no
      // forecast here" takes when the service does not raise.
      if (parsed === null) {
        this.markUnsupported(entityId, type)
        return
      }

      const derived = fetchType === 'twice_daily' && type === 'daily'
      forecastStoreActions.patchEntry(entityId, type, {
        forecast: derived ? deriveDailyFromTwiceDaily(parsed) : parsed,
        isLoading: false,
        error: null,
        unsupported: false,
        updatedAt: Date.now(),
      })
    } catch (error) {
      if (generation !== this.generation) return
      // "This entity has no such forecast" and "the call went wrong" render
      // differently: the first is hidden silently, the second is a fault.
      if (isUnsupportedForecastError(error)) {
        this.markUnsupported(entityId, type)
        return
      }
      // Non-fatal by contract: the consumer renders without forecast content.
      // Entries already held are left in place rather than blanked, and
      // `updatedAt` advances for the same reason as above.
      forecastStoreActions.patchEntry(entityId, type, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load forecast',
        updatedAt: Date.now(),
      })
    }
  }

  private markUnsupported(entityId: string, type: ForecastType): void {
    forecastStoreActions.patchEntry(entityId, type, {
      forecast: [],
      isLoading: false,
      error: null,
      unsupported: true,
      updatedAt: Date.now(),
    })
  }
}

/** Singleton, like the rest of the entity-state pipeline. */
export const weatherForecastService = new WeatherForecastService()
