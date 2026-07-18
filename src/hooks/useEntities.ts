import { useEffect, useMemo } from 'react'
import { useStore } from '@tanstack/react-store'
import { entityStore, entityStoreActions } from '../store/entityStore'
import type { HassEntity } from '../store/entityTypes'

// Order-sensitive shallow equality over an entities record: equal when both hold
// the same keys, in the same order, pointing at the same entity references.
// Combined with entityStore preserving per-entity reference identity across
// batches, this lets the filtered selector short-circuit re-renders when none of
// the requested entities changed. Order matters because the slice is built in the
// caller's requested `entityIds` order and `filteredEntities` reflects that order;
// reordering the requested IDs must therefore be treated as a change.
function shallowEqualEntities(
  a: Record<string, HassEntity>,
  b: Record<string, HassEntity>
): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i]
    if (key !== bKeys[i] || a[key] !== b[key]) return false
  }
  return true
}

export function useEntities(entityIds?: string[]): {
  entities: Record<string, HassEntity>
  filteredEntities: HassEntity[]
  isConnected: boolean
  isLoading: boolean
} {
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const isInitialLoading = useStore(entityStore, (state) => state.isInitialLoading)

  const hasFilter = entityIds !== undefined && entityIds.length > 0

  // Single reactive selector that drives this hook's re-renders.
  //
  // - Filtered form (non-empty `entityIds`): build a slice containing only the
  //   requested entities and compare it shallowly, so an unrelated map
  //   replacement does not propagate a re-render.
  // - No-argument form (used by browsing UIs that genuinely need every entity,
  //   e.g. EntityBrowser): select the full map and compare by identity.
  //   entityStore replaces the map on every batch, so this form re-renders on
  //   every batch — an accepted cost for consumers that need the whole map.
  const selectedEntities = useStore(
    entityStore,
    (state) => {
      if (!hasFilter) {
        return state.entities
      }
      const slice: Record<string, HassEntity> = {}
      for (const id of entityIds) {
        const entity = state.entities[id]
        if (entity !== undefined) {
          slice[id] = entity
        }
      }
      return slice
    },
    hasFilter ? shallowEqualEntities : undefined
  )

  // Subscribe to specific entities when component mounts
  const entityIdsKey = entityIds?.join(',') || ''
  useEffect(() => {
    if (entityIds && entityIds.length > 0) {
      entityIds.forEach((entityId) => {
        entityStoreActions.subscribeToEntity(entityId)
      })

      // Cleanup subscriptions when component unmounts
      return () => {
        entityIds.forEach((entityId) => {
          entityStoreActions.unsubscribeFromEntity(entityId)
        })
      }
    }
  }, [entityIds, entityIdsKey]) // Re-subscribe if entity list changes

  // For the filtered form the slice is already restricted to the requested,
  // present entities (in requested order); for the no-arg form this yields every
  // entity. Memoized so the array reference is stable while the slice is stable.
  const filteredEntities = useMemo(() => Object.values(selectedEntities), [selectedEntities])

  // `entities` mirrors the reactive subscription: the full store map for the
  // no-arg form, and the requested slice for the filtered form. Both stay fully
  // reactive. Per this change, the filtered form intentionally derives its
  // selection from the requested ids only — an entity that was not requested is
  // absent from `entities` (returns undefined) rather than being tracked as a
  // stale value, since tracking it would mean re-rendering on every unrelated
  // batch. Callers needing an entity must include it in `entityIds`.
  return {
    entities: selectedEntities,
    filteredEntities,
    isConnected,
    isLoading: isInitialLoading,
  }
}
