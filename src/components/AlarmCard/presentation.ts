import { Bell, BellRing, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import type { ComponentType } from 'react'
import { targetsEntity } from '~/hooks/useCardActions'
import { readCodeFormat, type CodeFormat } from '~/components/Keypad'
import type { ResolvedCardAction } from '~/store/cardActions'
import {
  DEFAULT_ARM_MODE_ORDER,
  type AlarmOptions,
  type ArmMode,
  type ShowKeypad,
} from '~/store/alarmOptions'
import type { DomainColorName } from '~/theme/tokens'

/**
 * Everything the alarm card's state and options RESOLVE TO: which pills exist,
 * which are held back, the glyph, the state text, the tint, whether a
 * transition needs a code, and which routes the confirmation gates stop.
 *
 * One module and one derivation, for the reason the lock has one: the state
 * decides the label, the tint, which controls exist and which of them may fire,
 * and a card that worked those out separately could contradict itself about
 * whether the house is armed.
 *
 * The option *contract* — keys, defaults, validation — is `~/store/alarmOptions`.
 */

/**
 * `AlarmControlPanelState`, read from
 * `homeassistant/components/alarm_control_panel/const.py` (2026.7.2).
 */
export const ALARM_STATE = {
  DISARMED: 'disarmed',
  ARMED_HOME: 'armed_home',
  ARMED_AWAY: 'armed_away',
  ARMED_NIGHT: 'armed_night',
  ARMED_VACATION: 'armed_vacation',
  ARMED_CUSTOM_BYPASS: 'armed_custom_bypass',
  PENDING: 'pending',
  ARMING: 'arming',
  DISARMING: 'disarming',
  TRIGGERED: 'triggered',
} as const

/**
 * `AlarmControlPanelEntityFeature`, from the same file — and worth reading
 * rather than guessing, because the numbering is not the order the modes are
 * usually listed in: `TRIGGER` takes `8`, so `ARM_VACATION` is `32` rather than
 * the `8` a reasonable person would assume.
 *
 * There is deliberately no `DISARM` bit. `alarm_disarm` is registered with no
 * feature requirement at all, so **every panel can be disarmed** — which is why
 * nothing below ever gates the Disarm control on a capability.
 */
export const ALARM_FEATURE = {
  ARM_HOME: 1,
  ARM_AWAY: 2,
  ARM_NIGHT: 4,
  TRIGGER: 8,
  ARM_CUSTOM_BYPASS: 16,
  ARM_VACATION: 32,
} as const

/** Each offered mode's feature bit, service and resulting state. */
export const ARM_MODE_SPEC: Readonly<
  Record<ArmMode, { feature: number; service: string; state: string; label: string }>
> = {
  away: {
    feature: ALARM_FEATURE.ARM_AWAY,
    service: 'alarm_arm_away',
    state: ALARM_STATE.ARMED_AWAY,
    label: 'Arm away',
  },
  home: {
    feature: ALARM_FEATURE.ARM_HOME,
    service: 'alarm_arm_home',
    state: ALARM_STATE.ARMED_HOME,
    label: 'Arm home',
  },
  night: {
    feature: ALARM_FEATURE.ARM_NIGHT,
    service: 'alarm_arm_night',
    state: ALARM_STATE.ARMED_NIGHT,
    label: 'Arm night',
  },
  vacation: {
    feature: ALARM_FEATURE.ARM_VACATION,
    service: 'alarm_arm_vacation',
    state: ALARM_STATE.ARMED_VACATION,
    label: 'Arm vacation',
  },
}

/** Every `alarm_arm_*` service, including the one this card does not offer. */
const ARM_SERVICES: readonly string[] = [
  ...Object.values(ARM_MODE_SPEC).map((spec) => spec.service),
  'alarm_arm_custom_bypass',
]

export const DISARM_SERVICE = 'alarm_disarm'

/**
 * The attributes this card reads, typed as what they are on the wire — unknown.
 *
 * HA's `AlarmControlPanelEntity.state_attributes` publishes all three keys
 * **unconditionally**, so `code_format` is always present and is `null` when no
 * code is needed. `readCodeFormat` is what reads it, shared with the lock, and
 * it flattens that difference: absent and `null` mean the same thing, and
 * neither may be mistaken for "a code is required".
 */
export interface AlarmAttributes {
  supported_features?: unknown
  code_format?: unknown
  code_arm_required?: unknown
  changed_by?: unknown
  friendly_name?: unknown
  [key: string]: unknown
}

/**
 * The advertised feature bits, as an integer. Strictly numeric, the rule the
 * cover card learned: `&` would coerce the string `"63"` into a full feature
 * set, and an entity whose `supported_features` arrives as a string is one
 * nothing else about is trustworthy either.
 */
export function readAlarmFeatures(attributes: AlarmAttributes | undefined): number {
  const raw = attributes?.supported_features
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0
}

/**
 * Whether arming needs a code.
 *
 * Both halves are required and each answers a different question: `code_format`
 * says a code *can* be entered, `code_arm_required` says arming *wants* one.
 * HA's `_attr_code_arm_required` defaults to `True`, so a panel with no code at
 * all still publishes `code_arm_required: true` — reading that alone would
 * demand a code from every codeless panel and make arming impossible.
 */
export function codeRequiredToArm(attributes: AlarmAttributes | undefined): boolean {
  if (readCodeFormat(attributes) === undefined) return false
  // Only an explicit `false` waives it: an absent or unreadable value leaves
  // the panel's own default (`true`) standing.
  return attributes?.code_arm_required !== false
}

/** Whether disarming needs a code — `code_format` alone governs it. */
export function codeRequiredToDisarm(attributes: AlarmAttributes | undefined): boolean {
  return readCodeFormat(attributes) !== undefined
}

/**
 * The arm modes this card offers, in order.
 *
 * Capability decides whether a mode *can* exist and the option decides whether
 * it shows — never the other way round (common convention 3). A stored mode the
 * panel does not support is dropped here at render time rather than trusted,
 * because configuration can never create capability: a dashboard exported from
 * a house with a vacation-capable panel must not offer vacation on one without.
 */
export function resolveArmModes(
  attributes: AlarmAttributes | undefined,
  stored: readonly ArmMode[] | undefined
): ArmMode[] {
  const features = readAlarmFeatures(attributes)
  const supported = (mode: ArmMode) => (features & ARM_MODE_SPEC[mode].feature) !== 0

  return (stored ?? DEFAULT_ARM_MODE_ORDER).filter(supported)
}

export type AlarmGlyph = ComponentType<{ size?: number }>

export interface AlarmPresentation {
  /** The entity's state, or `unknown` for anything this card cannot place. */
  state: string
  label: string
  icon: AlarmGlyph
  color: DomainColorName
  isActive: boolean
  /** `triggered` — drives the danger floor. */
  isDanger: boolean
  /** `arming` / `pending` — the amber countdown that pulses. */
  isCountdown: boolean
  /** `disarming` — its own transition, which disables only the Disarm control. */
  isDisarming: boolean
  /** `unavailable`, `unknown`, or anything unrecognised: nothing may dispatch. */
  isIndeterminate: boolean
  /** Whether the arm pills exist at all — true only when disarmed. */
  showArmPills: boolean
  /** Whether the Disarm control exists — true in every non-disarmed state. */
  showDisarm: boolean
  /** Whether the Disarm control may fire. */
  canDisarm: boolean
  /** Whether the arm pills may fire. */
  canArm: boolean
}

const ARMED_LABELS: Readonly<Record<string, string>> = {
  [ALARM_STATE.ARMED_HOME]: 'Armed home',
  [ALARM_STATE.ARMED_AWAY]: 'Armed away',
  [ALARM_STATE.ARMED_NIGHT]: 'Armed night',
  [ALARM_STATE.ARMED_VACATION]: 'Armed vacation',
  [ALARM_STATE.ARMED_CUSTOM_BYPASS]: 'Armed custom bypass',
}

/**
 * The per-state table (docs/specs/entity-cards/options/security.md — "States
 * and colors").
 *
 * Three rules meet here and the spec is emphatic that they are distinct:
 *
 *  - **Arm pills exist only while disarmed.** Every other state has something
 *    armed or arming, so there is nothing to arm — and the pills being absent
 *    rather than disabled is why `disarming` has "nothing else to cancel".
 *  - **Disarm stays enabled through `arming` and `pending`.** That is the exit
 *    countdown, the exact moment someone needs to stop it, and a card that
 *    folded transitional states into a blanket `busy` would disable the one
 *    control that must work. It disables only during `disarming` — its own
 *    command already in flight.
 *  - **Indeterminate wins over everything.** `unavailable`/`unknown` resolve
 *    first: every control is held and nothing dispatches. Indeterminate is
 *    never classified as "non-disarmed", which a naive `state !== 'disarmed'`
 *    would do — and that reading would offer a live Disarm against a panel
 *    whose state the card does not know.
 */
const ALARM_STATE_TABLE: Readonly<
  Record<
    string,
    {
      label: string
      icon: AlarmGlyph
      color: DomainColorName
      isActive: boolean
      showArmPills: boolean
      showDisarm: boolean
      canDisarm: boolean
    }
  >
> = {
  [ALARM_STATE.DISARMED]: {
    label: 'Disarmed',
    icon: ShieldOff,
    // Disarmed is a chosen idle state, not an alert: no hue at all.
    color: 'default',
    isActive: false,
    showArmPills: true,
    showDisarm: false,
    canDisarm: false,
  },
  [ALARM_STATE.ARMING]: {
    label: 'Arming…',
    icon: ShieldCheck,
    color: 'light',
    isActive: true,
    showArmPills: false,
    showDisarm: true,
    canDisarm: true,
  },
  [ALARM_STATE.PENDING]: {
    label: 'Pending…',
    icon: BellRing,
    color: 'light',
    isActive: true,
    showArmPills: false,
    showDisarm: true,
    canDisarm: true,
  },
  [ALARM_STATE.DISARMING]: {
    label: 'Disarming…',
    icon: ShieldOff,
    // Mounting mid-transition leaves no observed previous state, so the generic
    // armed green stands in: disarming implies it was armed.
    color: 'ok',
    isActive: true,
    showArmPills: false,
    showDisarm: true,
    canDisarm: false,
  },
  [ALARM_STATE.TRIGGERED]: {
    label: 'TRIGGERED',
    icon: Bell,
    color: 'alert',
    isActive: true,
    showArmPills: false,
    showDisarm: true,
    canDisarm: true,
  },
}

const armedRow = (state: string) => ({
  label: ARMED_LABELS[state],
  icon: ShieldCheck,
  color: 'ok' as DomainColorName,
  isActive: true,
  showArmPills: false,
  showDisarm: true,
  canDisarm: true,
})

/**
 * Resolve everything the card renders from one reading of the entity state.
 *
 * An unrecognised state resolves to the indeterminate row rather than to a
 * guess, and it does so by table miss rather than by a special case — the
 * fail-safe direction is the default.
 */
export function resolveAlarmPresentation({ state }: { state: string }): AlarmPresentation {
  const row = Object.hasOwn(ARMED_LABELS, state)
    ? armedRow(state)
    : Object.hasOwn(ALARM_STATE_TABLE, state)
      ? ALARM_STATE_TABLE[state]
      : undefined

  if (!row) {
    return {
      state: 'unknown',
      label: 'Unknown',
      icon: ShieldAlert,
      color: 'default',
      isActive: false,
      isDanger: false,
      isCountdown: false,
      isDisarming: false,
      isIndeterminate: true,
      /*
       * Rendered, and every one of them disabled — which is what the spec asks
       * for in as many words ("every control MUST render disabled and MUST NOT
       * dispatch") rather than the controls vanishing. A card whose buttons
       * disappear when a panel goes quiet reads as a card that lost its
       * features; one whose buttons are visibly greyed reads as a panel that is
       * unreachable, which is the true thing. Nothing can fire either way:
       * `canArm` and `canDisarm` are both false, and they are what gate the
       * dispatch.
       */
      showArmPills: true,
      showDisarm: true,
      canDisarm: false,
      canArm: false,
    }
  }

  return {
    state,
    label: row.label,
    icon: row.icon,
    color: row.color,
    isActive: row.isActive,
    isDanger: state === ALARM_STATE.TRIGGERED,
    isCountdown: state === ALARM_STATE.ARMING || state === ALARM_STATE.PENDING,
    isDisarming: state === ALARM_STATE.DISARMING,
    isIndeterminate: false,
    showArmPills: row.showArmPills,
    showDisarm: row.showDisarm,
    canDisarm: row.canDisarm,
    canArm: row.showArmPills,
  }
}

/**
 * Whether a keypad is presented for a transition
 * (docs/specs/entity-cards/options/security.md — `showKeypad`).
 *
 * `always` shows one even where no code is needed, in which case the code is
 * sent only if something was entered.
 */
export function keypadShownFor(showKeypad: ShowKeypad, codeRequired: boolean): boolean {
  if (showKeypad === 'never') return false
  if (showKeypad === 'always') return true
  return codeRequired
}

/**
 * How the keypad collects the code.
 *
 * `code_format` decides it, and where the panel publishes none — the normal
 * codeless case, reachable only through `showKeypad: always` — the digit pad is
 * the deterministic default the spec names, alarm codes being overwhelmingly
 * numeric.
 */
export function keypadFormat(attributes: AlarmAttributes | undefined): CodeFormat {
  return readCodeFormat(attributes) ?? 'number'
}

/** What a route would do to this panel. */
export type AlarmRouteDirection = 'arming' | 'disarming' | 'neutral' | 'unclassifiable'

export interface AlarmRouteContext {
  entityId: string
}

/**
 * The services the `alarm_control_panel` platform registers, and the only
 * same-domain names whose direction this card can know.
 *
 * Adding a name here without also classifying it below would make it `neutral`
 * — the fail-open direction. Classify it first.
 */
const ALARM_PLATFORM_SERVICES = new Set<string>([
  DISARM_SERVICE,
  ...ARM_SERVICES,
  // Known, and deliberately `neutral` rather than gated — see `classifyAlarmRoute`.
  'alarm_trigger',
])

/**
 * The routes whose effect on this panel cannot be known, held rather than waved
 * through.
 *
 * **Any same-domain service outside the set above**, first — because that is the
 * case a custom integration creates. On stock Home Assistant the platform
 * registers exactly `alarm_disarm`, the five `alarm_arm_*` and `alarm_trigger`,
 * so `alarm_control_panel.turn_off` resolves to nothing; but an integration is
 * free to register it, and if one does, nothing here can see what it does.
 * Naming the known services and holding the rest is the only form of this rule
 * that a service invented tomorrow cannot walk through.
 *
 * (This mirrors the lock card, where the same hole was closed in review. The
 * alarm shipped with the weaker enumerate-the-aliases form and is corrected
 * here, because the two families must not disagree about what "unknown" means.)
 *
 * Then the generic aliases, which on a panel are no-ops:
 * `homeassistant.turn_on`/`turn_off`/`toggle` forward to `<domain>.<same
 * service>` and do nothing when it does not exist
 * (`components/homeassistant/__init__.py`). They are still held, for the reason
 * the whole gate exists — the direction would be unknowable even if the service
 * did land, since HA defines no on/off polarity for an alarm panel. Gating a
 * no-op costs one dialog; missing a real disarm costs the house.
 */
function isUnclassifiableAlarmRoute(
  serviceDomain: string,
  service: string,
  entityDomain: string
): boolean {
  if (serviceDomain === entityDomain) return !ALARM_PLATFORM_SERVICES.has(service)
  return (
    serviceDomain === 'homeassistant' &&
    (service === 'turn_on' || service === 'turn_off' || service === 'toggle')
  )
}

/**
 * Classify a resolved action by what it would do to this panel
 * (docs/specs/entity-cards/options/security.md — `confirmArm` / `confirmDisarm`).
 *
 * `toggle` is `neutral` unconditionally, and that is a family definition rather
 * than an omission: the spec has the alarm family define the universal `toggle`
 * as resolving to `more-info`, because there is no sane toggle for a panel
 * (disarm ↔ *which* arm mode?) and a bare tap can never carry a code. A route
 * that opens the details actuates nothing, so confirming it would train the
 * user to dismiss the dialog that matters.
 *
 * `alarm_trigger` is `neutral` too, and this one needs its reason stated
 * because the obvious reading says otherwise: it unambiguously actuates the
 * panel, and this card's whole design is that what cannot be proven harmless
 * confirms. It is ungated anyway because **it is the panic action, and its
 * failure mode is delay rather than accident.** A confirmation dialog in front
 * of a panic button is itself the hazard — it puts a modal between someone in
 * an emergency and the siren. Every other gate here protects against an
 * accidental *loss* of security; gating this one would invert the property,
 * trading a real emergency delay for protection against an outcome that is
 * loud, obvious and immediately reversible.
 *
 * So: not an oversight, and not "the spec did not ask for it". Do not add a
 * gate here without a reason that beats the one above.
 */
export function classifyAlarmRoute(
  action: ResolvedCardAction,
  context: AlarmRouteContext
): AlarmRouteDirection {
  if (typeof action !== 'object' || action.action !== 'call-service') return 'neutral'
  if (!targetsEntity(action.data, context.entityId)) return 'neutral'

  const entityDomain = context.entityId.split('.')[0]
  const [serviceDomain, service] = action.service.split('.')

  if (serviceDomain === entityDomain) {
    if (service === DISARM_SERVICE) return 'disarming'
    if (ARM_SERVICES.includes(service)) return 'arming'
  }

  return isUnclassifiableAlarmRoute(serviceDomain, service, entityDomain)
    ? 'unclassifiable'
    : 'neutral'
}

/**
 * Whether a classified route has to be confirmed.
 *
 * Written the same way the lock's is — everything confirms except what can be
 * proven not to need it — with one addition the alarm has and the lock does
 * not: **a transition that will present a keypad is never also confirmed.**
 *
 * The spec states the gate is irrelevant "when a code is required", giving the
 * reason that the keypad *is* the confirmation and an extra dialog would
 * double-prompt. Keying on the keypad rather than literally on "a code is
 * required" is the reading that keeps that reason true in the one case where
 * the two come apart: `showKeypad: 'always'` on a codeless panel presents a
 * keypad for a transition that needs no code, and the literal reading would put
 * a confirmation dialog in front of it as well. Two prompts for one intent is
 * how a confirmation becomes something people click through — the defect this
 * card can least afford.
 */
export function requiresAlarmConfirmation(
  direction: AlarmRouteDirection,
  options: Pick<AlarmOptions, 'confirmArm' | 'confirmDisarm'>,
  keypadShown: boolean
): boolean {
  if (keypadShown) return false
  if (direction === 'arming') return options.confirmArm
  if (direction === 'disarming') return options.confirmDisarm
  if (direction === 'unclassifiable') return options.confirmArm || options.confirmDisarm
  return false
}

/** How each gated direction names itself in the confirmation dialog. */
export const DISARM_CONFIRM_PROMPT = { verb: 'Disarm', gerund: 'disarming' } as const
export const ARM_CONFIRM_PROMPT = { verb: 'Arm', gerund: 'arming' } as const
