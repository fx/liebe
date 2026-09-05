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

    await waitFor(() => expect(result.current.failedCommand).toEqual({ command, retryable: true }))
  })

  it('retains a code-bearing failure as non-retryable so Retry cannot replay it', async () => {
    // CodeRabbit Major on cardActions.ts:183 — a failed keypad command must
    // not sit in React state re-submittable through generic `Retry` after the
    // keypad closes. The error still surfaces; only the re-dispatch is
    // withheld, and the user enters a fresh code for a new command.
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({
      success: false,
      error: 'Invalid code',
    })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.dispatchGuarded({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: 'alarm_control_panel.house',
        data: { code: '1234' },
      })
    })

    await waitFor(() => expect(result.current.failedCommand).not.toBeNull())
    expect(result.current.failedCommand?.retryable).toBe(false)
    expect(result.current.error).toBe('Invalid code')
  })

  it('keeps retrying a codeless failure on the same entity', async () => {
    // The other half of the credential rule: withholding `Retry` must not
    // leak onto the codeless path — an armless code_format panel still
    // retries its plain commands.
    vi.mocked(hassService.callServiceOnce).mockResolvedValue({
      success: false,
      error: 'Panel busy',
    })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    await act(async () => {
      await result.current.dispatchGuarded({
        domain: 'alarm_control_panel',
        service: 'alarm_arm_away',
        entityId: 'alarm_control_panel.house',
      })
    })

    await waitFor(() =>
      expect(result.current.failedCommand).toEqual({
        command: {
          domain: 'alarm_control_panel',
          service: 'alarm_arm_away',
          entityId: 'alarm_control_panel.house',
        },
        retryable: true,
      })
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

  it('keeps the newer failure when an aborted request settles out of order', async () => {
    // Two overlapping guarded commands: the older request aborts when the
    // newer starts, then settles later. Its failure must not overwrite the
    // newer request's retention — otherwise `Retry` would re-dispatch the
    // older command.
    const newer = { domain: 'light', service: 'turn_on', entityId: 'light.desk' }
    type GateResult = { success: boolean; error?: string }
    const deferred = () => {
      let resolve!: (r: GateResult) => void
      const promise = new Promise<GateResult>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }
    const gates = { cover: deferred(), light: deferred() }
    vi.mocked(hassService.callServiceOnce).mockImplementation(
      (options: { domain: string; service: string }) =>
        options.domain === 'cover' ? gates.cover.promise : gates.light.promise
    )
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let older: Promise<unknown> | undefined
    let latest: Promise<unknown> | undefined
    act(() => {
      older = result.current.dispatchGuarded(command)
      latest = result.current.dispatchGuarded(newer)
    })

    // The newer request fails first and retains its own command.
    await act(async () => {
      gates.light.resolve({ success: false, error: 'Desk jammed' })
      await latest
    })
    await waitFor(() =>
      expect(result.current.failedCommand).toEqual({ command: newer, retryable: true })
    )

    // The aborted older request settles later with its own failure. It must
    // not clobber the newer retention.
    await act(async () => {
      gates.cover.resolve({ success: false, error: 'Cover jammed' })
      await older
    })
    expect(result.current.failedCommand).toEqual({ command: newer, retryable: true })
    expect(result.current.error).toBe('Desk jammed')
  })

  it('keeps currency when Retry reuses the retained options object', async () => {
    // The `Retry` path re-dispatches `failedCommand.command` — the SAME object
    // — so currency by reference equality would call the older call current
    // and let it clobber the newer retention. The dispatch id distinguishes
    // the two calls regardless of object reuse.
    const shared = { domain: 'switch', service: 'toggle', entityId: 'switch.desk' }
    const gate = (key: string) => {
      let resolve!: (r: { success: boolean; error?: string }) => void
      const promise = new Promise<{ success: boolean; error?: string }>((res) => {
        resolve = res
      })
      return { key, promise, resolve }
    }
    const first = gate('first')
    const second = gate('second')
    const calls: Array<{
      promise: Promise<{ success: boolean; error?: string }>
      resolve: (r: { success: boolean; error?: string }) => void
    }> = [first, second]
    vi.mocked(hassService.callServiceOnce).mockImplementation(() => {
      const next = calls.shift()
      if (!next) throw new Error('unexpected third dispatch')
      return next.promise
    })
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    resetDispatchGuard()
    let older: Promise<unknown> | undefined
    act(() => {
      older = result.current.dispatchGuarded(shared)
    })
    resetDispatchGuard()
    let latest: Promise<unknown> | undefined
    act(() => {
      latest = result.current.dispatchGuarded(shared)
    })

    await act(async () => {
      second.resolve({ success: false, error: 'second failed' })
      await latest
    })
    await waitFor(() =>
      expect(result.current.failedCommand).toEqual({ command: shared, retryable: true })
    )
    expect(result.current.error).toBe('second failed')

    await act(async () => {
      first.resolve({ success: false, error: 'first failed' })
      await older
    })
    // Same object, older call: still must not clobber.
    expect(result.current.failedCommand).toEqual({ command: shared, retryable: true })
    expect(result.current.error).toBe('second failed')
  })

  it('surfaces a dispatch that throws instead of returning a failure', async () => {
    // Line 162/165: the reshaped `runCall` catch — a transport throw becomes
    // a failed result with the thrown message, rather than an unhandled
    // rejection. Non-Error throws degrade to 'Unknown error'.
    vi.mocked(hassService.callServiceOnce).mockRejectedValueOnce(new Error('socket hiccup'))
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.dispatchGuarded(command)
    })

    expect(outcome).toEqual({ success: false, error: 'socket hiccup' })
    await waitFor(() => expect(result.current.error).toBe('socket hiccup'))
  })

  it('degrades a non-Error throw to Unknown error', async () => {
    // Line 165, the other arm: a transport that rejects with a bare value
    // still surfaces as a failed result rather than escaping.
    resetDispatchGuard()
    vi.mocked(hassService.callServiceOnce).mockRejectedValueOnce('cable cut')
    const { result } = renderHook(() => useServiceCall(), { wrapper })

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.dispatchGuarded(command)
    })

    expect(outcome).toEqual({ success: false, error: 'Unknown error' })
    await waitFor(() => expect(result.current.error).toBe('Unknown error occurred'))
  })
})
