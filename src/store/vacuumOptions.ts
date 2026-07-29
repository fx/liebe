import { z } from 'zod'

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
  /** Live: gates the fan-speed select at `full`. */
  showFanSpeed: boolean
  /** Live: gates the locate button at `full`. */
  showLocate: boolean
  /** Live: gates the stats line. */
  showStats: boolean
  /**
   * The battery sensor to read, overriding the one derived from the vacuum's
   * device.
   *
   * Empty means "derive it". When set it comes **first** in the chain, ahead of
   * the derived sibling — that is what makes it an override rather than a
   * suggestion. A device exposing more than one battery (a vacuum with a
   * separate mop-pad cell) makes the derived answer *a* battery rather than
   * *the* battery, and correcting that pick is the whole reason this key
   * exists; a setting that lost to the value it replaces could never do its job
   * (`~/utils/deviceSiblings` — `findBatterySibling`).
   */
  batteryEntity: string
}

export const VACUUM_OPTION_KEYS = [
  'showCommands',
  'showBattery',
  'showFanSpeed',
  'showLocate',
  'showStats',
  'batteryEntity',
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
  batteryEntity: '',
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
  batteryEntity: z.string().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const vacuumKeySchemas: Readonly<Record<VacuumOptionKey, z.ZodTypeAny>> = {
  showCommands: z.boolean(),
  showBattery: z.boolean(),
  showFanSpeed: z.boolean(),
  showLocate: z.boolean(),
  showStats: z.boolean(),
  batteryEntity: z.string(),
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
    batteryEntity: read('batteryEntity'),
  }
}
