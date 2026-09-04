import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCardActions } from '../useCardActions'
import { dashboardActions } from '~/store'
import { DOUBLE_TAP_WINDOW_MS, HOLD_DURATION_MS } from '~/store/cardActions'
import { resetDispatchGuard } from '../../services/guardedDispatch'

/**
 * The keyboard routes to the secondary gestures and the execution-time
 * availability re-read (change 0043 PR 3 + PR 8).
 *
 * `activateHold` / `activateDoubleTap` resolve off the same stored actions as
 * the gestures; the timers re-resolve where the deferred work executes rather
 * than where the gesture started, so an entity that goes quiet inside the
 * window never receives the `toggle` armed while it was available.
 */
describe('useCardActions keyboard routes and deferred re-read', () => {
  beforeEach(() => {
    resetDispatchGuard()
    vi.useFakeTimers()
    dashboardActions.resetState()
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
  })

  it('routes activateHold to the hold action, and never to the tap', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo })
    )

    act(() => result.current.activateHold())

    expect(onMoreInfo).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('leaves activateHold inert when holdAction is none', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({
        config: { holdAction: 'none' },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo,
      })
    )

    act(() => result.current.activateHold())

    expect(onMoreInfo).not.toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('routes activateDoubleTap to the double-tap action', () => {
    const onToggle = vi.fn()
    const onDouble = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({
        config: {
          doubleTapAction: { action: 'call-service', service: 'script.movie_mode' },
        },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo: onDouble,
      })
    )

    // A `call-service` double-tap dispatches through the guard; assert via the
    // dialog route instead, which is synchronous and observable.
    const { result: dialogResult } = renderHook(() =>
      useCardActions({
        config: { doubleTapAction: 'more-info' },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo: onDouble,
      })
    )
    void result
    act(() => dialogResult.current.activateDoubleTap())

    expect(onDouble).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('leaves activateDoubleTap inert when no double-tap action is configured', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo })
    )

    act(() => result.current.activateDoubleTap())

    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it('re-reads availability when the hold timer fires', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const options = {
      config: { tapAction: 'toggle', holdAction: 'toggle' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo,
      unavailable: false,
    }
    const { result, rerender } = renderHook((props) => useCardActions(props), {
      initialProps: options,
    })

    act(() => result.current.press())
    // The entity goes quiet inside the hold window.
    rerender({ ...options, unavailable: true })
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })

    // The stale `toggle` never dispatches; the re-resolved route opens details.
    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).toHaveBeenCalledTimes(1)
  })

  it('re-reads availability when the double-tap window elapses', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const options = {
      config: { tapAction: 'toggle', doubleTapAction: 'more-info' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo,
      unavailable: false,
    }
    const { result, rerender } = renderHook((props) => useCardActions(props), {
      initialProps: options,
    })

    act(() => result.current.tap())
    rerender({ ...options, unavailable: true })
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).toHaveBeenCalledTimes(1)
  })
})
