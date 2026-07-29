/**
 * The curated swatches the colour control offers, and the small helpers that
 * compare and render them.
 *
 * Spec: docs/specs/entity-cards/options/light.md — "Color (`showColorControl`)",
 * resolved in change 0016 as "a fixed single row of curated color swatches plus
 * one recent-color slot". Data rather than layout, exactly as the brightness
 * presets are: the row is a map over this array using the existing `liebe-pill`
 * anatomy, and no new primitive is introduced for it.
 *
 * **Why a fixed row rather than a wheel.** One tap per selection suits the
 * touch-first mandate, and a fixed count fits the `full` tier without scrolling
 * by construction — a hue/saturation wheel needs drag precision that a
 * wall-mounted tablet does not reward. A future `colorControlStyle` select is
 * anticipated (common convention 5); the boolean option gates visibility only,
 * so adding styles later is not a breaking change.
 */

export type Rgb = [number, number, number]

export interface ColorSwatch {
  /** The accessible name. The pills render icon-only, so this is all a screen reader gets. */
  name: string
  rgb: Rgb
}

/**
 * Six hues spread around the wheel, and deliberately not more.
 *
 * The count is the design constraint rather than the colour theory: seven cells
 * including the recent slot is what fits a `full` tile's width at the pill
 * anatomy's minimum touch target. Whites are absent on purpose — a white is a
 * colour *temperature*, and the control beside this one sets it across the range
 * the bulb actually reports, which this row could only approximate.
 */
export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Orange', rgb: [255, 138, 0] },
  { name: 'Yellow', rgb: [255, 214, 0] },
  { name: 'Green', rgb: [0, 200, 83] },
  { name: 'Blue', rgb: [0, 122, 255] },
  { name: 'Violet', rgb: [148, 0, 211] },
]

/** A colour as the CSS the anatomy's `hue` takes. */
export const rgbCss = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`

/** Whether two colours are the same, channel for channel. */
export const sameRgb = (a: Rgb | undefined, b: Rgb | undefined): boolean =>
  a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

/**
 * The bulb's currently reported colour, when it is one this control could have
 * set — used to mark a swatch as selected.
 *
 * Only `rgb_color` counts. The card can derive a tint from `hs_color` or a
 * colour temperature, but *selection* is a different claim from *tint*: it says
 * "this swatch is what the light is set to", and a derived approximation would
 * light up a swatch the user never chose and whose payload would not reproduce
 * the current state exactly.
 */
export function reportedRgb(attributes: { rgb_color?: unknown } | undefined): Rgb | undefined {
  const value = attributes?.rgb_color
  if (!Array.isArray(value) || value.length < 3) return undefined

  const head = value.slice(0, 3)
  if (!head.every((channel) => typeof channel === 'number' && Number.isFinite(channel))) {
    return undefined
  }

  return head as Rgb
}
