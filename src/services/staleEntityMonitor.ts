import { entityStore, entityStoreActions } from '../store/entityStore'

export class StaleEntityMonitor {
  private checkInterval: NodeJS.Timeout | null = null
  private readonly CHECK_INTERVAL = 30000 // Check every 30 seconds
  private readonly STALE_THRESHOLD = 300000 // 5 minutes - entity is considered stale
  private readonly DISCONNECT_THRESHOLD = 60000 // 1 minute - consider disconnected if no updates

  // Entity types that should never be considered stale
  private readonly EXCLUDED_ENTITY_TYPES = new Set(['camera'])

  start(): void {
    this.stop() // Clear any existing interval

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkStaleEntities()
    }, this.CHECK_INTERVAL)

    // Do an initial check
    this.checkStaleEntities()
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private checkStaleEntities(): void {
    const state = entityStore.state
    const now = Date.now()

    // Check if we're disconnected (no updates for a while)
    if (state.isConnected && now - state.lastUpdateTime > this.DISCONNECT_THRESHOLD) {
      console.warn('No entity updates received for over 1 minute, may be disconnected')
      // Don't automatically disconnect here, let the connection manager handle it
      // But we could emit an event or callback if needed
    }

    // Check each subscribed entity
    state.subscribedEntities.forEach((entityId) => {
      const entity = state.entities[entityId]
      if (!entity) return

      // Extract entity type from entity_id (e.g., "camera.front_door" -> "camera")
      const entityType = entityId.split('.')[0]

      // Skip excluded entity types
      if (this.EXCLUDED_ENTITY_TYPES.has(entityType)) {
        // If it was previously marked as stale, mark it fresh
        if (state.staleEntities.has(entityId)) {
          entityStoreActions.markEntityFresh(entityId)
        }
        return
      }

      // Parse the last_updated timestamp
      const lastUpdated = new Date(entity.last_updated).getTime()
      const timeSinceUpdate = now - lastUpdated

      // Check if entity should be marked as stale
      const isCurrentlyStale = state.staleEntities.has(entityId)
      const shouldBeStale = timeSinceUpdate > this.STALE_THRESHOLD

      if (shouldBeStale && !isCurrentlyStale) {
        entityStoreActions.markEntityStale(entityId)
        console.log(
          `Entity ${entityId} marked as stale (no updates for ${Math.round(timeSinceUpdate / 1000)}s)`
        )
      } else if (!shouldBeStale && isCurrentlyStale) {
        // This shouldn't happen through this check, but just in case
        entityStoreActions.markEntityFresh(entityId)
      }
    })
  }

  /**
   * Get the staleness status for a specific entity
   */
  getEntityStaleness(entityId: string): {
    isStale: boolean
    lastUpdated: number | null
    timeSinceUpdate: number | null
  } {
    const state = entityStore.state
    const entity = state.entities[entityId]

    if (!entity) {
      return {
        isStale: false,
        lastUpdated: null,
        timeSinceUpdate: null,
      }
    }

    const lastUpdated = new Date(entity.last_updated).getTime()
    const timeSinceUpdate = Date.now() - lastUpdated

    // Check if entity type is excluded from stale tracking
    const entityType = entityId.split('.')[0]
    const isExcluded = this.EXCLUDED_ENTITY_TYPES.has(entityType)

    return {
      isStale: isExcluded ? false : state.staleEntities.has(entityId),
      lastUpdated,
      timeSinceUpdate,
    }
  }

  /**
   * Configure custom thresholds
   */
  setThresholds(staleMs?: number, disconnectMs?: number): void {
    if (staleMs !== undefined) {
      Object.defineProperty(this, 'STALE_THRESHOLD', { value: staleMs })
    }
    if (disconnectMs !== undefined) {
      Object.defineProperty(this, 'DISCONNECT_THRESHOLD', { value: disconnectMs })
    }
  }

  /**
   * Configure which entity types should be excluded from stale tracking
   */
  setExcludedEntityTypes(entityTypes: string[]): void {
    this.EXCLUDED_ENTITY_TYPES.clear()
    entityTypes.forEach((type) => this.EXCLUDED_ENTITY_TYPES.add(type))
  }

  /**
   * Get the current list of excluded entity types
   */
  getExcludedEntityTypes(): string[] {
    return Array.from(this.EXCLUDED_ENTITY_TYPES)
  }
}

// Singleton instance
export const staleEntityMonitor = new StaleEntityMonitor()
