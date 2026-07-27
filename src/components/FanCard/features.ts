/**
 * The fan's `supported_features` bits, and the attribute shapes the card reads
 * them out of.
 *
 * Separate from `speedSteps.ts` (arithmetic) and from `~/store/fanOptions.ts`
 * (the stored contract) because it is neither: it is what the entity says it
 * can do, which is the input every option is gated against — an option can only
 * ever hide a capability, never add one (common contract, convention 3).
 */

/** Home Assistant's `FanEntityFeature` bits. */
export const FAN_FEATURE = {
  SET_SPEED: 1,
  OSCILLATE: 2,
  DIRECTION: 4,
  PRESET_MODE: 8,
} as const

/**
 * The attributes this card reads, typed as what they are on the wire.
 *
 * `unknown` rather than the convenient types: a template fan can publish a
 * string `percentage`, an integration can omit `supported_features` entirely,
 * and `preset_modes` arrives from YAML as whatever was written there.
 */
export interface FanAttributes {
  percentage?: unknown
  percentage_step?: unknown
  preset_mode?: unknown
  preset_modes?: unknown
  oscillating?: unknown
  direction?: unknown
  supported_features?: unknown
  friendly_name?: unknown
  [key: string]: unknown
}

export interface FanFeatures {
  speed: boolean
  oscillate: boolean
  direction: boolean
  preset: boolean
}

/**
 * The advertised features, as **booleans**.
 *
 * Booleans at the point they are derived, not the masked bits: React prints a
 * numeric `0` as the text "0", so the moment one of these gates JSX with `&&`
 * it stamps a stray zero on the card. Coercing here rather than at each use
 * site is what keeps that from coming back the next time one is read.
 *
 * The mask itself is read strictly-numeric, so a `supported_features` arriving
 * as the string `"9"` advertises nothing rather than being coerced by `&` into
 * a feature set nothing verified.
 */
export function readFanFeatures(attributes: FanAttributes | undefined): FanFeatures {
  const raw = attributes?.supported_features
  const mask = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0

  return {
    speed: (mask & FAN_FEATURE.SET_SPEED) !== 0,
    oscillate: (mask & FAN_FEATURE.OSCILLATE) !== 0,
    direction: (mask & FAN_FEATURE.DIRECTION) !== 0,
    preset: (mask & FAN_FEATURE.PRESET_MODE) !== 0,
  }
}
