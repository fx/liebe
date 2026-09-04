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

/**
 * The retained failed command (change 0043 PR 5): `dispatchGuarded` retains
 * the identical command on failure so `Retry` can re-dispatch it; a
 * pre-dispatch refusal retains nothing repeatable; `clearError` and a new
 * dispatch drop the retention.
 */
describe('useServiceCall retained failure', () => {
  let mockHass: HomeAssistant

  beforeEach(() => {
    resetDispatchGuard()
    vi.clearAllMocks()
    mockHass = createMockHomeAssistant({ callService: vi.fn() })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HomeAssistantProvider hass={mockHass}>{children}</HomeAssistantProvider>
  )

  const command = { domain: 'cover', service: 'open_cover', entityId: 'cover.garage' }

  it('retains the identical command as retryable on a guarded failure', async () => {
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({
      success: false,
      error: 'Cover jammed',
    })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    expect(result.current.failedCommand).toBeNull()

    await act(async () => {
      await result.current.dispatchGuarded(command)
    })

    await waitFor(() =>
      expect(result.current.failedCommand).toEqual({ command, retryable: true })
    )
  })

  it('retains a pre-dispatch refusal as non-retryable', async () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.setValue('sensor.invalid', 100)
    })

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.failedCommand?.retryable).toBe(false)
  })

  it('drops the retention on clearError and on a new dispatch', async () => {
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({
      success: false,
      error: 'Cover jammed',
    })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.dispatchGuarded(command)
    })
    await waitFor(() => expect(result.current.failedCommand).not.toBeNull())

    act(() => {
      result.current.clearError()
    })
    expect(result.current.failedCommand).toBeNull()

    // A new dispatch clears the retention on entry, then retains its own
    // failure. Reset the guard so the second dispatch is admitted rather
    // than refused as a repeat of the first (the ambiguous-boundary case).
    resetDispatchGuard()
    await act(async () => {
      await result.current.dispatchGuarded(command)
    })
    await waitFor(() => expect(result.current.failedCommand).not.toBeNull())
  })
})
