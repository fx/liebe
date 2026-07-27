import { z } from 'zod'

/**
 * The input helpers' `controlStyle` option — which embedded control each helper
 * card renders — and the loader migration that pins the styles existing cards
 * were built with.
 *
 * Spec: docs/specs/entity-cards/options/input-helpers.md. Lives beside
 * `lightOptions.ts` for the same reasons: config handling first, `persistence.ts`
 * is the migration's caller, and a pure module keeps the card graph free of
 * another import edge (AGENTS.md — "Entity Card Registration").
 */

/** One key, three domains, three value sets — the option is per helper. */
export const CONTROL_STYLE_KEY = 'controlStyle'

export const BOOLEAN_CONTROL_STYLES = ['tile', 'switch'] as const
export const NUMBER_CONTROL_STYLES = ['stepper', 'slider'] as const
export const SELECT_CONTROL_STYLES = ['dropdown', 'pills'] as const

export type BooleanControlStyle = (typeof BOOLEAN_CONTROL_STYLES)[number]
export type NumberControlStyle = (typeof NUMBER_CONTROL_STYLES)[number]
export type SelectControlStyle = (typeof SELECT_CONTROL_STYLES)[number]

/** The union the import gate validates against — the key is shared. */
export const inputHelperOptionsConfigSchema = z.object({
  [CONTROL_STYLE_KEY]: z
    .enum([...BOOLEAN_CONTROL_STYLES, ...NUMBER_CONTROL_STYLES, ...SELECT_CONTROL_STYLES])
    .optional(),
})

/**
 * The configuration form's stand-in for "no explicit choice".
 *
 * Form-only, deliberately: the stored contract has exactly one spelling for
 * following the entity, and that is the key being absent. Selecting this in the
 * form removes the key rather than storing this string, so it never reaches
 * `item.config`, the import schema, or a YAML export — and a hand-written
 * document carrying it resolves through the same path as any other
 * unrecognised value, which is the entity-derived default it was asking for.
 */
export const FOLLOW_ENTITY_MODE = 'auto'

const readStyle = <T extends string>(
  config: Record<string, unknown> | undefined,
  allowed: readonly T[],
  fallback: T
): T => {
  const stored = config?.[CONTROL_STYLE_KEY]
  return typeof stored === 'string' && (allowed as readonly string[]).includes(stored)
    ? (stored as T)
    : fallback
}

/**
 * `tile` by default: the whole tile is the toggle, like a switch card, and no
 * discrete control renders.
 */
export function readBooleanControlStyle(
  config: Record<string, unknown> | undefined
): BooleanControlStyle {
  return readStyle(config, BOOLEAN_CONTROL_STYLES, 'tile')
}

/**
 * The number helper's default follows the entity's own `mode` attribute
 * (`box` → stepper, `slider` → slider), resolved at render and never stored —
 * so a helper reconfigured in Home Assistant keeps steering unconfigured cards.
 * Only an explicit option value pins the style.
 */
export function readNumberControlStyle(
  config: Record<string, unknown> | undefined,
  mode: unknown
): NumberControlStyle {
  return readStyle(config, NUMBER_CONTROL_STYLES, mode === 'slider' ? 'slider' : 'stepper')
}

export function readSelectControlStyle(
  config: Record<string, unknown> | undefined
): SelectControlStyle {
  return readStyle(config, SELECT_CONTROL_STYLES, 'dropdown')
}

/** How many options a pill group may hold before it would have to clip. */
export const MAX_PILL_OPTIONS = 5

/**
 * The helper's option list, as something safe to count and map.
 *
 * `options` is user-defined and arrives from a hand-editable helper, so it can
 * be absent, empty, or not a list at all; every one of those means "no options
 * to offer" rather than a card that throws while rendering.
 */
export function readSelectOptions(attributes: { options?: unknown } | undefined): string[] {
  const options = attributes?.options
  if (!Array.isArray(options)) return []
  return options.filter((option): option is string => typeof option === 'string')
}

/**
 * What the select card actually renders, which is not always what is stored.
 *
 * Pills need the `full` tier and at most five options; anywhere else the stored
 * `pills` degrades to the dropdown rather than clipping a row that does not fit
 * (docs/specs/design-system — degrade, never scroll). Resolved at render, so a
 * card re-engages its pills when the helper loses an option or the tile grows —
 * the stored config is never rewritten.
 */
export function resolveSelectPresentation(
  style: SelectControlStyle,
  tier: string,
  optionCount: number
): SelectControlStyle {
  if (style !== 'pills') return style

  // A helper with no options has no pills to render, and an empty pill group is
  // a card with nothing to operate at all. The dropdown at least renders, and
  // says it is disabled.
  if (optionCount === 0) return 'dropdown'

  return tier === 'full' && optionCount <= MAX_PILL_OPTIONS ? 'pills' : 'dropdown'
}

/** The bounds a helper publishes, all optional on a hand-edited one. */
export interface NumberHelperBounds {
  min?: number
  max?: number
  step?: number
}

/** `Number.prototype.toFixed` accepts 0–100 and throws a `RangeError` past it. */
const MAX_FRACTION_DIGITS = 100

/**
 * How many decimals the helper's own `step` implies — the precision at which a
 * value both displays and quantizes, so the number on screen is one the helper
 * would actually accept.
 *
 * Derived from the step rather than from a coarse "is it fractional" test: a
 * helper stepping by `0.01` was previously formatted to one place, so the card
 * showed a value the helper would immediately round, and the readout disagreed
 * with what could be set.
 *
 * Read off the decimal text rather than computed with logarithms, which is what
 * makes `0.3` (`log10` → -0.52…) and `0.001` come out right rather than one
 * place adrift. Exponent notation is handled separately because `String`
 * switches to it below `1e-6`, where the fraction digits are not in the text at
 * all — a `1e-7` step formatted from its literal text would read as zero
 * decimals. Clamped at what `toFixed` accepts: a hand-edited `step: 1e-300` is
 * absurd, but it is a number a YAML field can hold, and an unclamped count
 * would throw a `RangeError` in the middle of a render.
 */
export function decimalsFor(step?: number): number {
  if (!step || !Number.isFinite(step)) return 0

  const text = String(Math.abs(step))
  const exponentAt = text.indexOf('e')

  if (exponentAt === -1) {
    return Math.min((text.split('.')[1] ?? '').length, MAX_FRACTION_DIGITS)
  }

  const mantissaDecimals = (text.slice(0, exponentAt).split('.')[1] ?? '').length
  const exponent = Number(text.slice(exponentAt + 1))

  // A positive exponent is a step of 1e21 or more, which implies no decimals at
  // all; `Math.max` is what keeps that from going negative.
  return Math.min(Math.max(mantissaDecimals - exponent, 0), MAX_FRACTION_DIGITS)
}

/**
 * A slider position turned into a value the helper will accept: quantized to
 * `step` from `min`, then clamped to `[min, max]`.
 *
 * The helper's rules, not the control's, which is why this is shared rather
 * than living in the slider's handler — the stepper and the typed field apply
 * the same ones. A helper that publishes no bounds constrains nothing, and the
 * value passes through.
 */
export function quantizeHelperValue(value: number, { min, max, step }: NumberHelperBounds): number {
  const base = min ?? 0
  let quantized = step ? base + Math.round((value - base) / step) * step : value

  /*
   * `step` is routinely fractional (0.1, 0.5), and the arithmetic above
   * reintroduces the binary-float tail it exists to remove.
   *
   * Rounded at the step's own precision, never below four places. A fixed four
   * was the tail-trimming depth and doubled as a precision ceiling by accident:
   * a helper stepping by `1e-5` had its quantized value rounded straight back
   * off the grid it was just snapped to. The floor keeps every step of `0.0001`
   * or coarser — which is all of them in practice — trimming exactly as before.
   */
  quantized = Number.parseFloat(quantized.toFixed(Math.max(decimalsFor(step), 4)))

  if (min !== undefined) quantized = Math.max(quantized, min)
  if (max !== undefined) quantized = Math.min(quantized, max)

  return quantized
}

/**
 * The configuration version that introduced `controlStyle`.
 *
 * Everything written before it predates the option, which is what the pinning
 * migration keys on. Bumped from `1.0.0` because that is the discriminator
 * convention 7 requires: **never key absence**. An absent `controlStyle` is
 * exactly what a newly added card has when it means "follow the entity's
 * `mode`", so pinning on absence would rewrite new cards on their first reload
 * — the failure the convention exists to prevent.
 */
export const CONTROL_STYLE_VERSION = '1.1.0'

/** The styles existing cards were built with, per helper domain. */
const LEGACY_CONTROL_STYLES: Readonly<Record<string, string>> = {
  input_boolean: 'switch',
  input_number: 'stepper',
}

/**
 * Whether a stored document was written before `controlStyle` existed.
 *
 * A missing or unparseable version reads as legacy: documents predating the
 * field are old by definition, and pinning an old card to the control it
 * already had is harmless, while failing to pin one silently changes how a
 * placed card is operated.
 */
export function configPredatesControlStyle(version: unknown): boolean {
  if (typeof version !== 'string') return true

  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true

  const [currentMajor, currentMinor] = CONTROL_STYLE_VERSION.split('.').map(Number)
  return major < currentMajor || (major === currentMajor && minor < currentMinor)
}

/**
 * Pin one pre-`controlStyle` helper card to the control it has always rendered.
 *
 * Only `input_boolean` and `input_number` are pinned, because only they had a
 * control surface replaced by a new default (the discrete switch, the stepper).
 * `input_select`'s new default *is* its current dropdown, so there is nothing
 * to preserve — and pinning it would freeze a card that never changed.
 *
 * Returns the config unchanged, by reference, when nothing applies: a document
 * already carrying the key, a domain with no legacy style, every load after the
 * first.
 */
export function pinLegacyControlStyle(
  domain: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const legacy = LEGACY_CONTROL_STYLES[domain]
  if (!legacy) return config
  if (CONTROL_STYLE_KEY in config) return config

  return { ...config, [CONTROL_STYLE_KEY]: legacy }
}
