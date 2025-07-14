import type { HomeAssistant } from '../contexts/HomeAssistantContext'
import type { HassEntity } from '../store/entityTypes'
import { entityStoreActions } from '../store/entityStore'
import { entityDebouncer } from '../store/entityDebouncer'
import { entityUpdateBatcher } from '../store/entityBatcher'
import { staleEntityMonitor } from './staleEntityMonitor'
import { connectionActions } from '../store/connectionStore'

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
  private isReconnecting = false
  private lastReconnectTime = 0

  constructor() {
    this.handleStateChanged = this.handleStateChanged.bind(this)
  }

  async connect(hass: HomeAssistant): Promise<void> {
    // If we already have a connection with the same hass instance, just update the reference
    if (this.hass && this.stateChangeUnsubscribe && this.isConnected()) {
      console.log('HassConnectionManager: Already connected, updating hass reference')
      this.hass = hass
      return
    }

    this.hass = hass
    this.reconnectAttempts = 0

    // Update connection status
    connectionActions.setConnecting(
      `Connecting to Home Assistant... (${hass.connection.socket.url})`
    )

    // Clear any existing connections
    await this.disconnect()

    try {
      // Update status
      connectionActions.setConnecting('Loading initial states...')

      // Mark as connected
      entityStoreActions.setConnected(true)
      entityStoreActions.setError(null)

      // Load initial states
      this.loadInitialStates()

      // Update status
      connectionActions.setConnecting('Subscribing to state changes...')

      // Subscribe to state changes
      await this.subscribeToStateChanges()

      // Start monitoring for stale entities
      staleEntityMonitor.start()

      // Mark as fully connected
      connectionActions.setConnected()
      console.log('HassConnectionManager: Successfully connected')
    } catch (error) {
      console.error('Failed to connect to Home Assistant:', error)
      const errorMessage =
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : 'Connection failed: Unknown error'
      entityStoreActions.setError(errorMessage)
      connectionActions.setError(errorMessage)
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
      console.log('HassConnectionManager: Unsubscribing from state changes')
      try {
        if (typeof this.stateChangeUnsubscribe === 'function') {
          const result = this.stateChangeUnsubscribe()
          if (result instanceof Promise) {
            await result
          }
        }
      } catch (error) {
        // Ignore "subscription not found" errors during cleanup
        const errorObj = error as { code?: string }
        if (errorObj.code !== 'not_found') {
          console.error('Error unsubscribing from state changes:', error)
        }
      } finally {
        this.stateChangeUnsubscribe = null
      }
    }

    // Stop stale entity monitoring
    staleEntityMonitor.stop()

    // Flush any pending updates before disconnecting
    entityDebouncer.flushAll()
    entityUpdateBatcher.flush()

    // Mark as disconnected
    entityStoreActions.setConnected(false)

    // Only update connection status if we're not reconnecting
    if (!this.isReconnecting) {
      connectionActions.setDisconnected()
    }
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

      // Log entity count
      connectionActions.setConnecting(`Loaded ${entities.length} entities`)
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
      connectionActions.setError('Max reconnection attempts reached')
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

    // Update status with retry info
    connectionActions.setReconnecting(
      this.reconnectAttempts,
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
    )

    this.reconnectTimer = setTimeout(() => {
      if (this.hass) {
        this.connect(this.hass)
      }
    }, delay)
  }

  // Public method to manually trigger reconnection
  async reconnect(): Promise<void> {
    // Prevent multiple simultaneous reconnection attempts
    if (this.isReconnecting) {
      console.log('HassConnectionManager: Reconnection already in progress, skipping')
      return
    }

    // Debounce reconnection attempts (minimum 5 seconds between attempts)
    const timeSinceLastReconnect = Date.now() - this.lastReconnectTime
    if (timeSinceLastReconnect < 5000) {
      console.log(
        `HassConnectionManager: Too soon since last reconnect (${timeSinceLastReconnect}ms), skipping`
      )
      return
    }

    console.log('HassConnectionManager: Manual reconnect triggered')
    this.isReconnecting = true
    this.lastReconnectTime = Date.now()
    this.reconnectAttempts = 0

    try {
      if (this.hass) {
        // Update status
        connectionActions.setReconnecting(1, 'Disconnecting...')

        // First disconnect cleanly
        await this.disconnect()

        // Wait a moment to ensure clean disconnection
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Update status
        connectionActions.setReconnecting(1, 'Establishing new connection...')

        // Reconnect with fresh state
        await this.connect(this.hass)
      }
    } finally {
      this.isReconnecting = false
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.stateChangeUnsubscribe !== null
  }

  // Update hass reference without reconnecting
  updateHass(hass: HomeAssistant): void {
    if (this.isConnected()) {
      this.hass = hass
    }
  }
}

// Singleton instance
export const hassConnectionManager = new HassConnectionManager()
