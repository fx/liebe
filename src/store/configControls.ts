import { z } from 'zod'

/**
 * The value contracts behind the shared non-scalar configuration controls — the
 * entity picker, the number array, and the ordered multi-select.
 *
 * Spec: docs/specs/entity-cards/options/common.md. Unlike `cardActions.ts` and
 * `cardDisplay.ts`, which own specific universal keys, this module owns *shapes*
 * that later per-card changes bind to their own keys: `motionEntity` /
 * `doorEntity` / `batteryEntity` are entity links, `brightnessPresets` is a
 * bounded number array, and `armModes` is an ordered selection over a canonical
 * enum. Building the shapes once is the point of change 0014 — a card change
 * that invented its own would also invent its own validation.
 *
 * Two kinds of function live here, and the difference is the whole design:
 *
 * - The **schemas** are strict, and are what a config schema composes so the
 *   import gate rejects a bad value naming the field that produced it.
 * - The **readers** are for the render path, which must never crash a dashboard
 *   over a value it cannot interpret. They resolve what this build understands
 *   and ignore the rest **without rewriting anything** — a stored value this
 *   version does not recognise survives the round trip untouched
 *   (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */

/**
 * `domain.object_id`, the only shape a Home Assistant entity id takes — the
 * same rule Core's own `valid_entity_id` applies: lowercase alphanumerics and
 * underscores, with no leading, trailing, or doubled underscore in either
 * segment. Copied rather than loosened so the schema rejects exactly what Home
 * Assistant would refuse to create. Core spells it this way — read from the
 * running Home Assistant container's own `homeassistant/core.py`:
 *
 *     ^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$
 *
 * We accept and reject exactly those strings, but without the lookarounds:
 * `(?<!_)` is lookbehind, which Safari before 16.4 cannot *parse*, so a regex
 * literal using it is a syntax error that takes the whole module down rather
 * than degrading validation — and a wall-mounted tablet or an iPhone running
 * the companion app is a realistic client for this panel. Writing the segment
 * as "alphanumeric runs joined by single underscores" states the rule directly
 * instead of asserting three separate things about it, and uses nothing beyond
 * ES3 regex syntax. `configControls.test.ts` pins the two forms together over
 * an exhaustive corpus, so this stays a restatement and never drifts into a
 * relaxation.
 */
const ENTITY_ID_SEGMENT = String.raw`[\da-z]+(?:_[\da-z]+)*`
const ENTITY_ID_PATTERN = new RegExp(`^${ENTITY_ID_SEGMENT}\\.${ENTITY_ID_SEGMENT}$`)

export const entityIdSchema = z
  .string()
  .regex(ENTITY_ID_PATTERN, 'entity id must be written as "domain.object_id"')

/**
 * A linked-entity option: an entity id, or `''` for "nothing linked" — the
 * default every consumer of the picker uses, because linking an entity is
 * always opt-in (common contract, convention 3: an option reads an entity the
 * user already has, it never creates one).
 *
 * An id naming an entity this Home Assistant does not have is **valid**: the
 * entity may be renamed, disabled, or simply not exist on the machine importing
 * the config. Only a malformed id is rejected.
 */
export const entityLinkSchema = z.union([z.literal(''), entityIdSchema])

/** The stored default for every entity-link option. */
export const ENTITY_LINK_DEFAULT = ''

/** Read a linked-entity option; anything unusable resolves to "not linked". */
export function readEntityLink(config: Record<string, unknown> | undefined, key: string): string {
  const parsed = entityLinkSchema.safeParse(config?.[key])
  return parsed.success ? parsed.data : ENTITY_LINK_DEFAULT
}

/** What a single entry of a number-array option is allowed to be. */
export interface NumberEntryBounds {
  min?: number
  max?: number
  /** Whole numbers only — percentages and step counts, not measurements. */
  integer?: boolean
}

/** The schema for one entry of a number array. */
export function numberEntrySchema({ min, max, integer = false }: NumberEntryBounds = {}) {
  let schema = z.number().finite()
  if (integer) schema = schema.int()
  if (min !== undefined) schema = schema.min(min)
  if (max !== undefined) schema = schema.max(max)
  return schema
}

/**
 * The strict schema a config gate composes for a number-array option
 * (`brightnessPresets: numberArraySchema({ min: 1, max: 100, integer: true })`).
 */
export function numberArraySchema(bounds: NumberEntryBounds = {}) {
  return z.array(numberEntrySchema(bounds))
}

/**
 * The stored value of a list option, as a list to work with.
 *
 * Deliberately `unknown[]` rather than a parsed array: the editors render every
 * entry, including the ones this build ignores, so removing one entry cannot
 * quietly drop another. A stored value that is not a list at all has no entries
 * to show and reads as empty — still without rewriting it.
 */
export function readStoredList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Read a number-array option, keeping only the entries this build can use. */
export function readNumberArray(
  config: Record<string, unknown> | undefined,
  key: string,
  bounds: NumberEntryBounds = {}
): number[] {
  const entry = numberEntrySchema(bounds)
  return readStoredList(config?.[key]).filter(
    (value): value is number => entry.safeParse(value).success
  )
}

/**
 * The strict schema a config gate composes for an ordered multi-select. The
 * value list is canonical and closed (REVIEW.md — "Enum-typed options need a
 * canonical, schema-validated value list"), and an option may be listed once:
 * order is meaningful, repetition is not.
 */
export function orderedSelectionSchema<T extends string>(values: readonly [T, ...T[]]) {
  return z
    .array(z.enum(values))
    .refine((list) => new Set(list).size === list.length, 'each option may be listed only once')
}

/**
 * Read an ordered multi-select option: the stored order, restricted to the
 * values this build knows, with repeats collapsed.
 *
 * Filtering is render-time resolution only. A card whose choice set is narrower
 * still than the canonical list — the alarm panel offering only the arm modes
 * its `supported_features` advertises — filters further on top of this, and
 * likewise stores nothing back.
 */
export function readOrderedSelection(
  config: Record<string, unknown> | undefined,
  key: string,
  values: readonly string[]
): string[] {
  const selected: string[] = []

  for (const entry of readStoredList(config?.[key])) {
    if (typeof entry !== 'string') continue
    if (!values.includes(entry)) continue
    if (selected.includes(entry)) continue
    selected.push(entry)
  }

  return selected
}
