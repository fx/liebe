import { Store } from '@tanstack/store'
import type { EntityState, EntityStoreActions, HassEntity } from './entityTypes'

const initialState: EntityState = {
  entities: {},
  isConnected: false,
  isInitialLoading: true,
  lastError: null,
  subscribedEntities: new Set(),
  staleEntities: new Set(),
}

export const entityStore = new Store<EntityState>(initialState)

// Connection state debouncing
let connectionDebounceTimer: NodeJS.Timeout | null = null

/**
 * How many mounted views are showing each subscribed entity.
 *
 * `subscribedEntities` stays a Set, because what its consumers ask is "is
 * anything showing this entity?" (panel.ts's update fast path,
 * staleEntityMonitor, the connection popover's count). But a Set cannot answer
 * "did the LAST view of this entity go away?", and two views of one entity is
 * now the ordinary case rather than a curiosity: the detail dialog a hold opens
 * renders the same entity as the card behind it, so its unmount would otherwise
 * drop the still-mounted card's subscription — silently taking that card out of
 * the update path it depends on.
 */
const subscriptionCounts = new Map<string, number>()

/**
 * Whether the entity already in the map is a LATER reading than the incoming
 * one — the test that lets a snapshot replace the map without discarding an
 * update that raced it (`replaceEntities`).
 *
 * `Date.parse` rather than a string comparison: `last_updated` is ISO-8601 from
 * Home Assistant and would usually compare correctly as text, but that is a
 * property of the format rather than a guarantee of the contract, and a single
 * offset or precision difference reverses the answer silently. `NaN` from either
 * side makes this false, so anything unparseable defers to the snapshot.
 */
function isNewerThan(existing: HassEntity | undefined, incoming: HassEntity): boolean {
  if (!existing) return false
  const existingAt = Date.parse(existing.last_updated)
  const incomingAt = Date.parse(incoming.last_updated)
  if (Number.isNaN(existingAt) || Number.isNaN(incomingAt)) return false
  return existingAt > incomingAt
}

export const entityStoreActions: EntityStoreActions = {
  setConnected: (connected: boolean) => {
    const currentState = entityStore.state

    // Clear any existing debounce timer
    if (connectionDebounceTimer) {
      clearTimeout(connectionDebounceTimer)
      connectionDebounceTimer = null
    }

    // If going from disconnected to connected, apply immediately
    if (connected && !currentState.isConnected) {
      entityStore.setState((state) => ({
        ...state,
        isConnected: true,
      }))
      return
    }

    // If going from connected to disconnected, debounce for 500ms
    if (!connected && currentState.isConnected) {
      connectionDebounceTimer = setTimeout(() => {
        // Double-check the intended state hasn't changed during the timeout
        const latestState = entityStore.state
        if (latestState.isConnected) {
          entityStore.setState((state) => ({
            ...state,
            isConnected: false,
          }))
        }
        connectionDebounceTimer = null
      }, 500)
      return
    }

    // For all other cases (no change or repeated calls), do nothing
  },

  setInitialLoading: (loading: boolean) => {
    entityStore.setState((state) => ({
      ...state,
      isInitialLoading: loading,
    }))
  },

  setError: (error: string | null) => {
    entityStore.setState((state) => ({
      ...state,
      lastError: error,
    }))
  },

  updateEntity: (entity: HassEntity) => {
    entityStore.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        [entity.entity_id]: entity,
      },
    }))
  },

  updateEntities: (entities: HassEntity[]) => {
    entityStore.setState((state) => {
      const newEntities = { ...state.entities }
      entities.forEach((entity) => {
        newEntities[entity.entity_id] = entity
      })
      return {
        ...state,
        entities: newEntities,
      }
    })
  },

  /**
   * Take a whole snapshot as the state machine's contents, rather than merging
   * it into whatever the last session left behind.
   *
   * **What it fixes.** `loadInitialStates` used `updateEntities`, which merges —
   * so an entity DELETED WHILE THE SOCKET WAS DOWN survived from the previous
   * session's snapshot and was absent from the fresh one, leaving the map a
   * superset of the state machine forever after. `useEntity`'s `isMissing`
   * therefore never fired for it and its card kept rendering, and dispatching
   * against, an entity Home Assistant no longer has
   * (docs/specs/entity-state/index.md — "Consumer Hooks", change 0037 PR 8). A
   * live deletion was never affected: `state_changed` with a null `new_state`
   * reaches `removeEntity`.
   *
   * **The ordering, which is the whole of this action.** A snapshot is a claim
   * about one instant, and the obvious implementation — clear, then apply —
   * turns this defect into a worse one: any live update that landed between the
   * snapshot being read and being applied is dropped, so a card shows "Entity
   * Not Found" for an entity that exists. The old bug UNDER-reports missing and
   * can never be wrong in the other direction; a naive replace can, and an
   * over-report is the strictly worse failure because it is visible and wrong
   * rather than invisible and stale.
   *
   * So the replace reconciles rather than clobbering: an entity the snapshot
   * carries is written **unless the map already holds a strictly newer one**,
   * compared on Home Assistant's own `last_updated`. That is what makes the
   * answer to "what happens to an update racing the snapshot" precise — it
   * survives, because a change after the snapshot instant necessarily carries a
   * later `last_updated` than the snapshot's copy of it.
   *
   * Deliberately not a guarantee about the current call order. Today
   * `loadInitialStates` runs before `subscribeToStateChanges`, so no live update
   * can interleave at all — but the correctness of a store action should not
   * rest on the sequence one caller happens to use, and this holds whatever
   * order a future caller picks.
   *
   * **Absence is the deletion signal, and only for entities the snapshot could
   * have carried.** An id missing from a whole-state snapshot is an id Home
   * Assistant does not have, which is exactly the fact `isMissing` needs and the
   * one the merge threw away.
   */
  replaceEntities: (entities: HassEntity[]) => {
    entityStore.setState((state) => {
      const nextEntities: Record<string, HassEntity> = {}

      /*
       * The instant the snapshot describes, taken from Home Assistant's own
       * clock rather than ours: the latest reading it carries. Nothing in the
       * snapshot is newer than this, so an entity the map holds with a LATER
       * reading demonstrably changed after the snapshot was assembled — which
       * is the one case where absence from it does not mean "deleted".
       *
       * A wall-clock capture time would have been the obvious alternative and
       * is wrong: it compares the browser's clock against Home Assistant's
       * timestamps, so any skew between them decides the answer.
       */
      const snapshotAt = entities.reduce((latest, entity) => {
        const at = Date.parse(entity.last_updated)
        return Number.isNaN(at) ? latest : Math.max(latest, at)
      }, Number.NEGATIVE_INFINITY)

      entities.forEach((entity) => {
        const existing = state.entities[entity.entity_id]
        /*
         * Keep the live update where it is newer than the snapshot's copy.
         * `last_updated` moves on an attribute-only change as well as a state
         * one, so it orders every update Home Assistant sends; an unparseable
         * or absent value falls back to taking the snapshot, which is the
         * conservative direction — the snapshot is the authority we just asked
         * for.
         */
        nextEntities[entity.entity_id] = isNewerThan(existing, entity) ? existing! : entity
      })

      /*
       * An ADDITION that raced the snapshot survives it, which the first
       * version of this action got wrong: it built the next map from the
       * snapshot alone, so an entity CREATED after the snapshot instant — in
       * the map from a live `state_changed`, absent from the snapshot because
       * it did not exist when the snapshot was taken — was deleted, and the
       * card reported it missing. That is precisely the over-report this whole
       * design exists to avoid, reached by the one path the update case does
       * not cover (found in review before this landed).
       *
       * "Newer than everything the snapshot carries" is what separates the two
       * meanings of absence. An entity deleted while the socket was down last
       * changed before the disconnection, so it cannot clear that bar and is
       * dropped as intended; anything that can clear it postdates the snapshot,
       * and keeping it is the conservative direction if the bar is ever met by
       * accident on a very quiet system.
       */
      for (const [entityId, existing] of Object.entries(state.entities)) {
        if (entityId in nextEntities) continue

        const existingAt = Date.parse(existing.last_updated)
        if (!Number.isNaN(existingAt) && existingAt > snapshotAt) {
          nextEntities[entityId] = existing
          continue
        }

        /*
         * Otherwise the snapshot's silence means deleted, and the subscription
         * count goes with it — the same bookkeeping `removeEntity` does, since
         * a count left behind would make the next subscribe to that id start
         * from a stale number if it ever came back.
         */
        subscriptionCounts.delete(entityId)
      }

      const subscribedEntities = new Set(
        [...state.subscribedEntities].filter((entityId) => entityId in nextEntities)
      )
      const staleEntities = new Set(
        [...state.staleEntities].filter((entityId) => entityId in nextEntities)
      )

      return {
        ...state,
        entities: nextEntities,
        subscribedEntities,
        staleEntities,
      }
    })
  },

  removeEntity: (entityId: string) => {
    // The entity is gone, so are its views' subscriptions — leaving a count
    // behind would make the next subscribe start from a stale number.
    subscriptionCounts.delete(entityId)

    entityStore.setState((state) => {
      const { [entityId]: removed, ...remainingEntities } = state.entities
      // Explicitly mark as unused
      void removed
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.delete(entityId)

      return {
        ...state,
        entities: remainingEntities,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  subscribeToEntity: (entityId: string) => {
    subscriptionCounts.set(entityId, (subscriptionCounts.get(entityId) ?? 0) + 1)

    entityStore.setState((state) => {
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.add(entityId)
      return {
        ...state,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  unsubscribeFromEntity: (entityId: string) => {
    const remaining = (subscriptionCounts.get(entityId) ?? 0) - 1
    if (remaining > 0) {
      // Another view still has it open; the set must not change.
      subscriptionCounts.set(entityId, remaining)
      return
    }
    subscriptionCounts.delete(entityId)

    entityStore.setState((state) => {
      const newSubscribedEntities = new Set(state.subscribedEntities)
      newSubscribedEntities.delete(entityId)
      return {
        ...state,
        subscribedEntities: newSubscribedEntities,
      }
    })
  },

  clearSubscriptions: () => {
    subscriptionCounts.clear()
    entityStore.setState((state) => ({
      ...state,
      subscribedEntities: new Set(),
    }))
  },

  reset: () => {
    // Clear any pending connection debounce timer
    if (connectionDebounceTimer) {
      clearTimeout(connectionDebounceTimer)
      connectionDebounceTimer = null
    }
    subscriptionCounts.clear()
    entityStore.setState(() => initialState)
  },

  markEntityStale: (entityId: string) => {
    entityStore.setState((state) => {
      const newStaleEntities = new Set(state.staleEntities)
      newStaleEntities.add(entityId)
      return {
        ...state,
        staleEntities: newStaleEntities,
      }
    })
  },

  markEntityFresh: (entityId: string) => {
    entityStore.setState((state) => {
      const newStaleEntities = new Set(state.staleEntities)
      newStaleEntities.delete(entityId)
      return {
        ...state,
        staleEntities: newStaleEntities,
      }
    })
  },

  hasSubscribedEntityUpdates: (entities: HassEntity[]): boolean => {
    const state = entityStore.state
    return entities.some((entity) => state.subscribedEntities.has(entity.entity_id))
  },
}
