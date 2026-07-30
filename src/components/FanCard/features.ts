/**
 * The fan's `supported_features` bits, and the attribute shapes the card reads
 * them out of.
 *
 * Separate from `speedSteps.ts` (arithmetic) and from `~/store/fanOptions.ts`
 * (the stored contract) because it is neither: it is what the entity says it
 * can do, which is the input every option is gated against — an option can only
 * ever hide a capability, never add one (common contract, convention 3).
 */

/**
 * Home Assistant's `FanEntityFeature` bits, in full.
 *
 * Verified against the running Home Assistant rather than from memory:
 * `FanEntityFeature` in 2026.7.2 is exactly these six. `TURN_OFF` and `TURN_ON`
 * are what `readFanFeatures().toggle` reads; the table lists all six because one
 * that stops at `8` reads as though `16` and `32` were free — which is how the
 * cover card came to treat stop-tilt as set-tilt-position.
 */
export const FAN_FEATURE = {
  SET_SPEED: 1,
  OSCILLATE: 2,
  DIRECTION: 4,
  PRESET_MODE: 8,
  TURN_OFF: 16,
  TURN_ON: 32,
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
  /** Accepts `fan.set_percentage`. */
  speed: boolean
  /** Accepts `fan.oscillate`. */
  oscillate: boolean
  /** Accepts `fan.set_direction`. */
  direction: boolean
  /**
   * Accepts `fan.set_preset_mode` — which is **either** `SET_SPEED` or
   * `PRESET_MODE`, not both. See `readFanFeatures`.
   */
  preset: boolean
  /**
   * Can be switched at all: accepts `fan.turn_on`, `fan.turn_off` or
   * `fan.toggle`. False on a fan advertising neither switching bit, which Home
   * Assistant refuses every one of the three for.
   */
  toggle: boolean
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
    /*
     * `set_preset_mode` takes **either** bit, not both. Home Assistant registers
     * it with `[FanEntityFeature.SET_SPEED, FanEntityFeature.PRESET_MODE]`, and
     * `helpers/service.py` evaluates `required_features` as
     * `any(supported & feature_set == feature_set for feature_set in ...)` — a
     * list of feature *sets*, of which the entity must satisfy one. Each entry
     * here is a single bit, so either alone is enough.
     *
     * Reading that as "both" would hide the preset control from a fan
     * advertising only one of them, which is the direction that removes a
     * control that works. Confirmed by evaluating the real gate against a
     * `SET_SPEED`-only entity in Home Assistant 2026.7.2: `set_preset_mode`
     * came back callable.
     */
    preset: (mask & (FAN_FEATURE.SET_SPEED | FAN_FEATURE.PRESET_MODE)) !== 0,
    /*
     * Either switching bit, for the same "one satisfied feature set" reason as
     * `preset` above: `fan.toggle` is registered with `[TURN_OFF, TURN_ON]`, so
     * a fan advertising one of them can be switched. A fan advertising
     * **neither** cannot be switched by any of the three services — Home
     * Assistant raises `ServiceNotSupported`, and as of 2026.7.2 the
     * compatibility shim that used to add these bits for entities implementing
     * `async_turn_on`/`async_turn_off` is gone from the fan module, so the mask
     * is now the whole answer. That is the capability the card's primary action
     * is gated on (docs/specs/entity-cards/options/fan.md — "Primary action").
     *
     * Deliberately **not** read per direction, though `fan.turn_on` requires
     * `TURN_ON` and `fan.turn_off` requires `TURN_OFF` individually: a fan
     * publishing exactly one of the pair is what a directional read would be
     * for, and this gate is the one the change document specifies
     * (docs/changes/0037-card-state-and-capability-correctness.md — PR 2).
     */
    toggle: (mask & (FAN_FEATURE.TURN_OFF | FAN_FEATURE.TURN_ON)) !== 0,
  }
}

/**
 * The preset modes this card can actually render.
 *
 * Filtered to strings, because `preset_modes` arrives from YAML as whatever was
 * written there and a pill needs a label. One reader rather than a copy per
 * call site: the card, the detail controls and the configuration form all have
 * to answer the same question about the same attribute, and three predicates
 * over one attribute is exactly how they drift apart.
 */
export function readFanPresetModes(attributes: FanAttributes | undefined): string[] {
  const raw = attributes?.preset_modes
  if (!Array.isArray(raw)) return []
  return raw.filter((mode): mode is string => typeof mode === 'string')
}

/**
 * Whether a preset control can render at all: the fan advertises `PRESET_MODE`
 * **and** publishes modes this card can label.
 *
 * This is the predicate the configuration form gates `showPresets` on, and it
 * has to be the same one the renderers use. When it was not, a fan publishing
 * `[1, null]` was offered the option, and turning it on produced a card that
 * could never render a preset control — no error, nothing to indicate why,
 * which is worse than the option simply being absent.
 */
export function fanHasPresets(attributes: FanAttributes | undefined): boolean {
  return readFanFeatures(attributes).preset && readFanPresetModes(attributes).length > 0
}
