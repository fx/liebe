import { describe, it, expect, beforeEach } from 'vitest'
import { entityStore, entityStoreActions } from '../entityStore'
import type { HassEntity } from '../entityTypes'

describe('entityStore', () => {
  beforeEach(() => {
    // Reset store before each test
    entityStoreActions.reset()
  })

  describe('connection state', () => {
    it('should set connected state', () => {
      entityStoreActions.setConnected(true)
      expect(entityStore.state.isConnected).toBe(true)

      entityStoreActions.setConnected(false)
      // Due to debouncing, disconnection is delayed 500ms, so it should still be true immediately
      expect(entityStore.state.isConnected).toBe(true)
    })

    it('should set initial loading state', () => {
      entityStoreActions.setInitialLoading(true)
      expect(entityStore.state.isInitialLoading).toBe(true)

      entityStoreActions.setInitialLoading(false)
      expect(entityStore.state.isInitialLoading).toBe(false)
    })

    it('should set error state', () => {
      entityStoreActions.setError('Connection failed')
      expect(entityStore.state.lastError).toBe('Connection failed')

      entityStoreActions.setError(null)
      expect(entityStore.state.lastError).toBeNull()
    })
  })

  describe('entity management', () => {
    const mockEntity: HassEntity = {
      entity_id: 'light.living_room',
      state: 'on',
      attributes: {
        friendly_name: 'Living Room Light',
        brightness: 255,
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: {
        id: '123',
        parent_id: null,
        user_id: null,
      },
    }

    it('should update a single entity', () => {
      entityStoreActions.updateEntity(mockEntity)
      expect(entityStore.state.entities['light.living_room']).toEqual(mockEntity)
    })

    it('should update multiple entities', () => {
      const entities: HassEntity[] = [
        mockEntity,
        {
          ...mockEntity,
          entity_id: 'light.bedroom',
          attributes: {
            friendly_name: 'Bedroom Light',
          },
        },
      ]

      entityStoreActions.updateEntities(entities)
      expect(Object.keys(entityStore.state.entities)).toHaveLength(2)
      expect(entityStore.state.entities['light.living_room']).toBeDefined()
      expect(entityStore.state.entities['light.bedroom']).toBeDefined()
    })

    it('should preserve reference identity for entities unchanged by a batch', () => {
      const kitchen = mockEntity
      const garage: HassEntity = {
        ...mockEntity,
        entity_id: 'sensor.garage',
        state: '20',
      }

      entityStoreActions.updateEntities([kitchen, garage])
      const kitchenRef = entityStore.state.entities['light.living_room']

      // A batch that only updates sensor.garage must leave the light.living_room
      // reference untouched, which is what lets the per-entity selectors in
      // useEntity/useEntities short-circuit re-renders.
      entityStoreActions.updateEntities([{ ...garage, state: '21' }])

      expect(entityStore.state.entities['light.living_room']).toBe(kitchenRef)
      expect(entityStore.state.entities['sensor.garage']?.state).toBe('21')
    })

    it('should remove an entity', () => {
      entityStoreActions.updateEntity(mockEntity)
      entityStoreActions.subscribeToEntity('light.living_room')

      entityStoreActions.removeEntity('light.living_room')

      expect(entityStore.state.entities['light.living_room']).toBeUndefined()
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })
  })

  describe('entity subscriptions', () => {
    it('should subscribe to an entity', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(true)
    })

    it('should unsubscribe from an entity', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.unsubscribeFromEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })

    it('should handle multiple subscriptions', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.bedroom')
      entityStoreActions.subscribeToEntity('switch.kitchen')

      expect(entityStore.state.subscribedEntities.size).toBe(3)
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(true)
      expect(entityStore.state.subscribedEntities.has('light.bedroom')).toBe(true)
      expect(entityStore.state.subscribedEntities.has('switch.kitchen')).toBe(true)
    })

    it('keeps an entity subscribed while a second view still shows it', () => {
      // Two views of one entity is the ordinary case now: the detail dialog a
      // hold opens renders the same entity as the card behind it, and its
      // unmount must not take the card's subscription with it.
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.living_room')

      entityStoreActions.unsubscribeFromEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(true)

      entityStoreActions.unsubscribeFromEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })

    it('tolerates unsubscribing something that was never subscribed', () => {
      entityStoreActions.unsubscribeFromEntity('light.never_mounted')
      expect(entityStore.state.subscribedEntities.has('light.never_mounted')).toBe(false)

      // ...and the next subscribe still counts from zero rather than from -1.
      entityStoreActions.subscribeToEntity('light.never_mounted')
      entityStoreActions.unsubscribeFromEntity('light.never_mounted')
      expect(entityStore.state.subscribedEntities.has('light.never_mounted')).toBe(false)
    })

    it.each([
      ['clearSubscriptions', () => entityStoreActions.clearSubscriptions()],
      ['reset', () => entityStoreActions.reset()],
      ['removeEntity', () => entityStoreActions.removeEntity('light.living_room')],
    ])('drops held subscription counts on %s', (_what, clear) => {
      // A leftover count would leave the entity subscribed forever: the next
      // view's unsubscribe would only decrement it back to one.
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.living_room')

      clear()
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)

      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.unsubscribeFromEntity('light.living_room')
      expect(entityStore.state.subscribedEntities.has('light.living_room')).toBe(false)
    })

    it('should clear all subscriptions', () => {
      entityStoreActions.subscribeToEntity('light.living_room')
      entityStoreActions.subscribeToEntity('light.bedroom')

      entityStoreActions.clearSubscriptions()

      expect(entityStore.state.subscribedEntities.size).toBe(0)
    })
  })

  describe('store reset', () => {
    it('should reset to initial state', () => {
      // Modify state
      entityStoreActions.setConnected(true)
      entityStoreActions.setError('Some error')
      entityStoreActions.updateEntity({
        entity_id: 'light.test',
        state: 'on',
        attributes: {},
        last_changed: '2023-01-01T00:00:00Z',
        last_updated: '2023-01-01T00:00:00Z',
        context: { id: '123', parent_id: null, user_id: null },
      })
      entityStoreActions.subscribeToEntity('light.test')

      // Reset
      entityStoreActions.reset()

      // Verify initial state
      expect(entityStore.state.isConnected).toBe(false)
      expect(entityStore.state.isInitialLoading).toBe(true)
      expect(entityStore.state.lastError).toBeNull()
      expect(Object.keys(entityStore.state.entities)).toHaveLength(0)
      expect(entityStore.state.subscribedEntities.size).toBe(0)
    })
  })

  describe('replaceEntities — a snapshot is the whole state machine', () => {
    /**
     * `loadInitialStates` used to write its snapshot through `updateEntities`,
     * which MERGES — so an entity deleted while the socket was down survived
     * from the previous session's snapshot and was absent from the fresh one,
     * leaving the map a permanent superset. `useEntity`'s `isMissing` therefore
     * never fired for it and its card kept rendering, and dispatching against,
     * an entity Home Assistant no longer has
     * (docs/specs/entity-state — "Consumer Hooks", change 0037 PR 8).
     */
    const entity = (entityId: string, state: string, lastUpdated: string): HassEntity => ({
      entity_id: entityId,
      state,
      attributes: {},
      last_changed: lastUpdated,
      last_updated: lastUpdated,
      context: { id: 'seed', parent_id: null, user_id: null },
    })

    it('drops an entity the snapshot does not carry', () => {
      // The defect, stated directly: `light.gone` was deleted while the socket
      // was down, so the fresh snapshot has no such id.
      entityStoreActions.updateEntities([
        entity('light.kept', 'on', '2026-07-30T10:00:00Z'),
        entity('light.gone', 'on', '2026-07-30T10:00:00Z'),
      ])

      entityStoreActions.replaceEntities([entity('light.kept', 'on', '2026-07-30T11:00:00Z')])

      expect(Object.keys(entityStore.state.entities)).toEqual(['light.kept'])
      // …and `isMissing`'s input is what changed: the id is genuinely absent
      // rather than present-but-stale.
      expect(entityStore.state.entities['light.gone']).toBeUndefined()
    })

    it('still merges on updateEntities, which live batches depend on', () => {
      // The two actions differ ONLY in what they do with ids the incoming list
      // does not carry, and the live path must keep merging — a batch of two
      // changed entities is not a claim about the other four hundred.
      entityStoreActions.updateEntities([entity('light.a', 'on', '2026-07-30T10:00:00Z')])
      entityStoreActions.updateEntities([entity('light.b', 'on', '2026-07-30T10:00:00Z')])

      expect(Object.keys(entityStore.state.entities).sort()).toEqual(['light.a', 'light.b'])
    })

    it('adds an entity that appeared while the socket was down', () => {
      // The other half of "the snapshot is the whole state machine": ids it
      // carries that the map has never seen are additions, and there is no
      // prior reading for them to lose a comparison against.
      entityStoreActions.updateEntities([entity('light.old', 'on', '2026-07-30T10:00:00Z')])

      entityStoreActions.replaceEntities([
        entity('light.old', 'on', '2026-07-30T11:00:00Z'),
        entity('light.new', 'off', '2026-07-30T11:00:00Z'),
      ])

      expect(Object.keys(entityStore.state.entities).sort()).toEqual(['light.new', 'light.old'])
      expect(entityStore.state.entities['light.new'].state).toBe('off')
    })

    it('keeps an update that raced the snapshot, rather than reverting it', () => {
      /*
       * The ordering hazard, and the reason this is a reconciliation rather
       * than a clear-and-apply. A snapshot is a claim about one instant; an
       * update that landed after that instant carries a later `last_updated`,
       * and dropping it would turn an under-report into an OVER-report — a card
       * showing a stale value, or "Entity Not Found" for an entity that exists.
       * That is the strictly worse direction, which is why the naive replace is
       * not what this does.
       */
      entityStoreActions.updateEntities([entity('light.raced', 'on', '2026-07-30T12:00:05Z')])

      // The snapshot was read BEFORE that update and carries the older reading.
      entityStoreActions.replaceEntities([entity('light.raced', 'off', '2026-07-30T12:00:00Z')])

      expect(entityStore.state.entities['light.raced'].state).toBe('on')
    })

    it('keeps an entity CREATED after the snapshot instant', () => {
      /*
       * The other racing case, and the one the update case does not cover: an
       * entity created after the snapshot was assembled is in the map from a
       * live `state_changed` and absent from the snapshot — because it did not
       * exist when the snapshot was taken, not because it was deleted. Dropping
       * it is the over-report this design exists to avoid, and the first
       * version of the action did exactly that (found in review).
       *
       * What separates the two meanings of absence is "newer than everything
       * the snapshot carries": an entity deleted while the socket was down last
       * changed before the disconnection and cannot clear that bar.
       */
      entityStoreActions.updateEntities([entity('light.born', 'on', '2026-07-30T12:00:09Z')])

      // A snapshot assembled a moment earlier — it has no such id.
      entityStoreActions.replaceEntities([entity('light.old', 'on', '2026-07-30T12:00:00Z')])

      expect(Object.keys(entityStore.state.entities).sort()).toEqual(['light.born', 'light.old'])
      expect(entityStore.state.entities['light.born'].state).toBe('on')
    })

    it('still drops one deleted offline, whose reading predates the snapshot', () => {
      // The discriminating half: same shape, older reading. This is what makes
      // the rule above a distinction rather than a blanket "keep everything",
      // which would restore the defect this PR fixes.
      entityStoreActions.updateEntities([entity('light.deleted', 'on', '2026-07-30T09:00:00Z')])

      entityStoreActions.replaceEntities([entity('light.old', 'on', '2026-07-30T12:00:00Z')])

      expect(Object.keys(entityStore.state.entities)).toEqual(['light.old'])
    })

    it('takes the snapshot where it is the newer reading', () => {
      // The other direction, which is the ordinary case: nothing raced, so the
      // snapshot is simply the truth.
      entityStoreActions.updateEntities([entity('light.normal', 'on', '2026-07-30T12:00:00Z')])
      entityStoreActions.replaceEntities([entity('light.normal', 'off', '2026-07-30T12:00:05Z')])

      expect(entityStore.state.entities['light.normal'].state).toBe('off')
    })

    it('dates the snapshot by its usable readings only', () => {
      /*
       * An unparseable `last_updated` in the snapshot contributes nothing to
       * the instant it is dated by, rather than poisoning it. `Math.max` with a
       * `NaN` yields `NaN` and every comparison against it is false, so a
       * poisoned date would drop EVERY entity absent from the snapshot —
       * including one created after it, which is the over-report this design
       * exists to avoid. One malformed row would take the whole guarantee.
       *
       * (An earlier version of this test asserted the deleted entity still
       * went, and a probe showed that holds either way: a `NaN` date drops it
       * too. The assertion has to be on what a poisoned date would WRONGLY
       * drop, which is the entity it should have kept.)
       */
      entityStoreActions.updateEntities([entity('light.born', 'on', '2026-07-30T12:00:09Z')])

      entityStoreActions.replaceEntities([
        entity('light.broken', 'on', 'not-a-timestamp'),
        entity('light.fine', 'on', '2026-07-30T12:00:00Z'),
      ])

      // `light.fine` dated the snapshot, so the newer creation is still kept.
      expect(Object.keys(entityStore.state.entities).sort()).toEqual([
        'light.born',
        'light.broken',
        'light.fine',
      ])
    })

    it('takes the snapshot when either timestamp is unusable', () => {
      // Anything unparseable defers to the snapshot, which is the conservative
      // direction: it is the reading we just asked Home Assistant for.
      entityStoreActions.updateEntities([entity('light.odd', 'on', 'not-a-timestamp')])
      entityStoreActions.replaceEntities([entity('light.odd', 'off', '2026-07-30T12:00:00Z')])

      expect(entityStore.state.entities['light.odd'].state).toBe('off')
    })

    it('forgets the subscriptions and staleness of entities it dropped', () => {
      /*
       * The same bookkeeping `removeEntity` does, for the same reason: a count
       * or a stale mark left behind outlives the entity it described, and would
       * be read by the next subscribe to that id if it ever came back.
       */
      entityStoreActions.updateEntities([
        entity('light.kept', 'on', '2026-07-30T10:00:00Z'),
        entity('light.gone', 'on', '2026-07-30T10:00:00Z'),
      ])
      entityStoreActions.subscribeToEntity('light.kept')
      entityStoreActions.subscribeToEntity('light.gone')
      entityStoreActions.markEntityStale('light.gone')

      entityStoreActions.replaceEntities([entity('light.kept', 'on', '2026-07-30T11:00:00Z')])

      expect([...entityStore.state.subscribedEntities]).toEqual(['light.kept'])
      expect([...entityStore.state.staleEntities]).toEqual([])
    })

    it('starts a re-added entity subscription count from zero', () => {
      /*
       * The subscription COUNT is module-private, so the Set assertion above
       * cannot see it — a mutation probe removing the `subscriptionCounts`
       * delete passed every test in this file. This is the observable
       * consequence: a count left behind outlives its entity, so an id that
       * comes back starts at 1 instead of 0, and the first unsubscribe leaves
       * it subscribed to something no view is showing.
       */
      entityStoreActions.updateEntities([entity('light.cycles', 'on', '2026-07-30T10:00:00Z')])
      entityStoreActions.subscribeToEntity('light.cycles')

      /*
       * Deleted while the socket was down — the snapshot carries a later
       * reading of something else, so the missing id's older one is genuinely
       * absent rather than newer than the snapshot instant. (An EMPTY snapshot
       * would not do: with nothing to date it by, the action keeps everything,
       * which is the conservative reading of a snapshot that carried nothing.)
       */
      entityStoreActions.replaceEntities([entity('light.other', 'on', '2026-07-30T11:00:00Z')])
      // …and created again before the next snapshot.
      entityStoreActions.replaceEntities([
        entity('light.other', 'on', '2026-07-30T11:30:00Z'),
        entity('light.cycles', 'on', '2026-07-30T11:30:00Z'),
      ])

      // One view subscribes to the returned entity, then goes away.
      entityStoreActions.subscribeToEntity('light.cycles')
      entityStoreActions.unsubscribeFromEntity('light.cycles')

      expect([...entityStore.state.subscribedEntities]).toEqual([])
    })
  })
})
