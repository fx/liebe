import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntity } from '../useEntity'
import { entityStore, entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'

/**
 * The third lifecycle state (docs/specs/entity-state — "Consumer Hooks";
 * docs/changes/0037 PR 3).
 *
 * Before it, "this entity has not arrived" and "Home Assistant has no such
 * entity" were the same answer — `entity === undefined` — so a card could only
 * pick one treatment for both, and every card picked waiting. These tests are
 * about the *transitions* rather than about three static snapshots, because the
 * defect was invisible in a snapshot: at the instant the panel starts, a
 * present entity and a deleted one look identical, and what tells them apart is
 * what the same hook says once the snapshot has landed.
 */

const ENTITY_ID = 'light.bedroom'

function makeEntity(entityId = ENTITY_ID): HassEntity {
  return {
    entity_id: entityId,
    state: 'on',
    attributes: { friendly_name: 'Bedroom Light' },
    last_changed: '2026-07-30T00:00:00Z',
    last_updated: '2026-07-30T00:00:00Z',
    context: { id: '1', parent_id: null, user_id: null },
  }
}

/** The panel mid-startup: connected, snapshot still being written. */
function startConnecting() {
  act(() => {
    entityStore.setState((state) => ({
      ...state,
      entities: {},
      isConnected: true,
      isInitialLoading: true,
    }))
  })
}

describe('useEntity — pending, missing and disconnected', () => {
  beforeEach(() => {
    entityStoreActions.reset()
  })

  afterEach(() => {
    entityStoreActions.clearSubscriptions()
  })

  it('pending → present: never reports missing on the way to an entity that exists', () => {
    startConnecting()
    const { result } = renderHook(() => useEntity(ENTITY_ID))

    expect(result.current.isLoading).toBe(true)
    // The whole point of gating on the snapshot: an entity that is about to
    // arrive must not be reported missing while it is on its way, or every card
    // flashes a not-found tile on every panel load.
    expect(result.current.isMissing).toBe(false)

    act(() => {
      entityStoreActions.updateEntity(makeEntity())
      entityStoreActions.setInitialLoading(false)
    })

    expect(result.current.entity?.entity_id).toBe(ENTITY_ID)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isMissing).toBe(false)
  })

  it('pending → missing: reports the entity gone once the snapshot has landed without it', () => {
    startConnecting()
    const { result } = renderHook(() => useEntity(ENTITY_ID))

    expect(result.current.isMissing).toBe(false)

    // The snapshot arrives carrying other entities and not this one — a card
    // left pointing at an entity that was renamed or removed.
    act(() => {
      entityStoreActions.updateEntity(makeEntity('light.kitchen'))
      entityStoreActions.setInitialLoading(false)
    })

    expect(result.current.entity).toBeUndefined()
    expect(result.current.isMissing).toBe(true)
    // And it stops claiming to be loading: the two are mutually exclusive, so a
    // consumer that branches on `isLoading` first still reaches the new state.
    expect(result.current.isLoading).toBe(false)
  })

  it('does not report missing while the connection is down, however long it stays down', () => {
    // A dropped socket has told the panel nothing about what exists. Reporting
    // the entity as deleted here would send the user to reconfigure a card that
    // is fine — which is why `isMissing` is gated on the connection and not
    // only on the snapshot having finished.
    act(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {},
        isConnected: false,
        isInitialLoading: false,
      }))
    })

    const { result } = renderHook(() => useEntity(ENTITY_ID))

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isMissing).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('reports missing only once the connection comes back and still has no such entity', () => {
    act(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {},
        isConnected: false,
        isInitialLoading: false,
      }))
    })
    const { result } = renderHook(() => useEntity(ENTITY_ID))
    expect(result.current.isMissing).toBe(false)

    act(() => {
      entityStoreActions.setConnected(true)
    })

    expect(result.current.isMissing).toBe(true)
  })

  it('never reports missing for an entity it is holding', () => {
    act(() => {
      entityStoreActions.updateEntity(makeEntity())
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })

    const { result } = renderHook(() => useEntity(ENTITY_ID))

    expect(result.current.isMissing).toBe(false)
  })

  it('reports an entity removed mid-session as missing rather than as still loading', () => {
    act(() => {
      entityStoreActions.updateEntity(makeEntity())
      entityStoreActions.setConnected(true)
      entityStoreActions.setInitialLoading(false)
    })
    const { result } = renderHook(() => useEntity(ENTITY_ID))
    expect(result.current.isMissing).toBe(false)

    // What Home Assistant sends when an entity is deleted: a `state_changed`
    // with a null `new_state`, which the ingress turns into a removal.
    act(() => {
      entityStoreActions.removeEntity(ENTITY_ID)
    })

    expect(result.current.entity).toBeUndefined()
    expect(result.current.isMissing).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })
})
