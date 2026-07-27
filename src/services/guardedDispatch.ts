import { hassService, type ServiceCallResult } from './hassService'
import { entityStore } from '../store/entityStore'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '../store/cardActions'

/**
 * The at-most-once dispatch guard, for every consequential command on every
 * card — gestures and embedded controls alike.
 *
 * Spec: docs/specs/entity-cards/options/common.md — "Dispatch guarantees",
 * normative "for every action **and every embedded control, on every card**".
 * Change 0014 built this for the shell's gestures and left it private to
 * `useCardActions`, so every card's sliders, pills and steppers kept
 * dispatching through the retrying path.
 *
 * It owns exactly one stage of the pipeline. The order is forced from both
 * ends: **resolution → confirmation gate → guard → dispatch**. The gate
 * classifies by effect on the entity, so it needs the *resolved action*; this
 * guard keys on `domain.service:target:data`, so it needs the *final payload*.
 * Neither can cross the other without losing what it operates on — which is why
 * this takes an already-resolved, already-gated command and never inspects an
 * action.
 *
 * **Why module scope rather than a hook's ref.** The guarantee is about a
 * command reaching Home Assistant at most once, not about one React component
 * dispatching at most once. Two things follow, and a per-instance ref gets both
 * wrong: a card's embedded control and its whole-tile gesture are different
 * hook instances issuing the *same* command, and so are two cards showing the
 * same entity. The pending set is therefore process-wide, exactly like the
 * Home Assistant connection it protects.
 *
 * Entries are keyed per command rather than held in a single slot, because a
 * card with open/stop/close pills is not a card doing one thing at a time: a
 * single slot means `open` → `stop` → `open` inside one window dispatches
 * `open` twice, each command evicting the last. Keying per command also keeps
 * the inverse command free, which is the point of C below.
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

const isNameableTarget = (value: unknown): value is string =>
  typeof value === 'string' && value !== ENTITY_MATCH_ALL && value !== ENTITY_MATCH_NONE

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

    const named = explicit.find(isNameableTarget)
    if (named !== undefined) return { aimed: true, watch: named }

    // Nothing nameable left, so the wildcards decide — and they mean the same
    // inside a list as outside one: `['none']` and `[]` aim at nothing exactly
    // as the bare `none` string does, while `['all']` aims at everything. A
    // member of any other shape counts as aimed for the same reason an
    // unresolvable bare value does: the dispatch happens regardless of what
    // this build makes of it, so the safe reading is to guard it.
    return { aimed: explicit.some((target) => target !== ENTITY_MATCH_NONE) }
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

interface PendingCommand {
  until: number
  lastUpdated?: string
}

/**
 * Commands dispatched and not yet known to have landed, keyed by identity.
 *
 * Swept on every admission rather than by a timer: an entry past its deadline
 * is already meaningless to `admitCommand`, so the only thing sweeping buys is
 * that the map cannot grow without bound — and a timer would keep a reference
 * alive for every command ever issued. The map is bounded in practice by the
 * commands issued within one acknowledgement window.
 *
 * A card unmounting mid-window deliberately leaves its entry: the command is
 * still travelling whether or not anything is rendering, and a remount must not
 * become a way to re-fire it.
 */
const pending = new Map<string, PendingCommand>()

const lastUpdatedOf = (id: string) => entityStore.state.entities[id]?.last_updated

/**
 * Clear the pending set. For tests, which share module state between cases and
 * would otherwise carry one case's window into the next.
 */
export function resetDispatchGuard(): void {
  pending.clear()
}

/**
 * Whether a command may be dispatched now, reserving its window when it may.
 *
 * Separate from dispatching so a caller with its own loading/error bookkeeping
 * can ask *before* disturbing it — a refused repeat must not abort the first
 * call still in flight, nor clear the error it is about to report.
 *
 * The window reopens on whichever comes first: the watched entity's
 * `last_updated` moving (it landed) or `ACKNOWLEDGEMENT_TIMEOUT_MS` elapsing
 * (it may never move, and the control must not be stuck). Promise resolution is
 * deliberately not one of them — Home Assistant acknowledges before a slow
 * integration updates state, so reopening on resolution would admit the second
 * press while the first was still travelling, which for `button.press`, a
 * script or a motor is the command running twice.
 */
export function admitCommand(command: GuardedCommand): boolean {
  const { aimed, watch } = resolveCommandTarget(command.entityId, command.data)
  if (!aimed) return true

  const now = Date.now()
  for (const [key, entry] of pending) {
    if (entry.until <= now) pending.delete(key)
  }

  const key = commandKey(command)
  const entry = pending.get(key)

  if (
    entry &&
    // Aimed but unobservable: there is no transition to notice, so the window
    // stays shut until the timeout.
    (watch === undefined || lastUpdatedOf(watch) === entry.lastUpdated)
  ) {
    return false
  }

  pending.set(key, {
    until: now + ACKNOWLEDGEMENT_TIMEOUT_MS,
    lastUpdated: watch === undefined ? undefined : lastUpdatedOf(watch),
  })
  return true
}

/**
 * Dispatch a command at most once until it is known to have landed.
 *
 * Resolves to the dispatch result, or to `null` when the guard refused it —
 * which is not a failure: the identical command is still in flight, and the
 * caller asked for it twice.
 */
export function guardedDispatch(command: GuardedCommand): Promise<ServiceCallResult | null> {
  if (!admitCommand(command)) return Promise.resolve(null)
  return hassService.callServiceOnce(command)
}
