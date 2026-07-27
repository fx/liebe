import { configPredatesVersion } from './configVersion'

/**
 * The climate card's `variant` option — which temperature control the card
 * renders — and the loader migration that pins the presentation existing
 * thermostats were placed with.
 *
 * Spec: docs/specs/entity-cards/options/climate.md. Lives beside
 * `inputHelperOptions.ts` for the same reasons: `persistence.ts` is the
 * migration's caller, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
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
  if (CLIMATE_VARIANT_KEY in config) return config

  return { ...config, [CLIMATE_VARIANT_KEY]: 'dial' satisfies ClimateVariant }
}
