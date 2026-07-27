import { z } from 'zod'
import { configPredatesVersion } from './configVersion'

/**
 * The fan card's option contract — the persisted shape of `speedControl`,
 * `showPresets`, `showOscillate`, `showDirection`, `animateIcon` and
 * `showPercentage` under `item.config` — plus the loader migration that pins
 * existing fan cards to the step control they were built with.
 *
 * Spec: docs/specs/entity-cards/options/fan.md. Lives in the store beside
 * `coverOptions.ts` for the same two reasons: `configSchema.ts` gates imports
 * with it and `persistence.ts` runs the migration, and a pure module keeps the
 * card graph free of another import edge (AGENTS.md — "Entity Card
 * Registration").
 *
 * What the options RESOLVE TO — which pill values, which one is selected, how
 * fast the glyph spins — is `src/components/FanCard/speedSteps.ts` and the card
 * itself, because that is arithmetic and presentation rather than validation.
 */

/** Style of the percentage control, where the entity supports `SET_SPEED`. */
export const FAN_SPEED_CONTROLS = ['slider', 'steps', 'none'] as const

export type FanSpeedControl = (typeof FAN_SPEED_CONTROLS)[number]

export interface FanOptions {
  speedControl: FanSpeedControl
  /** Preset-mode pills at `full`, where `preset_modes` is non-empty. */
  showPresets: boolean
  /** Oscillation toggle at `full`, where the entity supports `OSCILLATE`. */
  showOscillate: boolean
  /** Forward/reverse control at `full`, where the entity supports `DIRECTION`. */
  showDirection: boolean
  /** Spins the glyph while the fan runs, at a rate the speed sets. */
  animateIcon: boolean
  /** Adds the current percentage to the state line. */
  showPercentage: boolean
}

export const FAN_OPTION_KEYS = [
  'speedControl',
  'showPresets',
  'showOscillate',
  'showDirection',
  'animateIcon',
  'showPercentage',
] as const

export type FanOptionKey = (typeof FAN_OPTION_KEYS)[number]

/**
 * The stored defaults.
 *
 * `showDirection` is the one that defaults *off*: ceiling-fan direction is a
 * seasonal setting nobody touches twice a year, so it is opted into per card
 * rather than occupying a control slot on every fan.
 */
export const FAN_OPTION_DEFAULTS: Readonly<FanOptions> = {
  speedControl: 'slider',
  showPresets: true,
  showOscillate: true,
  showDirection: false,
  animateIcon: true,
  showPercentage: true,
}

const fanSpeedControlSchema = z.enum(FAN_SPEED_CONTROLS)

/** The fan fragment of `item.config`, merged into the item schema. */
export const fanOptionsConfigSchema = z.object({
  speedControl: fanSpeedControlSchema.optional(),
  showPresets: z.boolean().optional(),
  showOscillate: z.boolean().optional(),
  showDirection: z.boolean().optional(),
  animateIcon: z.boolean().optional(),
  showPercentage: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const fanKeySchemas: Readonly<Record<FanOptionKey, z.ZodTypeAny>> = {
  speedControl: fanSpeedControlSchema,
  showPresets: z.boolean(),
  showOscillate: z.boolean(),
  showDirection: z.boolean(),
  animateIcon: z.boolean(),
  showPercentage: z.boolean(),
}

/**
 * Read the fan options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * render path declining to fail over a value that reached localStorage some
 * other way, since imports are rejected by `dashboardConfigSchema` first
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
export function readFanOptions(config: Record<string, unknown> | undefined): FanOptions {
  const read = <K extends FanOptionKey>(key: K): FanOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return FAN_OPTION_DEFAULTS[key]

    const parsed = fanKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as FanOptions[K])
      : (FAN_OPTION_DEFAULTS[key] as FanOptions[K])
  }

  return {
    speedControl: read('speedControl'),
    showPresets: read('showPresets'),
    showOscillate: read('showOscillate'),
    showDirection: read('showDirection'),
    animateIcon: read('animateIcon'),
    showPercentage: read('showPercentage'),
  }
}

/** The key the pinning migration writes, and the card reads. */
export const SPEED_CONTROL_KEY = 'speedControl'

/**
 * The version documents carrying pinned fan speed controls are stamped with.
 *
 * Bumped from `CONTROL_STYLE_VERSION` because that is the discriminator
 * convention 7 requires: **never key absence**. An absent `speedControl` is
 * exactly what a newly created fan card has when it means "take the current
 * default", so pinning on absence would rewrite new cards on their first
 * reload.
 */
export const SPEED_CONTROL_VERSION = '1.2.0'

/** Whether a stored document was written before `speedControl` existed. */
export function configPredatesSpeedControl(version: unknown): boolean {
  return configPredatesVersion(version, SPEED_CONTROL_VERSION)
}

/**
 * Pin one pre-`speedControl` fan card to the step control it has always
 * rendered.
 *
 * The slider default *replaces* how an existing fan card is operated — four
 * discrete pills become a continuous drag — which is exactly the control-surface
 * replacement convention 7 names, and it names this migration among its
 * examples. Nothing else on the card is pinned: `showOscillate` and
 * `showDirection` add controls beside unchanged ones, and `animateIcon` /
 * `showPercentage` are presentation, all of which follow the new defaults
 * deliberately.
 *
 * Returns the config unchanged, by reference, when nothing applies: a document
 * already carrying the key, a card of another domain, every load after the
 * first.
 */
export function pinLegacyFanSpeedControl(
  domain: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (domain !== 'fan') return config
  if (SPEED_CONTROL_KEY in config) return config

  return { ...config, [SPEED_CONTROL_KEY]: 'steps' }
}
