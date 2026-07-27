import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useEntityHistory } from '../useEntityHistory'
import { entityHistoryService } from '../../services/entityHistory'
import { historyStore, historyStoreActions } from '../../store/historyStore'
import { entityStoreActions } from '../../store/entityStore'
import type { HassEntity } from '../../store/entityTypes'
import { HomeAssistantProvider, type HomeAssistant } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HistoryResponse } from '../../services/historyData'

const NOW = Date.now()
const ENTITY = 'sensor.power'

function historyResponse(entityId: string, values: number[]): HistoryResponse {
  return {
    [entityId]: values.map((value, index) => ({
      s: String(value),
      lu: (NOW - (values.length - 1 - index) * 60_000) / 1000,
    })),
  }
}

function makeEntity(entityId: string, state: string, attributes = {}): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes,
    last_changed: new Date(NOW).toISOString(),
    last_updated: new Date(NOW).toISOString(),
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

describe('useEntityHistory', () => {
  let hass: HomeAssistant
  let callWS: ReturnType<typeof vi.fn>

  function wrapper({ children }: { children: ReactNode }) {
    return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
  }

  beforeEach(() => {
    entityHistoryService.reset()
    entityStoreActions.reset()
    callWS = vi.fn().mockResolvedValue(historyResponse(ENTITY, [1, 2, 3]))
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
  })

  afterEach(() => {
    entityHistoryService.reset()
  })

  it('fetches on mount and returns the downsampled series', async () => {
    const { result } = renderHook(() => useEntityHistory(ENTITY), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.points).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(callWS).toHaveBeenCalledTimes(1)
    expect(result.current.values.at(-1)).toBe(3)
    // All three samples fall in one bucket of the default 24h window, so the
    // point carries the bucket's extremes alongside its closing value.
    expect(result.current.points.at(-1)).toMatchObject({ value: 3, min: 1, max: 3 })
    expect(result.current.error).toBeNull()
    expect(result.current.unsupported).toBe(false)
  })

  it('does not subscribe without an entity id', () => {
    const { result } = renderHook(() => useEntityHistory(''), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(callWS).not.toHaveBeenCalled()
  })

  it('shares one fetch between two consumers of the same window', async () => {
    const { result } = renderHook(
      () => [useEntityHistory(ENTITY), useEntityHistory(ENTITY)] as const,
      { wrapper }
    )

    await waitFor(() => expect(result.current[0].isLoading).toBe(false))
    expect(callWS).toHaveBeenCalledTimes(1)
  })

  it('refetches when the requested window changes', async () => {
    const { result, rerender } = renderHook(
      ({ hours }: { hours: number }) => useEntityHistory(ENTITY, { hours }),
      { wrapper, initialProps: { hours: 24 } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    rerender({ hours: 6 })
    await waitFor(() => expect(callWS).toHaveBeenCalledTimes(2))
    expect(callWS.mock.calls[1][0]).toMatchObject({ entity_ids: [ENTITY] })
  })

  it('re-renders with the appended sample when live ingress arrives', async () => {
    const { result } = renderHook(() => useEntityHistory(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      entityHistoryService.ingest(makeEntity(ENTITY, '42'))
    })

    await waitFor(() => expect(result.current.values.at(-1)).toBe(42))
  })

  it('keeps the projection referentially stable across unrelated re-renders', async () => {
    const { result, rerender } = renderHook(() => useEntityHistory(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const first = result.current.points
    rerender()
    expect(result.current.points).toBe(first)
  })

  it('applies reset-aware delta summation from the entity state class', async () => {
    entityStoreActions.updateEntity(
      makeEntity(ENTITY, '5', { state_class: 'total_increasing', unit_of_measurement: 'kWh' })
    )
    callWS.mockResolvedValue(historyResponse(ENTITY, [0, 10, 0, 5]))

    const { result } = renderHook(() => useEntityHistory(ENTITY, { mode: 'delta', points: 1 }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.values).toEqual([15])
  })

  it('resolves a non-numeric entity as unsupported rather than an error', async () => {
    entityStoreActions.updateEntity(makeEntity('device_tracker.phone', 'home'))

    const { result } = renderHook(() => useEntityHistory('device_tracker.phone'), { wrapper })
    await waitFor(() => expect(result.current.unsupported).toBe(true))

    expect(result.current.error).toBeNull()
    expect(result.current.points).toEqual([])
  })

  it('surfaces a fetch failure through the result instead of throwing', async () => {
    callWS.mockRejectedValue(new Error('websocket closed'))

    const { result } = renderHook(() => useEntityHistory(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.error).toBe('websocket closed'))

    expect(result.current.points).toEqual([])
  })

  it('reports an error rather than fetching when there is no Home Assistant', async () => {
    const { result } = renderHook(() => useEntityHistory(ENTITY), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HomeAssistantProvider hass={null}>{children}</HomeAssistantProvider>
      ),
    })

    await waitFor(() => expect(result.current.error).toBe('Home Assistant not connected'))
    expect(callWS).not.toHaveBeenCalled()
  })

  it('releases the window on unmount so it is refetched on remount', async () => {
    const first = renderHook(() => useEntityHistory(ENTITY), { wrapper })
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    const cached = historyStore.state.entries[`${ENTITY}|24`]?.samples
    const second = renderHook(() => useEntityHistory(ENTITY), { wrapper })

    // The cached window renders immediately — no gap, no loading flash — while
    // the refetch that closes the unwatched gap runs.
    expect(second.result.current.values.at(-1)).toBe(cached?.at(-1)?.value)
    await waitFor(() => expect(callWS).toHaveBeenCalledTimes(2))
  })

  it('does not refetch when Home Assistant re-supplies a fresh hass object', async () => {
    const { result, rerender } = renderHook(() => useEntityHistory(ENTITY), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
      ),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // HA mutates and re-supplies `hass` on every state change in the house;
    // the window's subscription must survive that untouched.
    hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    rerender()
    rerender()

    expect(callWS).toHaveBeenCalledTimes(1)
  })

  it('ignores history written for another entity', async () => {
    const { result } = renderHook(() => useEntityHistory(ENTITY), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const points = result.current.points

    act(() => {
      historyStoreActions.patchEntry('sensor.other', 24, {
        samples: [{ t: NOW, value: 99 }],
      })
    })

    expect(result.current.points).toBe(points)
  })
})
