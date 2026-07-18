import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, renderHook, act } from '@testing-library/react'
import { useEntities } from '../useEntities'
import { entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'

function makeEntity(entityId: string, state: string): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: {},
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: entityId, parent_id: null, user_id: null },
  }
}

describe('useEntities', () => {
  beforeEach(() => {
    entityStoreActions.reset()
  })

  afterEach(() => {
    entityStoreActions.clearSubscriptions()
  })

  it('returns only the requested entities for the filtered form', () => {
    act(() => {
      entityStoreActions.updateEntities([
        makeEntity('light.kitchen', 'on'),
        makeEntity('light.hall', 'off'),
        makeEntity('climate.living_room', 'heat'),
      ])
    })

    const { result } = renderHook(() => useEntities(['light.kitchen', 'light.hall']))

    expect(result.current.filteredEntities.map((e) => e.entity_id)).toEqual([
      'light.kitchen',
      'light.hall',
    ])
  })

  it('scopes entities to the requested ids in the filtered form', () => {
    act(() => {
      entityStoreActions.updateEntities([
        makeEntity('light.kitchen', 'on'),
        makeEntity('light.hall', 'off'),
        makeEntity('climate.living_room', 'heat'),
      ])
    })

    const { result } = renderHook(() => useEntities(['light.kitchen', 'light.hall']))

    // The filtered form derives its selection from the requested ids only, so a
    // non-requested entity is absent from entities rather than tracked as a stale
    // value (tracking it would re-render the component on every unrelated batch).
    expect(Object.keys(result.current.entities)).toEqual(['light.kitchen', 'light.hall'])
    expect(result.current.entities['climate.living_room']).toBeUndefined()
    expect(result.current.entities['light.kitchen']?.state).toBe('on')
  })

  it('keeps entities reactive to requested-entity updates in the filtered form', () => {
    act(() => {
      entityStoreActions.updateEntities([makeEntity('light.kitchen', 'on')])
    })

    const { result } = renderHook(() => useEntities(['light.kitchen']))
    expect(result.current.entities['light.kitchen']?.state).toBe('on')

    act(() => {
      entityStoreActions.updateEntities([makeEntity('light.kitchen', 'off')])
    })
    expect(result.current.entities['light.kitchen']?.state).toBe('off')
  })

  it('does not re-render the filtered form when an unrelated entity updates', () => {
    act(() => {
      entityStoreActions.updateEntities([
        makeEntity('light.kitchen', 'on'),
        makeEntity('light.hall', 'off'),
        makeEntity('climate.living_room', 'heat'),
      ])
    })

    // Stable reference so the effect deps and selector are not recreated by
    // the parent for reasons unrelated to what we are asserting.
    const ids = ['light.kitchen', 'light.hall']
    let renders = 0
    function Probe() {
      renders++
      useEntities(ids)
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      entityStoreActions.updateEntities([makeEntity('climate.living_room', 'cool')])
    })

    expect(renders).toBe(initialRenders)
  })

  it('reflects the requested order when entityIds are reordered', () => {
    act(() => {
      entityStoreActions.updateEntities([
        makeEntity('light.kitchen', 'on'),
        makeEntity('light.hall', 'off'),
      ])
    })

    const { result, rerender } = renderHook(({ ids }) => useEntities(ids), {
      initialProps: { ids: ['light.kitchen', 'light.hall'] },
    })
    expect(result.current.filteredEntities.map((e) => e.entity_id)).toEqual([
      'light.kitchen',
      'light.hall',
    ])

    rerender({ ids: ['light.hall', 'light.kitchen'] })
    expect(result.current.filteredEntities.map((e) => e.entity_id)).toEqual([
      'light.hall',
      'light.kitchen',
    ])
  })

  it('re-renders the filtered form when a requested entity updates', () => {
    act(() => {
      entityStoreActions.updateEntities([
        makeEntity('light.kitchen', 'on'),
        makeEntity('light.hall', 'off'),
      ])
    })

    const ids = ['light.kitchen', 'light.hall']
    let renders = 0
    let lastKitchenState: string | undefined
    function Probe() {
      renders++
      const { filteredEntities } = useEntities(ids)
      lastKitchenState = filteredEntities.find((e) => e.entity_id === 'light.kitchen')?.state
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      entityStoreActions.updateEntities([makeEntity('light.kitchen', 'off')])
    })

    expect(renders).toBe(initialRenders + 1)
    expect(lastKitchenState).toBe('off')
  })
})
