import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCardActions, findScreenByIdOrSlug } from '../useCardActions'
import type { UseCardActionsOptions } from '../useCardActions'
import { dashboardActions, dashboardStore } from '~/store'
import {
  ACKNOWLEDGEMENT_TIMEOUT_MS,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_DURATION_MS,
} from '~/store/cardActions'
import { entityStore } from '~/store/entityStore'
import { hassService } from '~/services/hassService'
import { logger } from '~/utils/logger'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { ScreenConfig } from '~/store/types'
import { resetDispatchGuard } from '../../services/guardedDispatch'

/**
 * The gesture controller's own edges — the ones the card shell cannot reach
 * because it guards them first, plus the screen lookup a `navigate` target goes
 * through. The behavior a user can see is covered through the shell in
 * `components/__tests__/GridCard.actions.test.tsx`.
 */
describe('findScreenByIdOrSlug', () => {
  const screens: ScreenConfig[] = [
    {
      id: 'screen-1',
      name: 'Home',
      slug: 'home',
      type: 'grid',
      children: [
        { id: 'screen-2', name: 'Bedroom', slug: 'bedroom', type: 'grid' },
        {
          id: 'screen-3',
          name: 'Ensuite',
          slug: 'ensuite',
          type: 'grid',
          children: [{ id: 'screen-4', name: 'Shower', slug: 'shower', type: 'grid' }],
        },
      ],
    },
  ]

  it('matches either identifier at the top level', () => {
    expect(findScreenByIdOrSlug(screens, 'home')?.id).toBe('screen-1')
    expect(findScreenByIdOrSlug(screens, 'screen-1')?.slug).toBe('home')
  })

  it('descends into children, and into their children', () => {
    expect(findScreenByIdOrSlug(screens, 'bedroom')?.id).toBe('screen-2')
    expect(findScreenByIdOrSlug(screens, 'shower')?.id).toBe('screen-4')
  })

  it('returns nothing for a target no screen answers to', () => {
    expect(findScreenByIdOrSlug(screens, 'garage')).toBeUndefined()
    expect(findScreenByIdOrSlug([], 'home')).toBeUndefined()
  })
})

describe('useCardActions', () => {
  beforeEach(() => {
    // The dispatch guard is process-wide, so one case's pending window would
    // otherwise carry into the next.
    resetDispatchGuard()
    vi.useFakeTimers()
    dashboardActions.resetState()
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
  })

  it('refuses a tap while disabled', () => {
    // The shell routes an edit-mode click to selection and never calls `tap`,
    // so this guard belongs to the hook's own contract rather than to the card.
    const onToggle = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({ entityId: 'light.desk', onToggle, disabled: true })
    )

    act(() => result.current.tap())
    expect(onToggle).not.toHaveBeenCalled()
    expect(result.current.hasTapAction).toBe(false)
  })

  it('has nothing to toggle without a card toggle or an entity', () => {
    const { result } = renderHook(() => useCardActions({ config: { tapAction: 'toggle' } }))

    expect(result.current.hasTapAction).toBe(false)
    // Still safe to call — it simply finds nothing to dispatch.
    act(() => result.current.tap())
  })

  it('drops a pending single tap when the card goes away mid-gesture', () => {
    // The first click of a possible double tap leaves a timer running. If it
    // outlived the card it would dispatch into an unmounted tree.
    const onToggle = vi.fn()
    const { result, unmount } = renderHook(() =>
      useCardActions({
        config: { doubleTapAction: 'more-info' },
        entityId: 'light.desk',
        onToggle,
        onMoreInfo: vi.fn(),
      })
    )

    act(() => result.current.tap())
    unmount()
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('does not arm a hold timer for an action with nothing behind it', () => {
    // `more-info` before the detail dialog exists: nothing to open, so a press
    // must not sit on a timer either — and, crucially, must not consume the tap
    // that follows the way a fired hold does.
    const onToggle = vi.fn()
    const { result } = renderHook(() => useCardActions({ entityId: 'light.desk', onToggle }))

    act(() => result.current.press())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })
    act(() => result.current.release())
    act(() => result.current.tap())

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  /*
   * A card family whose `toggle` means "open the details" (issue #260).
   *
   * The shell owns the dialog, so the card names the resolution and the shell
   * performs it — a card that passed its own `onMoreInfo` would REPLACE the
   * shell's opener rather than borrow it, which is what made the obvious route
   * wrong.
   */
  describe('a toggle that resolves to more-info', () => {
    it('opens the dialog when the card asks for it, and dispatches nothing', () => {
      const onMoreInfo = vi.fn()
      const onToggle = vi.fn(() => 'more-info' as const)
      const callService = vi.fn()
      hassService.setHass(createMockHomeAssistant({ callService }))

      const { result } = renderHook(() =>
        useCardActions({ entityId: 'lock.front_door', onToggle, onMoreInfo, config: {} })
      )

      act(() => result.current.tap())

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onMoreInfo).toHaveBeenCalledTimes(1)
      // The dialog instead of the device: no service may leave on this route.
      expect(callService).not.toHaveBeenCalled()
    })

    it('leaves a toggle that returns nothing alone', () => {
      const onMoreInfo = vi.fn()
      const onToggle = vi.fn()

      const { result } = renderHook(() =>
        useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo })
      )

      act(() => result.current.tap())

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onMoreInfo).not.toHaveBeenCalled()
    })

    it('does not mistake an async toggle for a request to open the dialog', () => {
      // `Promise<void>` is what several cards already return. It is not the
      // string, and nothing here awaits it.
      const onMoreInfo = vi.fn()
      const onToggle = vi.fn(async () => {})

      const { result } = renderHook(() =>
        useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo })
      )

      act(() => result.current.tap())

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onMoreInfo).not.toHaveBeenCalled()
    })
  })

  it('logs a failed action rather than swallowing it', async () => {
    const hass = createMockHomeAssistant({
      callService: vi.fn().mockRejectedValue(new Error('not authorised')),
    })
    hassService.setHass(hass)
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useCardActions({
        entityId: 'button.doorbell',
        config: { tapAction: { action: 'call-service', service: 'button.press' } },
      })
    )

    act(() => result.current.tap())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('button.press failed: not authorised'),
      'button.doorbell'
    )
    error.mockRestore()
  })

  it('names the action’s real target in the failure log, not the card’s entity', async () => {
    // `data.entity_id` wins at dispatch, so it is the entity that actually
    // failed. A report naming the card's own entity points whoever is diagnosing
    // it at a device that was never asked to do anything.
    const hass = createMockHomeAssistant({
      callService: vi.fn().mockRejectedValue(new Error('not authorised')),
    })
    hassService.setHass(hass)
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useCardActions({
        entityId: 'button.doorbell',
        config: {
          tapAction: {
            action: 'call-service',
            service: 'light.turn_on',
            data: { entity_id: 'light.hall' },
          },
        },
      })
    )

    act(() => result.current.tap())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('light.turn_on failed: not authorised'),
      'light.hall'
    )
    error.mockRestore()
  })

  /**
   * The routes a card's *default* cannot cover, which is where the defect lived
   * (change 0043). A stored `toggle` never consults what `default` resolves to,
   * so a redirect that only rewrote the default left every stored one
   * suppressed at dispatch: nothing was sent, and nothing was opened either —
   * the tap did nothing at all. At `glance`, where the tap is the only
   * affordance a card has, that is the operability regression the design system
   * forbids.
   *
   * Each case asserts BOTH halves. "Nothing dispatched" alone cannot fail here:
   * it was already true of the broken code, which is exactly why the defect
   * survived. What distinguishes the two is whether the gesture arrives
   * somewhere.
   */
  describe('a toggle route on an unavailable entity', () => {
    /*
     * Tap and hold only. Naming `doubleTapAction` as well would make the
     * double-tap route actionable, and `tap()` then waits out the double-tap
     * window instead of dispatching — which reads as "the redirect did not
     * work". The double-tap route is covered on its own below, where the timer
     * is advanced deliberately.
     */
    const stored = { tapAction: 'toggle', holdAction: 'toggle' } as const

    function unavailableCard() {
      const onToggle = vi.fn()
      const onMoreInfo = vi.fn()
      const rendered = renderHook(() =>
        useCardActions({
          config: stored,
          entityId: 'light.desk',
          onToggle,
          onMoreInfo,
          unavailable: true,
        })
      )
      return { onToggle, onMoreInfo, result: rendered.result }
    }

    it('sends a stored tapAction to the detail dialog', () => {
      const { onToggle, onMoreInfo, result } = unavailableCard()

      act(() => result.current.tap())

      expect(onMoreInfo).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('sends a stored holdAction there too', () => {
      const { onToggle, onMoreInfo, result } = unavailableCard()

      act(() => result.current.press())
      act(() => vi.advanceTimersByTime(HOLD_DURATION_MS))

      expect(onMoreInfo).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('sends a stored doubleTapAction there as well', () => {
      const onToggle = vi.fn()
      const onMoreInfo = vi.fn()
      const { result } = renderHook(() =>
        useCardActions({
          config: { ...stored, doubleTapAction: 'toggle' },
          entityId: 'light.desk',
          onToggle,
          onMoreInfo,
          unavailable: true,
        })
      )

      // Two taps inside the window is the double-tap gesture.
      act(() => result.current.tap())
      act(() => result.current.tap())

      expect(onMoreInfo).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('reports the tile as having a tap action, so the shell arms the gesture', () => {
      // The observable that made the old behaviour visible: a suppressed route
      // is not actionable, so the shell rendered the tile as inert — no pointer
      // cursor, no armed hold timer. A redirected one is actionable.
      const { result } = unavailableCard()

      expect(result.current.hasTapAction).toBe(true)
    })

    it('never consults the card while the entity is unavailable', () => {
      /*
       * The safety half, and the reason the redirect belongs at resolution
       * rather than at dispatch. The alternative — ask the card first and
       * honour a `'more-info'` return, the way the capability gates do — would
       * make "no actuation of an indeterminate device" depend on every card
       * answering correctly. A card whose handler dispatches would actuate.
       */
      const onToggle = vi.fn(() => {
        throw new Error('the card must not be asked')
      })
      const onMoreInfo = vi.fn()
      const { result } = renderHook(() =>
        useCardActions({
          config: stored,
          entityId: 'light.desk',
          onToggle,
          onMoreInfo,
          unavailable: true,
        })
      )

      expect(() => act(() => result.current.tap())).not.toThrow()
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('still toggles the same card once the entity is available again', () => {
      // The positive control. Without it every assertion above is satisfied by
      // a hook that had simply stopped resolving anything.
      const onToggle = vi.fn()
      const onMoreInfo = vi.fn()
      const { result } = renderHook(() =>
        useCardActions({
          config: stored,
          entityId: 'light.desk',
          onToggle,
          onMoreInfo,
          unavailable: false,
        })
      )

      act(() => result.current.tap())

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onMoreInfo).not.toHaveBeenCalled()
    })

    it('leaves a non-toggle route alone', () => {
      /*
       * The redirect is scoped to `toggle`, which is what the rule has always
       * said: unavailability makes a *toggle* inert and leaves everything else
       * available. A configured `call-service` still dispatches — widening the
       * redirect to cover it would be a different decision, and not this one.
       */
      const hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
      hassService.setHass(hass)
      const onMoreInfo = vi.fn()
      const { result } = renderHook(() =>
        useCardActions({
          config: { tapAction: { action: 'call-service', service: 'script.reset_hub' } },
          entityId: 'light.desk',
          onMoreInfo,
          unavailable: true,
        })
      )

      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledWith('script', 'reset_hub', {
        entity_id: 'light.desk',
      })
      expect(onMoreInfo).not.toHaveBeenCalled()
    })
  })

  it('resolves `default` to the detail dialog while the entity is unavailable', () => {
    // Whatever the card declares: a card must not actuate a device whose state
    // is indeterminate, and "why has this gone quiet?" is what the gesture is
    // for at that moment.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const { result } = renderHook(() =>
      useCardActions({ entityId: 'light.desk', onToggle, onMoreInfo, unavailable: true })
    )

    act(() => result.current.tap())

    expect(onMoreInfo).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  /**
   * The at-most-once guarantee, one gesture out. Home Assistant acknowledges a
   * service call before slow integrations update state, so a card that reopened
   * its dispatch on promise resolution would run a `button.press` twice for a
   * user who pressed twice while nothing appeared to happen.
   */
  describe('acknowledgement window', () => {
    const pressAction = {
      tapAction: { action: 'call-service' as const, service: 'button.press' },
    }

    function seedEntity(lastUpdated: string) {
      entityStore.setState((state) => ({
        ...state,
        entities: {
          'button.doorbell': {
            entity_id: 'button.doorbell',
            state: 'unknown',
            attributes: {},
            last_changed: lastUpdated,
            last_updated: lastUpdated,
            context: { id: 'ctx', parent_id: null, user_id: null },
          },
        },
      }))
    }

    let hass: ReturnType<typeof createMockHomeAssistant>

    beforeEach(() => {
      hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
      hassService.setHass(hass)
      seedEntity('2024-01-01T00:00:00Z')
    })

    afterEach(() => {
      entityStore.setState((state) => ({ ...state, entities: {} }))
    })

    it('drops a repeat command while the first has not visibly landed', () => {
      const { result } = renderHook(() =>
        useCardActions({ config: pressAction, entityId: 'button.doorbell' })
      )

      act(() => result.current.tap())
      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledTimes(1)
    })

    it('reopens as soon as the entity transitions', () => {
      const { result } = renderHook(() =>
        useCardActions({ config: pressAction, entityId: 'button.doorbell' })
      )

      act(() => result.current.tap())
      seedEntity('2024-01-01T00:00:05Z')
      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledTimes(2)
    })

    it('reopens once the acknowledgement timeout elapses, transition or not', () => {
      // Some commands never move the entity at all; the card must not be stuck
      // waiting for a transition that is not coming.
      const { result } = renderHook(() =>
        useCardActions({ config: pressAction, entityId: 'button.doorbell' })
      )

      act(() => result.current.tap())
      act(() => {
        vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
      })
      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledTimes(2)
    })

    it('does not hold back a different command on the same entity', () => {
      // The command most likely to arrive while the first is still in flight is
      // the inverse — stopping a cover that is moving too far. Blocking that
      // would be the exact opposite of safe.
      const { result } = renderHook(() =>
        useCardActions({
          config: {
            tapAction: { action: 'call-service', service: 'cover.open_cover' },
            holdAction: { action: 'call-service', service: 'cover.stop_cover' },
          },
          entityId: 'button.doorbell',
        })
      )

      act(() => result.current.tap())
      act(() => result.current.press())
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS)
      })

      expect(hass.callService).toHaveBeenCalledTimes(2)
      expect(hass.callService).toHaveBeenNthCalledWith(1, 'cover', 'open_cover', {
        entity_id: 'button.doorbell',
      })
      expect(hass.callService).toHaveBeenNthCalledWith(2, 'cover', 'stop_cover', {
        entity_id: 'button.doorbell',
      })
    })

    it('watches the target the call actually names, not the card’s entity', () => {
      // Explicit `data.entity_id` wins at dispatch, so it is what the window has
      // to watch: guarding the card's own entity would let a lively sensor
      // reopen a `button.press` aimed somewhere else.
      const { result } = renderHook(() =>
        useCardActions({
          entityId: 'sensor.hallway',
          config: {
            tapAction: {
              action: 'call-service',
              service: 'button.press',
              data: { entity_id: 'button.doorbell' },
            },
          },
        })
      )

      act(() => result.current.tap())
      act(() => result.current.tap())
      expect(hass.callService).toHaveBeenCalledTimes(1)

      // The sensor moving is not the button having been pressed.
      entityStore.setState((state) => ({
        ...state,
        entities: {
          ...state.entities,
          'sensor.hallway': {
            entity_id: 'sensor.hallway',
            state: '21.6',
            attributes: {},
            last_changed: '2024-01-01T00:00:09Z',
            last_updated: '2024-01-01T00:00:09Z',
            context: { id: 'ctx', parent_id: null, user_id: null },
          },
        },
      }))
      act(() => result.current.tap())
      expect(hass.callService).toHaveBeenCalledTimes(1)
    })

    it('does not hold back a call that names no target at all', () => {
      // With nothing to watch there is no transition to wait for, and holding
      // the path shut on a timeout alone would block a service the card cannot
      // observe — a scene or a notification.
      const { result } = renderHook(() =>
        useCardActions({
          config: { tapAction: { action: 'call-service', service: 'notify.persistent' } },
        })
      )

      act(() => result.current.tap())
      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledTimes(2)
    })
  })

  it('cancels a gesture already in flight when suppression starts', () => {
    // A tap waiting out the double-tap window when the user switches to edit
    // mode would otherwise still dispatch a quarter of a second into a mode
    // where nothing may.
    const onToggle = vi.fn()
    const options: UseCardActionsOptions = {
      config: { doubleTapAction: 'more-info' },
      entityId: 'light.desk',
      onToggle,
      onMoreInfo: vi.fn(),
    }
    const { result, rerender } = renderHook((props) => useCardActions(props), {
      initialProps: options,
    })

    act(() => result.current.tap())
    rerender({ ...options, disabled: true })
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('navigates to a nested screen by slug', () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Home', slug: 'home', type: 'grid' })
    dashboardActions.addScreen(
      { id: 'screen-2', name: 'Bedroom', slug: 'bedroom', type: 'grid' },
      'screen-1'
    )

    const { result } = renderHook(() =>
      useCardActions({ config: { tapAction: { action: 'navigate', target: 'bedroom' } } })
    )

    act(() => result.current.tap())
    expect(dashboardStore.state.currentScreenId).toBe('screen-2')
  })
})
