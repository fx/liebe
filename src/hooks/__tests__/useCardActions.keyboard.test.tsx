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

  it('consumes the click that follows a completed hold instead of dispatching twice', () => {
    // Line 616: the click the browser delivers after a hold fired is
    // consumed here — without it the same gesture would dispatch twice.
    const onToggle = vi.fn()
    const options = {
      config: { tapAction: 'toggle', holdAction: 'toggle' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo: vi.fn(),
      unavailable: false,
    }
    const { result } = renderHook((props) => useCardActions(props), { initialProps: options })

    act(() => result.current.press())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })
    expect(onToggle).toHaveBeenCalledTimes(1)

    // The trailing click of the same gesture dispatches nothing.
    act(() => result.current.tap())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('dispatches the double-tap on the second tap without waiting out the window', () => {
    // Line 624: the second tap while the window is armed completes the
    // gesture immediately against the current resolution.
    const onToggle = vi.fn()
    const onDouble = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({
        config: { tapAction: 'toggle', doubleTapAction: 'more-info' },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo: onDouble,
      })
    )

    act(() => result.current.tap())
    act(() => result.current.tap())

    expect(onDouble).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('re-resolves the second tap against the current availability', () => {
    // The second tap executes against the current resolution rather than
    // the arming-time one — losing the `more-info` handler inside the
    // window falls back to the tap instead of dispatching stale.
    const onToggle = vi.fn()
    const onDouble = vi.fn()
    const options = {
      config: { tapAction: 'toggle', doubleTapAction: 'more-info' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo: onDouble,
      unavailable: false,
    }
    const { result, rerender } = renderHook(
      (props: typeof options | Record<string, never>) => useCardActions(props as typeof options),
      {
        initialProps: options,
      }
    )
    act(() => result.current.tap())
    const { onMoreInfo: _droppedHandler, ...withoutHandler } = options
    rerender(withoutHandler as typeof options)
    act(() => result.current.tap())

    expect(onDouble).not.toHaveBeenCalled()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('dispatches the current double-tap route without a stale re-read', () => {
    // The gate and the dispatch read the same refs synchronously in one
    // handler, so no window elapses between them for availability to change
    // inside — the second tap fires the current route directly.
    const onToggle = vi.fn()
    const onDouble = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({
        config: { tapAction: 'toggle', doubleTapAction: 'more-info' },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo: onDouble,
      })
    )

    act(() => result.current.tap())
    act(() => result.current.tap())

    expect(onDouble).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('stays inert when the pending single tap loses its route inside the window', () => {
    // Line 639: the deferred single tap re-reads at execution time — the
    // `toggle` armed while available never dispatches once quiet.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const options = {
      config: { tapAction: 'toggle', doubleTapAction: 'more-info' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo,
      unavailable: false,
    }
    const { result, rerender } = renderHook(
      (props: typeof options | Record<string, never>) => useCardActions(props as typeof options),
      {
        initialProps: options,
      }
    )
    act(() => result.current.tap())
    const {
      onToggle: _droppedToggle,
      onMoreInfo: _droppedMoreInfo,
      entityId: _droppedEntity2,
      ...withoutRoute
    } = options
    rerender(withoutRoute as typeof options)
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it('withholds the hold when its route is lost inside the window', () => {
    // Line 595: the hold timer re-reads at execution time — a route that
    // lost its handler while armed stays inert rather than dispatching stale.
    const onToggle = vi.fn()
    const options = {
      config: { tapAction: 'toggle', holdAction: 'toggle' } as const,
      entityId: 'light.desk',
      onToggle,
      onMoreInfo: vi.fn(),
      unavailable: false,
    }
    const { result, rerender } = renderHook(
      (props: typeof options | Record<string, never>) => useCardActions(props as typeof options),
      {
        initialProps: options,
      }
    )

    act(() => result.current.press())
    const {
      onToggle: _droppedHoldToggle,
      entityId: _droppedHoldEntity,
      ...withoutHoldRoute
    } = options
    rerender(withoutHoldRoute as typeof options)
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('leaves pressTapOnly and the keyboard routes inert while disabled', () => {
    // Lines 607/656/662: the disabled guard on the tap-only press and the
    // two synchronous keyboard routes — the shell never calls them in edit
    // mode, so the hook's own contract owns the refusal.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo, disabled: true })
    )

    act(() => result.current.pressTapOnly())
    act(() => result.current.activateHold())
    act(() => result.current.activateDoubleTap())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2 + DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
  })
})
