import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { hassService } from '../services/hassService'
import { logger } from '../utils/logger'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { dashboardActions, dashboardStore } from '../store/dashboardStore'
import { entityStore } from '../store/entityStore'
import {
  ACKNOWLEDGEMENT_TIMEOUT_MS,
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
   * The entity's state is `unavailable` or `unknown`, which makes `toggle`
   * inert: a card must never actuate a device whose direction it cannot know —
   * an indeterminate RF cover is the case the rule exists for. Everything else
   * stays available, because opening the details of an unavailable entity is
   * precisely what a user reaches for when one goes quiet.
   */
  unavailable?: boolean
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
  unavailable = false,
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
  const pendingRef = useRef<{ command: string; until: number; lastUpdated?: string } | null>(null)

  /**
   * Dispatch a consequential command, at most once until it is known to have
   * landed.
   *
   * The gesture controller already fires once per gesture; this is the guard for
   * the gesture *after* it. Home Assistant acknowledges before a slow
   * integration updates state, so a card that reopened on promise resolution
   * would let a second press through while the first was still in flight —
   * which for `button.press`, a script, or a motor is the command running
   * twice. The window reopens on whichever comes first: the entity's
   * `last_updated` moving (it landed) or `ACKNOWLEDGEMENT_TIMEOUT_MS` elapsing
   * (it may never move, and the card must not be stuck).
   *
   * Keyed by service *and* entity, not by entity alone: a different command on
   * the same device is a different intent, and the one most likely to arrive
   * while the first is still in flight is the inverse — stopping a cover that is
   * moving too far. Blocking that would be the exact opposite of safe.
   */
  const dispatchService = useCallback(
    (options: {
      domain: string
      service: string
      entityId?: string
      data?: Record<string, unknown>
    }) => {
      // The effective target, not the card's: explicit `data.entity_id` wins at
      // dispatch (`buildServiceData`), so watching the card's entity would watch
      // the wrong thing move — a lively sensor would keep reopening the window
      // on a `button.press` aimed elsewhere.
      const explicit = options.data?.entity_id
      const target = typeof explicit === 'string' ? explicit : options.entityId
      const lastUpdatedOf = (id: string) => entityStore.state.entities[id]?.last_updated

      if (target) {
        // The payload is part of the command's identity: `set_cover_position` to
        // 100 and to 0 are the same service and opposite intents, and the second
        // is the reversal that must not be swallowed.
        const command = `${options.domain}.${options.service}:${target}:${JSON.stringify(options.data ?? null)}`
        const pending = pendingRef.current
        if (
          pending &&
          pending.command === command &&
          Date.now() < pending.until &&
          lastUpdatedOf(target) === pending.lastUpdated
        ) {
          return
        }
        pendingRef.current = {
          command,
          until: Date.now() + ACKNOWLEDGEMENT_TIMEOUT_MS,
          lastUpdated: lastUpdatedOf(target),
        }
      }

      void hassService.callServiceOnce(options).then((result) => {
        if (!result.success) {
          // The card's own error surface belongs to whatever issued the command
          // — a control knows it is loading, the shell does not. What the shell
          // owes a failed *action* is that it not vanish silently.
          //
          // The resolved target, for the same reason the pending window keys off
          // it: a `call-service` action may aim at another entity entirely, and a
          // failure report naming the card's own entity points the person
          // diagnosing it at the wrong device.
          logger.error(
            `Card action ${options.domain}.${options.service} failed: ${result.error}`,
            target
          )
        }
      })
    },
    []
  )

  /*
   * An unavailable entity resolves `default` to the detail dialog whatever the
   * card declares, which is both halves of the same rule: a card must not
   * actuate a device whose state is indeterminate, and "why has this gone
   * quiet?" is precisely what the gesture is for at that moment. Kept here
   * rather than declared again in each card's unavailable branch — every card
   * has one, and one that forgot would fall through to a toggle.
   */
  const effectiveDefault: ResolvedCardAction = unavailable ? 'more-info' : defaultAction

  const actions = useMemo(
    () => ({
      tap: resolveCardAction(readCardAction(config, 'tapAction'), effectiveDefault),
      hold: resolveCardAction(readCardAction(config, 'holdAction'), effectiveDefault),
      doubleTap: resolveCardAction(readCardAction(config, 'doubleTapAction'), effectiveDefault),
    }),
    [config, effectiveDefault]
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
      if (action === 'toggle') return !unavailable && Boolean(onToggle || entityId)
      if (action === 'more-info') return Boolean(onMoreInfo)
      return true
    },
    [entityId, onMoreInfo, onToggle, unavailable]
  )

  const dispatch = useCallback(
    (action: ResolvedCardAction) => {
      if (hass) hassService.setHass(hass)

      if (action === 'none') return

      if (action === 'toggle') {
        if (unavailable) return
        if (onToggle) {
          onToggle()
          return
        }
        if (entityId) {
          // The generic alias, deliberately: a card with no toggle semantics of
          // its own has no gate to bypass, and `homeassistant.toggle` is what
          // the contract names as the fallback.
          dispatchService({ domain: 'homeassistant', service: 'toggle', entityId })
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
      dispatchService({ domain, service, entityId, data: action.data })
    },
    [dispatchService, entityId, hass, onMoreInfo, onToggle, router, unavailable]
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

  /*
   * Suppression has to reach the gestures already in flight, not only the ones
   * that start afterwards: a tap waiting out the double-tap window when the user
   * switches to edit mode would otherwise still dispatch a quarter of a second
   * into a mode where nothing may.
   */
  useEffect(() => {
    if (!disabled) return

    release()
    clearTapTimer()
    holdFiredRef.current = false
  }, [clearTapTimer, disabled, release])

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
