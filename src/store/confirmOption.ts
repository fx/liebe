import { z } from 'zod'

/**
 * The `confirm` option — one definition, shared by every card family that has a
 * confirmation gate.
 *
 * It is deliberately NOT part of the universal fragment. `confirm` is a per-card
 * option in both the [switch](../../docs/specs/entity-cards/options/switch.md)
 * and [scene](../../docs/specs/entity-cards/options/scene.md) documents, and the
 * universal set is closed at `name`, `icon`, `hideName`, `hideState`, `color`
 * and the three action keys ([common — universal
 * options](../../docs/specs/entity-cards/options/common.md)). Declaring it as
 * universal would say every card family accepts it, which is a spec change
 * rather than a refactor.
 *
 * **Why it is shared rather than declared twice.** `configSchema.ts` merges every
 * family fragment into one item schema, and `zod.merge()` is last-one-wins for
 * an overlapping key. Two families declaring `confirm` separately means whichever
 * merges last silently governs it for both — so the day one family tightens its
 * own gate, the other's validation changes with no diff touching it and no test
 * failing. Pointing both at this one object makes the merge a no-op by
 * construction: there is nothing for the two to disagree about.
 *
 * That failure mode is not hypothetical. `stateLabels` is declared as an object
 * in `switchOptions.ts` and as a string enum in `coverOptions.ts`; cover merges
 * last, so a switch card's documented `stateLabels: { onLabel, offLabel }` is
 * rejected outright by the import gate today. This module exists so `confirm`
 * cannot join it.
 */

/** Off, so a card is only ever gated because a document asked for it. */
export const CONFIRM_DEFAULT = false

/** The per-key schema, for the readers that validate one key at a time. */
export const confirmOptionSchema = z.boolean()

/**
 * The `confirm` fragment of `item.config`. Every family with a gate merges THIS
 * object rather than declaring the key again.
 */
export const confirmOptionsConfigSchema = z.object({
  confirm: confirmOptionSchema.optional(),
})

/**
 * Whether this card's actions are confirmation-gated.
 *
 * Lives here rather than with a card family because the gate is applied by the
 * *shell's* gesture controller — the only place that sees an action after
 * resolution, and therefore the only place a re-routed toggle cannot slip past.
 * The shell has no business importing one family's option module to read a key
 * three families now define.
 *
 * Falls back to the default when the stored value does not validate, the same
 * rule as every other option reader: imports are rejected by
 * `dashboardConfigSchema` long before a card renders, so this is the render path
 * declining to crash a dashboard over a value that reached localStorage some
 * other way. `confirm: "false"` is the case that matters — a truthy string, so
 * a reader that skipped validation would gate a card whose author asked for no
 * gate, and one that trusted it would leave a well pump unguarded.
 */
export function readCardConfirm(config: Record<string, unknown> | undefined): boolean {
  const raw = config?.confirm
  if (raw === undefined) return CONFIRM_DEFAULT

  const parsed = confirmOptionSchema.safeParse(raw)
  return parsed.success ? parsed.data : CONFIRM_DEFAULT
}
