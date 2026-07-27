import { Store } from '@tanstack/store'
import type { HistorySample } from '../services/historyData'

/**
 * One cached history window: the expensive part of `useEntityHistory`.
 *
 * Keyed by entity + window only. Projections (mode, point count) are derived
 * per subscriber and cached separately — the raw samples are what a fetch costs.
 */
export interface HistoryEntry {
  entityId: string
  /** Rolling window length, in hours. */
  hours: number
  /** Raw numeric samples inside the window, oldest first. */
  samples: HistorySample[]
  /**
   * Bumped on every change to `samples`. Projections cache against it, so a
   * live append invalidates exactly the derived series and nothing else.
   */
  version: number
  isLoading: boolean
  error: string | null
  /** The entity's states are not numeric, so there is nothing to graph. */
  unsupported: boolean
  /**
   * When the entry last received data — a fetch or a live append. Freshness is
   * judged against this, and it must outlive the subscriber that produced it:
   * a card that unmounts and remounts has to know its window went unwatched.
   */
  updatedAt: number
}

export interface HistoryState {
  entries: Record<string, HistoryEntry>
}

export const historyStore = new Store<HistoryState>({ entries: {} })

/** Cache key for a window. Projections extend it with mode and point count. */
export function historyCacheKey(entityId: string, hours: number): string {
  return `${entityId}|${hours}`
}

export const historyStoreActions = {
  /**
   * Merge a patch into one entry, creating it if absent. Only the patched
   * entry's identity changes, so the per-entry selectors in `useEntityHistory`
   * leave every other card alone.
   *
   * `version` is owned here rather than by callers: it is bumped exactly when
   * the patch replaces `samples`, which is the one condition the projection
   * cache keys off. A caller that had to remember to bump it would eventually
   * forget, and a stale projection is invisible until someone stares at a
   * graph that stopped moving.
   */
  patchEntry(
    entityId: string,
    hours: number,
    patch: Partial<Omit<HistoryEntry, 'entityId' | 'hours' | 'version'>>
  ): void {
    const key = historyCacheKey(entityId, hours)
    historyStore.setState((state) => {
      const existing = state.entries[key]
      const base: HistoryEntry = existing ?? {
        entityId,
        hours,
        samples: [],
        version: 0,
        isLoading: false,
        error: null,
        unsupported: false,
        updatedAt: 0,
      }
      const samplesReplaced = patch.samples !== undefined && patch.samples !== base.samples
      const entry: HistoryEntry = {
        ...base,
        ...patch,
        version: samplesReplaced ? base.version + 1 : base.version,
      }
      return { ...state, entries: { ...state.entries, [key]: entry } }
    })
  },

  /** Drop every cached window. */
  reset(): void {
    historyStore.setState(() => ({ entries: {} }))
  },
}
