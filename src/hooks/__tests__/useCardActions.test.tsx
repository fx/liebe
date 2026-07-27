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
