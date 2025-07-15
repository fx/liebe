import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HassConnectionManager } from '../hassConnection'
import { entityStoreActions } from '../../store/entityStore'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import type { StateChangedEvent } from '../hassConnection'
import type { Connection } from 'home-assistant-js-websocket'

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
    hasSubscribedEntityUpdates: vi.fn().mockReturnValue(true),
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

    const mockConnectionOverride = {
      subscribeEvents: vi.fn().mockReturnValue(Promise.resolve(mockUnsubscribe)),
      subscribeMessage: vi.fn().mockReturnValue(Promise.resolve(vi.fn())),
      sendMessagePromise: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      reconnect: vi.fn(),
      suspend: vi.fn(),
      ping: vi.fn().mockResolvedValue(undefined),
      socket: {
        readyState: 1,
        close: vi.fn(),
      },
      haVersion: '2024.1.0',
    } as unknown as Connection

    mockHass = createMockHomeAssistant({
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
      connection: mockConnectionOverride,
      callService: vi.fn(),
    })

    connectionManager = new HassConnectionManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('connect', () => {
    it('should connect successfully and load initial states', async () => {
      await connectionManager.connect(mockHass)

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

    it('should handle connection errors and schedule reconnect', async () => {
      const errorConnection = {
        ...mockHass.connection,
        subscribeEvents: vi.fn().mockImplementation(() => {
          throw new Error('Connection failed')
        }),
      } as unknown as Connection

      const errorHass = {
        ...mockHass,
        connection: errorConnection,
      }

      await connectionManager.connect(errorHass)

      expect(entityStoreActions.setError).toHaveBeenCalledWith(
        'Connection failed: Connection failed'
      )

      // Should schedule reconnect
      expect(vi.getTimerCount()).toBe(1)
    })
  })

  describe('disconnect', () => {
    it('should disconnect and cleanup', async () => {
      await connectionManager.connect(mockHass)
      await connectionManager.disconnect()

      expect(mockUnsubscribe).toHaveBeenCalled()
      expect(entityStoreActions.setConnected).toHaveBeenCalledWith(false)
    })
  })

  describe('state change handling', () => {
    let stateChangeHandler: (event: StateChangedEvent) => void

    beforeEach(async () => {
      vi.clearAllMocks()
      await connectionManager.connect(mockHass)
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
      // Test the scheduleReconnect method directly for exponential backoff
      const manager = new HassConnectionManager()
      const privateManager = manager as unknown as {
        reconnectAttempts: number
        scheduleReconnect: () => void
        RECONNECT_DELAY_BASE: number
      }

      const delays: number[] = []
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, ms) => {
        delays.push(ms || 0)
        return 1 as unknown as NodeJS.Timeout // Return fake timer ID
      })

      // First reconnect: 1 * 1000 = 1000ms
      privateManager.reconnectAttempts = 0
      privateManager.scheduleReconnect()
      expect(delays[0]).toBe(1000)

      // Second reconnect: 2 * 1000 = 2000ms
      privateManager.reconnectAttempts = 1
      privateManager.scheduleReconnect()
      expect(delays[1]).toBe(2000)

      // Third reconnect: 4 * 1000 = 4000ms
      privateManager.reconnectAttempts = 2
      privateManager.scheduleReconnect()
      expect(delays[2]).toBe(4000)

      // Fourth reconnect: 8 * 1000 = 8000ms
      privateManager.reconnectAttempts = 3
      privateManager.scheduleReconnect()
      expect(delays[3]).toBe(8000)

      // Cleanup
      vi.mocked(global.setTimeout).mockRestore()
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
    it('should check connection status', async () => {
      expect(connectionManager.isConnected()).toBe(false)

      await connectionManager.connect(mockHass)
      expect(connectionManager.isConnected()).toBe(true)

      await connectionManager.disconnect()
      expect(connectionManager.isConnected()).toBe(false)
    })

    it('should manually trigger reconnection', async () => {
      // Create a fresh connection manager for this test
      const manager = new HassConnectionManager()
      await manager.connect(mockHass)

      // Create spy before reconnect
      const connectSpy = vi.spyOn(manager, 'connect' as keyof HassConnectionManager)

      // The first reconnect should work immediately since lastReconnectTime is 0
      const reconnectPromise = manager.reconnect()

      // Advance only the specific timer for the reconnect delay
      await vi.advanceTimersByTimeAsync(100)

      // Wait for reconnect to complete
      await reconnectPromise

      expect(connectSpy).toHaveBeenCalledWith(mockHass)

      // Clean up to prevent infinite timers
      await manager.disconnect()
    })
  })
})
