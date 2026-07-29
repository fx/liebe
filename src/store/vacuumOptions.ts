import { z } from 'zod'
import { configPredatesVersion } from './configVersion'

/**
 * The vacuum card's option contract — the persisted shape of `showCommands`,
 * `showBattery`, `showFanSpeed`, `showLocate` and `showStats` under
 * `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/vacuum.md — "Options". Lives in the
 * store beside its siblings for the same two reasons: `configSchema.ts` gates
 * imports with it, and a pure module keeps the card graph free of another import
 * edge (AGENTS.md — "Entity Card Registration").
 *
 * **The whole option surface is declared here, including the keys whose controls
 * land in PR 2.** The stored contract is what a shared YAML is validated
 * against, and a document is written by whichever build the author happened to
 * run: rejecting `showLocate: true` because this build does not draw the button
 * yet would fail a document that is valid against the option doc. Which keys
 * currently *do* something is a property of the renderer, recorded per key
 * below, not of the contract.
 */

export interface VacuumOptions {
  /** Live: gates the command cluster (start/pause + dock). */
  showCommands: boolean
  /** Live: appends the battery percentage to the state line. */
  showBattery: boolean
  /** Reserved by this build; the fan-speed select is change 0025 PR 2. */
  showFanSpeed: boolean
  /** Reserved by this build; the locate button is change 0025 PR 2. */
  showLocate: boolean
  /** Reserved by this build; the stats line is change 0025 PR 2. */
  showStats: boolean
}

export const VACUUM_OPTION_KEYS = [
  'showCommands',
  'showBattery',
  'showFanSpeed',
  'showLocate',
  'showStats',
] as const

export type VacuumOptionKey = (typeof VACUUM_OPTION_KEYS)[number]

/**
 * The stored defaults, from the option doc's table.
 *
 * Commands, battery and fan speed are on because they are why a vacuum card
 * exists and what a glance at one is for; locate and stats are off because
 * locating is occasional and not every integration reports stats, so both would
 * be noise on the common card (docs/specs/entity-cards/options/common.md —
 * "Defaults are the researched common case").
 */
export const VACUUM_OPTION_DEFAULTS: Readonly<VacuumOptions> = {
  showCommands: true,
  showBattery: true,
  showFanSpeed: true,
  showLocate: false,
  showStats: false,
}

/**
 * The vacuum fragment of `item.config`, merged into the item schema.
 *
 * Every key is a boolean, so there is no closed enum here whose misspelling
 * would look like a working card — but they are still validated at the gate
 * rather than waved through, because all five read "not the disabling value" as
 * enabled: `showCommands: "false"` is a string, so it is not `false`, so a
 * dashboard that asked to hide the cluster would silently keep it. A document
 * whose author needs telling beats a card that quietly disagrees with them.
 */
export const vacuumOptionsConfigSchema = z.object({
  showCommands: z.boolean().optional(),
  showBattery: z.boolean().optional(),
  showFanSpeed: z.boolean().optional(),
  showLocate: z.boolean().optional(),
  showStats: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const vacuumKeySchemas: Readonly<Record<VacuumOptionKey, z.ZodTypeAny>> = {
  showCommands: z.boolean(),
  showBattery: z.boolean(),
  showFanSpeed: z.boolean(),
  showLocate: z.boolean(),
  showStats: z.boolean(),
}

/**
 * Read the vacuum options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as every sibling reader, and for the same reason: imports are
 * rejected by `dashboardConfigSchema` before a card renders, so this is the
 * render path declining to fail over a value that reached localStorage some
 * other way (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 * The stored document is never written back, so a round trip preserves whatever
 * its author wrote.
 */
export function readVacuumOptions(config: Record<string, unknown> | undefined): VacuumOptions {
  const read = <K extends VacuumOptionKey>(key: K): VacuumOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return VACUUM_OPTION_DEFAULTS[key]

    const parsed = vacuumKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as VacuumOptions[K])
      : (VACUUM_OPTION_DEFAULTS[key] as VacuumOptions[K])
  }

  return {
    showCommands: read('showCommands'),
    showBattery: read('showBattery'),
    showFanSpeed: read('showFanSpeed'),
    showLocate: read('showLocate'),
    showStats: read('showStats'),
  }
}

/**
 * The version documents carrying pinned vacuum taps are stamped with.
 *
 * `1.5.0` because `MEDIA_PLAYER_CARD_VERSION` claims `1.4.0` and is the highest
 * marker on `main`. Markers are allocated in merge order and only ever move up:
 * two migrations sharing a number is not a merge conflict but a silent one — a
 * document stamped by whichever build ran first would no longer *predate* the
 * other's marker and would skip that migration entirely
 * (`climateOptions.ts` — `CLIMATE_VARIANT_VERSION`).
 */
export const VACUUM_CARD_VERSION = '1.5.0'

/** Whether a stored document was written before the vacuum card existed. */
export function configPredatesVacuumCard(version: unknown): boolean {
  return configPredatesVersion(version, VACUUM_CARD_VERSION)
}

/**
 * Pin one pre-card `vacuum` item to the power toggle its tap has always
 * performed.
 *
 * Convention 7, mirroring the media player's pin. Before this change there was
 * no `vacuum` entry in `domainToCard`, so every placed vacuum rendered the
 * **fallback** card, whose body tap is `homeassistant.toggle` — power. This
 * build gives the domain a card whose `default` tap runs the state machine.
 * Without a pin, upgrading would silently repurpose a tap that has always cut
 * power into one that starts a cleaning run, on cards the user placed and never
 * reconfigured.
 *
 * The pin writes the universal `tapAction: 'toggle'` rather than a
 * family-specific key, because "keep toggling power" is exactly what that
 * universal value already means — there is no new option to pin to, only the old
 * behaviour to name explicitly (docs/changes/0025 — "Legacy pinning").
 *
 * Returns the config unchanged, by reference, when nothing applies: a document
 * already stating a `tapAction`, a card of another domain, every load after the
 * first.
 */
export function pinLegacyVacuumAction(
  domain: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (domain !== 'vacuum') return config
  /*
   * An own-property check rather than `in`, as the sibling pins do: "does this
   * document already say something" is a question about the document, and a
   * migration answering it from the prototype chain is a bug waiting for a key
   * named like one of `Object.prototype`'s.
   */
  if (Object.prototype.hasOwnProperty.call(config, 'tapAction')) return config

  return { ...config, tapAction: 'toggle' }
}
