import { z } from 'zod'

/**
 * The action card family's option contract — the persisted shape of `confirm`
 * and `showLastActivated` under `item.config`, and the rules for reading them
 * back.
 *
 * Spec: docs/specs/entity-cards/options/scene.md. One contract for all four
 * domains the family serves (`scene`, `script`, `button`, `input_button`),
 * because the family is one card: the domains diverge in which service a tap
 * calls, never in which options they accept.
 *
 * Lives in the store, beside `cardActions` and `cardDisplay`, for the same two
 * reasons every other option module does: `configSchema.ts` gates imports with
 * it, and a pure module keeps the card graph free of another import edge
 * (AGENTS.md — "Entity Card Registration").
 */

export interface ActionCardOptions {
  confirm: boolean
  showLastActivated: boolean
}

export const ACTION_OPTION_KEYS = ['confirm', 'showLastActivated'] as const

export type ActionOptionKey = (typeof ACTION_OPTION_KEYS)[number]

/**
 * The stored defaults, both "leave the card as it was before the option
 * existed". `confirm` defaults off even though this family fires non-idempotent
 * actions: the gate is for the destructive minority ("Reset all devices"), and a
 * dialog in front of every scene tile is the fastest way to train someone to
 * dismiss the one that matters (scene.md — "`confirm`").
 */
export const ACTION_OPTION_DEFAULTS: Readonly<ActionCardOptions> = {
  confirm: false,
  showLastActivated: false,
}

/**
 * The action-key fragment of `item.config`, merged into the item schema.
 *
 * `confirm` is declared here as well as in `switchOptionsConfigSchema` — same
 * key, same type, same default — rather than leaned on from there. The two
 * families name the option independently, so this schema has to stand on its own:
 * a later change to the switch card's surface must not be able to silently take
 * the validation out from under this one.
 */
export const actionOptionsConfigSchema = z.object({
  confirm: z.boolean().optional(),
  showLastActivated: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const actionKeySchemas: Readonly<Record<ActionOptionKey, z.ZodTypeAny>> = {
  confirm: z.boolean(),
  showLastActivated: z.boolean(),
}

/**
 * Read the action options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardAction`/`readCardDisplay`, and for the same reason:
 * imports are rejected by `dashboardConfigSchema` long before a card renders, so
 * this is the render path declining to crash a dashboard over a value that
 * reached localStorage some other way.
 */
export function readActionOptions(config: Record<string, unknown> | undefined): ActionCardOptions {
  const read = <K extends ActionOptionKey>(key: K): ActionCardOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return ACTION_OPTION_DEFAULTS[key]

    const parsed = actionKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as ActionCardOptions[K])
      : (ACTION_OPTION_DEFAULTS[key] as ActionCardOptions[K])
  }

  return {
    confirm: read('confirm'),
    showLastActivated: read('showLastActivated'),
  }
}
