import type { HassEntity } from './entityTypes';
import { entityStoreActions } from './entityStore';

interface PendingUpdate {
  entity: HassEntity;
  timestamp: number;
}

export class EntityUpdateBatcher {
  private pendingUpdates = new Map<string, PendingUpdate>();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // 50ms batching window
  private readonly MAX_BATCH_SIZE = 100; // Process at most 100 entities per batch

  // Track attribute changes
  private attributeListeners = new Map<string, Set<string>>();

  /**
   * Add an entity update to the batch
   */
  addUpdate(entity: HassEntity): void {
    const existingUpdate = this.pendingUpdates.get(entity.entity_id);
    
    // Check if attributes changed (not just state)
    if (existingUpdate) {
      const oldEntity = existingUpdate.entity;
      const attributesChanged = this.hasAttributesChanged(oldEntity, entity);
      
      // Only update if state or attributes changed
      if (oldEntity.state === entity.state && !attributesChanged) {
        return; // No meaningful change
      }
    }

    this.pendingUpdates.set(entity.entity_id, {
      entity,
      timestamp: Date.now(),
    });

    // Start or reset the batch timer
    this.scheduleBatch();
  }

  /**
   * Check if entity attributes have changed
   */
  private hasAttributesChanged(oldEntity: HassEntity, newEntity: HassEntity): boolean {
    // Quick check if attributes object reference changed
    if (oldEntity.attributes === newEntity.attributes) {
      return false;
    }

    // Get tracked attributes for this entity
    const trackedAttributes = this.attributeListeners.get(oldEntity.entity_id);
    if (!trackedAttributes || trackedAttributes.size === 0) {
      // If no specific attributes are tracked, do a deep comparison of common attributes
      const commonAttributes = ['friendly_name', 'icon', 'unit_of_measurement', 'device_class'];
      return commonAttributes.some(attr => 
        oldEntity.attributes[attr] !== newEntity.attributes[attr]
      );
    }

    // Check only tracked attributes
    return Array.from(trackedAttributes).some(attr =>
      oldEntity.attributes[attr] !== newEntity.attributes[attr]
    );
  }

  /**
   * Register interest in specific attributes for an entity
   */
  trackAttribute(entityId: string, attribute: string): void {
    if (!this.attributeListeners.has(entityId)) {
      this.attributeListeners.set(entityId, new Set());
    }
    this.attributeListeners.get(entityId)!.add(attribute);
  }

  /**
   * Unregister attribute tracking
   */
  untrackAttribute(entityId: string, attribute: string): void {
    const attributes = this.attributeListeners.get(entityId);
    if (attributes) {
      attributes.delete(attribute);
      if (attributes.size === 0) {
        this.attributeListeners.delete(entityId);
      }
    }
  }

  /**
   * Schedule a batch update
   */
  private scheduleBatch(): void {
    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // If we have too many pending updates, process immediately
    if (this.pendingUpdates.size >= this.MAX_BATCH_SIZE) {
      this.processBatch();
      return;
    }

    // Otherwise, schedule batch processing
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  /**
   * Process all pending updates
   */
  private processBatch(): void {
    if (this.pendingUpdates.size === 0) {
      return;
    }

    // Convert pending updates to array and clear the map
    const updates = Array.from(this.pendingUpdates.values()).map(u => u.entity);
    this.pendingUpdates.clear();

    // Clear the timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Update all entities at once
    entityStoreActions.updateEntities(updates);
    
    // Mark all updated entities as fresh
    updates.forEach(entity => {
      entityStoreActions.markEntityFresh(entity.entity_id);
    });
    
    // Update last update time
    entityStoreActions.updateLastUpdateTime();
  }

  /**
   * Force process any pending updates immediately
   */
  flush(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.processBatch();
  }

  /**
   * Clear all pending updates without processing
   */
  clear(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.pendingUpdates.clear();
    this.attributeListeners.clear();
  }

  /**
   * Get statistics about the batcher
   */
  getStats(): { pendingCount: number; trackedAttributes: number } {
    return {
      pendingCount: this.pendingUpdates.size,
      trackedAttributes: this.attributeListeners.size,
    };
  }
}

// Singleton instance
export const entityUpdateBatcher = new EntityUpdateBatcher();