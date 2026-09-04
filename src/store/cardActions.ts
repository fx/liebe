import { z } from 'zod'

/**
 * The card action contract — the persisted shape of `tapAction`, `holdAction`
 * and `doubleTapAction` under `item.config`, and the rules for resolving one
 * into something the shell can dispatch.
 *
 * Spec: docs/specs/entity-cards/options/common.md — "Action type". The
 * serialized form is normative because these values travel between versions in
 * shared YAML exports, so there is exactly one spelling per action: the four
 * parameterless actions are bare strings, and the two parameterized ones are
 * objects discriminated by an `action` key. `{ action: 'toggle' }` is therefore
 * invalid, not a second way to write `toggle`.
 *
 * Lives in the store rather than next to the shell because it is config
 * validation first — `configSchema.ts` gates imports with it — and because a
 * pure module keeps the card graph free of another import edge (AGENTS.md,
 * "Entity Card Registration").
 */

/** The actions that carry no parameters and persist as bare strings. */
export const PARAMETERLESS_CARD_ACTIONS = ['default', 'toggle', 'more-info', 'none'] as const

export type ParameterlessCardAction = (typeof PARAMETERLESS_CARD_ACTIONS)[number]

/**
 * `domain.service`, the only form Home Assistant accepts. Validated here rather
 * than at dispatch time so a typo is rejected while the user is still looking at
 * the field that produced it.
 */
const SERVICE_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/

/**
 * `.strict()` on both object actions is load-bearing: the spec requires unknown
 * keys inside an action object to be rejected rather than dropped, so a
 * mistyped `targets:` cannot ride along looking like it works.
 */
export const navigateActionSchema = z
  .object({
    action: z.literal('navigate'),
    target: z.string().min(1, 'navigate requires a screen id or slug'),
  })
  .strict()

export const callServiceActionSchema = z
  .object({
    action: z.literal('call-service'),
    service: z.string().regex(SERVICE_PATTERN, 'service must be written as "domain.service"'),
    data: z.record(z.unknown()).optional(),
  })
  .strict()

export const cardActionSchema = z.union([
  z.enum(PARAMETERLESS_CARD_ACTIONS),
  navigateActionSchema,
  callServiceActionSchema,
])

export type NavigateCardAction = z.infer<typeof navigateActionSchema>
export type CallServiceCardAction = z.infer<typeof callServiceActionSchema>
export type CardAction = z.infer<typeof cardActionSchema>

/**
 * Everything `default` is allowed to resolve to. Typed as an exclusion so a card
 * cannot declare its default as `default` and leave resolution chasing itself.
 */
export type ResolvedCardAction = Exclude<CardAction, 'default'>

export const CARD_ACTION_KEYS = ['tapAction', 'holdAction', 'doubleTapAction'] as const

export type CardActionKey = (typeof CARD_ACTION_KEYS)[number]

/**
 * The stored defaults. `tapAction` is the literal `default` for *every* card,
 * including read-only ones — what varies per card is what `default` resolves to,
 * which the card declares to the shell rather than storing in its config.
 */
export const CARD_ACTION_DEFAULTS: Readonly<Record<CardActionKey, CardAction>> = {
  tapAction: 'default',
  holdAction: 'more-info',
  doubleTapAction: 'none',
}

/** The action-key fragment of `item.config`, merged into the item schema. */
export const cardActionsConfigSchema = z.object({
  tapAction: cardActionSchema.optional(),
  holdAction: cardActionSchema.optional(),
  doubleTapAction: cardActionSchema.optional(),
})

/** Press-and-hold threshold (spec: ≈500ms). */
export const HOLD_DURATION_MS = 500

/**
 * How long a tap waits to find out whether it was the first half of a double
 * tap. Only paid when a double-tap action is actually configured — with the
 * `none` default, a tap dispatches immediately.
 */
export const DOUBLE_TAP_WINDOW_MS = 250

/**
 * How long a consequential command holds the dispatch path closed against a
 * repeat of itself when the entity does not visibly move.
 *
 * Home Assistant acknowledges a service call before slow integrations update
 * state, so the promise resolving proves nothing — a second press landing in
 * that window would press the button twice. The window closes early the moment
 * the entity does transition, which is the signal that actually means "done"
 * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
 */
export const ACKNOWLEDGEMENT_TIMEOUT_MS = 2000

/**
 * Read one action key out of a card's stored config.
 *
 * Falls back to the key's default when the stored value does not validate. That
 * is not the silent fallback the spec forbids — imports are rejected by
 * `dashboardConfigSchema` before they ever reach a card — it is the render path
 * refusing to crash a dashboard over a value that got into localStorage some
 * other way.
 */
export function readCardAction(
  config: Record<string, unknown> | undefined,
  key: CardActionKey
): CardAction {
  const raw = config?.[key]
  if (raw === undefined) return CARD_ACTION_DEFAULTS[key]

  const parsed = cardActionSchema.safeParse(raw)
  return parsed.success ? parsed.data : CARD_ACTION_DEFAULTS[key]
}

/** Substitute the card's declared default for the literal `default`. */
export function resolveCardAction(
  action: CardAction,
  cardDefault: ResolvedCardAction
): ResolvedCardAction {
  return action === 'default' ? cardDefault : action
}

/** Narrowing helper — the two parameterized actions are the object-shaped ones. */
export function isParameterizedCardAction(
  action: CardAction
): action is NavigateCardAction | CallServiceCardAction {
  return typeof action === 'object'
}

/**
 * The retained command as the resolved action `Retry` re-dispatches.
 *
 * A `call-service` action replaying the retained payload verbatim — never
 * re-derived from the current entity state, so a toggle that failed as
 * `turn_off` retries as `turn_off` even if the state has since moved. The
 * shell routes it through `dispatchAction`: the confirmation gate classifies
 * it by effect on the entity (the generic `homeassistant.*` aliases and the
 * domain services alike), then the at-most-once guard refuses it while the
 * failed command's window is still open. Absent where there is nothing to
 * repeat — a pre-dispatch refusal, a stream that would not start.
 */
export function retainedRetryAction(
  failed:
    | {
        command: {
          domain: string
          service: string
          entityId?: string
          data?: Record<string, unknown>
        }
        retryable: boolean
      }
    | null
    | undefined
): ResolvedCardAction | undefined {
  if (!failed?.retryable) return undefined
  const { domain, service, entityId, data } = failed.command
  // Built the way `HassService.buildServiceData` builds it: the command's own
  // target travels inside the payload, so the retry replays what was actually
  // dispatched — never the shell's current entity. An explicit `data.entity_id`
  // wins over the implicit one, exactly as at dispatch.
  const payload =
    entityId === undefined && data === undefined
      ? undefined
      : { ...(entityId !== undefined ? { entity_id: entityId } : {}), ...data }
  return {
    action: 'call-service',
    service: `${domain}.${service}`,
    ...(payload !== undefined ? { data: payload } : {}),
  }
}
