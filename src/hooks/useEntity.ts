import { useEffect, useMemo } from 'react'
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
  const entities = useStore(entityStore, (state) => state.entities)
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const isInitialLoading = useStore(entityStore, (state) => state.isInitialLoading)
  const staleEntities = useStore(entityStore, (state) => state.staleEntities)

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

  const entity = useMemo(() => {
    return entities[entityId]
  }, [entities, entityId])

  const isStale = useMemo(() => {
    // Use staleEntityMonitor to check staleness, which respects excluded entity types
    return staleEntityMonitor.getEntityStaleness(entityId).isStale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, staleEntities])

  return {
    entity,
    isConnected,
    isLoading: isInitialLoading && !entity,
    isStale,
  }
}
