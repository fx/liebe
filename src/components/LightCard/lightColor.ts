/**
 * The bulb's actual colour, resolved to something the anatomy can tint with.
 *
 * Spec: docs/specs/entity-cards/options/light.md — "Light-color theming
 * (`useLightColor`)". One pure function rather than logic in JSX, so the icon
 * circle and the slider fill cannot drift apart, and so the derivations are
 * unit-testable without rendering a card
 * (docs/changes/0016-light-card-to-spec.md — "Design Decisions").
 *
 * What comes back is a CSS colour for `AnatomyPartProps.hue`, or `undefined`
 * meaning "no bulb colour" — which is not a failure but the ordinary case: an
 * `onoff` light, a `brightness`-only light, a light that is off, or a colour
 * attribute this build cannot make sense of. `undefined` leaves the card on its
 * domain token, which is exactly the fallback the option doc requires.
 */

/** Home Assistant reports hue in degrees and saturation in percent. */
type HsColor = [number, number]
type RgbColor = [number, number, number]
type XyColor = [number, number]

/**
 * The attributes this reads, named individually so the file says what it
 * depends on — over a real `entity.attributes` bag, which carries far more.
 * The index signature is what makes it accept one; it is not an invitation to
 * read anything else.
 */
export interface LightColorAttributes {
  rgb_color?: unknown
  hs_color?: unknown
  xy_color?: unknown
  color_temp_kelvin?: unknown
  [attribute: string]: unknown
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * A tuple of exactly `length` finite numbers, or nothing.
 *
 * Every colour attribute arrives over the wire from an integration, so "an
 * array of the right length holding real numbers" is a claim to check rather
 * than assume — a short `rgb_color`, or one carrying `null` for a channel,
 * would otherwise produce `rgb(255, NaN, 0)` and paint the card black.
 */
function numericTuple(value: unknown, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length < length) return undefined
  const head = value.slice(0, length)
  return head.every(isFiniteNumber) ? head : undefined
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const to255 = (value: number) => Math.round(clamp(value, 0, 1) * 255)

/**
 * The lightness clamp the option doc asks for: "very dark or desaturated bulb
 * colors SHOULD be lightness-clamped for the tint so the active state remains
 * distinguishable from inactive".
 *
 * Applied in HSL on the resolved RGB rather than to each source format, so
 * every derivation gets it and none of them has to remember to. A deep red at
 * 5% lightness is a real colour a bulb can be set to, and a card tinted with it
 * is indistinguishable from an inactive one — which would make the active
 * treatment stop meaning anything at exactly the moment it is most obviously
 * "on".
 */
const MIN_TINT_LIGHTNESS = 0.35

function clampLightness([r, g, b]: RgbColor): RgbColor {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255]
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const lightness = (max + min) / 2

  if (lightness >= MIN_TINT_LIGHTNESS) return [r, g, b]

  // Pure black carries no hue to preserve, so it lifts to a neutral grey rather
  // than to an arbitrary one.
  if (max === min) {
    const grey = to255(MIN_TINT_LIGHTNESS)
    return [grey, grey, grey]
  }

  // Scale toward white about the same hue: the ratio between channels is what
  // carries the hue, so multiplying all three preserves it exactly.
  const factor = MIN_TINT_LIGHTNESS / lightness
  return [to255(rf * factor), to255(gf * factor), to255(bf * factor)]
}

/** HA's `hs_color` (0–360, 0–100) to RGB. */
function hsToRgb([hue, saturation]: HsColor): RgbColor {
  const h = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 100) / 100
  const chroma = s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = 1 - chroma

  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = (
    [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ] as const
  )[sector]

  return [to255(r + m), to255(g + m), to255(b + m)]
}

/**
 * CIE 1931 xy to sRGB, via XYZ at a fixed luminance.
 *
 * `xy_color` carries chromaticity only — the brightness attribute carries the
 * rest — so Y is pinned at 1 and the lightness clamp does the rest. A `y` of 0
 * is a degenerate point with no colour to recover, so it resolves to nothing
 * rather than to a division by zero.
 */
function xyToRgb([x, y]: XyColor): RgbColor | undefined {
  if (y <= 0) return undefined

  const Y = 1
  const X = (Y / y) * x
  const Z = (Y / y) * (1 - x - y)

  const r = X * 3.2406 + Y * -1.5372 + Z * -0.4986
  const g = X * -0.9689 + Y * 1.8758 + Z * 0.0415
  const b = X * 0.0557 + Y * -0.204 + Z * 1.057

  // Gamma companding, then normalise so the brightest channel is full — the
  // chromaticity is what was reported, and the scale is arbitrary.
  const gamma = (channel: number) => {
    const c = Math.max(channel, 0)
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  }

  /*
   * `peak` is always positive, so there is no zero-division case to guard.
   * Luminance is `Y = 0.2126R + 0.7152G + 0.0722B` over the linear channels, and
   * `Y` is pinned at 1 above — so the three cannot all be non-positive without
   * contradicting it. Whichever way an out-of-gamut `x` pushes the result, one
   * channel survives: a large positive `X` keeps red positive, and an `X` at or
   * below zero keeps green positive. A guard here would therefore be a branch no
   * input can take, which is worse than none — it reads as a handled case.
   */
  const linear = [gamma(r), gamma(g), gamma(b)]
  const peak = Math.max(...linear)

  return [to255(linear[0] / peak), to255(linear[1] / peak), to255(linear[2] / peak)]
}

/**
 * Colour temperature in Kelvin to RGB, by Tanner Helland's piecewise fit.
 *
 * Kelvin is the only colour-temperature interface — Home Assistant Core 2026.3
 * removed the mired attributes and arguments entirely, so there is no second
 * path to support. Values outside the fit's usable span are clamped rather than
 * refused: an integration reporting 500K is reporting something, and a warm
 * bulb is the right answer for it.
 */
export function kelvinToRgb(kelvin: number): RgbColor {
  const t = clamp(kelvin, 1000, 40000) / 100

  const red = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592), 0, 255)

  const green =
    t <= 66
      ? clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255)
      : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492), 0, 255)

  const blue =
    t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255)

  return [Math.round(red), Math.round(green), Math.round(blue)]
}

/**
 * The bulb's colour as a CSS value, or `undefined` when there is none to show.
 *
 * Precedence is the option doc's own: "a resolvable RGB color (`rgb_color`, or
 * derivable from `hs_color` / `xy_color` / color temperature)" — the reported
 * value first, the derivations after, in that order.
 *
 * **Why `color_mode` is not consulted, though it exists and names the active
 * mode.** It cannot change the answer. Every mode that has a colour at all
 * publishes an attribute this chain already tries, and the chain tries all of
 * them, so `color_mode` could only ever select something already reachable —
 * it is redundant by construction rather than by luck. The modes it would name
 * that this chain declines (`white`, `brightness`, `onoff`) are exactly the
 * ones that publish no colour attributes, so they resolve to nothing here for
 * the same reason `color_mode` would have excluded them. A future reader who
 * knows the attribute exists should read this rather than assume it was
 * overlooked.
 *
 * `off` resolves to nothing: the option doc requires the inactive treatment to
 * be the domain token, and a light that is off has no colour to show whatever
 * its attributes still say.
 */
export function resolveLightHue(
  state: string | undefined,
  attributes: LightColorAttributes | undefined
): string | undefined {
  if (state !== 'on' || !attributes) return undefined

  const rgb =
    (numericTuple(attributes.rgb_color, 3) as RgbColor | undefined) ??
    resolveHs(attributes.hs_color) ??
    resolveXy(attributes.xy_color) ??
    resolveKelvin(attributes.color_temp_kelvin)

  if (!rgb) return undefined

  const [r, g, b] = clampLightness([
    clamp(Math.round(rgb[0]), 0, 255),
    clamp(Math.round(rgb[1]), 0, 255),
    clamp(Math.round(rgb[2]), 0, 255),
  ])

  return `rgb(${r}, ${g}, ${b})`
}

function resolveHs(value: unknown): RgbColor | undefined {
  const hs = numericTuple(value, 2) as HsColor | undefined
  // A saturation of zero is white, which carries no hue worth tinting with —
  // and is what a colour bulb reports while it is running in white mode.
  return hs && hs[1] > 0 ? hsToRgb(hs) : undefined
}

function resolveXy(value: unknown): RgbColor | undefined {
  const xy = numericTuple(value, 2) as XyColor | undefined
  return xy ? xyToRgb(xy) : undefined
}

function resolveKelvin(value: unknown): RgbColor | undefined {
  return isFiniteNumber(value) && value > 0 ? kelvinToRgb(value) : undefined
}
