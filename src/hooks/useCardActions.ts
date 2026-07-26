import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { hassService } from '../services/hassService'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { dashboardActions, dashboardStore } from '../store/dashboardStore'
import {
  DOUBLE_TAP_WINDOW_MS,
  HOLD_DURATION_MS,
  readCardAction,
  resolveCardAction,
  type ResolvedCardAction,
} from '../store/cardActions'
import type { ScreenConfig } from '../store/types'

export interface UseCardActionsOptions {
  /**
   * The card's stored options (`item.config`). The three action keys are read
   * and validated out of it; everything else is ignored.
   */
  config?: Record<string, unknown>
  /**
   * What the literal `default` resolves to for this card — the one thing a card
   * declares about actions. Interactive cards leave it at `toggle`; read-only
   * ones (sensor, weather, person) declare `more-info`.
   */
  defaultAction?: ResolvedCardAction
  /** Target of `toggle`'s fallback and of a `call-service` without an explicit target. */
  entityId?: string
  /**
   * The card family's own toggle semantics, including any confirmation gate its
   * options impose. `toggle` routes here when a card provides it, precisely so a
   * re-routed action cannot slip past a gate the card enforces; only a card that
   * defines no toggle falls back to `homeassistant.toggle`.
   */
  onToggle?: () => void
  /**
   * Opens the entity detail dialog. The dialog itself arrives with 0014 PR 2 —
   * until then `more-info` resolves and finds nothing to call, which is why it
   * is not treated as actionable without a handler.
   */
  onMoreInfo?: () => void
  /**
   * Suppresses every action. Edit mode passes `true`: a press there selects and
   * drags a card, it does not operate the device.
   */
  disabled?: boolean
}

export interface CardGestures {
  /**
   * Whether a tap would actually do something — what the shell's cursor reads,
   * so a card whose tap resolves to `none` (or to an action with nothing behind
   * it) does not advertise a press that goes nowhere.
   */
  hasTapAction: boolean
  /** A completed click on the card body, already past the shell's portal guard. */
  tap: () => void
  /** Pointer down on the card body — arms hold detection. */
  press: () => void
  /** Pointer up, cancel, or leave — disarms hold detection. */
  release: () => void
}

/** Screens are a tree, and a `navigate` target may be either identifier. */
export function findScreenByIdOrSlug(
  screens: ScreenConfig[],
  target: string
): ScreenConfig | undefined {
  for (const screen of screens) {
    if (screen.id === target || screen.slug === target) return screen
    if (screen.children) {
      const found = findScreenByIdOrSlug(screen.children, target)
      if (found) return found
    }
  }
  return undefined
}

/**
 * The card shell's gesture controller: tap / press-and-hold / double-tap
 * recognition, resolution of each gesture's configured action, and dispatch.
 *
 * It lives here — one controller behind the shell — rather than in the cards, so
 * per-card changes never touch gesture code (docs/changes/0014, "Design
 * Decisions"). Cards contribute two things and no more: what their `default`
 * resolves to, and how *they* toggle.
 *
 * Two rules shape the state machine:
 *  - **A hold must not also fire a tap.** The hold timer sets a flag that the
 *    click which follows the release consumes. The flag is reset at the start of
 *    every press, so a touch gesture that never produces a click (as a long
 *    press often does not) cannot leave it armed to swallow the next real tap.
 *  - **Tap stays immediate unless a double tap is actually configured.** Only
 *    then does a tap wait out `DOUBLE_TAP_WINDOW_MS` to find out which gesture
 *    it was; with the `none` default, nothing is delayed.
 */
export function useCardActions({
  config,
  defaultAction = 'toggle',
  entityId,
  onToggle,
  onMoreInfo,
  disabled = false,
}: UseCardActionsOptions): CardGestures {
  const hass = useHomeAssistantOptional()
  // `warn: false` returns `undefined` outside a `RouterProvider` instead of
  // logging: the shell renders in tests and in Storybook with no router, and a
  // card that cannot navigate is not a card that should fail to render. Reading
  // the router through the hook also keeps the shell from importing the router
  // module, which would close a cycle back through the route tree.
  const router = useRouter({ warn: false })

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdFiredRef = useRef(false)

  const actions = useMemo(
    () => ({
      tap: resolveCardAction(readCardAction(config, 'tapAction'), defaultAction),
      hold: resolveCardAction(readCardAction(config, 'holdAction'), defaultAction),
      doubleTap: resolveCardAction(readCardAction(config, 'doubleTapAction'), defaultAction),
    }),
    [config, defaultAction]
  )

  /**
   * Whether an action has anything behind it. `toggle` needs either the card's
   * own toggle or an entity to fall back on; `more-info` needs the dialog
   * handler. An action that is not actionable is not merely a no-op at dispatch
   * time — it must not arm a hold timer or delay a tap either.
   */
  const isActionable = useCallback(
    (action: ResolvedCardAction): boolean => {
      if (action === 'none') return false
      if (action === 'toggle') return Boolean(onToggle || entityId)
      if (action === 'more-info') return Boolean(onMoreInfo)
      return true
    },
    [entityId, onMoreInfo, onToggle]
  )

  const dispatch = useCallback(
    (action: ResolvedCardAction) => {
      if (hass) hassService.setHass(hass)

      if (action === 'none') return

      if (action === 'toggle') {
        if (onToggle) {
          onToggle()
          return
        }
        if (entityId) {
          // The generic alias, deliberately: a card with no toggle semantics of
          // its own has no gate to bypass, and `homeassistant.toggle` is what
          // the contract names as the fallback.
          void hassService.callServiceOnce({ domain: 'homeassistant', service: 'toggle', entityId })
        }
        return
      }

      if (action === 'more-info') {
        onMoreInfo?.()
        return
      }

      if (action.action === 'navigate') {
        const screen = findScreenByIdOrSlug(dashboardStore.state.screens, action.target)
        // A target that no longer resolves navigates nowhere rather than to a
        // dead route — screens can be deleted after an action was configured.
        if (!screen) return

        dashboardActions.setCurrentScreen(screen.id)
        router?.navigate({ to: '/$slug', params: { slug: screen.slug } })
        return
      }

      const [domain, service] = action.service.split('.')
      void hassService.callServiceOnce({ domain, service, entityId, data: action.data })
    },
    [entityId, hass, onMoreInfo, onToggle, router]
  )

  const clearTapTimer = useCallback(() => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
      tapTimerRef.current = null
    }
  }, [])

  const release = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const press = useCallback(() => {
    if (disabled) return

    holdFiredRef.current = false
    release()

    if (!isActionable(actions.hold)) return

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null
      holdFiredRef.current = true
      // A hold ends whatever the previous click started: if this press was the
      // second half of a would-be double tap, the pending single tap is gone.
      clearTapTimer()
      dispatch(actions.hold)
    }, HOLD_DURATION_MS)
  }, [actions.hold, clearTapTimer, disabled, dispatch, isActionable, release])

  const tap = useCallback(() => {
    if (disabled) return

    if (holdFiredRef.current) {
      // The click that follows a completed hold. Consumed here, so the same
      // gesture cannot dispatch twice.
      holdFiredRef.current = false
      return
    }

    if (isActionable(actions.doubleTap)) {
      if (tapTimerRef.current) {
        clearTapTimer()
        dispatch(actions.doubleTap)
        return
      }

      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null
        dispatch(actions.tap)
      }, DOUBLE_TAP_WINDOW_MS)
      return
    }

    dispatch(actions.tap)
  }, [actions, clearTapTimer, disabled, dispatch, isActionable])

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    }
  }, [])

  return {
    hasTapAction: !disabled && isActionable(actions.tap),
    tap,
    press,
    release,
  }
}
