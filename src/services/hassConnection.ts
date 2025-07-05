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
  private stateChangeUnsubscribe: (() => void) | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT_ATTEMPTS = 10
  private readonly RECONNECT_DELAY_BASE = 1000 // 1 second

  constructor() {
    this.handleStateChanged = this.handleStateChanged.bind(this)
  }

  connect(hass: HomeAssistant): void {
    // If already connected with the same hass object, skip
    if (this.hass === hass && this.isConnected()) {
      return
    }

    this.hass = hass
    this.reconnectAttempts = 0

    // Clear any existing connections
    this.disconnect()

    try {
      // Mark as connected
      entityStoreActions.setConnected(true)
      entityStoreActions.setError(null)

      // Load initial states
      this.loadInitialStates()

      // Subscribe to state changes
      this.subscribeToStateChanges()

      // Start monitoring for stale entities
      staleEntityMonitor.start()
    } catch (error) {
      console.error('Failed to connect to Home Assistant:', error)
      entityStoreActions.setError(error instanceof Error ? error.message : 'Connection failed')
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Unsubscribe from state changes
    if (this.stateChangeUnsubscribe) {
      this.stateChangeUnsubscribe()
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

  private subscribeToStateChanges(): void {
    // Check if we're in iframe mode (no WebSocket connection)
    if (!this.hass?.connection) {
      // In iframe mode, we get state updates via the hass object itself
      // No need to subscribe to WebSocket events
      console.info('Running in iframe mode - state updates handled via postMessage')

      // Listen for state change events from parent window
      const handleIframeStateChange = (event: CustomEvent) => {
        this.handleStateChanged(event.detail as StateChangedEvent)
      }

      const handleStatesUpdate = (event: CustomEvent) => {
        if (event.detail?.states) {
          // Convert states object to array of entities
          const entities = Object.values(event.detail.states) as HassEntity[]
          entityStoreActions.updateEntities(entities)
          entityStoreActions.setInitialLoading(false)
        }
      }

      window.addEventListener('hass-state-changed', handleIframeStateChange as EventListener)
      window.addEventListener('hass-states-update', handleStatesUpdate as EventListener)

      // Store cleanup function
      this.stateChangeUnsubscribe = () => {
        window.removeEventListener('hass-state-changed', handleIframeStateChange as EventListener)
        window.removeEventListener('hass-states-update', handleStatesUpdate as EventListener)
      }

      return
    }

    try {
      this.stateChangeUnsubscribe = this.hass.connection.subscribeEvents(
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
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)

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
