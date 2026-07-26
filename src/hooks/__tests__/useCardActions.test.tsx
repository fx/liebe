import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCardActions, findScreenByIdOrSlug } from '../useCardActions'
import { dashboardActions, dashboardStore } from '~/store'
import {
  ACKNOWLEDGEMENT_TIMEOUT_MS,
  DOUBLE_TAP_WINDOW_MS,
  HOLD_DURATION_MS,
} from '~/store/cardActions'
import { entityStore } from '~/store/entityStore'
import { hassService } from '~/services/hassService'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { ScreenConfig } from '~/store/types'

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
    // must not sit on a timer either.
    const { result } = renderHook(() => useCardActions({ entityId: 'light.desk' }))

    act(() => result.current.press())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })
    // The tap that follows is unaffected by the press that did nothing.
    act(() => result.current.release())
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

    it('does not hold back a call that targets nothing of its own', () => {
      // With no entity to watch there is no transition to wait for, so the
      // window would never open on evidence — only on the timeout.
      const { result } = renderHook(() =>
        useCardActions({
          config: {
            tapAction: {
              action: 'call-service',
              service: 'script.turn_on',
              data: { entity_id: 'script.bedtime' },
            },
          },
        })
      )

      act(() => result.current.tap())
      act(() => result.current.tap())

      expect(hass.callService).toHaveBeenCalledTimes(2)
    })
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
