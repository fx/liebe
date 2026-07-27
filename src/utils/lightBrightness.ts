/**
 * The one place brightness crosses between Liebe's 0–100 UI scale and Home
 * Assistant's 0–255 `brightness` attribute.
 *
 * Spec: docs/specs/entity-cards/options/light.md — "Brightness
 * (`showBrightnessSlider`)". Shared rather than inlined because the slider is
 * not the only thing that converts: the brightness-preset pills
 * (docs/changes/0016-light-card-to-spec.md, PR 3) convert the same way, and two
 * copies of a rounding rule are two chances to round a light off.
 */

/** Home Assistant's maximum `brightness`. */
export const HA_BRIGHTNESS_MAX = 255

/**
 * A UI percentage (0–100) as Home Assistant's `brightness` (0–255).
 *
 * Rounding MUST NOT collapse a nonzero percentage to `0`: `light.turn_on` with
 * `brightness: 0` turns the light off, so the lowest slider step or preset
 * would silently do the opposite of what it says. Only an explicit `0` maps to
 * `0`, and the card treats that as "turn off" rather than sending it.
 *
 * Input outside 0–100 is clamped rather than refused. Percentages reaching here
 * include configured preset values, which are whatever was typed into a YAML
 * file.
 */
export function percentToHaBrightness(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent))
  if (clamped === 0) return 0
  return Math.max(1, Math.round((clamped / 100) * HA_BRIGHTNESS_MAX))
}

/**
 * Home Assistant's `brightness` (0–255) as a UI percentage (0–100), clamped for
 * the same reason: the attribute is whatever the integration reported.
 */
export function haBrightnessToPercent(brightness: number): number {
  const clamped = Math.min(HA_BRIGHTNESS_MAX, Math.max(0, brightness))
  return Math.round((clamped / HA_BRIGHTNESS_MAX) * 100)
}
