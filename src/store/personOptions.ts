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
 * `showBattery` and `batteryEntity` are specified in the same option table and
 * are deliberately **absent here** — they land with the derivation that gives
 * them meaning in PR 2 of change 0026. Declaring the keys early would put two
 * options in the config form that read nothing and hide nothing, which is worse
 * than their absence: a control that does not work is a bug report, a control
 * that does not exist yet is a roadmap.
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
}

export const PERSON_OPTION_KEYS = ['showZone', 'showLastChanged'] as const

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
})

/** Per-key schemas, so one bad value costs only its own key. */
const personKeySchemas: Readonly<Record<PersonOptionKey, z.ZodTypeAny>> = {
  showZone: z.boolean(),
  showLastChanged: z.boolean(),
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
  }
}
