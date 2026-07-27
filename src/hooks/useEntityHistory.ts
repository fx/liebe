import { useEffect, useMemo } from 'react'
import { useStore } from '@tanstack/react-store'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { entityHistoryService } from '../services/entityHistory'
import {
  DEFAULT_HISTORY_HOURS,
  DEFAULT_HISTORY_POINTS,
  normalizeHistoryHours,
  normalizeHistoryPoints,
  type HistoryMode,
  type HistoryPoint,
} from '../services/historyData'
import { entityStore } from '../store/entityStore'
import { historyCacheKey, historyStore } from '../store/historyStore'

export interface UseEntityHistoryOptions {
  /** Rolling window length in hours. Defaults to 24. */
  hours?: number
  /** Maximum points returned. Defaults to 100. */
  points?: number
  /** How raw samples reduce to a point. Defaults to `sample`. */
  mode?: HistoryMode
}

export interface EntityHistoryResult {
  /** The downsampled series, oldest first. */
  points: HistoryPoint[]
  /** Just the values — what the sparkline anatomy takes. */
  values: number[]
  isLoading: boolean
  /** Non-fatal: consumers render without a graph. Never thrown. */
  error: string | null
  /** The entity's states are not numeric, so there is nothing to graph. */
  unsupported: boolean
}

/**
 * Recent numeric history for one entity, downsampled for a card-sized graph.
 *
 * Contract owner: docs/specs/entity-state/index.md — "History & Forecast Hooks".
 * The window is cached across consumers and kept current by raw state ingress;
 * this hook only registers interest and projects what the cache holds.
 */
export function useEntityHistory(
  entityId: string,
  options: UseEntityHistoryOptions = {}
): EntityHistoryResult {
  const {
    hours: requestedHours = DEFAULT_HISTORY_HOURS,
    points: requestedPoints = DEFAULT_HISTORY_POINTS,
    mode = 'sample',
  } = options
  // These arrive from card configuration, and a document this build cannot
  // fully interpret still reaches the render path, so the value is read rather
  // than rejected. Normalising at the boundary keeps a junk number out of the
  // cache key as well as out of the arithmetic behind it.
  const hours = normalizeHistoryHours(requestedHours)
  const points = normalizeHistoryPoints(requestedPoints)
  const hass = useHomeAssistantOptional()

  // Per-window slice: an unrelated entity's history landing in the store leaves
  // this selector's result identical, so the card does not re-render.
  const entry = useStore(historyStore, (state) => state.entries[historyCacheKey(entityId, hours)])
  // `delta` reads differently for a resetting counter than for a signed total,
  // and only the entity says which it is.
  const stateClass = useStore(entityStore, (state) => {
    const value = state.entities[entityId]?.attributes?.state_class
    return typeof value === 'string' ? value : undefined
  })

  // Home Assistant hands down a NEW `hass` object on every state change, so
  // this must stay separate from the subscription below — folding them together
  // would tear the window's subscription down and refetch its history on every
  // state change in the house.
  useEffect(() => {
    entityHistoryService.setHass(hass)
  }, [hass])

  useEffect(() => {
    if (!entityId) return
    return entityHistoryService.subscribe(entityId, hours)
  }, [entityId, hours])

  const projected = useMemo(
    () => entityHistoryService.project(entry, { mode, points, stateClass }),
    [entry, mode, points, stateClass]
  )
  const values = useMemo(() => projected.map((point) => point.value), [projected])

  return {
    points: projected,
    values,
    // No entry yet means the first fetch has not resolved — which is loading,
    // unless there is no entity to load anything for.
    isLoading: entry?.isLoading ?? Boolean(entityId),
    error: entry?.error ?? null,
    unsupported: entry?.unsupported ?? false,
  }
}
