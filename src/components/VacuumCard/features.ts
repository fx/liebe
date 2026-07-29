/**
 * The vacuum's `supported_features` bits, its activity states, and the attribute
 * shapes the card reads them out of.
 *
 * Separate from `presentation.ts` (what the card shows) and from
 * `~/store/vacuumOptions.ts` (the stored contract) because it is neither: it is
 * what the entity says it can do, which is the input every option is gated
 * against — an option can only ever hide a capability, never add one
 * (docs/specs/entity-cards/options/common.md, convention 3).
 */

/**
 * Home Assistant's `VacuumEntityFeature` bits, in full.
 *
 * Transcribed from `homeassistant/components/vacuum/const.py` on `dev`, read
 * directly rather than from memory or from another card: this repo shipped a
 * `COVER_FEATURE` map with `STOP_TILT` and `SET_TILT_POSITION` transposed and
 * every test agreed with it, because the tests imported the same wrong map.
 *
 * Listed in full even though this card gates on six, for the reason the fan
 * card's table records: a table that stops early reads as though the bits above
 * it were free. Note that the values are **not** contiguous powers of two in the
 * order a reader expects — `LOCATE` is 512 while `START`, the one a vacuum card
 * needs most, is 8192 near the end.
 */
export const VACUUM_FEATURE = {
  /** Deprecated upstream; not supported by `StateVacuumEntity`. */
  TURN_ON: 1,
  /** Deprecated upstream; not supported by `StateVacuumEntity`. */
  TURN_OFF: 2,
  PAUSE: 4,
  STOP: 8,
  RETURN_HOME: 16,
  FAN_SPEED: 32,
  /**
   * Still present in the enum, and deliberately **not** gated on by this card.
   *
   * Core 2025.8 deprecated `StateVacuumEntity.battery_level`/`battery_icon` and
   * they stop working in 2026.8; integrations are asked to publish a separate
   * battery sensor instead. So the bit exists but says nothing useful about
   * whether a battery reading is available (docs/specs/entity-cards/options/
   * vacuum.md — "Battery").
   */
  BATTERY: 64,
  /** Deprecated upstream; not supported by `StateVacuumEntity`. */
  STATUS: 128,
  SEND_COMMAND: 256,
  LOCATE: 512,
  CLEAN_SPOT: 1024,
  MAP: 2048,
  /** Set by platforms derived from `StateVacuumEntity`; not a control. */
  STATE: 4096,
  START: 8192,
  CLEAN_AREA: 16384,
} as const

/**
 * Home Assistant's `VacuumActivity` members, transcribed from the same file.
 *
 * Exactly six — the option doc's primary-action matrix covers all of them.
 * `unavailable` and `unknown` are NOT members: they come from
 * `homeassistant.const` and can replace any entity's state, which is why the
 * matrix has a row for them.
 */
export const VACUUM_ACTIVITY = {
  CLEANING: 'cleaning',
  DOCKED: 'docked',
  IDLE: 'idle',
  PAUSED: 'paused',
  RETURNING: 'returning',
  ERROR: 'error',
} as const

export type VacuumActivity = (typeof VACUUM_ACTIVITY)[keyof typeof VACUUM_ACTIVITY]

/**
 * The attributes this card reads, typed as what they are on the wire.
 *
 * `unknown` rather than the convenient types, because every one of them is
 * optional on a real vacuum and several arrive from integrations that publish
 * whatever they like: `fan_speed_list` is missing entirely on a vacuum without
 * `FAN_SPEED`, `cleaned_area` arrives as a number from one integration and a
 * numeric string from another, and `supported_features` can be absent.
 */
export interface VacuumAttributes {
  friendly_name?: unknown
  supported_features?: unknown
  fan_speed?: unknown
  fan_speed_list?: unknown
  /** Legacy — deprecated Core 2025.8, stops working 2026.8. See `VACUUM_FEATURE.BATTERY`. */
  battery_level?: unknown
  cleaned_area?: unknown
  cleaning_time?: unknown
  /** The diagnostic message the option doc's error state surfaces. */
  error?: unknown
  [key: string]: unknown
}

/**
 * The advertised features this card gates on, as **booleans**.
 *
 * Booleans at the point they are derived, not the masked bits: React prints a
 * numeric `0` as the text "0", so the moment one of these gates JSX with `&&` it
 * stamps a stray zero on the card.
 *
 * Only the six the option doc's gating table names. `BATTERY` is absent on
 * purpose — see `VACUUM_FEATURE.BATTERY`.
 */
export interface VacuumFeatures {
  /** Accepts `vacuum.pause`. */
  pause: boolean
  /** Accepts `vacuum.stop`. */
  stop: boolean
  /** Accepts `vacuum.return_to_base`. */
  returnHome: boolean
  /** Accepts `vacuum.set_fan_speed`. */
  fanSpeed: boolean
  /** Accepts `vacuum.locate`. */
  locate: boolean
  /** Accepts `vacuum.start`. */
  start: boolean
}

/**
 * Read the feature mask.
 *
 * Strictly numeric, so a `supported_features` arriving as the string `"8192"`
 * advertises nothing rather than being coerced by `&` into a feature set nothing
 * verified. `Math.trunc` because a float mask is not a mask.
 */
export function readVacuumMask(attributes: VacuumAttributes | undefined): number {
  const raw = attributes?.supported_features
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0
}

export function readVacuumFeatures(attributes: VacuumAttributes | undefined): VacuumFeatures {
  const mask = readVacuumMask(attributes)

  return {
    pause: (mask & VACUUM_FEATURE.PAUSE) !== 0,
    stop: (mask & VACUUM_FEATURE.STOP) !== 0,
    returnHome: (mask & VACUUM_FEATURE.RETURN_HOME) !== 0,
    fanSpeed: (mask & VACUUM_FEATURE.FAN_SPEED) !== 0,
    locate: (mask & VACUUM_FEATURE.LOCATE) !== 0,
    start: (mask & VACUUM_FEATURE.START) !== 0,
  }
}

/**
 * The entity's fan-speed options, or an empty list.
 *
 * Every element must be a non-empty string: `fan_speed_list` is passed straight
 * to `vacuum.set_fan_speed`, and an integration publishing `[null, "max"]` would
 * otherwise offer a select entry that dispatches `{ fan_speed: null }`.
 */
export function readFanSpeedList(attributes: VacuumAttributes | undefined): string[] {
  const raw = attributes?.fan_speed_list
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
}
