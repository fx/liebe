import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useServiceCall } from '../useServiceCall'
import { hassService } from '../../services/hassService'
import { HomeAssistantProvider } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'
import { resetDispatchGuard } from '../../services/guardedDispatch'

vi.mock('../../services/hassService', () => ({
  hassService: {
    setHass: vi.fn(),
    callService: vi.fn(),
    callServiceOnce: vi.fn(),
  },
}))

describe('useServiceCall', () => {
  let mockHass: HomeAssistant

  beforeEach(() => {
    // The dispatch guard is process-wide, so one case's pending window would
    // otherwise carry into the next.
    resetDispatchGuard()
    vi.clearAllMocks()

    mockHass = createMockHomeAssistant({
      callService: vi.fn(),
      user: {
        name: 'Test User',
        id: '123',
        is_admin: true,
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HomeAssistantProvider hass={mockHass}>{children}</HomeAssistantProvider>
  )

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(hassService.setHass).toHaveBeenCalledWith(mockHass)
  })

  it('should handle successful service call', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let serviceResult
    await act(async () => {
      serviceResult = await result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })
    })

    expect(serviceResult).toEqual({ success: true })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('should handle failed service call', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({
      success: false,
      error: 'Service call failed',
    })

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('Service call failed')
  })

  it('should set loading state during service call', async () => {
    vi.mocked(hassService.callService).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
    )

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    act(() => {
      result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })
    })

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  /*
   * The three convenience helpers, which cards reach for far more often than
   * they build a payload by hand.
   *
   * These asserted the RETRYING path until #230 — which is what let the input
   * boolean card's switch keep re-sending `toggle` three times on a flaky
   * connection while every other card had migrated. The assertion below states
   * what the contract requires of them ("non-retrying and at-most-once per
   * gesture ... for every embedded control, on every card"), not which function
   * they presently call.
   */
  it.each([
    ['turnOn', 'turn_on', { brightness: 255 }],
    ['turnOff', 'turn_off', undefined],
    ['toggle', 'toggle', undefined],
  ] as const)(
    'dispatches %s through the non-retrying guarded path',
    async (helper, service, data) => {
      vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })

      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current[helper]('light.bedroom', data)
      })

      expect(hassService.callServiceOnce).toHaveBeenCalledWith({
        domain: 'light',
        service,
        entityId: 'light.bedroom',
        data,
      })
      // The retrying wrapper is the thing the contract forbids here.
      expect(hassService.callService).not.toHaveBeenCalled()
    }
  )

  it('refuses a repeat of the same helper command while the first is in flight', async () => {
    // At-most-once is the other half of the guarantee, and the half a call-site
    // swap alone would not deliver.
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.toggle('switch.well_pump')
      await result.current.toggle('switch.well_pump')
    })

    expect(hassService.callServiceOnce).toHaveBeenCalledTimes(1)
  })

  it('should handle setValue helper for input_number', async () => {
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.setValue('input_number.temperature', 25)
    })

    // The guarded, non-retrying path: a helper's value is a consequential
    // command like any other control's (docs/changes/0022 PR 4).
    expect(hassService.callServiceOnce).toHaveBeenCalledWith({
      domain: 'input_number',
      service: 'set_value',
      entityId: 'input_number.temperature',
      data: { value: 25 },
    })
    expect(hassService.callService).not.toHaveBeenCalled()
  })

  it('maps a numeric setValue on a light to a guarded brightness command', async () => {
    /*
     * `setValue`'s domain map covers this, and no card reaches it today — the
     * light card builds its own payload. It is still public API of the hook, so
     * it is pinned rather than left as the one arm of the map that could quietly
     * go back to retrying.
     */
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.setValue('light.bedroom', 128)
    })

    expect(hassService.callServiceOnce).toHaveBeenCalledWith({
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.bedroom',
      data: { brightness: 128 },
    })
    expect(hassService.callService).not.toHaveBeenCalled()
  })

  it('should handle setValue error for unsupported domain', async () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.setValue('sensor.temperature', 25)
    })

    expect(result.current.error).toBe('setValue not supported for domain: sensor')
  })

  /**
   * `dispatchGuarded` is what a card's embedded controls dispatch through, so
   * these assert at the service boundary rather than at the hook's own API: a
   * card test that mocks this hook cannot tell the retrying path from the
   * non-retrying one, and that difference is the whole point of the method
   * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
   */
  describe('dispatchGuarded', () => {
    const command = { domain: 'cover', service: 'open_cover', entityId: 'cover.garage' }

    it('never reaches the retrying path', async () => {
      vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.dispatchGuarded(command)
      })

      expect(hassService.callServiceOnce).toHaveBeenCalledWith(command)
      expect(hassService.callService).not.toHaveBeenCalled()
    })

    it('holds back a repeat of the same command', async () => {
      vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.dispatchGuarded(command)
        await result.current.dispatchGuarded(command)
      })

      expect(hassService.callServiceOnce).toHaveBeenCalledTimes(1)
    })

    it('reports a refused repeat as success rather than as an error', async () => {
      // The first command is still in flight; there is nothing to show the user.
      vi.mocked(hassService.callServiceOnce).mockResolvedValue({ success: true })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      let second: { success: boolean } | undefined
      await act(async () => {
        await result.current.dispatchGuarded(command)
        second = await result.current.dispatchGuarded(command)
      })

      expect(second).toEqual({ success: true })
      expect(result.current.error).toBeNull()
    })

    it('does not let a refused repeat swallow the first call’s failure', async () => {
      /*
       * The reason the guard is consulted before `runCall` and not inside it.
       * `runCall` aborts the previous call and resets loading/error on entry,
       * so a refusal reaching it would tear down the state of the dispatch
       * still in flight: the abort makes the first call skip its own error
       * update when it finally fails, while the repeat has already returned
       * success. Pressing a button twice would make a real failure vanish.
       */
      let failFirst: (result: { success: boolean; error?: string }) => void = () => {}
      vi.mocked(hassService.callServiceOnce).mockReturnValue(
        new Promise((resolve) => {
          failFirst = resolve
        })
      )
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      let first: Promise<unknown> | undefined
      act(() => {
        first = result.current.dispatchGuarded(command)
      })
      await waitFor(() => expect(result.current.loading).toBe(true))

      // The repeat is refused while the first is still travelling.
      let refused: { success: boolean } | undefined
      await act(async () => {
        refused = await result.current.dispatchGuarded(command)
      })
      expect(refused).toEqual({ success: true })
      expect(hassService.callServiceOnce).toHaveBeenCalledTimes(1)

      // Now the first one fails. Its error must still reach the card.
      await act(async () => {
        failFirst({ success: false, error: 'Cover jammed' })
        await first
      })

      await waitFor(() => expect(result.current.error).toBe('Cover jammed'))
    })

    it('surfaces a real failure', async () => {
      vi.mocked(hassService.callServiceOnce).mockResolvedValue({
        success: false,
        error: 'Cover jammed',
      })
      const { result } = renderHook(() => useServiceCall(), { wrapper })

      await act(async () => {
        await result.current.dispatchGuarded(command)
      })

      await waitFor(() => expect(result.current.error).toBe('Cover jammed'))
    })
  })

  it('should clear error', () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    act(() => {
      // Set an error first
      result.current.setValue('sensor.invalid', 100)
    })

    waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBe(null)
  })

  it('should cancel previous call when new call starts', async () => {
    const abortControllerMock = {
      abort: vi.fn(),
      signal: { aborted: false },
    }

    // Mock AbortController
    // Function expression (not arrow) so it is constructable with `new` under vitest 4.
    const realAbortController = global.AbortController
    global.AbortController = vi.fn(function () {
      return abortControllerMock
    }) as unknown as typeof AbortController

    vi.mocked(hassService.callService).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
    )

    const { result } = renderHook(() => useServiceCall(), { wrapper })

    // Start first call
    let first: Promise<unknown> | undefined
    act(() => {
      first = result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })
    })

    // Start second call immediately
    let second: Promise<unknown> | undefined
    act(() => {
      second = result.current.callService({
        domain: 'light',
        service: 'turn_off',
        entityId: 'light.bedroom',
      })
    })

    expect(abortControllerMock.abort).toHaveBeenCalled()

    // Both calls settle 100ms later and set state on the way out. Awaiting them
    // keeps that inside the test: left running, they land after the jsdom
    // environment is gone and surface as an unhandled `window is not defined`
    // rejection attributed to whichever file was slow enough to still be open.
    await act(async () => {
      await Promise.all([first, second])
    })
    global.AbortController = realAbortController
  })
})
