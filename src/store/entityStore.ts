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

/**
 * How many mounted views are showing each subscribed entity.
 *
 * `subscribedEntities` stays a Set, because what its consumers ask is "is
 * anything showing this entity?" (panel.ts's update fast path,
 * staleEntityMonitor, the connection popover's count). But a Set cannot answer
 * "did the LAST view of this entity go away?", and two views of one entity is
 * now the ordinary case rather than a curiosity: the detail dialog a hold opens
 * renders the same entity as the card behind it, so its unmount would otherwise
 * drop the still-mounted card's subscription — silently taking that card out of
 * the update path it depends on.
 */
const subscriptionCounts = new Map<string, number>()

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
    // The entity is gone, so are its views' subscriptions — leaving a count
    // behind would make the next subscribe start from a stale number.
    subscriptionCounts.delete(entityId)

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
    subscriptionCounts.set(entityId, (subscriptionCounts.get(entityId) ?? 0) + 1)

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
    const remaining = (subscriptionCounts.get(entityId) ?? 0) - 1
    if (remaining > 0) {
      // Another view still has it open; the set must not change.
      subscriptionCounts.set(entityId, remaining)
      return
    }
    subscriptionCounts.delete(entityId)

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
    subscriptionCounts.clear()
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
    subscriptionCounts.clear()
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
