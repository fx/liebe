import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServiceCall } from '../useServiceCall'
import { HomeAssistantProvider } from '../../contexts/HomeAssistantContext'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'

/**
 * The `input_datetime` service mapping, exercised end to end.
 *
 * Deliberately does NOT mock `hassService` (as the sibling `useServiceCall`
 * suite does) and never stubs `setValue` itself: the only thing stubbed is the
 * Home Assistant connection boundary, `hass.callService`. That is the point of
 * this file — every existing test of the datetime card mocks `setValue`, which
 * is exactly why the missing mapping shipped green
 * (docs/changes/0022-switch-input-helpers-to-spec.md, "Testing Requirements").
 */

const ENTITY_ID = 'input_datetime.alarm_time'

function seedHelper(state: string, attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state,
    attributes,
    last_changed: '2024-01-15T00:00:00Z',
    last_updated: '2024-01-15T00:00:00Z',
    context: { id: 'seed', parent_id: null, user_id: null },
  }
  entityStore.setState((s) => ({ ...s, entities: { ...s.entities, [ENTITY_ID]: entity } }))
}

describe('useServiceCall.setValue — input_datetime', () => {
  let mockHass: HomeAssistant

  beforeEach(() => {
    vi.clearAllMocks()
    mockHass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  })

  afterEach(() => {
    entityStore.setState((s) => ({ ...s, entities: {} }))
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HomeAssistantProvider hass={mockHass}>{children}</HomeAssistantProvider>
  )

  it('sends { date } for a date-only helper', async () => {
    seedHelper('2024-01-15', { has_date: true, has_time: false })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let callResult
    await act(async () => {
      callResult = await result.current.setValue(ENTITY_ID, '2024-03-02')
    })

    expect(callResult).toEqual({ success: true })
    expect(result.current.error).toBe(null)
    // Exactly once at the connection boundary: a set that is dispatched twice is
    // a dispatch guarantee violation, not a harmless duplicate
    // (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
    expect(mockHass.callService).toHaveBeenCalledTimes(1)
    expect(mockHass.callService).toHaveBeenCalledWith('input_datetime', 'set_datetime', {
      entity_id: ENTITY_ID,
      date: '2024-03-02',
    })
  })

  it('sends { time } for a time-only helper, padding the seconds', async () => {
    seedHelper('06:00:00', { has_date: false, has_time: true })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.setValue(ENTITY_ID, '06:30')
    })

    expect(result.current.error).toBe(null)
    expect(mockHass.callService).toHaveBeenCalledTimes(1)
    expect(mockHass.callService).toHaveBeenCalledWith('input_datetime', 'set_datetime', {
      entity_id: ENTITY_ID,
      time: '06:30:00',
    })
  })

  it('sends { datetime } for a combined helper, in the format Home Assistant publishes', async () => {
    seedHelper('2024-01-15 06:00:00', { has_date: true, has_time: true })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    // What `<input type="datetime-local">` yields: `T`-separated, no seconds.
    await act(async () => {
      await result.current.setValue(ENTITY_ID, '2024-03-02T06:30')
    })

    expect(result.current.error).toBe(null)
    expect(mockHass.callService).toHaveBeenCalledTimes(1)
    expect(mockHass.callService).toHaveBeenCalledWith('input_datetime', 'set_datetime', {
      entity_id: ENTITY_ID,
      datetime: '2024-03-02 06:30:00',
    })
  })

  /**
   * The error the card shows verbatim. Each case asserts the *shape* is named,
   * not merely that something failed: an assertion on "an error was raised"
   * passes against a message that leaves the user guessing which of three
   * shapes their helper wanted, which is the whole defect.
   */
  describe('a value that cannot serve the helper', () => {
    it('names the date format for a date-only helper', async () => {
      seedHelper('2024-01-15', { has_date: true, has_time: false })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      let callResult
      await act(async () => {
        callResult = await result.current.setValue(ENTITY_ID, '06:30')
      })

      const expected = `${ENTITY_ID} expects a date (YYYY-MM-DD)`
      expect(callResult).toEqual({ success: false, error: expected })
      expect(result.current.error).toBe(expected)
      expect(mockHass.callService).not.toHaveBeenCalled()
    })

    it('names the time format for a time-only helper', async () => {
      seedHelper('06:00:00', { has_date: false, has_time: true })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.setValue(ENTITY_ID, '2024-01-15')
      })

      expect(result.current.error).toBe(`${ENTITY_ID} expects a time (HH:MM)`)
      expect(mockHass.callService).not.toHaveBeenCalled()
    })

    it('names both halves for a combined helper', async () => {
      seedHelper('2024-01-15 06:00:00', { has_date: true, has_time: true })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.setValue(ENTITY_ID, '06:30')
      })

      expect(result.current.error).toBe(`${ENTITY_ID} expects a date and time (YYYY-MM-DD HH:MM)`)
      expect(mockHass.callService).not.toHaveBeenCalled()
    })

    it('says so when the helper carries neither half', async () => {
      seedHelper('2024-01-15', { has_date: false, has_time: false })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.setValue(ENTITY_ID, '2024-01-15')
      })

      expect(result.current.error).toBe(`${ENTITY_ID} has neither a date nor a time to set`)
      expect(mockHass.callService).not.toHaveBeenCalled()
    })
  })

  it('surfaces a failure from the connection without a second attempt', async () => {
    seedHelper('2024-01-15', { has_date: true, has_time: false })
    vi.mocked(mockHass.callService).mockRejectedValue(new Error('not connected'))
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let callResult
    await act(async () => {
      callResult = await result.current.setValue(ENTITY_ID, '2024-03-02')
    })

    expect(callResult).toEqual({ success: false, error: 'not connected' })
    expect(result.current.error).toBe('not connected')
    // The retrying wrapper would be on its second of four attempts here.
    expect(mockHass.callService).toHaveBeenCalledTimes(1)
  })
})
