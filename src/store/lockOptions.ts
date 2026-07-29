import { z } from 'zod'

/**
 * The lock card's option contract — the persisted shape of `showButtons`,
 * `confirmUnlock`, `confirmLock` and `doorEntity` under `item.config`, and the
 * rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/security.md — "Lock card". Lives in the
 * store beside `cardDisplay.ts` for the same two reasons as its siblings:
 * `configSchema.ts` gates imports with it, and a pure module keeps the card
 * graph free of another import edge (AGENTS.md — "Entity Card Registration").
 *
 * This module is the contract only. What the options RESOLVE TO on screen —
 * glyph, state text, tint, which pill is held back, and which routes the
 * confirmation gates stop — is `src/components/LockCard/presentation.ts`.
 */

export interface LockOptions {
  /** Renders the explicit Lock / Unlock pills at `row`, `tall` and `full`. */
  showButtons: boolean
  /** Confirmation gate on every route that unlocks. On by default. */
  confirmUnlock: boolean
  /** The same gate for locking. Off by default — locking is the safe direction. */
  confirmLock: boolean
  /** A linked `binary_sensor` whose open/closed reading joins the state line. */
  doorEntity: string
}

export const LOCK_OPTION_KEYS = [
  'showButtons',
  'confirmUnlock',
  'confirmLock',
  'doorEntity',
] as const

export type LockOptionKey = (typeof LOCK_OPTION_KEYS)[number]

/**
 * The stored defaults.
 *
 * `confirmUnlock` is the asymmetric one, and the asymmetry is the point: unlock
 * is the direction that can fail physically-open, so it is gated for a card
 * nobody has configured, while `confirmLock` stays off because locking is the
 * safe direction and should stay one tap
 * (docs/specs/entity-cards/options/security.md — `confirmUnlock` / `confirmLock`).
 */
export const LOCK_OPTION_DEFAULTS: Readonly<LockOptions> = {
  showButtons: true,
  confirmUnlock: true,
  confirmLock: false,
  doorEntity: '',
}

/**
 * The lock fragment of `item.config`, merged into the item schema.
 *
 * `showButtons` is declared here as `z.boolean().optional()` — structurally
 * identical to the cover fragment's, which is what keeps the two out of
 * `configSchema.keyCollisions`: the merge is then a no-op rather than one
 * family's validation silently replacing another's.
 */
export const lockOptionsConfigSchema = z.object({
  showButtons: z.boolean().optional(),
  confirmUnlock: z.boolean().optional(),
  confirmLock: z.boolean().optional(),
  doorEntity: z.string().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const lockKeySchemas: Readonly<Record<LockOptionKey, z.ZodTypeAny>> = {
  showButtons: z.boolean(),
  confirmUnlock: z.boolean(),
  confirmLock: z.boolean(),
  doorEntity: z.string(),
}

/**
 * Read the lock options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * For the two gates that fallback is also the safe direction, which is why it is
 * a fallback rather than a coercion: `confirmUnlock: "no"` is a truthy string, so
 * a reader that trusted it would leave a front door ungated, and one that
 * coerced it would gate on a value nobody wrote. Falling back to the default
 * leaves the gate exactly where the document says it should be.
 */
export function readLockOptions(config: Record<string, unknown> | undefined): LockOptions {
  const read = <K extends LockOptionKey>(key: K): LockOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return LOCK_OPTION_DEFAULTS[key]

    const parsed = lockKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as LockOptions[K])
      : (LOCK_OPTION_DEFAULTS[key] as LockOptions[K])
  }

  return {
    showButtons: read('showButtons'),
    confirmUnlock: read('confirmUnlock'),
    confirmLock: read('confirmLock'),
    doorEntity: read('doorEntity'),
  }
}
