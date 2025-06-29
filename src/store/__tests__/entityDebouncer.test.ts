import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityDebouncer } from '../entityDebouncer';
import { entityUpdateBatcher } from '../entityBatcher';
import type { HassEntity } from '../entityTypes';

// Mock the batcher
vi.mock('../entityBatcher', () => ({
  entityUpdateBatcher: {
    addUpdate: vi.fn(),
  },
}));

describe('EntityDebouncer', () => {
  let debouncer: EntityDebouncer;

  beforeEach(() => {
    debouncer = new EntityDebouncer();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    debouncer.clear();
  });

  const createMockEntity = (
    entityId: string,
    state: string,
    deviceClass?: string
  ): HassEntity => ({
    entity_id: entityId,
    state,
    attributes: {
      friendly_name: `Test ${entityId}`,
      ...(deviceClass && { device_class: deviceClass }),
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: '123', parent_id: null, user_id: null },
  });

  it('should pass through entities with no debounce immediately', () => {
    const entity = createMockEntity('light.bedroom', 'on');
    
    debouncer.processUpdate(entity);
    
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity);
  });

  it('should debounce sensor updates', () => {
    const entity1 = createMockEntity('sensor.temperature', '22.5');
    const entity2 = createMockEntity('sensor.temperature', '22.6');
    const entity3 = createMockEntity('sensor.temperature', '22.7');
    
    // Send multiple updates rapidly
    debouncer.processUpdate(entity1);
    debouncer.processUpdate(entity2);
    debouncer.processUpdate(entity3);
    
    // Should not have sent any updates yet
    expect(entityUpdateBatcher.addUpdate).not.toHaveBeenCalled();
    
    // Fast forward past debounce time (1 second for sensors)
    vi.advanceTimersByTime(1100);
    
    // Should have sent only the last update
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledTimes(1);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity3);
  });

  it('should use longer debounce for high-frequency sensors', () => {
    const entity = createMockEntity('sensor.power', '1500', 'power');
    
    debouncer.processUpdate(entity);
    
    // Advance time but not past the high-frequency threshold
    vi.advanceTimersByTime(1500);
    expect(entityUpdateBatcher.addUpdate).not.toHaveBeenCalled();
    
    // Advance past the threshold (2 seconds for power sensors)
    vi.advanceTimersByTime(600);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity);
  });

  it('should respect custom debounce configurations', () => {
    const entity = createMockEntity('sensor.custom', '100');
    
    // Set custom debounce time
    debouncer.setDebounceTime('sensor.custom', 500);
    
    debouncer.processUpdate(entity);
    
    // Should not update before custom time
    vi.advanceTimersByTime(400);
    expect(entityUpdateBatcher.addUpdate).not.toHaveBeenCalled();
    
    // Should update after custom time
    vi.advanceTimersByTime(200);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity);
  });

  it('should handle multiple entities independently', () => {
    const sensor1 = createMockEntity('sensor.temperature', '22');
    const sensor2 = createMockEntity('sensor.humidity', '45');
    const light = createMockEntity('light.bedroom', 'on');
    
    debouncer.processUpdate(sensor1);
    debouncer.processUpdate(sensor2);
    debouncer.processUpdate(light);
    
    // Light should be immediate
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(light);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledTimes(1);
    
    // Advance time for sensors
    vi.advanceTimersByTime(1100);
    
    // Both sensors should have updated
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(sensor1);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(sensor2);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledTimes(3);
  });

  it('should flush all pending updates on demand', () => {
    const entity1 = createMockEntity('sensor.temperature', '22');
    const entity2 = createMockEntity('sensor.humidity', '45');
    
    debouncer.processUpdate(entity1);
    debouncer.processUpdate(entity2);
    
    debouncer.flushAll();
    
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity1);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledWith(entity2);
    expect(entityUpdateBatcher.addUpdate).toHaveBeenCalledTimes(2);
  });

  it('should provide accurate statistics', () => {
    const entity1 = createMockEntity('sensor.temperature', '22');
    const entity2 = createMockEntity('sensor.humidity', '45');
    
    debouncer.setDebounceTime('sensor.custom', 1000);
    debouncer.processUpdate(entity1);
    debouncer.processUpdate(entity2);
    
    const stats = debouncer.getStats();
    expect(stats.pendingCount).toBe(2);
    expect(stats.configuredEntities).toBe(1);
    expect(stats.oldestPending).toBeGreaterThanOrEqual(0);
  });

  it('should clear all pending without processing', () => {
    const entity = createMockEntity('sensor.temperature', '22');
    
    debouncer.processUpdate(entity);
    debouncer.clear();
    
    vi.advanceTimersByTime(2000);
    
    expect(entityUpdateBatcher.addUpdate).not.toHaveBeenCalled();
  });
});