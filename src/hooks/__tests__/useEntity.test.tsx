import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntity } from '../useEntity'
import { entityStore, entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'

describe('useEntity', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.bedroom',
    state: 'on',
    attributes: {
      friendly_name: 'Bedroom Light',
      brightness: 255,
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: {
      id: '123',
      parent_id: null,
      user_id: null,
    },
  }

  beforeEach(() => {
    // Reset store to initial state
    entityStoreActions.reset()
  })

  afterEach(() => {
    // Clean up subscriptions
    entityStoreActions.clearSubscriptions()
  })

  it('should return entity when available', () => {
    // Add entity to store
    act(() => {
      entityStoreActions.updateEntity(mockEntity)
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity('light.bedroom'))

    expect(result.current.entity).toEqual(mockEntity)
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isStale).toBe(false)
  })

  it('should return undefined entity when not found', () => {
    act(() => {
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity('light.unknown'))

    expect(result.current.entity).toBeUndefined()
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('should show loading state during initial load', () => {
    act(() => {
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(true)
    })

    const { result } = renderHook(() => useEntity('light.bedroom'))

    expect(result.current.isLoading).toBe(true)
  })

  it('should track stale state', () => {
    act(() => {
      entityStoreActions.updateEntity(mockEntity)
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity('light.bedroom'))

    expect(result.current.isStale).toBe(false)

    // Mark entity as stale
    act(() => {
      entityStoreActions.markEntityStale('light.bedroom')
    })

    expect(result.current.isStale).toBe(true)

    // Mark entity as fresh
    act(() => {
      entityStoreActions.markEntityFresh('light.bedroom')
    })

    expect(result.current.isStale).toBe(false)
  })

  it('should exclude camera entities from stale tracking', () => {
    const cameraEntity: HassEntity = {
      entity_id: 'camera.front_door',
      state: 'streaming',
      attributes: {
        friendly_name: 'Front Door Camera',
      },
      last_changed: '2024-01-01T00:00:00Z',
      last_updated: '2024-01-01T00:00:00Z',
      context: {
        id: '456',
        parent_id: null,
        user_id: null,
      },
    }

    act(() => {
      entityStoreActions.updateEntity(cameraEntity)
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity('camera.front_door'))

    expect(result.current.isStale).toBe(false)

    // Mark camera entity as stale - it should still return false
    act(() => {
      entityStoreActions.markEntityStale('camera.front_door')
    })

    // Camera entities should never be considered stale
    expect(result.current.isStale).toBe(false)
  })

  it('should subscribe and unsubscribe to entity', () => {
    const { unmount } = renderHook(() => useEntity('light.bedroom'))

    // Check subscription was added
    expect(entityStore.state.subscribedEntities.has('light.bedroom')).toBe(true)

    // Unmount hook
    unmount()

    // Check subscription was removed
    expect(entityStore.state.subscribedEntities.has('light.bedroom')).toBe(false)
  })

  it('should update when entity state changes', () => {
    act(() => {
      entityStoreActions.updateEntity(mockEntity)
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity('light.bedroom'))

    expect(result.current.entity?.state).toBe('on')

    // Update entity state
    act(() => {
      entityStoreActions.updateEntity({
        ...mockEntity,
        state: 'off',
      })
    })

    expect(result.current.entity?.state).toBe('off')
  })

  it('should handle disconnected state', () => {
    act(() => {
      entityStoreActions.setConnected(false)
    })

    const { result } = renderHook(() => useEntity('light.bedroom'))

    expect(result.current.isConnected).toBe(false)
  })
})
