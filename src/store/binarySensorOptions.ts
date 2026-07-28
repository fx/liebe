import { z } from 'zod'

/**
 * The binary sensor card's option contract — the persisted shape of `onIcon`,
 * `offIcon`, `onLabel`, `offLabel` and `invert` under `item.config`, and the
 * rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/sensor.md — "Binary sensor". Lives in
 * the store beside `cardDisplay.ts` for the same two reasons as its siblings:
 * `configSchema.ts` gates imports with it, and a pure module keeps the card
 * graph free of another import edge (AGENTS.md — "Entity Card Registration").
 *
 * This module is the contract only. What the options RESOLVE TO on screen —
 * which glyph, which label, which tint, and what a hazard takes back — is
 * `src/components/BinarySensorCard/presentation.ts`, because that is
 * presentation rather than config validation.
 */

export interface BinarySensorOptions {
  /** Icon while presented-on; `''` falls back to the `device_class` pair. */
  onIcon: string
  /** Icon while presented-off; same fallback chain. */
  offIcon: string
  /** State text while presented-on; `''` uses the `device_class` naming. */
  onLabel: string
  /** State text while presented-off; `''` uses the `device_class` naming. */
  offLabel: string
  /** Swaps the on/off presentation for a sensor wired backwards. */
  invert: boolean
}

export const BINARY_SENSOR_OPTION_KEYS = [
  'onIcon',
  'offIcon',
  'onLabel',
  'offLabel',
  'invert',
] as const

export type BinarySensorOptionKey = (typeof BINARY_SENSOR_OPTION_KEYS)[number]

/**
 * The stored defaults — all five "leave the card alone".
 *
 * `onIcon`/`offIcon` default to `''` rather than to the `CircleCheck`/`Circle`
 * names the configuration form has always shown: an empty value means "use the
 * device-class pair, and the generic pair only if there is none", which is what
 * the card already did for an unset key. Defaulting them to the generic names
 * would pin every door sensor to a tick and a circle the moment its form was
 * opened and saved.
 */
export const BINARY_SENSOR_OPTION_DEFAULTS: Readonly<BinarySensorOptions> = {
  onIcon: '',
  offIcon: '',
  onLabel: '',
  offLabel: '',
  invert: false,
}

/** The binary-sensor fragment of `item.config`, merged into the item schema. */
export const binarySensorOptionsConfigSchema = z.object({
  onIcon: z.string().optional(),
  offIcon: z.string().optional(),
  onLabel: z.string().optional(),
  offLabel: z.string().optional(),
  invert: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const binarySensorKeySchemas: Readonly<Record<BinarySensorOptionKey, z.ZodTypeAny>> = {
  onIcon: z.string(),
  offIcon: z.string(),
  onLabel: z.string(),
  offLabel: z.string(),
  invert: z.boolean(),
}

/**
 * Read the binary sensor options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
export function readBinarySensorOptions(
  config: Record<string, unknown> | undefined
): BinarySensorOptions {
  const read = <K extends BinarySensorOptionKey>(key: K): BinarySensorOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return BINARY_SENSOR_OPTION_DEFAULTS[key]

    const parsed = binarySensorKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as BinarySensorOptions[K])
      : (BINARY_SENSOR_OPTION_DEFAULTS[key] as BinarySensorOptions[K])
  }

  return {
    onIcon: read('onIcon'),
    offIcon: read('offIcon'),
    onLabel: read('onLabel'),
    offLabel: read('offLabel'),
    invert: read('invert'),
  }
}
