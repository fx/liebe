import { useEffect } from 'react'
import { useStore } from '@tanstack/react-store'
import { entityStore, entityStoreActions } from '../store/entityStore'
import type { HassEntity } from '../store/entityTypes'
import { staleEntityMonitor } from '../services/staleEntityMonitor'

export function useEntity(entityId: string): {
  entity: HassEntity | undefined
  isConnected: boolean
  isLoading: boolean
  isMissing: boolean
  isStale: boolean
} {
  // Select only this entity's slice so TanStack Store's selector equality
  // short-circuits re-renders when the entity reference is unchanged. Because
  // updateEntities preserves reference identity for entities that did not change
  // in a batch, an unrelated entity update leaves this selector's result === the
  // previous value and does not re-render the component.
  const entity = useStore(entityStore, (state) => state.entities[entityId])
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const isInitialLoading = useStore(entityStore, (state) => state.isInitialLoading)
  // Select staleness for this entity only. getEntityStaleness reads the store
  // singleton and honors excluded entity types (e.g. cameras are never stale);
  // the selector returns a boolean so re-renders only occur when it flips.
  const isStale = useStore(
    entityStore,
    () => staleEntityMonitor.getEntityStaleness(entityId).isStale
  )

  // Subscribe to entity when component mounts
  useEffect(() => {
    if (entityId) {
      entityStoreActions.subscribeToEntity(entityId)

      // Cleanup subscription when component unmounts
      return () => {
        entityStoreActions.unsubscribeFromEntity(entityId)
      }
    }
  }, [entityId])

  /*
   * The third lifecycle state, and the reason for having one: an entity absent
   * from a state machine we have finished receiving is absent from Home
   * Assistant, which is a different fact from one that has not arrived yet.
   * Without the distinction a consumer can only ask "do I hold this entity?",
   * and the honest answer to that question during startup and after a deletion
   * is the same "no" — so a card either flashes a not-found treatment while the
   * snapshot loads or, as every card did, waits forever for an entity Home
   * Assistant will never send.
   *
   * Both conjuncts are what make the answer safe to act on. `isConnected` keeps
   * a dropped socket out of it: an unreachable Home Assistant has told us
   * nothing about what exists, so a disconnected panel is neither missing nor
   * pending. `!isInitialLoading` is what makes the map the whole state machine
   * rather than a prefix of it — mid-snapshot, every entity yet to be written
   * is absent and none of them is missing.
   *
   * `isMissing` and `isLoading` are therefore mutually exclusive by
   * construction: one requires `isInitialLoading`, the other its negation.
   */
  const isMissing = isConnected && !isInitialLoading && !entity

  return {
    entity,
    isConnected,
    isLoading: isInitialLoading && !entity,
    isMissing,
    isStale,
  }
}
