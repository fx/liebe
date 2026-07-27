/**
 * The fan's step-pill arithmetic — `percentage_step` → pill values, and which
 * pill the current percentage selects.
 *
 * A pure function with no React in sight, because the arithmetic is the part
 * that has to be right and JSX is a poor place to read it
 * (docs/changes/0019 — "Step derivation is a pure helper"). The contract it
 * implements is docs/specs/entity-cards/options/fan.md — "Speed control".
 */

/**
 * The fallback pills: four quartiles, which is what the card has always shown
 * and what a fan that publishes no usable `percentage_step` gets.
 */
export const QUARTILE_SPEEDS: readonly number[] = [25, 50, 75, 100]

/**
 * The most pills that stay touch-legible at `row` width. A fixed count rather
 * than a layout measurement: "as many as fit" cannot be unit-tested, and two
 * implementations would disagree about the same entity.
 */
export const MAX_SPEED_PILLS = 6

/**
 * The pill values for a fan, from its `percentage_step`.
 *
 * `percentage_step` encodes a **speed count** — Home Assistant defines it as
 * `100 / speed_count` — so the pills are derived from that count and evenly
 * divided, never as raw multiples of the step. The difference is the whole
 * reason the contract is written this way: multiples of a non-divisor step end
 * below full speed (`30` → 30 / 60 / 90, with no way to reach 100), while the
 * count gives 33 / 67 / 100 for the same fan. Every value is an integer and the
 * last is exactly `100`, so no separate clamp or pin is needed.
 *
 * The quartile fallback covers every shape that yields no usable count: absent,
 * `null`, a string, `NaN`, `Infinity`, zero, negative — and a step so fine it
 * would produce more pills than fit.
 */
export function deriveSpeedSteps(percentageStep: unknown): number[] {
  if (typeof percentageStep !== 'number' || !Number.isFinite(percentageStep)) {
    return [...QUARTILE_SPEEDS]
  }
  if (percentageStep <= 0) return [...QUARTILE_SPEEDS]

  const speedCount = Math.max(1, Math.round(100 / percentageStep))
  if (speedCount > MAX_SPEED_PILLS) return [...QUARTILE_SPEEDS]

  return Array.from({ length: speedCount }, (_, index) =>
    Math.round(((index + 1) * 100) / speedCount)
  )
}

/**
 * The pill the current percentage selects, or `undefined` when none does.
 *
 * Nearest within **half a step**, so a fan reporting a percentage between two
 * pills lights the one it is closest to, and a fan that is off (or parked at a
 * value no pill is near) lights none rather than misreporting its speed. The
 * half-step is derived from the pills themselves, so it stays correct for a
 * three-speed fan as much as for the quartile fallback.
 */
export function selectedSpeedStep(
  steps: readonly number[],
  percentage: unknown
): number | undefined {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return undefined
  if (steps.length === 0) return undefined

  const tolerance = 100 / steps.length / 2

  let nearest: number | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const step of steps) {
    const distance = Math.abs(step - percentage)
    if (distance < nearestDistance) {
      nearest = step
      nearestDistance = distance
    }
  }

  return nearestDistance <= tolerance ? nearest : undefined
}

/**
 * The percentage the card operates on, or `undefined` when the fan publishes
 * none it can use.
 *
 * The consumers are intolerant in different ways and none of them survives a
 * non-number: the slider positions its thumb from `value / max`, the state line
 * interpolates it into text, and the spin duration divides by it. Clamped
 * rather than rejected when out of range for the same reason the cover's
 * position is — a fan reporting `120` means "flat out".
 */
export function readFanPercentage(percentage: unknown): number | undefined {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return undefined
  return Math.min(100, Math.max(0, Math.round(percentage)))
}

/** The slowest and fastest the glyph is allowed to turn, in seconds per turn. */
export const FAN_SPIN_FASTEST_S = 0.5
export const FAN_SPIN_SLOWEST_S = 4
/** What a fan with no percentage to read spins at. */
export const FAN_SPIN_FIXED_S = 1.5

/**
 * How long one rotation of the glyph takes, in seconds.
 *
 * The option doc asks for a rate *proportional* to the percentage, so the
 * duration is inversely proportional to it — clamped at both ends, because
 * proportionality alone sends a fan at 1% to a minute per turn (indistinguishable
 * from stopped, which is the one thing the animation must not look like) and a
 * hypothetical 200% to a blur.
 *
 * A fan with no percentage — no `SET_SPEED`, or none reported — turns at a
 * single fixed rate, per the same section.
 */
export function fanSpinDurationSeconds(percentage: number | undefined): number {
  if (percentage === undefined || percentage <= 0) return FAN_SPIN_FIXED_S

  return Math.min(FAN_SPIN_SLOWEST_S, Math.max(FAN_SPIN_FASTEST_S, 60 / percentage))
}
