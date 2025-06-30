import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HassConnectionManager } from '../hassConnection'
import { entityStoreActions } from '../../store/entityStore'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import type { StateChangedEvent } from '../hassConnection'

// Mock the store actions
vi.mock('../../store/entityStore', () => ({
  entityStore: {
    getState: vi.fn().mockReturnValue({
      entities: {},
      isConnected: false,
      isInitialLoading: true,
      lastError: null,
      subscribedEntities: new Set(),
      staleEntities: new Set(),
      lastUpdateTime: Date.now(),
    }),
    setState: vi.fn(),
    subscribe: vi.fn(),
  },
  entityStoreActions: {
    setConnected: vi.fn(),
    setInitialLoading: vi.fn(),
    setError: vi.fn(),
    updateEntity: vi.fn(),
    updateEntities: vi.fn(),
    removeEntity: vi.fn(),
    subscribeToEntity: vi.fn(),
    unsubscribeFromEntity: vi.fn(),
    clearSubscriptions: vi.fn(),
    reset: vi.fn(),
    markEntityStale: vi.fn(),
    markEntityFresh: vi.fn(),
    updateLastUpdateTime: vi.fn(),
  },
}))

// Mock the entity debouncer
vi.mock('../../store/entityDebouncer', () => ({
  entityDebouncer: {
    processUpdate: vi.fn(),
    flushAll: vi.fn(),
  },
}))

// Mock the entity update batcher
vi.mock('../../store/entityBatcher', () => ({
  entityUpdateBatcher: {
    flush: vi.fn(),
  },
}))

// Mock the stale entity monitor
vi.mock('../staleEntityMonitor', () => ({
  staleEntityMonitor: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}))

describe('HassConnectionManager', () => {
  let connectionManager: HassConnectionManager
  let mockHass: HomeAssistant
  let mockUnsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockUnsubscribe = vi.fn()

    mockHass = {
      states: {
        'light.living_room': {
          entity_id: 'light.living_room',
          state: 'on',
          attributes: { friendly_name: 'Living Room' },
          last_changed: '2023-01-01T00:00:00Z',
          last_updated: '2023-01-01T00:00:00Z',
          context: { id: '123', parent_id: null, user_id: null },
        },
        'switch.kitchen': {
          entity_id: 'switch.kitchen',
          state: 'off',
          attributes: { friendly_name: 'Kitchen Switch' },
          last_changed: '2023-01-01T00:00:00Z',
          last_updated: '2023-01-01T00:00:00Z',
          context: { id: '456', parent_id: null, user_id: null },
        },
      },
      connection: {
        subscribeEvents: vi.fn().mockReturnValue(mockUnsubscribe),
      },
      callService: vi.fn(),
      user: {
        name: 'Test User',
        id: 'test-user',
        is_admin: true,
      },
      themes: {},
      language: 'en',
      config: {
        latitude: 0,
        longitude: 0,
        elevation: 0,
        unit_system: {
          length: 'km',
          mass: 'kg',
          temperature: 'C',
          volume: 'L',
        },
        location_name: 'Test Location',
        time_zone: 'UTC',
        components: [],
        version: '2023.1.0',
      },
    }

    connectionManager = new HassConnectionManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('connect', () => {
    it('should connect successfully and load initial states', () => {
      connectionManager.connect(mockHass)

      // Should mark as connected
      expect(entityStoreActions.setConnected).toHaveBeenCalledWith(true)
      expect(entityStoreActions.setError).toHaveBeenCalledWith(null)

      // Should load initial states
      expect(entityStoreActions.setInitialLoading).toHaveBeenCalledWith(true)
      expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([
        expect.objectContaining({ entity_id: 'light.living_room' }),
        expect.objectContaining({ entity_id: 'switch.kitchen' }),
      ])
      expect(entityStoreActions.setInitialLoading).toHaveBeenCalledWith(false)

      // Should subscribe to state changes
      expect(mockHass.connection.subscribeEvents).toHaveBeenCalledWith(
        expect.any(Function),
        'state_changed'
      )
    })

    it('should handle connection errors and schedule reconnect', () => {
      const errorHass = {
        ...mockHass,
        connection: {
          subscribeEvents: vi.fn().mockImplementation(() => {
            throw new Error('Connection failed')
          }),
        },
      }

      connectionManager.connect(errorHass)

      expect(entityStoreActions.setError).toHaveBeenCalledWith('Connection failed')

      // Should schedule reconnect
      expect(vi.getTimerCount()).toBe(1)
    })
  })

  describe('disconnect', () => {
    it('should disconnect and cleanup', () => {
      connectionManager.connect(mockHass)
      connectionManager.disconnect()

      expect(mockUnsubscribe).toHaveBeenCalled()
      expect(entityStoreActions.setConnected).toHaveBeenCalledWith(false)
    })
  })

  describe('state change handling', () => {
    let stateChangeHandler: (event: StateChangedEvent) => void

    beforeEach(() => {
      vi.clearAllMocks()
      connectionManager.connect(mockHass)
      stateChangeHandler = (mockHass.connection.subscribeEvents as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
    })

    it('should handle entity updates', async () => {
      const event: StateChangedEvent = {
        event_type: 'state_changed',
        data: {
          entity_id: 'light.living_room',
          old_state: {
            entity_id: 'light.living_room',
            state: 'off',
            attributes: { friendly_name: 'Living Room' },
            last_changed: '2023-01-01T00:00:00Z',
            last_updated: '2023-01-01T00:00:00Z',
            context: { id: '123', parent_id: null, user_id: null },
          },
          new_state: {
            entity_id: 'light.living_room',
            state: 'on',
            attributes: { friendly_name: 'Living Room' },
            last_changed: '2023-01-01T00:01:00Z',
            last_updated: '2023-01-01T00:01:00Z',
            context: { id: '789', parent_id: null, user_id: null },
          },
        },
      }

      stateChangeHandler(event)

      const { entityDebouncer } = await import('../../store/entityDebouncer')
      expect(entityDebouncer.processUpdate).toHaveBeenCalledWith(event.data.new_state)
    })

    it('should handle entity removal', () => {
      const event: StateChangedEvent = {
        event_type: 'state_changed',
        data: {
          entity_id: 'light.living_room',
          old_state: {
            entity_id: 'light.living_room',
            state: 'on',
            attributes: { friendly_name: 'Living Room' },
            last_changed: '2023-01-01T00:00:00Z',
            last_updated: '2023-01-01T00:00:00Z',
            context: { id: '123', parent_id: null, user_id: null },
          },
          new_state: null,
        },
      }

      stateChangeHandler(event)

      expect(entityStoreActions.removeEntity).toHaveBeenCalledWith('light.living_room')
    })

    it('should ignore non-state_changed events', () => {
      const event = {
        event_type: 'other_event',
        data: {},
      } as unknown as StateChangedEvent

      stateChangeHandler(event)

      expect(entityStoreActions.updateEntity).not.toHaveBeenCalled()
      expect(entityStoreActions.removeEntity).not.toHaveBeenCalled()
    })
  })

  describe('reconnection logic', () => {
    it('should implement exponential backoff', () => {
      const errorHass = {
        ...mockHass,
        connection: {
          subscribeEvents: vi.fn().mockImplementation(() => {
            throw new Error('Connection failed')
          }),
        },
      }

      // First attempt
      connectionManager.connect(errorHass)
      expect(vi.getTimerCount()).toBe(1)

      // Advance time to trigger first reconnect (1 second)
      vi.advanceTimersByTime(1000)
      expect(vi.getTimerCount()).toBe(1)

      // Advance time to trigger second reconnect (2 seconds)
      vi.advanceTimersByTime(2000)
      expect(vi.getTimerCount()).toBe(1)

      // Advance time to trigger third reconnect (4 seconds)
      vi.advanceTimersByTime(4000)
      expect(vi.getTimerCount()).toBe(1)
    })

    it('should stop reconnecting after max attempts', () => {
      // Manually set reconnectAttempts to the limit and call scheduleReconnect
      const manager = connectionManager as unknown as {
        reconnectAttempts: number
        scheduleReconnect: () => void
      }
      manager.reconnectAttempts = 10
      manager.scheduleReconnect()

      // No timer should be scheduled
      expect(vi.getTimerCount()).toBe(0)

      // Should show max attempts error
      expect(entityStoreActions.setError).toHaveBeenCalledWith(
        'Unable to reconnect to Home Assistant'
      )
    })
  })

  describe('public methods', () => {
    it('should check connection status', () => {
      expect(connectionManager.isConnected()).toBe(false)

      connectionManager.connect(mockHass)
      expect(connectionManager.isConnected()).toBe(true)

      connectionManager.disconnect()
      expect(connectionManager.isConnected()).toBe(false)
    })

    it('should manually trigger reconnection', () => {
      connectionManager.connect(mockHass)
      const connectSpy = vi.spyOn(
        connectionManager as unknown as { connect: (hass: HomeAssistant) => void },
        'connect'
      )

      connectionManager.reconnect()

      expect(connectSpy).toHaveBeenCalledWith(mockHass)
    })
  })
})
