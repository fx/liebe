import { describe, it, expect, beforeEach } from 'vitest'
import { entityStore, entityStoreActions } from '../entityStore'
import type { HassEntity } from '../entityTypes'

describe('entityStore', () => {
  beforeEach(() => {
    // Reset store before each test
    entityStoreActions.reset()
  })

  describe('connection state', () => {
    it('should set connected state', () => {
      entityStoreActions.setConnected(true)
      expect(entityStore.state.isConnected).toBe(true)

      entityStoreActions.setConnected(false)
      expect(entityStore.state.isConnected).toBe(false)
    })

    it('should set initial loading state', () => {
      entityStoreActions.setInitialLoading(true)
      expect(entityStore.state.isInitialLoading).toBe(true)

      entityStoreActions.setInitialLoading(false)
      expect(entityStore.state.isInitialLoading).toBe(false)
    })

    it('should set error state', () => {
      entityStoreActions.setError('Connection failed')
      expect(entityStore.state.lastError).toBe('Connection failed')

      entityStoreActions.setError(null)
      expect(entityStore.state.lastError).toBeNull()
    })
  })

  describe('entity management', () => {
    const mockEntity: HassEntity = {
      entity_id: 'light.living_room',
      state: 'on',
      attributes: {
        friendly_name: 'Living Room Light',
        brightness: 255,
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: {
        id: '123',
        parent_id: null,
        user_id: null,
      },
    }

    it('should update a single entity', () => {
      entityStoreActions.updateEntity(mockEntity)
      expect(entityStore.state.entities['light.living_room']).toEqual(mockEntity)
    })

    it('should update multiple entities', () => {
      const entities: HassEntity[] = [
        mockEntity,
        {
          ...mockEntity,
          entity_id: 'light.bedroom',
          attributes: {
            friendly_name: 'Bedroom Light',
          },
        },
      ]

      entityStoreActions.updateEntities(entities)
      expect(Object.keys(entityStore.state.entities)).toHaveLength(2)
      expect(entityStore.state.entities['light.living_room']).toBeDefined()
      expect(entityStore.state.entities['light.bedroom']).toBeDefined()
    })

    it('should remove an entity', () => {
      entityStoreActions.updateEntity(mockEntity)
      entityStoreActions.subscribeToEntity('light.living_room')

      entityStoreActions.removeEntity('light.living_room')

      expect(entityStore.state.entities['light.living_room']).toBeUndefined()
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })
  })

  describe('entity subscriptions', () => {
    it('should subscribe to an entity', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(true)
    })

    it('should unsubscribe from an entity', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.unsubscribeFromEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })

    it('should handle multiple subscriptions', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.bedroom')
      entityStoreActions.subscribeToEntity('switch.kitchen')

      expect(entityStore.state.subscribedEntities.size).toBe(3)
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(true)
      expect(entityStore.state.subscribedEntities.has('light.bedroom')).toBe(true)
      expect(entityStore.state.subscribedEntities.has('switch.kitchen')).toBe(true)
    })

    it('should clear all subscriptions', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.bedroom')

      entityStoreActions.clearSubscriptions()

      expect(entityStore.state.subscribedEntities.size).toBe(0)
    })
  })

  describe('store reset', () => {
    it('should reset to initial state', () => {
      // Modify state
      entityStoreActions.setConnected(true)
      entityStoreActions.setError('Some error')
      entityStoreActions.updateEntity({
        entity_id: 'light.test',
        state: 'on',
        attributes: {},
        last_changed: '2023-01-01T00:00:00Z',
        last_updated: '2023-01-01T00:00:00Z',
        context: { id: '123', parent_id: null, user_id: null },
      })
      entityStoreActions.subscribeToEntity('light.test')

      // Reset
      entityStoreActions.reset()

      // Verify initial state
      expect(entityStore.state.isConnected).toBe(false)
      expect(entityStore.state.isInitialLoading).toBe(true)
      expect(entityStore.state.lastError).toBeNull()
      expect(Object.keys(entityStore.state.entities)).toHaveLength(0)
      expect(entityStore.state.subscribedEntities.size).toBe(0)
    })
  })
})
