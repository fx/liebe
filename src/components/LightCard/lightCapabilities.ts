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
  [attribute: string]: unknown
}

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

/** Whether any declared mode is one this build recognises as providing `capability`. */
function hasMode(attributes: LightCapabilityAttributes | undefined, capability: string[]): boolean {
  const modes = declaredModes(attributes?.supported_color_modes)
  return modes === undefined ? false : modes.some((mode) => capability.includes(mode))
}

/** Whether the entity declares colour modes this build can read at all. */
function declaresModes(attributes: LightCapabilityAttributes | undefined): boolean {
  return declaredModes(attributes?.supported_color_modes) !== undefined
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
  if (declaresModes(attributes)) return hasMode(attributes, modes)
  return hasFeature(attributes, legacyBit)
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
