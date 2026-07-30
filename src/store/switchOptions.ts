import { z } from 'zod'
import { CONFIRM_DEFAULT, confirmOptionSchema, confirmOptionsConfigSchema } from './confirmOption'

/**
 * The switch/fallback card's option contract — the persisted shape of
 * `confirm`, `deviceClassIcon`, `stateLabels` and `showLastChanged` under
 * `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/switch.md. The card these belong to is
 * also the fallback for every domain with no registry entry, so every option
 * here MUST be safe on an arbitrary entity: no crash, no `device_class` lookup
 * outside `switch`, no state text a foreign domain did not report.
 *
 * Lives in the store, beside `cardActions` and `cardDisplay`, for the same two
 * reasons: `configSchema.ts` gates imports with it, and a pure module keeps the
 * card graph free of another import edge (AGENTS.md — "Entity Card
 * Registration"). `confirm` in particular is read by the *shell*, which must be
 * able to gate an action without importing the card that named the option.
 */

/** Optional per-state text replacing the state line's `on`/`off` rendering. */
export interface SwitchStateLabels {
  onLabel: string
  offLabel: string
}

export interface SwitchCardOptions {
  confirm: boolean
  deviceClassIcon: boolean
  stateLabels: SwitchStateLabels
  showLastChanged: boolean
}

export const SWITCH_OPTION_KEYS = [
  'confirm',
  'deviceClassIcon',
  'stateLabels',
  'showLastChanged',
] as const

export type SwitchOptionKey = (typeof SWITCH_OPTION_KEYS)[number]

/**
 * The stored defaults. `deviceClassIcon` defaults on because deriving an outlet
 * glyph from an outlet is what the card would do if it could; everything else
 * defaults to "leave the card as it was before the option existed".
 */
export const SWITCH_OPTION_DEFAULTS: Readonly<SwitchCardOptions> = {
  confirm: CONFIRM_DEFAULT,
  deviceClassIcon: true,
  stateLabels: { onLabel: '', offLabel: '' },
  showLastChanged: false,
}

/**
 * The stored shape of the label pair. Exported so the import gate can spell out
 * the one legacy tolerance it carries for this key — a cover card written before
 * change 0038 stores a style *string* here (see `./configSchema`) — without
 * restating the shape and letting the two drift.
 */
export const switchStateLabelsSchema = z
  .object({
    onLabel: z.string().optional(),
    offLabel: z.string().optional(),
  })
  .strict()

/**
 * The switch-key fragment of `item.config`, merged into the item schema.
 *
 * `confirm` comes from the shared gate fragment rather than being declared here:
 * the action family offers the same option, and `configSchema.ts` merges both
 * fragments into one schema where `zod.merge()` is last-one-wins. Merging the
 * same object is what stops the two from ever governing each other
 * (see `./confirmOption`).
 */
export const switchOptionsConfigSchema = z
  .object({
    deviceClassIcon: z.boolean().optional(),
    stateLabels: switchStateLabelsSchema.optional(),
    showLastChanged: z.boolean().optional(),
  })
  .merge(confirmOptionsConfigSchema)

/** Per-key schemas, so one bad value costs only its own key. */
const switchKeySchemas: Readonly<Record<SwitchOptionKey, z.ZodTypeAny>> = {
  confirm: confirmOptionSchema,
  deviceClassIcon: z.boolean(),
  stateLabels: switchStateLabelsSchema,
  showLastChanged: z.boolean(),
}

/**
 * Read the switch options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardAction`/`readCardDisplay`, and for the same reason:
 * imports are rejected by `dashboardConfigSchema` long before a card renders,
 * so this is the render path declining to crash a dashboard over a value that
 * reached localStorage some other way.
 */
export function readSwitchOptions(config: Record<string, unknown> | undefined): SwitchCardOptions {
  const read = <K extends SwitchOptionKey>(key: K): SwitchCardOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return SWITCH_OPTION_DEFAULTS[key]

    const parsed = switchKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as SwitchCardOptions[K])
      : (SWITCH_OPTION_DEFAULTS[key] as SwitchCardOptions[K])
  }

  const stateLabels = read('stateLabels')

  return {
    confirm: read('confirm'),
    deviceClassIcon: read('deviceClassIcon'),
    // Normalized to both keys present, so callers never re-derive the absence.
    stateLabels: {
      onLabel: stateLabels.onLabel ?? SWITCH_OPTION_DEFAULTS.stateLabels.onLabel,
      offLabel: stateLabels.offLabel ?? SWITCH_OPTION_DEFAULTS.stateLabels.offLabel,
    },
    showLastChanged: read('showLastChanged'),
  }
}

/**
 * The state line's text for a state, with `on`/`off` remapped by the labels.
 *
 * Only ever `on` and `off`: every other state — including whatever a fallback
 * domain reports, and `unavailable` — renders raw, because a label that reads
 * "Brewing" on a state that is neither on nor off is a card lying about the
 * entity. An empty or absent label falls through to the same raw rendering.
 */
export function resolveSwitchStateLabel(state: string, labels: SwitchStateLabels): string {
  if (state === 'on' && labels.onLabel) return labels.onLabel
  if (state === 'off' && labels.offLabel) return labels.offLabel
  return state.toUpperCase()
}
