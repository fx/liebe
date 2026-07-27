import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGuardedDispatch, resolveCommandTarget } from '../useGuardedDispatch'
import { hassService } from '../../services/hassService'
import { entityStore } from '../../store/entityStore'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '../../store/cardActions'
import type { HassEntity } from '../../store/entityTypes'

/**
 * The at-most-once dispatch guard (docs/specs/entity-cards/options/common.md —
 * "Dispatch guarantees"). These are the boundary-level tests the contract
 * requires: they count calls at `hassService`, the seam where a command either
 * leaves for Home Assistant or does not.
 */

const entity = (entityId: string, lastUpdated: string): HassEntity => ({
  entity_id: entityId,
  state: 'open',
  attributes: {},
  last_changed: lastUpdated,
  last_updated: lastUpdated,
  context: { id: 'ctx', parent_id: null, user_id: null },
})

const setEntity = (entityId: string, lastUpdated: string) => {
  entityStore.setState((state) => ({
    ...state,
    entities: { ...state.entities, [entityId]: entity(entityId, lastUpdated) },
  }))
}

describe('useGuardedDispatch', () => {
  let once: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    entityStore.setState((state) => ({ ...state, entities: {} }))
    once = vi.spyOn(hassService, 'callServiceOnce').mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    once.mockRestore()
  })

  const cover = { domain: 'cover', service: 'open_cover', entityId: 'cover.garage' }

  it('dispatches through the non-retrying path', async () => {
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    await act(async () => {
      await result.current(cover)
    })

    expect(once).toHaveBeenCalledTimes(1)
    expect(once).toHaveBeenCalledWith(cover)
  })

  it('refuses a repeat of the same command while the first is in flight', async () => {
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    const first = await act(async () => result.current(cover))
    const second = await act(async () => result.current(cover))

    expect(once).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ success: true })
    // Refusal is not a failure — the caller asked for the same thing twice.
    expect(second).toBeNull()
  })

  /**
   * The case the contract names explicitly. Home Assistant acknowledges before
   * a slow integration updates state, so a guard that reopened on promise
   * resolution would admit the second press while the first was still
   * travelling. Here the promise has already resolved and `last_updated` has
   * not moved: the command must still be refused.
   */
  it('stays shut after the service call resolves, before the entity moves', async () => {
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    const first = await act(async () => result.current(cover))
    expect(first).toEqual({ success: true }) // acknowledged...

    // ...but nothing has moved yet, and time has not run out.
    vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS - 1)
    const second = await act(async () => result.current(cover))

    expect(second).toBeNull()
    expect(once).toHaveBeenCalledTimes(1)
  })

  it('reopens once the watched entity actually transitions', async () => {
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    await act(async () => result.current(cover))
    setEntity('cover.garage', '2024-01-01T00:00:03Z')
    await act(async () => result.current(cover))

    expect(once).toHaveBeenCalledTimes(2)
  })

  it('reopens on the timeout when the entity never transitions', async () => {
    // The other reopen path, and a different one: nothing landed, but a control
    // that can never be used again is worse than one that retries by hand.
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    await act(async () => result.current(cover))
    vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
    await act(async () => result.current(cover))

    expect(once).toHaveBeenCalledTimes(2)
  })

  it('never holds back the inverse command', async () => {
    // Stopping a cover that is travelling too far is the command most likely to
    // arrive while the first is in flight, and the one that must never be
    // swallowed.
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')

    await act(async () => result.current(cover))
    await act(async () =>
      result.current({ domain: 'cover', service: 'stop_cover', entityId: 'cover.garage' })
    )

    expect(once).toHaveBeenCalledTimes(2)
  })

  it('treats a different payload as a different command', async () => {
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('cover.garage', '2024-01-01T00:00:00Z')
    const position = (value: number) => ({
      domain: 'cover',
      service: 'set_cover_position',
      entityId: 'cover.garage',
      data: { position: value },
    })

    await act(async () => result.current(position(100)))
    await act(async () => result.current(position(0)))

    expect(once).toHaveBeenCalledTimes(2)
  })

  it('does not hold back a command that aims at nothing', async () => {
    // Nothing to observe and nothing to repeat harmfully: a notification or a
    // scene the card cannot watch must not be held shut on the timeout alone.
    const { result } = renderHook(() => useGuardedDispatch())

    await act(async () => result.current({ domain: 'notify', service: 'persistent' }))
    await act(async () => result.current({ domain: 'notify', service: 'persistent' }))

    expect(once).toHaveBeenCalledTimes(2)
  })

  it('guards a command aimed at everything, which it cannot watch', async () => {
    // `entity_id: all` is as consequential as a command gets and has no single
    // `last_updated` to read. Aimed but unobservable: held until the timeout.
    const { result } = renderHook(() => useGuardedDispatch())
    const all = {
      domain: 'homeassistant',
      service: 'turn_off',
      data: { entity_id: 'all' },
    }

    await act(async () => result.current(all))
    await act(async () => result.current(all))
    expect(once).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
    await act(async () => result.current(all))
    expect(once).toHaveBeenCalledTimes(2)
  })

  it('watches the payload’s target rather than the card’s own entity', async () => {
    // `buildServiceData` spreads `data` over the implicit target, so the array
    // is what actually gets dispatched at. Watching the card's entity instead
    // would let an unrelated change here admit a duplicate there.
    const { result } = renderHook(() => useGuardedDispatch())
    setEntity('sensor.hallway', '2024-01-01T00:00:00Z')
    setEntity('cover.garage', '2024-01-01T00:00:00Z')
    const command = {
      domain: 'cover',
      service: 'open_cover',
      entityId: 'sensor.hallway',
      data: { entity_id: ['cover.garage'] },
    }

    await act(async () => result.current(command))

    // The card's own entity moving is not the cover having opened.
    setEntity('sensor.hallway', '2024-01-01T00:00:09Z')
    await act(async () => result.current(command))
    expect(once).toHaveBeenCalledTimes(1)

    // The entity actually dispatched at moving is.
    setEntity('cover.garage', '2024-01-01T00:00:09Z')
    await act(async () => result.current(command))
    expect(once).toHaveBeenCalledTimes(2)
  })
})

/**
 * The target resolution behind the guard. Its shapes are `buildServiceData`'s,
 * not this module's invention: the card's entity is the implicit target and
 * `data` is spread over it, so any `entity_id` replaces it.
 */
describe('resolveCommandTarget', () => {
  it('falls back to the card’s entity when the payload names none', () => {
    expect(resolveCommandTarget('cover.garage', undefined)).toEqual({
      aimed: true,
      watch: 'cover.garage',
    })
    expect(resolveCommandTarget('cover.garage', { position: 40 })).toEqual({
      aimed: true,
      watch: 'cover.garage',
    })
  })

  it('aims at nothing when there is no entity anywhere', () => {
    expect(resolveCommandTarget(undefined, undefined)).toEqual({ aimed: false })
    expect(resolveCommandTarget('cover.garage', { entity_id: 'none' })).toEqual({ aimed: false })
    expect(resolveCommandTarget('cover.garage', { entity_id: [] })).toEqual({ aimed: false })
  })

  it('lets the payload’s own target win over the card’s', () => {
    expect(resolveCommandTarget('sensor.hallway', { entity_id: 'cover.garage' })).toEqual({
      aimed: true,
      watch: 'cover.garage',
    })
  })

  it.each([
    ['a wildcard', 'all'],
    ['a list of wildcards', ['all']],
  ])('is aimed but unwatchable for %s', (_label, entity_id) => {
    expect(resolveCommandTarget('cover.garage', { entity_id })).toEqual({ aimed: true })
  })

  it('prefers the card’s own entity inside a list it belongs to', () => {
    expect(
      resolveCommandTarget('cover.garage', { entity_id: ['cover.side', 'cover.garage'] })
    ).toEqual({ aimed: true, watch: 'cover.garage' })
  })

  it('takes the first nameable entry of a list it does not belong to', () => {
    expect(resolveCommandTarget('sensor.hallway', { entity_id: ['all', 'cover.garage'] })).toEqual({
      aimed: true,
      watch: 'cover.garage',
    })
  })

  it.each([
    ['a number', 7],
    ['an object', { id: 'cover.garage' }],
    ['a list of non-strings', [7]],
  ])('is aimed but unwatchable for %s, rather than guessing', (_label, entity_id) => {
    // The dispatch happens whatever this build makes of the value, so the safe
    // reading is to guard on the timeout — not to watch the card's own entity,
    // which is not what the command targets.
    expect(resolveCommandTarget('cover.garage', { entity_id })).toEqual({ aimed: true })
  })
})
