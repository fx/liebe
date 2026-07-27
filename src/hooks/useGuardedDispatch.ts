import { useCallback, useRef } from 'react'
import { hassService, type ServiceCallResult } from '../services/hassService'
import { entityStore } from '../store/entityStore'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '../store/cardActions'

/**
 * The at-most-once dispatch guard, for every consequential command on every
 * card — gestures and embedded controls alike.
 *
 * Spec: docs/specs/entity-cards/options/common.md — "Dispatch guarantees",
 * which are normative "for every action **and every embedded control, on every
 * card**". Change 0014 built this for the shell's gestures and left it private
 * to `useCardActions`, so every card's sliders, pills and steppers kept
 * dispatching through the retrying path; this hook is that guard made
 * holdable by a control (docs/changes — issue "embedded controls dispatch
 * through the retrying path").
 *
 * It owns exactly one stage of the pipeline. The order is forced from both
 * ends: **resolution → confirmation gate → guard → dispatch**. The gate
 * classifies by effect on the entity, so it needs the *resolved action*; this
 * guard keys on `domain.service:target:data`, so it needs the *final payload*.
 * Neither can cross the other without losing what it operates on — which is why
 * this hook takes an already-resolved, already-gated command and never inspects
 * an action.
 */

/** Home Assistant's wildcard targets, which a payload may name instead of ids. */
export const ENTITY_MATCH_ALL = 'all'
export const ENTITY_MATCH_NONE = 'none'

/** A resolved, gated service call — the only thing this guard understands. */
export interface GuardedCommand {
  domain: string
  service: string
  entityId?: string
  data?: Record<string, unknown>
}

/** What a command aims at, and what the guard can watch move. */
export interface CommandTarget {
  /**
   * Whether the command aims at anything at all.
   *
   * An *unaimed* command is not deduplicated. With nothing to observe there is
   * no transition to wait for, and holding the path shut on the timeout alone
   * would block a service the card cannot watch — a scene, a notification.
   */
  aimed: boolean
  /**
   * The entity whose `last_updated` reopens the window, when a single one can
   * be named. Absent means the command is aimed but unobservable, so only the
   * acknowledgement timeout reopens it.
   */
  watch?: string
}

/**
 * Resolve what a command targets, the way `HassService.buildServiceData`
 * resolves it: the card's entity is the implicit target, and `data` is spread
 * over it, so **any** `entity_id` in the payload replaces that target — not
 * only a string one.
 *
 * Two questions, deliberately answered separately, because conflating them is
 * how this goes wrong in both directions at once. "Does this command aim at
 * anything?" decides whether to deduplicate; "which entity can I watch move?"
 * decides what reopens the window. `entity_id: 'all'` is the case that proves
 * they differ: it is as consequential a command as exists, so it must be
 * deduplicated, yet there is no single `last_updated` to read, so only the
 * timeout can reopen it.
 *
 * Reading only the string form is the same hole the confirmation gate had
 * (`targetsEntity` in `useCardActions`, which answers a third question —
 * whether a payload reaches *this* card, for the gate). A command carrying
 * `entity_id: ['cover.garage']` dispatches at that cover, so watching the
 * card's own entity would let an unrelated state change reopen the window and
 * admit a duplicate, while the real target moving would not reopen it at all.
 *
 * An unresolvable shape is treated as aimed but unobservable: the dispatch
 * happens whatever this build makes of the value, so the safe reading is to
 * guard it on the timeout rather than to guess at the card's entity.
 */
export function resolveCommandTarget(
  entityId: string | undefined,
  data: Record<string, unknown> | undefined
): CommandTarget {
  const explicit = data?.entity_id

  // No target of its own: the card's entity is what `buildServiceData` supplies.
  if (explicit === undefined) {
    return entityId === undefined ? { aimed: false } : { aimed: true, watch: entityId }
  }

  if (typeof explicit === 'string') {
    if (explicit === ENTITY_MATCH_NONE) return { aimed: false }
    if (explicit === ENTITY_MATCH_ALL) return { aimed: true }
    return { aimed: true, watch: explicit }
  }

  if (Array.isArray(explicit)) {
    // Prefer this card's own entity when it is one of them: that is the
    // transition the card is already subscribed to.
    if (entityId !== undefined && explicit.includes(entityId)) {
      return { aimed: true, watch: entityId }
    }
    const named = explicit.find(
      (target): target is string =>
        typeof target === 'string' && target !== ENTITY_MATCH_ALL && target !== ENTITY_MATCH_NONE
    )
    if (named !== undefined) return { aimed: true, watch: named }
    // Nothing nameable left: `['all']` still aims at everything, an empty list
    // at nothing.
    return { aimed: explicit.length > 0 }
  }

  return { aimed: true }
}

/**
 * The command's identity, for deciding whether a second dispatch is a repeat.
 *
 * The payload is part of it: `set_cover_position` to 100 and to 0 are the same
 * service and opposite intents, and the second is the reversal that must never
 * be swallowed. The card's own entity is in the key too, so a command aimed
 * elsewhere by `data.entity_id` cannot collide with one aimed here.
 */
function commandKey({ domain, service, entityId, data }: GuardedCommand): string {
  return `${domain}.${service}:${entityId ?? ''}:${JSON.stringify(data ?? null)}`
}

/**
 * Dispatch a command at most once until it is known to have landed.
 *
 * Resolves to the dispatch result, or to `null` when the guard refused it —
 * which is not a failure: the identical command is still in flight, and the
 * caller asked for it twice.
 *
 * The window reopens on whichever comes first: the watched entity's
 * `last_updated` moving (it landed) or `ACKNOWLEDGEMENT_TIMEOUT_MS` elapsing
 * (it may never move, and the control must not be stuck). Promise resolution is
 * deliberately not one of them — Home Assistant acknowledges before a slow
 * integration updates state, so reopening on resolution would admit the second
 * press while the first was still travelling, which for `button.press`, a
 * script or a motor is the command running twice.
 *
 * Keyed by service, target *and* payload rather than by entity alone: a
 * different command on the same device is a different intent, and the one most
 * likely to arrive while the first is in flight is the inverse — stopping a
 * cover that is travelling too far. Blocking that would be the exact opposite
 * of safe.
 */
export type GuardedDispatch = (command: GuardedCommand) => Promise<ServiceCallResult | null>

export function useGuardedDispatch(): GuardedDispatch {
  const pendingRef = useRef<{ key: string; until: number; lastUpdated?: string } | null>(null)

  return useCallback((command: GuardedCommand) => {
    const { aimed, watch } = resolveCommandTarget(command.entityId, command.data)
    const lastUpdatedOf = (id: string) => entityStore.state.entities[id]?.last_updated

    if (aimed) {
      const key = commandKey(command)
      const pending = pendingRef.current

      if (
        pending &&
        pending.key === key &&
        Date.now() < pending.until &&
        // Aimed but unobservable: there is no transition to notice, so the
        // window stays shut until the timeout.
        (watch === undefined || lastUpdatedOf(watch) === pending.lastUpdated)
      ) {
        return Promise.resolve(null)
      }

      pendingRef.current = {
        key,
        until: Date.now() + ACKNOWLEDGEMENT_TIMEOUT_MS,
        lastUpdated: watch === undefined ? undefined : lastUpdatedOf(watch),
      }
    }

    return hassService.callServiceOnce(command)
  }, [])
}
