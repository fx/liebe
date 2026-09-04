import type { HomeAssistant } from '../contexts/HomeAssistantContext'
import { entityStore } from '../store/entityStore'
import type { HassEntity } from '../store/entityTypes'
import { schedulePipelineTask } from './pipelineScheduler'
import {
  historyCacheKey,
  historyStore,
  historyStoreActions,
  type HistoryEntry,
} from '../store/historyStore'
import {
  buildHistoryRequest,
  downsampleHistory,
  historyWindowMs,
  isNonNumericState,
  parseHistoryResponse,
  pruneSamples,
  type HistoryMode,
  type HistoryPoint,
  type HistoryResponse,
  type HistorySample,
} from './historyData'

/**
 * How long an entry may go without new data before it is refetched. A window
 * that has only been kept current by live appends is trusted for this long
 * after the last one; past it the recorder is the authority again.
 */
export const HISTORY_FRESHNESS_TTL_MS = 5 * 60_000

/**
 * Floor on the periodic maintenance interval. The interval is otherwise one
 * downsample bucket (window ÷ default points), which for a short window would
 * otherwise mean a timer running every few seconds for no visible gain.
 */
export const MIN_MAINTENANCE_INTERVAL_MS = 60_000

/** Shared empty projection, so "no data yet" is referentially stable. */
const EMPTY_POINTS: HistoryPoint[] = []

export interface ProjectionOptions {
  mode: HistoryMode
  points: number
  /** The entity's `state_class`; decides how `delta` treats a decrease. */
  stateClass?: string
}

interface CachedProjection {
  version: number
  points: HistoryPoint[]
}

/**
 * Owns recent numeric history for the entities cards are currently showing.
 *
 * Two-level cache: raw samples per entity + window (the expensive fetch), and
 * derived series per mode + point count on top of them. A module-level singleton
 * for the same reason the rest of the pipeline is one — the panel re-supplies
 * `hass` constantly, and the cache must outlive React's render lifecycle.
 */
export class EntityHistoryService {
  private hass: HomeAssistant | null = null
  /** Live subscriber count per window key. */
  private subscribers = new Map<string, number>()
  /** Window keys per entity id, so raw ingress is O(1) for untracked entities. */
  private keysByEntity = new Map<string, Set<string>>()
  /** Window keys that have had no subscriber since their last append. */
  private idle = new Set<string>()
  private inflight = new Map<string, Promise<void>>()
  /**
   * Scheduler unsubscribes per watched window. Replaces the per-window
   * `setInterval` map: subscribing the fiftieth entity adds a map entry, not
   * a timer.
   */
  private maintenanceTasks = new Map<string, () => void>()
  private projections = new Map<string, CachedProjection>()
  /**
   * Bumped by `reset()`. A fetch that was already in flight resolves into a
   * service that no longer wants it, and without this it would resurrect the
   * window it was fetching and evict a fresh fetch's in-flight entry.
   */
  private generation = 0

  setHass(hass: HomeAssistant | null): void {
    // Gaining a connection is the same situation as regaining one: any window
    // fetched without it holds an error rather than data, and nothing else
    // would retry it before the next maintenance tick.
    const gained = hass !== null && this.hass === null
    this.hass = hass
    if (gained) this.handleReconnected()
  }

  /**
   * Register interest in a window, returning the unsubscribe. The first
   * subscriber triggers the fetch (or the freshness check on a warm entry) and
   * starts periodic maintenance; the last one to leave stops it and marks the
   * entry as having gone unwatched.
   */
  subscribe(entityId: string, hours: number): () => void {
    const key = historyCacheKey(entityId, hours)
    const count = (this.subscribers.get(key) ?? 0) + 1
    this.subscribers.set(key, count)

    let keys = this.keysByEntity.get(entityId)
    if (!keys) {
      keys = new Set()
      this.keysByEntity.set(entityId, keys)
    }
    keys.add(key)

    if (count === 1) {
      this.maintain(entityId, hours)
      this.startMaintenance(entityId, hours)
    }

    const entityKeys = keys
    let released = false
    return () => {
      // Guard against a double release: React invokes a cleanup once, but a
      // caller holding the function must not be able to drive the count
      // negative and take another consumer's subscription down with it.
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
      entityKeys.delete(key)
      if (entityKeys.size === 0) this.keysByEntity.delete(entityId)
      this.idle.add(key)
      this.stopMaintenance(key)
    }
  }

  /**
   * The derived series for one subscriber's request, cached against the entry's
   * version. The cache key carries mode AND point count because the point count
   * sets the bucket boundaries: two cards asking for different point counts get
   * genuinely different values, not the same series at a different resolution.
   */
  project(entry: HistoryEntry | undefined, options: ProjectionOptions): HistoryPoint[] {
    if (!entry || entry.samples.length === 0) return EMPTY_POINTS

    const { mode, points, stateClass } = options
    const key = `${historyCacheKey(entry.entityId, entry.hours)}|${mode}|${points}|${stateClass ?? ''}`
    const cached = this.projections.get(key)
    if (cached && cached.version === entry.version) return cached.points

    const end = Date.now()
    const projected = downsampleHistory(entry.samples, {
      start: end - historyWindowMs(entry.hours),
      end,
      points,
      mode,
      stateClass,
    })
    this.projections.set(key, { version: entry.version, points: projected })
    return projected
  }

  /**
   * Raw state ingress, called from the connection manager BEFORE the debouncer.
   * The debounced pipeline keeps only the last update in its window, which is
   * precisely the counter resets and measurement spikes delta and min/max
   * processing exist to preserve.
   */
  ingest(entity: HassEntity): void {
    const keys = this.keysByEntity.get(entity.entity_id)
    if (!keys) return

    const value = Number(entity.state)
    if (entity.state.trim() === '' || !Number.isFinite(value)) return

    const now = Date.now()
    const parsed = Date.parse(entity.last_updated)
    const t = Number.isNaN(parsed) ? now : parsed

    for (const key of keys) {
      const entry = historyStore.state.entries[key]
      if (!entry || entry.unsupported) continue
      const appended = [...entry.samples, { t, value }]
      historyStoreActions.patchEntry(entry.entityId, entry.hours, {
        samples: pruneSamples(appended, now - historyWindowMs(entry.hours)),
        updatedAt: now,
      })
    }
  }

  /**
   * The event stream restarted, so every watched window has a hole in it for
   * however long the socket was down. Live appends cannot fill that in — only
   * the recorder can.
   */
  handleReconnected(): void {
    for (const key of this.subscribers.keys()) {
      const entry = historyStore.state.entries[key]
      if (!entry) continue
      void this.fetch(entry.entityId, entry.hours)
    }
    // Unwatched windows are already marked; a reconnect does not change that
    // they must be refetched before they are shown again.
  }

  /** Drop all state. Test-only seam — the singleton is module-global. */
  reset(): void {
    this.generation += 1
    for (const release of this.maintenanceTasks.values()) release()
    this.maintenanceTasks.clear()
    this.subscribers.clear()
    this.keysByEntity.clear()
    this.idle.clear()
    this.inflight.clear()
    this.projections.clear()
    this.hass = null
    historyStoreActions.reset()
  }

  /**
   * Bring one window up to date: prune what has aged out, then refetch if the
   * entry cannot be trusted — it went unwatched (so it missed appends), or it
   * has had no data for longer than the freshness TTL.
   */
  private maintain(entityId: string, hours: number): void {
    const key = historyCacheKey(entityId, hours)
    const entry = historyStore.state.entries[key]
    // Set when the last subscriber left, so this is "no active subscriber since
    // the last append" — the window has a hole in it wherever the entity moved
    // while nothing was watching.
    const wentUnwatched = this.idle.delete(key)

    if (!entry) {
      void this.fetch(entityId, hours)
      return
    }

    // A non-numeric entity does not become graphable by waiting.
    if (entry.unsupported) return

    const now = Date.now()
    const pruned = pruneSamples(entry.samples, now - historyWindowMs(hours))
    if (pruned !== entry.samples) {
      historyStoreActions.patchEntry(entityId, hours, { samples: pruned })
    }

    if (wentUnwatched || now - entry.updatedAt > HISTORY_FRESHNESS_TTL_MS) {
      void this.fetch(entityId, hours)
    }
  }

  private startMaintenance(entityId: string, hours: number): void {
    const key = historyCacheKey(entityId, hours)
    this.stopMaintenance(key)
    // A freshness decision, not a cadence: the scheduler's 30s wheel wakes
    // the window, and `maintain` refetches only when the entry is stale (TTL)
    // or went unwatched. The bucket-derived interval this replaced set how
    // often a short window re-pruned; pruning now happens at TTL granularity,
    // which is the coarser but behaviour-preserving choice the coalescing
    // requires — the entry, not the timer, decides.
    this.maintenanceTasks.set(
      key,
      schedulePipelineTask('fast', MIN_MAINTENANCE_INTERVAL_MS, () =>
        this.maintain(entityId, hours)
      )
    )
  }

  private stopMaintenance(key: string): void {
    const release = this.maintenanceTasks.get(key)
    if (!release) return
    release()
    this.maintenanceTasks.delete(key)
  }

  /** Deduped fetch: concurrent requests for one window share a single call. */
  private fetch(entityId: string, hours: number): Promise<void> {
    const key = historyCacheKey(entityId, hours)
    const existing = this.inflight.get(key)
    if (existing) return existing

    const generation = this.generation
    const request = this.runFetch(entityId, hours, generation).finally(() => {
      if (generation === this.generation) this.inflight.delete(key)
    })
    this.inflight.set(key, request)
    return request
  }

  private async runFetch(entityId: string, hours: number, generation: number): Promise<void> {
    const { hass } = this
    if (!hass) {
      // `updatedAt` advances on the failure too, or maintenance would judge the
      // entry stale on every tick and retry for as long as the connection is
      // down. A dashboard that has lost Home Assistant must go quiet, not busy.
      // `setHass` retries the moment a connection returns, so nothing waits on
      // the TTL for the case that actually resolves this.
      historyStoreActions.patchEntry(entityId, hours, {
        isLoading: false,
        error: 'Home Assistant not connected',
        updatedAt: Date.now(),
      })
      return
    }

    // A text entity has nothing to graph, and the recorder would happily return
    // a window of its states. Resolve it from the live state instead of paying
    // for the fetch to find out.
    const key = historyCacheKey(entityId, hours)
    const entity = entityStore.state.entities[entityId]
    if (entity && isNonNumericState(entity.state)) {
      historyStoreActions.patchEntry(entityId, hours, {
        isLoading: false,
        error: null,
        unsupported: true,
        samples: [],
        updatedAt: Date.now(),
      })
      return
    }

    historyStoreActions.patchEntry(entityId, hours, { isLoading: true, error: null })

    const end = Date.now()
    try {
      const response = await hass.callWS<HistoryResponse>(
        buildHistoryRequest(entityId, end - historyWindowMs(hours), end)
      )
      // The service may have been reset while this was in flight; writing the
      // answer to a question nobody is asking any more would resurrect the
      // window it was fetched for.
      if (generation !== this.generation) return
      const { samples, nonNumeric } = parseHistoryResponse(response, entityId)
      const previous = historyStore.state.entries[key]
      historyStoreActions.patchEntry(entityId, hours, {
        samples: nonNumeric ? [] : mergeLiveTail(samples, previous?.samples ?? []),
        isLoading: false,
        error: null,
        unsupported: nonNumeric,
        updatedAt: Date.now(),
      })
    } catch (error) {
      if (generation !== this.generation) return
      // Non-fatal by contract: the consumer renders without a graph. Samples
      // already held are left in place rather than blanked, and `updatedAt`
      // advances for the same reason as above — a recorder that answered with
      // an error must be asked again at the TTL, not at every tick.
      historyStoreActions.patchEntry(entityId, hours, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load history',
        updatedAt: Date.now(),
      })
    }
  }
}

/**
 * Keep live appends that landed while the fetch was in flight. The recorder's
 * window closed when the request was issued, so anything newer than its last
 * sample would otherwise be dropped on arrival.
 */
function mergeLiveTail(fetched: HistorySample[], previous: HistorySample[]): HistorySample[] {
  const newest = fetched.length === 0 ? -Infinity : fetched[fetched.length - 1].t
  const tail = previous.filter((sample) => sample.t > newest)
  return tail.length === 0 ? fetched : [...fetched, ...tail]
}

/** Singleton, like the rest of the entity-state pipeline. */
export const entityHistoryService = new EntityHistoryService()
