import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EntityUpdateBatcher } from '../entityBatcher'
import { entityStoreActions } from '../entityStore'
import type { HassEntity } from '../entityTypes'

// Mock the store actions
vi.mock('../entityStore', () => ({
  entityStoreActions: {
    updateEntities: vi.fn(),
    markEntityFresh: vi.fn(),
    updateLastUpdateTime: vi.fn(),
    hasSubscribedEntityUpdates: vi.fn().mockReturnValue(true),
  },
}))

describe('EntityUpdateBatcher', () => {
  let batcher: EntityUpdateBatcher

  beforeEach(() => {
    batcher = new EntityUpdateBatcher()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    batcher.clear()
  })

  const createMockEntity = (entityId: string, state: string): HassEntity => ({
    entity_id: entityId,
    state,
    attributes: { friendly_name: `Test ${entityId}` },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: '123', parent_id: null, user_id: null },
  })

  it('should batch multiple updates within the batch window', () => {
    const entity1 = createMockEntity('light.bedroom', 'on')
    const entity2 = createMockEntity('switch.living_room', 'off')

    batcher.addUpdate(entity1)
    batcher.addUpdate(entity2)

    // Should not update immediately
    expect(entityStoreActions.updateEntities).not.toHaveBeenCalled()

    // Fast forward past batch delay
    vi.advanceTimersByTime(60)

    // Should have updated with both entities
    expect(entityStoreActions.updateEntities).toHaveBeenCalledTimes(1)
    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity1, entity2])
    expect(entityStoreActions.markEntityFresh).toHaveBeenCalledWith(entity1.entity_id)
    expect(entityStoreActions.markEntityFresh).toHaveBeenCalledWith(entity2.entity_id)
    expect(entityStoreActions.updateLastUpdateTime).toHaveBeenCalledTimes(1)
  })

  it('should ignore duplicate updates with no changes', () => {
    const entity = createMockEntity('light.bedroom', 'on')

    batcher.addUpdate(entity)
    batcher.addUpdate({ ...entity }) // Same state and attributes

    vi.advanceTimersByTime(60)

    expect(entityStoreActions.updateEntities).toHaveBeenCalledTimes(1)
    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity])
  })

  it('should detect attribute changes', () => {
    const entity1 = createMockEntity('light.bedroom', 'on')
    const entity2 = { ...entity1, attributes: { ...entity1.attributes, brightness: 255 } }

    batcher.addUpdate(entity1)
    batcher.addUpdate(entity2)

    vi.advanceTimersByTime(60)

    // The batcher should only have the latest update (entity2)
    expect(entityStoreActions.updateEntities).toHaveBeenCalledTimes(1)
    const updateCall = (entityStoreActions.updateEntities as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(updateCall).toHaveLength(1)
    expect(updateCall[0].attributes.brightness).toBe(255)
  })

  it('should track specific attributes when requested', () => {
    const entity1 = createMockEntity('sensor.temperature', '22')
    batcher.trackAttribute('sensor.temperature', 'unit_of_measurement')

    // First update
    batcher.addUpdate(entity1)
    vi.advanceTimersByTime(60)

    vi.clearAllMocks()

    // Update with tracked attribute change
    const entity2 = {
      ...entity1,
      attributes: { ...entity1.attributes, unit_of_measurement: '°F' },
    }
    batcher.addUpdate(entity2)
    vi.advanceTimersByTime(60)

    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity2])
  })

  it('should process immediately when reaching max batch size', () => {
    // Add entities up to max batch size
    for (let i = 0; i < 100; i++) {
      batcher.addUpdate(createMockEntity(`light.test_${i}`, 'on'))
    }

    // Should have processed immediately without waiting
    expect(entityStoreActions.updateEntities).toHaveBeenCalledTimes(1)
    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entity_id: 'light.test_0' }),
        expect.objectContaining({ entity_id: 'light.test_99' }),
      ])
    )
  })

  it('should flush pending updates on demand', () => {
    const entity = createMockEntity('light.bedroom', 'on')
    batcher.addUpdate(entity)

    // Flush immediately
    batcher.flush()

    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity])
  })

  it('should clear pending updates without processing', () => {
    const entity = createMockEntity('light.bedroom', 'on')
    batcher.addUpdate(entity)

    // Clear without processing
    batcher.clear()

    vi.advanceTimersByTime(60)

    expect(entityStoreActions.updateEntities).not.toHaveBeenCalled()
  })

  it('should provide accurate statistics', () => {
    const entity1 = createMockEntity('light.bedroom', 'on')
    const entity2 = createMockEntity('switch.living_room', 'off')

    batcher.trackAttribute('light.bedroom', 'brightness')
    batcher.addUpdate(entity1)
    batcher.addUpdate(entity2)

    const stats = batcher.getStats()
    expect(stats.pendingCount).toBe(2)
    expect(stats.trackedAttributes).toBe(1)
  })

  it('should only update lastUpdateTime for subscribed entities', () => {
    const entity = createMockEntity('light.bedroom', 'on')

    // Mock hasSubscribedEntityUpdates to return false
    vi.mocked(entityStoreActions.hasSubscribedEntityUpdates).mockReturnValue(false)

    batcher.addUpdate(entity)
    vi.advanceTimersByTime(60)

    // Should update entities but not lastUpdateTime
    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity])
    expect(entityStoreActions.updateLastUpdateTime).not.toHaveBeenCalled()

    // Reset and test with subscribed entity
    vi.clearAllMocks()
    vi.mocked(entityStoreActions.hasSubscribedEntityUpdates).mockReturnValue(true)

    batcher.addUpdate(entity)
    vi.advanceTimersByTime(60)

    // Should update both entities and lastUpdateTime
    expect(entityStoreActions.updateEntities).toHaveBeenCalledWith([entity])
    expect(entityStoreActions.updateLastUpdateTime).toHaveBeenCalled()
  })
})
