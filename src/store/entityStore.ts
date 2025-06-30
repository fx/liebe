import { Store } from '@tanstack/store'
import type { EntityState, EntityStoreActions, HassEntity } from './entityTypes'

const initialState: EntityState = {
  entities: {},
  isConnected: false,
  isInitialLoading: true,
  lastError: null,
  subscribedEntities: new Set(),
  staleEntities: new Set(),
  lastUpdateTime: Date.now(),
}

export const entityStore = new Store<EntityState>(initialState)

export const entityStoreActions: EntityStoreActions = {
  setConnected: (connected: boolean) => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: connected,
    }))
  },

  setInitialLoading: (loading: boolean) => {
    entityStore.setState((state) => ({
      ...state,
      isInitialLoading: loading,
    }))
  },

  setError: (error: string | null) => {
    entityStore.setState((state) => ({
      ...state,
      lastError: error,
    }))
  },

  updateEntity: (entity: HassEntity) => {
    entityStore.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [entity.entity_id]: entity,
      },
    }))
  },

  updateEntities: (entities: HassEntity[]) => {
    entityStore.setState((state) => {
      const newEntities = { ...state.entities }
      entities.forEach((entity) => {
        newEntities[entity.entity_id] = entity
      })
      return {
        ...state,
        entities: newEntities,
      }
    })
  },

  removeEntity: (entityId: string) => {
    entityStore.setState((state) => {
      const { [entityId]: removed, ...remainingEntities } = state.entities
      // Explicitly mark as unused
      void removed
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.delete(entityId)

      return {
        ...state,
        entities: remainingEntities,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  subscribeToEntity: (entityId: string) => {
    entityStore.setState((state) => {
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.add(entityId)
      return {
        ...state,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  unsubscribeFromEntity: (entityId: string) => {
    entityStore.setState((state) => {
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.delete(entityId)
      return {
        ...state,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  clearSubscriptions: () => {
    entityStore.setState((state) => ({
      ...state,
      subscribedEntities: new Set(),
    }))
  },

  reset: () => {
    entityStore.setState(() => initialState)
  },

  markEntityStale: (entityId: string) => {
    entityStore.setState((state) => {
      const newStaleEntities = new Set(state.staleEntities)
      newStaleEntities.add(entityId)
      return {
        ...state,
        staleEntities: newStaleEntities,
      }
    })
  },

  markEntityFresh: (entityId: string) => {
    entityStore.setState((state) => {
      const newStaleEntities = new Set(state.staleEntities)
      newStaleEntities.delete(entityId)
      return {
        ...state,
        staleEntities: newStaleEntities,
      }
    })
  },

  updateLastUpdateTime: () => {
    entityStore.setState((state) => ({
      ...state,
      lastUpdateTime: Date.now(),
    }))
  },
}
