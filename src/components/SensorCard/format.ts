import type { SensorCardOptions } from '~/store/sensorOptions'

/**
 * The sensor card's one value-formatting pipeline: raw value → `valueScale` →
 * `displayPrecision` → unit, used for the main value, the trend delta and the
 * `full` tier's min/max footer alike.
 *
 * Spec: docs/specs/entity-cards/options/sensor.md. The `displayPrecision: auto`
 * rules and the `valueScale: auto` k-scaling are behaviour that already shipped
 * and are marked MUST-not-regress there; `src/components/__tests__/sensorFormatting.test.tsx`
 * pins the matrix through the rendered card, and was written before this module
 * existed so the two can be compared rather than trusted.
 *
 * One function for every surface is the design decision (change 0018): a
 * per-surface formatter is how a footer ends up disagreeing with the value
 * directly above it.
 */

/** What the entity contributes: the two attributes formatting depends on. */
export interface SensorFormatContext {
  deviceClass?: string
  /** The entity's `unit_of_measurement`; `unitOverride` replaces it. */
  unit?: string
}

/** The formatting-relevant slice of the card's options. */
export type SensorFormatOptions = Pick<
  SensorCardOptions,
  'displayPrecision' | 'valueScale' | 'unitOverride'
>

export interface FormattedSensorValue {
  /** The number and its unit, as rendered. */
  text: string
  /**
   * The number as rendered, parsed back — i.e. scaled and rounded. What a
   * caller must compare against zero: a delta of `0.04` shown at one decimal
   * reads `0.0`, and an arrow claiming it rose is the card disagreeing with
   * its own text.
   */
  value: number
  /** Whether `valueScale` divided by a thousand and prefixed the unit. */
  scaled: boolean
  /** The unit as rendered, `k` prefix included; `''` when there is none. */
  unit: string
}

/** Device classes whose values k-scale under `valueScale: auto`. */
const SCALED_DEVICE_CLASSES = new Set(['energy', 'power'])

/** The magnitude at or above which those values scale. */
const SCALE_THRESHOLD = 1000

/**
 * The decimals `displayPrecision: auto` chooses.
 *
 * These are the shipped rules, restated: `temperature` one decimal;
 * `humidity`/`battery` rounded; `energy`/`power` integer, or one decimal once
 * scaled; everything else by magnitude.
 */
function autoPrecision(value: number, deviceClass: string | undefined, scaled: boolean): number {
  switch (deviceClass) {
    case 'temperature':
      return 1
    case 'humidity':
    case 'battery':
      return 0
    case 'energy':
    case 'power':
      return scaled ? 1 : 0
    default:
      /*
       * Magnitude defaults. Two details are the shipped behaviour rather than
       * the obvious reading of "magnitude", and the pinned matrix exists to
       * keep them:
       *
       *  - `value % 1 === 0` comes first, so a whole number renders whole
       *    whatever its size — this is not a bucketed table.
       *  - the comparisons are SIGNED, not on the absolute value. Every
       *    negative reading therefore takes the two-decimal branch: `-18.75`
       *    renders in full, where a magnitude comparison would round it to
       *    `-18.8`. Widening these to `Math.abs` is a silent change to every
       *    negative sensor on every dashboard.
       */
      if (value % 1 === 0) return 0
      if (value < 10) return 2
      if (value < 100) return 1
      return 0
  }
}

/**
 * Run one number through the pipeline.
 *
 * The scaling condition is deliberately `>= 1000` on the signed value rather
 * than on its magnitude, which is what ships today: a `-1500 W` export reading
 * renders `-1500 W`, not `-1.5 kW`. Widening it to the magnitude would be a
 * behaviour change to a MUST-not-regress rule, and it belongs to whoever
 * decides that negative power readings should scale — not to the change that
 * was adding options around it.
 *
 * Scaling also requires a unit to prefix. Dividing by a thousand is only
 * meaningful if the card can say `k` about it, and a unitless sensor with no
 * `unit_of_measurement` and no `unitOverride` would otherwise report `1250` as
 * `1.3 k` — a number silently a thousand times too small, followed by a stray
 * letter. (Pinned as the old behaviour in the matrix test, and changed here on
 * purpose.)
 */
export function formatSensorNumber(
  value: number,
  { deviceClass, unit }: SensorFormatContext,
  { displayPrecision, valueScale, unitOverride }: SensorFormatOptions
): FormattedSensorValue {
  const baseUnit = unitOverride || unit || ''
  const scaled =
    valueScale === 'auto' &&
    baseUnit !== '' &&
    SCALED_DEVICE_CLASSES.has(deviceClass ?? '') &&
    value >= SCALE_THRESHOLD

  const scaledValue = scaled ? value / SCALE_THRESHOLD : value
  const decimals =
    displayPrecision === 'auto' ? autoPrecision(scaledValue, deviceClass, scaled) : displayPrecision
  const rendered = scaledValue.toFixed(decimals)
  const renderedUnit = scaled ? `k${baseUnit}` : baseUnit

  return {
    text: renderedUnit ? `${rendered} ${renderedUnit}` : rendered,
    // Read back from the rendered digits rather than recomputed, so "what the
    // card says" and "what the card decided" cannot come apart.
    value: Number(rendered),
    scaled,
    unit: renderedUnit,
  }
}

/**
 * Whether a state carries a reading at all.
 *
 * `Number('')` is `0` and `Number('  ')` is `0`, so a blank state would
 * otherwise parse as a perfectly good zero and then format as `NaN` through
 * `parseFloat` — which is what shipped. A state with no digits in it is not a
 * reading, whatever `Number` makes of it.
 */
function readNumericState(state: string): number | undefined {
  if (state.trim() === '') return undefined
  const value = Number(state)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Format an entity state for display.
 *
 * Non-numeric states — `unavailable`, `unknown`, a timestamp, a word, a blank —
 * pass through upper-cased, unit and all options ignored: there is no number
 * for a precision or a scale to apply to, and appending `°C` to `UNAVAILABLE`
 * would read as a measurement.
 */
export function formatSensorState(
  state: string,
  context: SensorFormatContext,
  options: SensorFormatOptions
): string {
  const value = readNumericState(state)
  // Trimmed, so a state that is nothing but whitespace reads as nothing at all
  // rather than as a value line holding three spaces.
  if (value === undefined) return state.trim().toUpperCase()
  return formatSensorNumber(value, context, options).text
}

/**
 * One number at a fixed decimal count, or `—` when the state carries no
 * reading. The number-helper card's value formatter: its step decides the
 * decimals, and an unrestored helper (`unknown`, `unavailable`) renders the
 * em-dash rather than a `NaN` literal or a scaled value. Split out from the
 * sensor pipeline on purpose — `formatSensorNumber` scales energy/power and
 * upper-cases non-numeric states, neither of which a helper value wants.
 */
export function formatFixedNumber(state: string, decimals: number): string {
  if (state.trim() === '') return '—'
  const value = Number(state)
  return Number.isFinite(value) ? value.toFixed(decimals) : '—'
}

/** Which way a trend arrow points. */
export type SensorTrendDirection = 'up' | 'down' | 'flat'

export interface SensorTrend {
  direction: SensorTrendDirection
  /** The signed delta, formatted through the same pipeline as the value. */
  text: string
}

/** The arrow glyph for a direction, as the option doc writes them. */
export const TREND_ARROWS: Readonly<Record<SensorTrendDirection, string>> = {
  up: '↑',
  down: '↓',
  flat: '→',
}

/**
 * The trend arrow and signed delta for a movement over the graph window.
 *
 * The direction comes from the delta as *rendered*, not as computed: a
 * movement too small to survive the card's own precision must read as flat,
 * because an arrow beside `+0.0` is the card contradicting itself. A negative
 * delta already carries its minus sign from `toFixed`; only the positive case
 * needs one added, and a flat one gets neither.
 */
export function formatSensorTrend(
  delta: number,
  context: SensorFormatContext,
  options: SensorFormatOptions
): SensorTrend {
  const formatted = formatSensorNumber(delta, context, options)
  if (formatted.value > 0) return { direction: 'up', text: `+${formatted.text}` }
  if (formatted.value < 0) return { direction: 'down', text: formatted.text }
  // `-0` renders as `-0.0`, which is a rounded-away decrease claiming a sign.
  return { direction: 'flat', text: formatted.text.replace('-', '') }
}
