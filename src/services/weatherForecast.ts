import type { HomeAssistant } from '../contexts/HomeAssistantContext'
import { entityStore } from '../store/entityStore'
import { schedulePipelineTask } from './pipelineScheduler'
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
  /**
   * Scheduler unsubscribes per requested forecast. Replaces the per-forecast
   * `setInterval` map: subscribing the fiftieth forecast adds a map entry,
   * not a timer.
   */
  private refreshTasks = new Map<string, () => void>()
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
      // Regaining the socket is not new information about an entity that has
      // already answered "no such forecast": the same once-per-session rule the
      // refresh tick follows applies here, and a dashboard that reconnects often
      // would otherwise spend a call per reconnect on every forecast that will
      // never answer.
      if (entry.unsupported) continue
      void this.fetch(entry.entityId, entry.type)
    }
  }

  /** Drop all state. Test-only seam — the singleton is module-global. */
  reset(): void {
    this.generation += 1
    for (const release of this.refreshTasks.values()) release()
    this.refreshTasks.clear()
    this.subscribers.clear()
    this.inflight.clear()
    this.hass = null
    forecastStoreActions.reset()
  }

  /**
   * The subscribe path: fetch if there is nothing cached, or if what is cached
   * has aged out. A subscriber arrives at an arbitrary point inside the refresh
   * interval — a remount, a second card on the same entity — so here the entry's
   * own timestamp is the only thing that can decide.
   */
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

  /**
   * The refresh tick, which IS the freshness decision: the timer's period is the
   * type's refresh interval, so an entry that survives to a tick is due by
   * construction.
   *
   * Re-checking `updatedAt` here would defeat that. The tick fires at T0 +
   * interval while the entry records the moment the previous fetch RESOLVED, T0
   * + latency, so `now - updatedAt` is always one round trip short of the
   * interval, the entry never reads stale on its own tick, and every refresh
   * slips to the following one — a real interval of twice what is documented.
   */
  private refresh(entityId: string, type: ForecastType): void {
    // Same once-per-session resolution as `maintain`.
    if (forecastStore.state.entries[forecastCacheKey(entityId, type)]?.unsupported) return
    void this.fetch(entityId, type)
  }

  private startRefresh(entityId: string, type: ForecastType): void {
    const key = forecastCacheKey(entityId, type)
    this.stopRefresh(key)
    // The slow wheel ticks every 5min; hourly (30min) and daily (2h) refresh
    // intervals both divide it evenly, so each refresh lands on a tick with
    // no phase of its own. Rates unchanged — coalescing aligns, not retunes.
    this.refreshTasks.set(
      key,
      schedulePipelineTask('slow', FORECAST_REFRESH_MS[type], () =>
        this.refresh(entityId, type)
      )
    )
  }

  private stopRefresh(key: string): void {
    const release = this.refreshTasks.get(key)
    if (!release) return
    release()
    this.refreshTasks.delete(key)
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
