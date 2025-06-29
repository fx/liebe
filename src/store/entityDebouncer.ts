import type { HassEntity } from './entityTypes';
import { entityUpdateBatcher } from './entityBatcher';

interface DebouncedEntity {
  latestEntity: HassEntity;
  timer: NodeJS.Timeout;
  lastUpdate: number;
}

export class EntityDebouncer {
  private debouncedEntities = new Map<string, DebouncedEntity>();
  private debounceConfigs = new Map<string, number>(); // entity_id -> debounce time in ms
  
  // Default debounce times by domain
  private readonly DEFAULT_DEBOUNCE_TIMES: Record<string, number> = {
    sensor: 1000,      // 1 second for sensors
    binary_sensor: 500, // 500ms for binary sensors
    light: 0,          // No debounce for lights
    switch: 0,         // No debounce for switches
    climate: 2000,     // 2 seconds for climate
    cover: 1000,       // 1 second for covers
  };

  // Specific sensor types that update very frequently
  private readonly HIGH_FREQUENCY_SENSORS = {
    power: 2000,       // Power sensors - 2 seconds
    energy: 5000,      // Energy sensors - 5 seconds
    temperature: 3000, // Temperature sensors - 3 seconds
    humidity: 3000,    // Humidity sensors - 3 seconds
    pressure: 5000,    // Pressure sensors - 5 seconds
  };

  /**
   * Process an entity update with debouncing
   */
  processUpdate(entity: HassEntity): void {
    const debounceTime = this.getDebounceTime(entity);
    
    // If no debounce needed, pass through immediately
    if (debounceTime === 0) {
      entityUpdateBatcher.addUpdate(entity);
      return;
    }

    const existing = this.debouncedEntities.get(entity.entity_id);
    
    if (existing) {
      // Clear existing timer
      clearTimeout(existing.timer);
      
      // Update with latest entity
      existing.latestEntity = entity;
      existing.lastUpdate = Date.now();
      
      // Set new timer
      existing.timer = setTimeout(() => {
        this.flushEntity(entity.entity_id);
      }, debounceTime);
    } else {
      // Create new debounced entry
      const timer = setTimeout(() => {
        this.flushEntity(entity.entity_id);
      }, debounceTime);

      this.debouncedEntities.set(entity.entity_id, {
        latestEntity: entity,
        timer,
        lastUpdate: Date.now(),
      });
    }
  }

  /**
   * Get the debounce time for an entity
   */
  private getDebounceTime(entity: HassEntity): number {
    // Check if there's a specific config for this entity
    const configuredTime = this.debounceConfigs.get(entity.entity_id);
    if (configuredTime !== undefined) {
      return configuredTime;
    }

    const [domain] = entity.entity_id.split('.');
    
    // Check if it's a high-frequency sensor
    if (domain === 'sensor' || domain === 'binary_sensor') {
      const deviceClass = entity.attributes.device_class as string | undefined;
      if (deviceClass && deviceClass in this.HIGH_FREQUENCY_SENSORS) {
        return this.HIGH_FREQUENCY_SENSORS[deviceClass as keyof typeof this.HIGH_FREQUENCY_SENSORS];
      }
    }

    // Use default for domain
    return this.DEFAULT_DEBOUNCE_TIMES[domain] ?? 0;
  }

  /**
   * Configure debounce time for a specific entity
   */
  setDebounceTime(entityId: string, debounceMs: number): void {
    this.debounceConfigs.set(entityId, debounceMs);
  }

  /**
   * Clear debounce configuration for an entity
   */
  clearDebounceConfig(entityId: string): void {
    this.debounceConfigs.delete(entityId);
  }

  /**
   * Flush a specific entity immediately
   */
  private flushEntity(entityId: string): void {
    const debounced = this.debouncedEntities.get(entityId);
    if (debounced) {
      clearTimeout(debounced.timer);
      entityUpdateBatcher.addUpdate(debounced.latestEntity);
      this.debouncedEntities.delete(entityId);
    }
  }

  /**
   * Flush all pending debounced updates
   */
  flushAll(): void {
    this.debouncedEntities.forEach((debounced, entityId) => {
      clearTimeout(debounced.timer);
      entityUpdateBatcher.addUpdate(debounced.latestEntity);
    });
    this.debouncedEntities.clear();
  }

  /**
   * Clear all pending updates without processing
   */
  clear(): void {
    this.debouncedEntities.forEach(debounced => {
      clearTimeout(debounced.timer);
    });
    this.debouncedEntities.clear();
    this.debounceConfigs.clear();
  }

  /**
   * Get statistics about the debouncer
   */
  getStats(): {
    pendingCount: number;
    configuredEntities: number;
    oldestPending: number | null;
  } {
    let oldestPending: number | null = null;
    
    if (this.debouncedEntities.size > 0) {
      const now = Date.now();
      this.debouncedEntities.forEach(debounced => {
        const age = now - debounced.lastUpdate;
        if (oldestPending === null || age > oldestPending) {
          oldestPending = age;
        }
      });
    }

    return {
      pendingCount: this.debouncedEntities.size,
      configuredEntities: this.debounceConfigs.size,
      oldestPending,
    };
  }
}

// Singleton instance
export const entityDebouncer = new EntityDebouncer();