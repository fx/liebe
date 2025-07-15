import { Store } from '@tanstack/store'
import type { EntityState, EntityStoreActions, HassEntity } from './entityTypes'

const initialState: EntityState = {
  entities: {},
  isConnected: false,
  isInitialLoading: true,
  lastError: null,
  subscribedEntities: new Set(),
  staleEntities: new Set(),
}

export const entityStore = new Store<EntityState>(initialState)

// Connection state debouncing
let connectionDebounceTimer: NodeJS.Timeout | null = null

export const entityStoreActions: EntityStoreActions = {
  setConnected: (connected: boolean) => {
    const currentState = entityStore.state

    // Clear any existing debounce timer
    if (connectionDebounceTimer) {
      clearTimeout(connectionDebounceTimer)
      connectionDebounceTimer = null
    }

    // If going from disconnected to connected, apply immediately
    if (connected && !currentState.isConnected) {
      entityStore.setState((state) => ({
        ...state,
        isConnected: true,
      }))
      return
    }

    // If going from connected to disconnected, debounce for 500ms
    if (!connected && currentState.isConnected) {
      connectionDebounceTimer = setTimeout(() => {
        // Double-check the intended state hasn't changed during the timeout
        const latestState = entityStore.state
        if (latestState.isConnected) {
          entityStore.setState((state) => ({
            ...state,
            isConnected: false,
          }))
        }
        connectionDebounceTimer = null
      }, 500)
      return
    }

    // For all other cases (no change or repeated calls), do nothing
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
    // Clear any pending connection debounce timer
    if (connectionDebounceTimer) {
      clearTimeout(connectionDebounceTimer)
      connectionDebounceTimer = null
    }
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

  hasSubscribedEntityUpdates: (entities: HassEntity[]): boolean => {
    const state = entityStore.state
    return entities.some((entity) => state.subscribedEntities.has(entity.entity_id))
  },
}
