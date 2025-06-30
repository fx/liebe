import { useEffect, useMemo } from 'react'
import { useStore } from '@tanstack/react-store'
import { entityStore, entityStoreActions } from '../store/entityStore'
import type { HassEntity } from '../store/entityTypes'

export function useEntities(entityIds?: string[]): {
  entities: Record<string, HassEntity>
  filteredEntities: HassEntity[]
  isConnected: boolean
  isLoading: boolean
} {
  const allEntities = useStore(entityStore, (state) => state.entities)
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const isInitialLoading = useStore(entityStore, (state) => state.isInitialLoading)

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

  // Filter entities if specific IDs are requested
  const filteredEntities = useMemo(() => {
    if (!entityIds || entityIds.length === 0) {
      return Object.values(allEntities)
    }

    return entityIds
      .map((id) => allEntities[id])
      .filter((entity): entity is HassEntity => entity !== undefined)
  }, [allEntities, entityIds])

  return {
    entities: allEntities,
    filteredEntities,
    isConnected,
    isLoading: isInitialLoading,
  }
}
