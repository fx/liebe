import type { DomainColorName } from '~/theme/tokens'
import { VACUUM_ACTIVITY, type VacuumAttributes, type VacuumFeatures } from './features'

/**
 * What the vacuum card shows and what a gesture on it does, decided away from
 * JSX.
 *
 * Every function here is pure and takes the state, attributes and features
 * explicitly, because each answer is needed by more than one tier and by the
 * tests that pin them — and because the primary action is consulted twice, by
 * the body tap and by the start/pause button, which the option doc requires to
 * share one resolution for the command states and to diverge in exactly one
 * (docs/specs/entity-cards/options/vacuum.md).
 */

/** The states with nothing to command and nothing to inspect. */
const UNRESPONSIVE_STATES: readonly string[] = ['unavailable', 'unknown']

/**
 * What a gesture resolves to.
 *
 * `more-info` and `none` are distinct: `more-info` opens the detail dialog and
 * is the option doc's answer for `returning` and `error`, where the safe default
 * is inspection; `none` is inert, which is what an entity that is not reporting
 * gets. Collapsing them would make an unavailable vacuum open a dialog about an
 * entity with nothing in it.
 */
export type VacuumCommand = 'start' | 'pause' | 'stop'
export type VacuumPrimaryAction = VacuumCommand | 'more-info' | 'none'

/** The Home Assistant service each command dispatches. */
export const VACUUM_COMMAND_SERVICE: Readonly<Record<VacuumCommand, string>> = {
  start: 'start',
  pause: 'pause',
  stop: 'stop',
}

/**
 * Whether a command is dispatchable at all in this state.
 *
 * `error` joins `unavailable`/`unknown` here on the option doc's instruction —
 * "no physical command may dispatch from an indeterminate or failed state" —
 * even though `error` is a state the entity is actively reporting and the tap
 * still resolves to `more-info` as the escalation path.
 */
const COMMANDS_BLOCKED_STATES: readonly string[] = ['unavailable', 'unknown', VACUUM_ACTIVITY.ERROR]

/**
 * What a tap does, by state — the option doc's primary-action table, first match
 * wins.
 *
 *   1. `unavailable`/`unknown` → inert, regardless of retained feature bits.
 *   2. `error`, `returning`    → `more-info`. Mid-return the least destructive
 *                                default is inspection, and in `error` the
 *                                dialog is the escalation path.
 *   3. `cleaning`              → `pause` when `PAUSE`, else `stop` when `STOP`,
 *                                else `more-info`.
 *   4. `docked`/`idle`/`paused`→ `start` when `START`, else `more-info`.
 *   5. anything else           → `more-info`.
 *
 * **Every fallthrough terminates at `more-info`, never at the next state's
 * command.** That is the property worth stating: a chain that fell through from
 * "cannot pause" to "start" would resume a vacuum whose user asked it to stop.
 * `more-info` commands nothing, so it is always a safe floor.
 *
 * Rung 5 exists because `VacuumActivity` is Home Assistant's enum, not ours: a
 * member added upstream, or an integration publishing something outside it,
 * must land somewhere deliberate. It lands on inspection rather than on
 * whichever branch happens to be last.
 */
export function resolveVacuumPrimaryAction(
  state: string,
  features: VacuumFeatures
): VacuumPrimaryAction {
  if (UNRESPONSIVE_STATES.includes(state)) return 'none'
  if (state === VACUUM_ACTIVITY.ERROR || state === VACUUM_ACTIVITY.RETURNING) return 'more-info'

  if (state === VACUUM_ACTIVITY.CLEANING) {
    if (features.pause) return 'pause'
    return features.stop ? 'stop' : 'more-info'
  }

  if (
    state === VACUUM_ACTIVITY.DOCKED ||
    state === VACUUM_ACTIVITY.IDLE ||
    state === VACUUM_ACTIVITY.PAUSED
  ) {
    return features.start ? 'start' : 'more-info'
  }

  return 'more-info'
}

export interface VacuumCommandButton {
  /** The command the button dispatches, or `null` when it is inert. */
  command: VacuumCommand | null
  /** Screen-reader name and visible label. */
  label: string
  /** Which glyph the card draws. */
  glyph: 'play' | 'pause' | 'stop'
  disabled: boolean
}

/**
 * The start/pause button, which is **not** simply the tap resolution.
 *
 * It shares the tap's resolution for the command states and diverges in exactly
 * one, `returning`: the tap keeps the safe inspection default while the button
 * offers Pause — the explicit interruption control — and disables when `PAUSE`
 * is absent. The option doc calls that divergence deliberate, so it is expressed
 * here as its own branch rather than as a patch over the tap's answer.
 *
 * Reading the doc's two sentences about presence together: "each only when its
 * flag is supported" and "renders disabled when it is not" cannot both be about
 * the same button in the same state, so presence is decided by the cluster (a
 * vacuum advertising none of `START`/`PAUSE`/`STOP` has no run control and gets
 * no button — `hasRunControl`) and *this* function decides only what a present
 * button says and whether it is live.
 */
export function resolveVacuumCommandButton(
  state: string,
  features: VacuumFeatures
): VacuumCommandButton {
  if (state === VACUUM_ACTIVITY.RETURNING) {
    return {
      command: features.pause ? 'pause' : null,
      label: 'Pause',
      glyph: 'pause',
      disabled: !features.pause,
    }
  }

  /*
   * `cleaning` is never a blocked state — the blocked set is
   * `unavailable`/`unknown`/`error` — so this branch gates on features alone.
   * Guarding it with `blocked` too would read as defensive and be a condition no
   * input can falsify.
   */
  if (state === VACUUM_ACTIVITY.CLEANING) {
    if (features.pause) {
      return { command: 'pause', label: 'Pause', glyph: 'pause', disabled: false }
    }
    if (features.stop) {
      return { command: 'stop', label: 'Stop', glyph: 'stop', disabled: false }
    }
    return { command: null, label: 'Pause', glyph: 'pause', disabled: true }
  }

  if (
    state === VACUUM_ACTIVITY.DOCKED ||
    state === VACUUM_ACTIVITY.IDLE ||
    state === VACUUM_ACTIVITY.PAUSED
  ) {
    /*
     * `paused` says Resume rather than Start. Same service either way — the
     * difference is what the user is being told the button will do, and "Start"
     * on a vacuum that is mid-run and paused reads as "start over".
     */
    const label = state === VACUUM_ACTIVITY.PAUSED ? 'Resume' : 'Start'

    return features.start
      ? { command: 'start', label, glyph: 'play', disabled: false }
      : { command: null, label, glyph: 'play', disabled: true }
  }

  /*
   * Everything else: the three states where no physical command may dispatch
   * (`COMMANDS_BLOCKED_STATES`), and any state outside `VacuumActivity`
   * entirely.
   *
   * The unrecognised case is why this is an explicit catch-all rather than a
   * `blocked` check. A state this build does not understand must not fall into
   * the startable branch and offer to start the vacuum — the tap already routes
   * it to `more-info`, and a button that dispatched `vacuum.start` from a state
   * nobody has modelled would be the one control on the card contradicting that.
   */
  return { command: null, label: 'Start', glyph: 'play', disabled: true }
}

/**
 * Whether the cluster draws a start/pause button at all.
 *
 * A vacuum advertising no run control whatsoever would otherwise get a button
 * that is disabled in every state it can reach, which is chrome pretending to be
 * a control (docs/specs/design-system — omission never clipping).
 */
export function hasRunControl(features: VacuumFeatures): boolean {
  return features.start || features.pause || features.stop
}

/**
 * Whether the dock button is inert.
 *
 * Disabled while `docked` or `returning` — there is nothing to return — and in
 * every state where no physical command may dispatch. Presence is gated on
 * `RETURN_HOME` by the caller.
 */
export function isDockDisabled(state: string): boolean {
  return (
    COMMANDS_BLOCKED_STATES.includes(state) ||
    state === VACUUM_ACTIVITY.DOCKED ||
    state === VACUUM_ACTIVITY.RETURNING
  )
}

/** Whether the fan-speed select and locate button may dispatch (change 0025 PR 2). */
export function areCommandsBlocked(state: string): boolean {
  return COMMANDS_BLOCKED_STATES.includes(state)
}

/** The human label for each activity; unknown states print themselves. */
const STATE_LABELS: Readonly<Record<string, string>> = {
  [VACUUM_ACTIVITY.CLEANING]: 'Cleaning',
  [VACUUM_ACTIVITY.DOCKED]: 'Docked',
  [VACUUM_ACTIVITY.IDLE]: 'Idle',
  [VACUUM_ACTIVITY.PAUSED]: 'Paused',
  [VACUUM_ACTIVITY.RETURNING]: 'Returning',
  [VACUUM_ACTIVITY.ERROR]: 'Error',
}

/** A trimmed, non-empty string, or nothing. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * The state line's leading text.
 *
 * In `error` this is the entity's `error` attribute — the diagnostic the option
 * doc puts on the card — falling back to the plain word. The `status` attribute
 * is deliberately not consulted: `VacuumEntityFeature.STATUS` is deprecated
 * upstream and not supported by `StateVacuumEntity`, so a card reading it would
 * be reading an attribute that modern integrations do not publish.
 *
 * An **own-property** lookup for the label, not `STATE_LABELS[state]`: the key is
 * the entity's state, so any string reaches this table, and a plain object
 * answers for its prototype — a vacuum reporting `constructor` would otherwise
 * put a function on the card. Same shape as the weather artwork map and the
 * climate `hvacModeConfig` before it.
 */
export function resolveVacuumStateText(state: string, attributes: VacuumAttributes | undefined) {
  if (state === VACUUM_ACTIVITY.ERROR) {
    return text(attributes?.error) ?? STATE_LABELS[VACUUM_ACTIVITY.ERROR]
  }

  return Object.prototype.hasOwnProperty.call(STATE_LABELS, state) ? STATE_LABELS[state] : state
}

export interface VacuumBattery {
  /** Whole percent, 0–100. */
  percent: number
  /** Below the option doc's 20% threshold, which takes the amber emphasis. */
  low: boolean
}

/** The percentage below which the battery segment takes amber emphasis. */
export const LOW_BATTERY_PERCENT = 20

/**
 * Read a percentage from whatever an integration published.
 *
 * Numeric strings are accepted because a sensor's `state` is *always* a string
 * on the wire, and template-backed sensors publish whatever their template
 * rendered. Non-finite values, out-of-range values and anything non-numeric
 * resolve to nothing rather than to `0` — `Number(null)` is `0`, and a card
 * reporting a missing battery as "0%" would be inventing a flat one.
 */
function percentage(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined

  return Math.round(parsed)
}

/**
 * The battery reading, from a battery **sensor** first and the vacuum's own
 * attribute only as a legacy fallback.
 *
 * The order is the point. Core 2025.8 deprecated
 * `StateVacuumEntity.battery_level` and it stops working in 2026.8, so a card
 * built on the attribute ships dead within this change's lifetime
 * (docs/specs/entity-cards/options/vacuum.md — "Battery"). The sensor is passed
 * in rather than looked up here because finding it is the caller's problem and
 * currently an unsolved one — see the card, which explains why nothing is passed
 * yet.
 */
export function resolveVacuumBattery(
  attributes: VacuumAttributes | undefined,
  batterySensorState?: unknown
): VacuumBattery | undefined {
  const percent = percentage(batterySensorState) ?? percentage(attributes?.battery_level)
  if (percent === undefined) return undefined

  return { percent, low: percent < LOW_BATTERY_PERCENT }
}

/** The stats the option doc puts on the `full` tier, already formatted. */
export interface VacuumStats {
  /** Area cleaned, with its unit — absent when the entity reports none. */
  area?: string
  /** Cleaning time as a duration — absent when the entity reports none. */
  duration?: string
}

/** A finite number from whatever an integration published, or nothing. */
function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * `cleaned_area` and `cleaning_time`, formatted for the stats line.
 *
 * Each is independent: an integration reporting one and not the other renders
 * the one it has, and an entity reporting neither renders no line at all — the
 * option doc requires the absence rather than an empty row.
 *
 * `cleaning_time` is minutes, which is what the integrations publishing it use,
 * and is rendered as `1h 24m` past the hour so a long run does not read as a
 * three-digit number the viewer has to divide. Area carries m² because that is
 * what every integration reporting it uses; no unit attribute is standardised
 * for it, so none is consulted.
 */
export function resolveVacuumStats(attributes: VacuumAttributes | undefined): VacuumStats {
  const stats: VacuumStats = {}

  const area = numeric(attributes?.cleaned_area)
  // A negative area is a broken integration, not a small one.
  if (area !== undefined && area >= 0) stats.area = `${Math.round(area)} m²`

  const minutes = numeric(attributes?.cleaning_time)
  if (minutes !== undefined && minutes >= 0) {
    const whole = Math.round(minutes)
    const hours = Math.floor(whole / 60)
    stats.duration = hours > 0 ? `${hours}h ${whole % 60}m` : `${whole}m`
  }

  return stats
}

/** Whether the stats line has anything to say. */
export function hasVacuumStats(stats: VacuumStats): boolean {
  return stats.area !== undefined || stats.duration !== undefined
}

/**
 * The colour triplet the card resolves to.
 *
 * `alert` in `error`, overriding the domain colour exactly as the option doc's
 * scenario requires; teal while the vacuum is doing something; neutral when it
 * is parked. `returning` counts as doing something — it is moving.
 */
export function resolveVacuumColor(state: string): DomainColorName {
  if (state === VACUUM_ACTIVITY.ERROR) return 'alert'
  return isVacuumActive(state) ? 'vacuum' : 'default'
}

/** Whether the tile reads as "on" for the shell's active treatment. */
export function isVacuumActive(state: string): boolean {
  return state === VACUUM_ACTIVITY.CLEANING || state === VACUUM_ACTIVITY.RETURNING
}
