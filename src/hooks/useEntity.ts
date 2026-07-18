import { useEffect } from 'react'
import { useStore } from '@tanstack/react-store'
import { entityStore, entityStoreActions } from '../store/entityStore'
import type { HassEntity } from '../store/entityTypes'
import { staleEntityMonitor } from '../services/staleEntityMonitor'

export function useEntity(entityId: string): {
  entity: HassEntity | undefined
  isConnected: boolean
  isLoading: boolean
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

  return {
    entity,
    isConnected,
    isLoading: isInitialLoading && !entity,
    isStale,
  }
}
