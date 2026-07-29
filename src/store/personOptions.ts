import { z } from 'zod'

/**
 * The person card's option contract — the persisted shape of `showZone` and
 * `showLastChanged` under `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/person.md — "Options". Lives in the
 * store beside its siblings for the same two reasons: `configSchema.ts` gates
 * imports with it, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
 *
 * This module is the contract only. What the options RESOLVE TO on screen —
 * presence, zone label, initials and the avatar's identity colour — is
 * `src/components/PersonCard/presentation.ts`.
 */

export interface PersonOptions {
  /** Renders the presence/zone name as the card's state line. */
  showZone: boolean
  /** Renders how long the person has held this presence, at `row` and `full`. */
  showLastChanged: boolean
  /**
   * Renders the battery percentage of the person's tracker, at `row` and
   * `full`. On by default, and self-hiding: it shows only where a level is
   * actually derivable, so the default costs nothing on a person whose trackers
   * report none.
   */
  showBattery: boolean
  /**
   * An explicit battery sensor to read, which overrides derivation.
   *
   * `''` means derive. It is the answer for a tracker whose device the registry
   * does not join — 20 of 95 entities on a small instance carry no `device_id`
   * — which is exactly when auto-derivation cannot answer and is therefore
   * exactly when the override has to be reachable.
   */
  batteryEntity: string
}

export const PERSON_OPTION_KEYS = [
  'showZone',
  'showLastChanged',
  'showBattery',
  'batteryEntity',
] as const

export type PersonOptionKey = (typeof PERSON_OPTION_KEYS)[number]

/**
 * The stored defaults — both on.
 *
 * A person card with neither would be an avatar and a name, which is a contact
 * photo rather than a presence card; the option doc defaults both to `true` and
 * this follows it.
 */
export const PERSON_OPTION_DEFAULTS: Readonly<PersonOptions> = {
  showZone: true,
  showLastChanged: true,
  showBattery: true,
  batteryEntity: '',
}

/**
 * The person fragment of `item.config`, merged into the item schema.
 *
 * `showLastChanged` is declared here as `z.boolean().optional()` — structurally
 * identical to the switch fragment's, which is what keeps the two out of
 * `configSchema.keyCollisions`: the merge is then a no-op rather than one
 * family's validation silently replacing another's. Both families mean the same
 * thing by the key (how long the entity has held its current state), so sharing
 * it is the intent rather than a coincidence the guard tolerates.
 */
export const personOptionsConfigSchema = z.object({
  showZone: z.boolean().optional(),
  showLastChanged: z.boolean().optional(),
  showBattery: z.boolean().optional(),
  batteryEntity: z.string().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const personKeySchemas: Readonly<Record<PersonOptionKey, z.ZodTypeAny>> = {
  showZone: z.boolean(),
  showLastChanged: z.boolean(),
  showBattery: z.boolean(),
  batteryEntity: z.string(),
}

/**
 * Read the person options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
export function readPersonOptions(config: Record<string, unknown> | undefined): PersonOptions {
  const read = <K extends PersonOptionKey>(key: K): PersonOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return PERSON_OPTION_DEFAULTS[key]

    const parsed = personKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as PersonOptions[K])
      : (PERSON_OPTION_DEFAULTS[key] as PersonOptions[K])
  }

  return {
    showZone: read('showZone'),
    showLastChanged: read('showLastChanged'),
    showBattery: read('showBattery'),
    batteryEntity: read('batteryEntity'),
  }
}
