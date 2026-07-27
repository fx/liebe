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

  // `step` is routinely fractional (0.1, 0.5), and the arithmetic above
  // reintroduces the binary-float tail it exists to remove.
  quantized = Number.parseFloat(quantized.toFixed(4))

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
