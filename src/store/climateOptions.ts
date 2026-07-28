import { z } from 'zod'
import { configPredatesVersion } from './configVersion'

/**
 * The climate card's option contract — the persisted shape of `variant`, the
 * `show*` toggles and `displayUnit` under `item.config`, the rules for reading
 * them back, and the loader migration that pins the presentation existing
 * thermostats were placed with.
 *
 * Spec: docs/specs/entity-cards/options/climate.md. Lives beside
 * `inputHelperOptions.ts` for the same reasons: `persistence.ts` is the
 * migration's caller, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
 *
 * Every reader here follows the same rule as `readCardDisplay`: a value this
 * build cannot interpret resolves to the key's default rather than being
 * rejected, and nothing is written back. Imports are gated upstream by
 * `dashboardConfigSchema`; the render path's job is to render
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */

/** The key the pinning migration writes, and the registry dispatches on. */
export const CLIMATE_VARIANT_KEY = 'variant'

/**
 * `compact` is the stepper/pills presentation and the default: defaults must
 * look right with zero configuration at any size, and the arc dial only earns
 * its space at `full`. `dial` is the arc thermostat, which falls back to the
 * compact layout below `full` rather than shrinking.
 */
export const CLIMATE_VARIANTS = ['compact', 'dial'] as const
export type ClimateVariant = (typeof CLIMATE_VARIANTS)[number]

/**
 * Display conversion only. Climate entities carry no per-entity
 * `temperature_unit`: Home Assistant normalises their values to
 * `hass.config.unit_system.temperature`, which is the native unit here. `auto`
 * shows that unit; the other two convert every temperature the card *displays*.
 * Service calls always send the native unit (option doc — `displayUnit`).
 */
export const CLIMATE_DISPLAY_UNITS = ['auto', 'celsius', 'fahrenheit'] as const
export type ClimateDisplayUnit = (typeof CLIMATE_DISPLAY_UNITS)[number]

export interface ClimateCardOptions {
  variant: ClimateVariant
  showModePills: boolean
  showPresets: boolean
  showFanModes: boolean
  showCurrentTemp: boolean
  showHumidity: boolean
  displayUnit: ClimateDisplayUnit
}

/**
 * The stored defaults.
 *
 * `showPresets`/`showFanModes` are off because presets and fan modes are
 * secondary controls most thermostat users touch rarely, and on by default they
 * crowd the `full` tier. The rest are on: the mode row is how a thermostat is
 * turned off, and the current temperature and humidity are readings rather than
 * controls — additive content, which convention 7 exempts from pinning.
 */
export const CLIMATE_OPTION_DEFAULTS: Readonly<ClimateCardOptions> = {
  variant: 'compact',
  showModePills: true,
  showPresets: false,
  showFanModes: false,
  showCurrentTemp: true,
  showHumidity: true,
  displayUnit: 'auto',
}

/**
 * The climate-key fragment of `item.config`, merged into the item schema.
 *
 * `variant` is deliberately **not** in it. The item config schema is one shape
 * shared by every domain, and `variant` is also the weather card's key with an
 * entirely different value set (`minimal`/`modern`/`detailed`) — an enum here
 * would reject every stored weather card. Whose variants are legal is the card
 * registry's question, and `getCardVariant` already answers it by resolving an
 * unknown name to nothing and falling back to the default card.
 */
export const climateOptionsConfigSchema = z.object({
  showModePills: z.boolean().optional(),
  showPresets: z.boolean().optional(),
  showFanModes: z.boolean().optional(),
  showCurrentTemp: z.boolean().optional(),
  showHumidity: z.boolean().optional(),
  displayUnit: z.enum(CLIMATE_DISPLAY_UNITS).optional(),
})

const readBoolean = (raw: unknown, fallback: boolean): boolean =>
  typeof raw === 'boolean' ? raw : fallback

/** Read the climate options out of a card's stored config. */
export function readClimateOptions(
  config: Record<string, unknown> | undefined
): ClimateCardOptions {
  const variant = z.enum(CLIMATE_VARIANTS).safeParse(config?.[CLIMATE_VARIANT_KEY])
  const displayUnit = z.enum(CLIMATE_DISPLAY_UNITS).safeParse(config?.displayUnit)

  return {
    variant: variant.success ? variant.data : CLIMATE_OPTION_DEFAULTS.variant,
    showModePills: readBoolean(config?.showModePills, CLIMATE_OPTION_DEFAULTS.showModePills),
    showPresets: readBoolean(config?.showPresets, CLIMATE_OPTION_DEFAULTS.showPresets),
    showFanModes: readBoolean(config?.showFanModes, CLIMATE_OPTION_DEFAULTS.showFanModes),
    showCurrentTemp: readBoolean(config?.showCurrentTemp, CLIMATE_OPTION_DEFAULTS.showCurrentTemp),
    showHumidity: readBoolean(config?.showHumidity, CLIMATE_OPTION_DEFAULTS.showHumidity),
    displayUnit: displayUnit.success ? displayUnit.data : CLIMATE_OPTION_DEFAULTS.displayUnit,
  }
}

/**
 * The version documents carrying pinned climate variants are stamped with.
 *
 * A version marker rather than key absence, because that is the discriminator
 * convention 7 requires: an absent `variant` is exactly what a climate card
 * added after this build carries when it means "take the compact default", so
 * pinning on absence would rewrite new cards on their first reload — the
 * failure the convention exists to prevent.
 *
 * `1.3.0` rather than the next free minor: change 0019's `speedControl` marker
 * claims `1.2.0` and merges first. Two migrations sharing one number is not a
 * merge conflict, it is a silent one — a document stamped `1.2.0` by whichever
 * build ran first would no longer *predate* the other's marker, so it would
 * skip that migration entirely, and the cards it was meant to pin would take
 * the new default with nothing in the config to explain it. Markers are
 * therefore allocated in merge order, and each one only ever moves up.
 */
export const CLIMATE_VARIANT_VERSION = '1.3.0'

/** Whether a stored document was written before the climate `variant` existed. */
export function configPredatesClimateVariant(version: unknown): boolean {
  return configPredatesVersion(version, CLIMATE_VARIANT_VERSION)
}

/**
 * Pin one pre-`variant` climate card to the arc thermostat it has always
 * rendered.
 *
 * Every climate card placed before this build renders the dial at `full`, and
 * the new `compact` default *replaces* that control surface — a drag-on-arc
 * setpoint becomes a stepper — which is exactly the replacement convention 7
 * names. An upgrade never silently swaps a dashboard's thermostat for a
 * different one; only newly added cards start compact.
 *
 * Returns the config unchanged, by reference, when nothing applies: a document
 * already carrying the key, a card of another domain, every load after the
 * first.
 */
export function pinLegacyClimateVariant(
  domain: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (domain !== 'climate') return config
  /*
   * An own-property check rather than `in`. The key is a fixed literal that no
   * prototype declares, so this is exactness rather than a fix — but "does this
   * document already say something" is a question about the document, and a
   * migration answering it from the prototype chain is the shape that bit the
   * mode lookup (`ClimateCard/climateModel.ts` — `hvacModeConfig`).
   */
  if (Object.prototype.hasOwnProperty.call(config, CLIMATE_VARIANT_KEY)) return config

  return { ...config, [CLIMATE_VARIANT_KEY]: 'dial' satisfies ClimateVariant }
}
