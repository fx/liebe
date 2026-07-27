import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { hassService } from '../services/hassService'
import { logger } from '../utils/logger'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { dashboardActions, dashboardStore } from '../store/dashboardStore'
import {
  DOUBLE_TAP_WINDOW_MS,
  HOLD_DURATION_MS,
  readCardAction,
  resolveCardAction,
  type ResolvedCardAction,
} from '../store/cardActions'
import {
  ENTITY_MATCH_ALL,
  ENTITY_MATCH_NONE,
  guardedDispatch,
  resolveCommandTarget,
} from '../services/guardedDispatch'
import { readCardConfirm } from '../store/switchOptions'
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
  /**
   * Presents the card's confirmation gate, when the card's options ask for one.
   *
   * Supplied by the shell (which owns the dialog); the hook only decides *which*
   * routes are gated, because it is the only place that sees an action after
   * resolution. Absent — a card rendered outside the shell, a story — a
   * `confirm: true` card simply dispatches: a gate nobody can present must not
   * become a card that cannot be operated at all.
   */
  requestConfirmation?: (request: CardConfirmRequest) => void
  /**
   * A card family's own confirmation rule, replacing the on/off classification
   * below for the cards whose gate is not about switching.
   *
   * The cover is the case it exists for: `confirmOpen` gates every route that
   * *increases the opening* — an opening `toggle`, a `set_cover_position` commit
   * to a higher effective position, `cover.open_cover` and the generic aliases —
   * while closing stays ungated, which no on/off reading can express
   * (docs/specs/entity-cards/options/cover.md — `confirmOpen`). It is consulted
   * here, after resolution, for the same reason the built-in gate is: every
   * gesture and every re-routed action arrives at this one point, so there is no
   * path to the device the rule does not see.
   *
   * Returning a prompt gates the action and names it in the dialog; returning
   * `null` lets it through.
   */
  confirmRoute?: (action: ResolvedCardAction) => CardConfirmPrompt | null
}

/** The toggle-equivalent effect a gated route would have on the entity. */
export type ConfirmableService = 'toggle' | 'turn_on' | 'turn_off'

/**
 * How a gated route is named in the confirmation dialog, for a card family
 * whose actions are not "turn it on" and "turn it off".
 */
export interface CardConfirmPrompt {
  /** Titles the dialog and labels its action button — "Open". */
  verb: string
  /** Names the action in the description — "opening". */
  gerund: string
}

export interface CardConfirmRequest {
  entityId: string
  /**
   * What the gated route does, so the dialog can name the target state. Set by
   * the built-in on/off gate; a card family supplying its own `prompt` names the
   * action directly instead.
   */
  service?: ConfirmableService
  /** Overrides the on/off wording — see `CardConfirmPrompt`. */
  prompt?: CardConfirmPrompt
  /** Dispatches the action the gate held. Called at most once, on confirm. */
  proceed: () => void
}

const CONFIRMABLE_SERVICES: readonly string[] = ['toggle', 'turn_on', 'turn_off']

/**
 * Whether a `call-service` payload reaches this entity.
 *
 * Resolved the way `HassService.buildServiceData` actually resolves it: the
 * card's entity is the implicit target, and `data` is spread over it, so
 * **any** `entity_id` in the payload replaces that target — not only a string
 * one. Reading only the string form left a hole exactly where it hurts: an
 * action carrying `entity_id: ['switch.well_pump']` dispatches at this entity
 * while the gate, seeing a non-string, concluded the action was aimed
 * elsewhere and waved it through unconfirmed.
 *
 * Where the shape cannot be resolved at all, this answers `true`. The two
 * errors are not symmetric: confirming an action that turns out to target
 * something else is a visible annoyance, while missing one is a `confirm`
 * option that silently does not confirm.
 */
export function targetsEntity(
  data: Record<string, unknown> | undefined,
  entityId: string
): boolean {
  const explicit = data?.entity_id

  // No target of its own: the card's entity is what `buildServiceData` supplies.
  if (explicit === undefined) return true

  if (typeof explicit === 'string') {
    if (explicit === ENTITY_MATCH_ALL) return true
    if (explicit === ENTITY_MATCH_NONE) return false
    return explicit === entityId
  }

  // A list reaches every entity in it — including when this one is merely a
  // member of a larger target set.
  if (Array.isArray(explicit)) {
    return explicit.some((target) => target === entityId || target === ENTITY_MATCH_ALL)
  }

  return true
}

/**
 * Whether an action toggles *this* entity, and so passes through the card's
 * confirmation gate.
 *
 * Classified by effect on the entity rather than by service name
 * (docs/specs/entity-cards/options/switch.md — "`confirm`"). A list of
 * `switch.*` services would leave the fallback role bypassable, since this card
 * renders every unmapped domain: `siren.turn_on` on a `siren.alarm` card is
 * exactly as consequential as `switch.turn_on`. So the rule is the invariant —
 * same entity, on/off-equivalent effect — and the generic `homeassistant`
 * aliases are equivalent to the domain services they invoke.
 */
export function confirmableService(
  action: ResolvedCardAction,
  entityId: string | undefined
): ConfirmableService | null {
  if (!entityId) return null
  if (action === 'toggle') return 'toggle'
  if (typeof action !== 'object' || action.action !== 'call-service') return null

  // An explicit `data.entity_id` wins at dispatch, so an action aimed only at
  // other entities is not this card's toggle to gate — but one that reaches
  // this entity by any shape is.
  if (!targetsEntity(action.data, entityId)) return null

  const [serviceDomain, service] = action.service.split('.')
  if (!CONFIRMABLE_SERVICES.includes(service)) return null
  if (serviceDomain !== entityId.split('.')[0] && serviceDomain !== 'homeassistant') return null

  return service as ConfirmableService
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
  requestConfirmation,
  confirmRoute,
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

  /**
   * Dispatch a gesture's command through the shared at-most-once guard.
   *
   * The guard itself lives in `useGuardedDispatch` so that embedded controls can
   * hold the same one — the dispatch guarantees are normative for controls as
   * well as gestures, and keeping the guard private here is what left every
   * card's sliders and pills on the retrying path. What remains here is the
   * shell's own concern: what it owes a failed *action*.
   */
  const dispatchService = useCallback(
    (options: {
      domain: string
      service: string
      entityId?: string
      data?: Record<string, unknown>
    }) => {
      void guardedDispatch(options).then((result) => {
        // `null` is the guard refusing a repeat, which is not a failure.
        if (result && !result.success) {
          // The card's own error surface belongs to whatever issued the command
          // — a control knows it is loading, the shell does not. What the shell
          // owes a failed *action* is that it not vanish silently.
          //
          // The watched target, for the same reason the guard keys off it: a
          // `call-service` action may aim at another entity entirely, and a
          // failure report naming the card's own entity points the person
          // diagnosing it at the wrong device.
          logger.error(
            `Card action ${options.domain}.${options.service} failed: ${result.error}`,
            resolveCommandTarget(options.entityId, options.data).watch ?? options.entityId
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

  /*
   * Read here rather than passed by the card: the shell gates what the shell
   * dispatches. A card that named the option but forgot to forward it would be
   * a card whose critical load is unguarded, which is the one failure mode this
   * option exists to prevent.
   */
  const confirm = useMemo(() => readCardConfirm(config), [config])

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

  const performDispatch = useCallback(
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

  /**
   * The confirmation gate, applied *after* resolution.
   *
   * That placement is the whole point: `default`, an explicit `toggle` on any
   * gesture, and a `call-service` aimed at this entity's own on/off services all
   * arrive here as resolved actions, so no re-routing reaches the device by a
   * path the gate does not see. Non-toggling actions — `more-info`, `navigate`,
   * `none`, a `call-service` on something else — pass straight through, since
   * confirming them would train the user to dismiss the dialog that matters.
   */
  const dispatch = useCallback(
    (action: ResolvedCardAction) => {
      // Held, not queued: nothing is dispatched, and nothing about the card
      // changes, until the user says so. Cancelling drops this closure.
      const proceed = () => performDispatch(action)

      /*
       * A card family's own rule replaces the on/off one rather than joining it.
       * Two gates over one action would ask twice for the route both recognise,
       * and the family that declared a rule is the one that knows what its
       * services do.
       */
      if (confirmRoute && requestConfirmation && entityId) {
        const prompt = confirmRoute(action)
        if (prompt) {
          requestConfirmation({ entityId, prompt, proceed })
          return
        }

        performDispatch(action)
        return
      }

      const service = confirmableService(action, entityId)

      if (service && confirm && requestConfirmation && entityId) {
        requestConfirmation({ entityId, service, proceed })
        return
      }

      performDispatch(action)
    },
    [confirm, confirmRoute, entityId, performDispatch, requestConfirmation]
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
