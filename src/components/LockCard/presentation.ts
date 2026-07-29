import { DoorOpen, Lock, LockOpen, TriangleAlert } from 'lucide-react'
import type { ComponentType } from 'react'
import { targetsEntity } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { LockOptions } from '~/store/lockOptions'
import type { HassEntity } from '~/store/entityTypes'
import type { DomainColorName } from '~/theme/tokens'

/**
 * Everything the lock card's state and options RESOLVE TO: the glyph, the state
 * text, the tint, which pill is held back, the door fragment, and which routes
 * the `confirmUnlock` / `confirmLock` gates stop.
 *
 * One module and one derivation, for the reason the cover has one: the state
 * decides the label, the tint, the glyph and the two buttons together, so a
 * card that worked any of them out separately could disagree with itself about
 * whether its door is secure.
 *
 * The option *contract* — keys, defaults, validation — is `~/store/lockOptions`.
 */

/**
 * Home Assistant's `LockState`, read from
 * `homeassistant/components/lock/const.py` (2026.7.2) rather than inferred.
 *
 * All seven, and the set is closed: HA's `LockEntity.state` returns one of these
 * or `None` — which reaches a card as `unknown` — so any *other* string on the
 * wire is an integration doing something undocumented, and this card treats it
 * as indeterminate rather than guessing (see `resolveLockPresentation`).
 */
export const LOCK_STATE = {
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  LOCKING: 'locking',
  UNLOCKING: 'unlocking',
  OPENING: 'opening',
  OPEN: 'open',
  JAMMED: 'jammed',
} as const

/**
 * No feature-bit reader lives here, and that is a deliberate absence rather than
 * an omission.
 *
 * `LockEntityFeature` defines exactly one bit — `OPEN = 1` — and it gates only
 * the `lock.open` (unlatch) service, which HA registers with
 * `[LockEntityFeature.OPEN]` so a lock without the bit never exposes it. This
 * card ships **no unlatch control**: the option doc withholds one until demand
 * is demonstrated, and the change doc puts the built-in control out of scope
 * while keeping a *configured* `lock.open` route in scope. So there is no
 * control here for the bit to gate, and a reader for it would be API with no
 * consumer — which is the kind of thing that rots into a wrong answer nobody
 * notices. What the bit's existence does affect is `unlocksLock` below, where
 * `open` is classified as an unlock route regardless of whether this particular
 * lock advertises it: an action configured against a lock that cannot unlatch is
 * a no-op, and gating a no-op costs nothing, while missing a real unlatch would
 * cost a door.
 *
 * `opening` and `open` are still rendered as full states — an unlatch-capable
 * lock reaches them however it was commanded, and the card must have defined
 * labels, colours and button behaviour when it does.
 */

export type LockGlyph = ComponentType<{ size?: number }>

/** What the card presents the lock as, once the unrecognised cases are folded in. */
export interface LockPresentation {
  /** The entity's state, or `unknown` for anything this card cannot place. */
  state: string
  /** The state-line text, cased the way the card renders it. */
  label: string
  icon: LockGlyph
  color: DomainColorName
  /** Whether the shell paints the active tint. */
  isActive: boolean
  /**
   * A physical-security failure — `jammed`. Drives the danger floor, which takes
   * back the `color`, `icon` and hide options so the card cannot be configured
   * into looking calm (REVIEW.md — "Danger states must not be configurable into
   * looking calm").
   */
  isDanger: boolean
  /** A transition is in progress: `locking`, `unlocking` or `opening`. */
  isTransitional: boolean
  /**
   * The state is indeterminate — `unavailable`, `unknown`, or anything this card
   * does not recognise. Both pills are held back and nothing dispatches.
   */
  isIndeterminate: boolean
  /** Whether the Lock pill may fire. */
  canLock: boolean
  /** Whether the Unlock pill may fire. */
  canUnlock: boolean
}

export interface LockPresentationInput {
  /** The entity's raw state string. */
  state: string
}

/**
 * The per-state table, in one place
 * (docs/specs/entity-cards/options/security.md — "States").
 *
 * **Transitional tints are inferred from the transition's direction**, which the
 * spec names as the rule for a card with no locally observed previous state —
 * `locking` implies it was `unlocked` (alert), `unlocking` and `opening` imply it
 * was `locked` (green). Inferring in every case rather than only on a cold mount
 * keeps this a pure function of the state string, which is what lets the whole
 * table be asserted directly; the observable difference is confined to
 * transitions that begin from a state they cannot normally begin from.
 *
 * **Enablement is the safety-critical column.** Two distinct rules meet here and
 * the spec is explicit that they are not the same:
 *  - the *transitional* rule — during `locking`/`unlocking`/`opening` the pill
 *    for the direction in progress is held back while the **inverse pill stays
 *    live**, so an unwanted movement can be reversed;
 *  - the *indeterminate* rule — in `unavailable`/`unknown` **both** pills are
 *    held back, because neither matches a state the card cannot know and there
 *    is nothing to reverse.
 *
 * `jammed` is in neither group. It is not locked and it is not unlocked — the
 * bolt position is genuinely unknown — so no pill matches the current state and
 * both stay live: a jam is precisely the moment someone needs to try the
 * mechanism, and `confirmUnlock` still stands in front of the unsafe direction.
 */
const LOCK_STATE_TABLE: Readonly<
  Record<
    string,
    {
      label: string
      icon: LockGlyph
      color: DomainColorName
      isActive: boolean
      canLock: boolean
      canUnlock: boolean
    }
  >
> = {
  [LOCK_STATE.LOCKED]: {
    label: 'Locked',
    icon: Lock,
    color: 'ok',
    isActive: true,
    canLock: false,
    canUnlock: true,
  },
  [LOCK_STATE.UNLOCKED]: {
    label: 'Unlocked',
    icon: LockOpen,
    color: 'alert',
    isActive: true,
    canLock: true,
    canUnlock: false,
  },
  [LOCK_STATE.LOCKING]: {
    label: 'Locking…',
    icon: Lock,
    // Previous-state tint: locking implies it was unlocked.
    color: 'alert',
    isActive: true,
    canLock: false,
    canUnlock: true,
  },
  [LOCK_STATE.UNLOCKING]: {
    label: 'Unlocking…',
    icon: LockOpen,
    // Previous-state tint: unlocking implies it was locked.
    color: 'ok',
    isActive: true,
    canLock: true,
    canUnlock: false,
  },
  [LOCK_STATE.OPENING]: {
    label: 'Opening…',
    icon: DoorOpen,
    color: 'ok',
    isActive: true,
    canLock: true,
    canUnlock: false,
  },
  [LOCK_STATE.OPEN]: {
    label: 'Open',
    icon: DoorOpen,
    color: 'alert',
    isActive: true,
    canLock: true,
    canUnlock: false,
  },
  [LOCK_STATE.JAMMED]: {
    label: 'Jammed',
    icon: TriangleAlert,
    color: 'alert',
    isActive: true,
    canLock: true,
    canUnlock: true,
  },
}

/** The states that are a transition rather than a resting position. */
const TRANSITIONAL_STATES: readonly string[] = [
  LOCK_STATE.LOCKING,
  LOCK_STATE.UNLOCKING,
  LOCK_STATE.OPENING,
]

/**
 * Resolve everything the card renders from one reading of the entity state.
 *
 * An unrecognised state — including `unavailable` and `unknown` — resolves to
 * the indeterminate row rather than to a guess. That is the fail-safe direction
 * and it is the default rather than a special case: the table is consulted, and
 * a miss falls through to "no pill may fire".
 */
export function resolveLockPresentation({ state }: LockPresentationInput): LockPresentation {
  const row = Object.hasOwn(LOCK_STATE_TABLE, state) ? LOCK_STATE_TABLE[state] : undefined

  if (!row) {
    return {
      state: 'unknown',
      label: 'Unknown',
      icon: Lock,
      color: 'default',
      isActive: false,
      isDanger: false,
      isTransitional: false,
      isIndeterminate: true,
      canLock: false,
      canUnlock: false,
    }
  }

  return {
    state,
    label: row.label,
    icon: row.icon,
    color: row.color,
    isActive: row.isActive,
    isDanger: state === LOCK_STATE.JAMMED,
    isTransitional: TRANSITIONAL_STATES.includes(state),
    isIndeterminate: false,
    canLock: row.canLock,
    canUnlock: row.canUnlock,
  }
}

/**
 * What this card's own `toggle` resolves to, per lock state
 * (docs/specs/entity-cards/options/security.md — "Primary action").
 *
 * `more-info` for `jammed` — never guess a direction against a jammed mechanism —
 * and `none` for every state where a direction is either already in progress or
 * unknowable. Total over the state set by construction: everything the table
 * does not name is `none`.
 */
export type LockToggleResolution = 'lock' | 'unlock' | 'more-info' | 'none'

export function resolveLockToggle(state: string): LockToggleResolution {
  if (state === LOCK_STATE.LOCKED) return 'unlock'
  if (state === LOCK_STATE.UNLOCKED || state === LOCK_STATE.OPEN) return 'lock'
  if (state === LOCK_STATE.JAMMED) return 'more-info'
  return 'none'
}

/**
 * What a route would do to this lock.
 *
 * `unclassifiable` is not a third outcome the gate weighs separately — it is
 * gated whenever either gate is on. It exists as its own value so a test can pin
 * *why* a route was held (an alias whose direction HA does not define) rather
 * than only that it was.
 */
export type LockRouteDirection = 'unlocking' | 'locking' | 'neutral' | 'unclassifiable'

export interface LockRouteContext {
  entityId: string
  /** The entity's current state, which is what a bare `toggle` resolves against. */
  state: string
}

/**
 * The services whose effect is "unlock this lock".
 *
 * `open` is here with `unlock`, deliberately. Unlatching is a *different and
 * more* consequential operation than unlocking — it retracts the latch and lets
 * the door swing — and the spec settles the one question its Open Questions
 * leave open by requiring that a configured `call-service` on `lock.open` pass
 * the same gate as `lock.unlock`, so the deferred built-in control cannot be
 * bypassed by re-routing.
 */
function unlocksLock(serviceDomain: string, service: string, entityDomain: string): boolean {
  return serviceDomain === entityDomain && (service === 'unlock' || service === 'open')
}

function locksLock(serviceDomain: string, service: string, entityDomain: string): boolean {
  return serviceDomain === entityDomain && service === 'lock'
}

/**
 * The generic aliases, which on a lock are **not** the same command by another
 * name — and this is where reading Home Assistant's source changes the answer.
 *
 * `homeassistant.turn_on` / `turn_off` / `toggle` all run one handler
 * (`components/homeassistant/__init__.py`, `async_handle_turn_service`) that
 * forwards to `<domain>.<same service>` and, when that service does not exist,
 * logs "does not support entities" and does nothing. The `lock` platform
 * registers exactly three services — `lock`, `unlock`, `open` — so there is no
 * `lock.turn_on`, no `lock.turn_off` and **no `lock.toggle`**. On stock HA every
 * one of these aliases, and a hand-written `lock.toggle`, is a no-op.
 *
 * They are still classified as `unclassifiable` rather than waved through, for
 * two reasons that both point the same way. A custom integration is free to
 * register `lock.turn_off`, and if one does, nothing here would see it coming.
 * And the direction would still be unknowable if it did: HA defines no on/off
 * polarity for a lock, so "off" is as readable as unlocked as it is as locked.
 * A gate that must fail safe cannot resolve that by picking one.
 */
function isAmbiguousLockAlias(
  serviceDomain: string,
  service: string,
  entityDomain: string
): boolean {
  if (serviceDomain === entityDomain && service === 'toggle') return true
  return (
    serviceDomain === 'homeassistant' &&
    (service === 'turn_on' || service === 'turn_off' || service === 'toggle')
  )
}

/**
 * Classify a resolved action by what it would do to this lock
 * (docs/specs/entity-cards/options/security.md — `confirmUnlock` / `confirmLock`).
 *
 * By effect, never by service name alone, and applied *after* resolution — which
 * is what makes the gate un-bypassable: `tapAction: toggle`, a `call-service` on
 * `lock.unlock`, one on `lock.open`, and a generic alias all arrive here as
 * resolved actions, so there is no path to the device the rule does not see.
 *
 * Anything that does not actuate *this* lock — `more-info`, `navigate`, `none`,
 * a service aimed at another entity — is `neutral`: confirming those would train
 * the user to dismiss the dialog that matters.
 */
export function classifyLockRoute(
  action: ResolvedCardAction,
  context: LockRouteContext
): LockRouteDirection {
  const entityDomain = context.entityId.split('.')[0]

  if (action === 'toggle') {
    const resolution = resolveLockToggle(context.state)
    if (resolution === 'unlock') return 'unlocking'
    if (resolution === 'lock') return 'locking'
    /*
     * `more-info` and `none` dispatch nothing, so there is nothing to gate — but
     * only where the state was recognised. An unrecognised state resolves to
     * `none` too, and that one is held: the card cannot prove the toggle is
     * harmless, and the whole rule here is that what cannot be proven harmless
     * confirms.
     */
    return Object.hasOwn(LOCK_STATE_TABLE, context.state) ? 'neutral' : 'unclassifiable'
  }

  if (typeof action !== 'object' || action.action !== 'call-service') return 'neutral'
  if (!targetsEntity(action.data, context.entityId)) return 'neutral'

  const [serviceDomain, service] = action.service.split('.')

  if (unlocksLock(serviceDomain, service, entityDomain)) return 'unlocking'
  if (locksLock(serviceDomain, service, entityDomain)) return 'locking'
  if (isAmbiguousLockAlias(serviceDomain, service, entityDomain)) return 'unclassifiable'

  return 'neutral'
}

/**
 * Whether a classified route has to be confirmed.
 *
 * Written as the inverse of the cover's rule and for the same reason: everything
 * confirms except what can be *proven* not to need it. `neutral` is the one
 * direction with a proof behind it — it does not actuate this lock at all.
 *
 * `unclassifiable` defers to whichever gates the user has left on. Gating it
 * unconditionally would put a dialog in front of a household that switched both
 * gates off deliberately; gating it when *either* is on means an ambiguous route
 * is held whenever the user has asked for any gate at all, which with
 * `confirmUnlock` defaulting to `true` is every card nobody has configured.
 */
export function requiresLockConfirmation(
  direction: LockRouteDirection,
  options: Pick<LockOptions, 'confirmUnlock' | 'confirmLock'>
): boolean {
  if (direction === 'unlocking') return options.confirmUnlock
  if (direction === 'locking') return options.confirmLock
  if (direction === 'unclassifiable') return options.confirmUnlock || options.confirmLock
  return false
}

/**
 * How each gated direction names itself in the confirmation dialog.
 *
 * There is no `promptFor(direction)` helper, deliberately. It would need a
 * fourth arm for `neutral` — a direction that is never gated, so the arm could
 * not be reached, and an unreachable arm in the middle of a safety gate is worse
 * than none: it reads as a case someone considered, and it can be quietly wrong
 * forever. The two call sites choose between these two constants directly, on a
 * condition each of them can actually take both ways.
 */
export const UNLOCK_CONFIRM_PROMPT = { verb: 'Unlock', gerund: 'unlocking' } as const
export const LOCK_CONFIRM_PROMPT = { verb: 'Lock', gerund: 'locking' } as const

/**
 * The linked door sensor's contribution to the state line
 * (docs/specs/entity-cards/options/security.md — `doorEntity`).
 *
 * Display-only, and deliberately hard to fool. The option adds a reading from an
 * entity the user already has; it never creates capability, and it must never
 * put the word "closed" on screen unless a door sensor actually said so. So the
 * fragment renders only for a `binary_sensor` reporting `on` or `off`, and
 * everything else — the empty default, an id that resolves to nothing, an
 * `unavailable` or `unknown` sensor, a `sensor.` or `light.` entity whose `on`
 * means something else entirely, and the id of the lock itself — renders the
 * plain lock state with no fragment and no error.
 */
export interface DoorFragment {
  label: string
  /** An open door deserves attention even on a locked card. */
  isOpen: boolean
}

export function resolveDoorFragment(
  doorEntity: string,
  entity: HassEntity | undefined
): DoorFragment | undefined {
  if (!doorEntity) return undefined
  // The domain check is what makes the self-reference case fall out for free: a
  // `lock.` id names no binary sensor, so a card pointed at itself simply has no
  // fragment rather than reading its own `locked` as a door position.
  if (doorEntity.split('.')[0] !== 'binary_sensor') return undefined
  if (!entity) return undefined

  if (entity.state === 'on') return { label: 'Door open', isOpen: true }
  if (entity.state === 'off') return { label: 'Door closed', isOpen: false }

  return undefined
}
