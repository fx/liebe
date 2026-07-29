/**
 * What a light can actually do, read off the attributes it publishes.
 *
 * Spec: docs/specs/entity-cards/options/light.md — the option table's capability
 * column and common convention 3, "whether a control _can_ appear is derived
 * from the entity's `supported_color_modes` (with the legacy `supported_features`
 * fallback); these options only hide or tune capabilities the entity already
 * has". The options are the second question, and they are asked elsewhere: this
 * module answers only the first, so a card can never offer a control the bulb
 * has no way to obey.
 *
 * Pure functions in the component folder rather than `useMemo` bodies in JSX,
 * for the reason `lightColor.ts` gives: the capability matrix is the part of
 * this card most worth testing without rendering it, and colour temperature and
 * colour are read by more than one call site once the controls land.
 *
 * **The forward-compatibility rule these all share.** Home Assistant adds colour
 * modes; a build that meets one it has never heard of must keep rendering the
 * card. So an unrecognised mode is simply a mode that answers "no" to every
 * question here — never an error, and never a reason to stop rendering. The same
 * applies to an attribute whose *shape* is wrong, which is the sharper case: a
 * hand-edited YAML or a broken integration can publish `supported_color_modes`
 * as a bare string, and `['brightness'].some(...)` on a string throws, which
 * would blank the card rather than dim it (docs/specs/dashboard-config/index.md
 * — "Forward Compatibility").
 */

/** The `supported_color_modes` values Home Assistant treats as dimmable. */
export const BRIGHTNESS_COLOR_MODES = [
  'brightness',
  'white',
  'color_temp',
  'hs',
  'xy',
  'rgb',
  'rgbw',
  'rgbww',
]

/**
 * The modes that carry a settable colour.
 *
 * `white` and `color_temp` are deliberately absent: both produce light with a
 * colour, and neither takes one. A `white` light is a brightness channel, and a
 * `color_temp` light is served by the temperature control — offering the colour
 * swatches for either would present a control whose payload the entity rejects.
 */
export const COLOR_COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww']

/** The single mode that carries a settable colour temperature. */
export const COLOR_TEMP_COLOR_MODES = ['color_temp']

/*
 * The legacy `supported_features` bits, from before `supported_color_modes`
 * existed. Home Assistant stopped setting them on modern integrations, so they
 * are consulted only when the modern attribute is absent or unusable — never in
 * preference to it.
 */
const SUPPORT_BRIGHTNESS = 1
const SUPPORT_COLOR_TEMP = 2
const SUPPORT_COLOR = 16

/**
 * The attributes these read, named individually so the file says what it
 * depends on. As in `lightColor.ts`, the index signature is what lets a real
 * `entity.attributes` bag be passed; it is not an invitation to read more.
 */
export interface LightCapabilityAttributes {
  supported_color_modes?: unknown
  supported_features?: unknown
  min_color_temp_kelvin?: unknown
  max_color_temp_kelvin?: unknown
  [attribute: string]: unknown
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * The declared colour modes, or nothing when the entity does not usably declare
 * any.
 *
 * "Usably" is the whole of it. An absent attribute means a pre-modes integration
 * and the legacy bits are the right answer; a non-array value means an attribute
 * this build cannot read, and the legacy bits are again the best information
 * available. Both resolve to `undefined` so the callers below share one rule.
 *
 * Non-string members are dropped rather than rejecting the list: one junk entry
 * in an otherwise good array should cost only itself, exactly as a bad option
 * value costs only its own key in `readCameraOptions`.
 */
function declaredModes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((mode): mode is string => typeof mode === 'string')
}

/**
 * The legacy bit test.
 *
 * Coerced to a boolean here rather than where it is read: the masked bits are a
 * number, and React renders a `0` as the text "0" the moment a caller gates JSX
 * with `&&`. A `supported_features` that is not a number contributes nothing
 * rather than producing `NaN`.
 */
function hasFeature(attributes: LightCapabilityAttributes | undefined, bit: number): boolean {
  const features = attributes?.supported_features
  return typeof features === 'number' && Number.isFinite(features) && (features & bit) !== 0
}

/**
 * One capability question, asked of the modern attribute first.
 *
 * A usable `supported_color_modes` is authoritative and the legacy bits are not
 * consulted — including when it answers "no". That is not a detail: a modern
 * colour-capable light publishes `supported_color_modes` and may still carry a
 * stale `supported_features`, and letting the old bits override the new list
 * would put a colour control on a bulb whose modes say it has none.
 */
function supports(
  attributes: LightCapabilityAttributes | undefined,
  modes: string[],
  legacyBit: number
): boolean {
  // Resolved once and branched on directly. Asking "does it declare modes?" and
  // then "which modes?" as two calls would leave the second with an
  // unreachable "no declaration" arm — dead by construction, and dead code in a
  // capability check is worse than most: it reads as a handled case.
  const declared = declaredModes(attributes?.supported_color_modes)
  if (declared === undefined) return hasFeature(attributes, legacyBit)
  return declared.some((mode) => modes.includes(mode))
}

/**
 * Whether the light can be dimmed.
 *
 * Every mode Home Assistant itself treats as brightness-capable counts, `white`
 * included — its entities may carry no legacy feature flag at all, so omitting
 * it would leave them with no way to be dimmed. An `onoff`-only light is false
 * here and gets no slider regardless of `showBrightnessSlider`
 * (docs/specs/entity-cards/options/light.md — "Brightness").
 */
export function supportsBrightness(attributes: LightCapabilityAttributes | undefined): boolean {
  return supports(attributes, BRIGHTNESS_COLOR_MODES, SUPPORT_BRIGHTNESS)
}

/**
 * Whether the light accepts a colour temperature, i.e. `color_temp_kelvin`.
 *
 * Kelvin is the only interface — Home Assistant Core 2026.3 removed the mired
 * attributes and arguments outright — but that concerns the *payload*, not this
 * question: the capability is still declared by the `color_temp` mode.
 */
export function supportsColorTemp(attributes: LightCapabilityAttributes | undefined): boolean {
  return supports(attributes, COLOR_TEMP_COLOR_MODES, SUPPORT_COLOR_TEMP)
}

/** Whether the light accepts a colour, in any of the modes that carry one. */
export function supportsColor(attributes: LightCapabilityAttributes | undefined): boolean {
  return supports(attributes, COLOR_COLOR_MODES, SUPPORT_COLOR)
}

/** The warm and cool ends a colour-temperature control may span, in Kelvin. */
export interface ColorTempRange {
  min: number
  max: number
}

/**
 * The entity's own colour-temperature bounds, or nothing when it does not
 * usably report them.
 *
 * **Why "nothing" rather than a default range.** The option doc requires the
 * control to span `min_color_temp_kelvin`–`max_color_temp_kelvin` and says
 * "never a hardcoded range". A light that declares `color_temp` support but
 * publishes no bounds therefore gets no control at all: inventing 2000–6500 for
 * it would present a warm end the bulb may not reach and a cool end it may
 * exceed, and every value in between would be a guess dressed as the device's
 * own. No control is honest; a fabricated one is not.
 *
 * The cases below are what the *consumer* can be handed, not a list of
 * defensive guesses. `Slider` passes these straight to Radix as `min`/`max`, and
 * each one breaks it differently: a missing or non-numeric bound gives a track
 * with no arithmetic, `NaN` poisons every comparison silently (it is never less
 * than, never greater than, never equal), and `min >= max` gives an inverted
 * track whose thumb cannot be placed. A single bound is just as unusable as
 * none — there is no span without both ends.
 */
export function readColorTempRange(
  attributes: LightCapabilityAttributes | undefined
): ColorTempRange | undefined {
  const min = attributes?.min_color_temp_kelvin
  const max = attributes?.max_color_temp_kelvin

  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return undefined
  // Kelvin is an absolute scale, so a non-positive bound is not a cooler colour
  // but a broken reading.
  if (min <= 0 || max <= 0) return undefined
  if (min >= max) return undefined

  return { min, max }
}
