import type { HomeAssistant } from '../contexts/HomeAssistantContext'
import type { HassEntity } from '../store/entityTypes'
import { entityStoreActions } from '../store/entityStore'
import { entityDebouncer } from '../store/entityDebouncer'
import { entityUpdateBatcher } from '../store/entityBatcher'
import { staleEntityMonitor } from './staleEntityMonitor'

export interface StateChangedEvent {
  event_type: 'state_changed'
  data: {
    entity_id: string
    old_state: HassEntity | null
    new_state: HassEntity | null
  }
}

export class HassConnectionManager {
  private hass: HomeAssistant | null = null
  private stateChangeUnsubscribe: (() => void | Promise<void>) | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT_ATTEMPTS = 10
  private readonly RECONNECT_DELAY_BASE = 1000 // 1 second

  constructor() {
    this.handleStateChanged = this.handleStateChanged.bind(this)
  }

  async connect(hass: HomeAssistant): Promise<void> {
    this.hass = hass
    this.reconnectAttempts = 0

    // Clear any existing connections
    await this.disconnect()

    try {
      // Mark as connected
      entityStoreActions.setConnected(true)
      entityStoreActions.setError(null)

      // Load initial states
      this.loadInitialStates()

      // Subscribe to state changes
      await this.subscribeToStateChanges()

      // Start monitoring for stale entities
      staleEntityMonitor.start()
    } catch (error) {
      console.error('Failed to connect to Home Assistant:', error)
      entityStoreActions.setError(error instanceof Error ? error.message : 'Connection failed')
      this.scheduleReconnect()
    }
  }

  async disconnect(): Promise<void> {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Unsubscribe from state changes
    if (this.stateChangeUnsubscribe) {
      if (typeof this.stateChangeUnsubscribe === 'function') {
        try {
          const result = this.stateChangeUnsubscribe()
          if (result instanceof Promise) {
            await result
          }
        } catch (error) {
          // Ignore "subscription not found" errors during cleanup
          if (error && typeof error === 'object' && 'code' in error && error.code !== 'not_found') {
            console.error('Error unsubscribing from state changes:', error)
          }
        }
      }
      this.stateChangeUnsubscribe = null
    }

    // Stop stale entity monitoring
    staleEntityMonitor.stop()

    // Flush any pending updates before disconnecting
    entityDebouncer.flushAll()
    entityUpdateBatcher.flush()

    // Mark as disconnected
    entityStoreActions.setConnected(false)
  }

  private loadInitialStates(): void {
    if (!this.hass) return

    entityStoreActions.setInitialLoading(true)

    try {
      // Convert Home Assistant states format to our HassEntity format
      const entities: HassEntity[] = Object.values(this.hass.states).map((state) => ({
        entity_id: state.entity_id,
        state: state.state,
        attributes: state.attributes,
        last_changed: state.last_changed,
        last_updated: state.last_updated,
        context: state.context,
      }))

      // Update all entities at once
      entityStoreActions.updateEntities(entities)
      entityStoreActions.setInitialLoading(false)
    } catch (error) {
      console.error('Failed to load initial states:', error)
      entityStoreActions.setError('Failed to load initial states')
      entityStoreActions.setInitialLoading(false)
    }
  }

  private async subscribeToStateChanges(): Promise<void> {
    // Check if we have a WebSocket connection
    if (!this.hass?.connection) {
      console.warn('No WebSocket connection available')
      return
    }

    try {
      // subscribeEvents returns a promise that resolves to an unsubscribe function
      this.stateChangeUnsubscribe = await this.hass.connection.subscribeEvents(
        (event: unknown) => this.handleStateChanged(event as StateChangedEvent),
        'state_changed'
      )
    } catch (error) {
      console.error('Failed to subscribe to state changes:', error)
      throw error
    }
  }

  private handleStateChanged(event: StateChangedEvent): void {
    if (event.event_type !== 'state_changed') return

    const { entity_id, new_state, old_state } = event.data

    // Handle entity removal
    if (!new_state && old_state) {
      entityStoreActions.removeEntity(entity_id)
      return
    }

    // Handle entity update or addition
    if (new_state) {
      // Use debouncer which will pass to batcher
      entityDebouncer.processUpdate(new_state)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached')
      entityStoreActions.setError('Unable to reconnect to Home Assistant')
      return
    }

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    )

    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      if (this.hass) {
        this.connect(this.hass)
      }
    }, delay)
  }

  // Public method to manually trigger reconnection
  reconnect(): void {
    this.reconnectAttempts = 0
    if (this.hass) {
      this.connect(this.hass)
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.stateChangeUnsubscribe !== null
  }
}

// Singleton instance
export const hassConnectionManager = new HassConnectionManager()
