import type { ReactElement } from 'react'
import type { HassEntity } from '~/store/entityTypes'
import type { CardTier } from '~/utils/cardTier'
import { SkeletonCard } from './SkeletonCard'
import { ErrorDisplay } from './ErrorDisplay'

/**
 * The message a not-found tile carries.
 *
 * It names the entity the card was configured against and says what the user
 * has to do about it, because nothing else will: the entity is gone from Home
 * Assistant, so no amount of waiting, reloading or reconnecting brings it back
 * — only editing the card does. That is also why this tile is the one lifecycle
 * state with no Retry (see `renderCardLifecycle`).
 */
export function entityNotFoundMessage(entityId: string): string {
  return `${entityId} is not in Home Assistant. It may have been renamed or removed — reconfigure this card to point at an entity that exists.`
}

export interface CardLifecycleProps {
  /** The id the card was configured with — what a not-found tile has to name. */
  entityId: string
  entity: HassEntity | undefined
  isConnected: boolean
  isLoading: boolean
  /**
   * `useEntity`'s third state: the connection is up, the state machine has been
   * received, and this entity is not in it.
   */
  isMissing: boolean
  tier?: CardTier
  /** Skeleton shape — how many meta lines and whether a control is coming. */
  lines?: number
  showIcon?: boolean
  showButton?: boolean
  /** Radix's text scale for the error tile. */
  size?: '1' | '2' | '3'
}

/**
 * The tile a card renders *instead of* itself, for every state in which there
 * is no card to render.
 *
 * One function rather than a copy per card, because the three states are told
 * apart by facts about the connection that no card knows better than another —
 * and because a card that answered them itself is how "waiting" came to stand
 * in for "deleted" everywhere at once (docs/changes/0037 — PR 3). A plain
 * function and not a component: the caller needs this *instead of* its own
 * body, and a component can only be rendered beside one. It holds no hooks, so
 * calling it after the card's own hooks is safe at any point in the render.
 *
 * Callers guard with `if (!entity || !isConnected)`, which is what lets the
 * compiler narrow the entity for the rest of the card's body — the one thing a
 * shared helper cannot do on the caller's behalf. That guard is exactly the set
 * of states below, since a pending entity and a missing one are both absent
 * ones; the function is total over it and returns a tile rather than `null`, so
 * no card has to handle an answer that would mean "render yourself after all".
 *
 * The order is the precedence, and it is total:
 *
 *  - **pending** — an entity that has not arrived over a live connection. The
 *    skeleton says "still working on it", which here is true.
 *  - **missing** — received the state machine, this entity is not in it. The
 *    one state the shared treatment is new for; before it, this fell into the
 *    arm above and waited forever.
 *  - **connection down** — no entity *and* nothing to ask. Distinct from
 *    missing on purpose: a disconnected panel has learned nothing about what
 *    exists, and reporting an entity as deleted because the socket dropped
 *    would send the user to reconfigure a card that is fine.
 *
 * Only the last of the three gets a Retry, and that is a judgement about what
 * each is: reloading the panel is a real way out of a dropped connection, and
 * no way at all out of an entity Home Assistant does not have. A Retry on the
 * not-found tile would be a button whose only possible outcome is the same
 * tile. There is no Dismiss on any of them either — a card has nowhere to
 * dismiss to, since the state it would dismiss is the state it is in.
 *
 * Why these tiles stand outside `GridCard` rather than rendering through it
 * (change 0043 PR 6): a tile that stands in for a card is not a card tile.
 * The shell's tile is the primary action of an entity the card can see; these
 * tiles render exactly where there is no card — no entity, no gestures, no
 * confirmation gate, nothing to dispatch and nothing to dismiss. Folding them
 * into the shell would give them a `liebe-tile-action` control with no action
 * behind it and a dialog opener with no dialog target, which the shell
 * correctly refuses to render. What they do take from the shell's contract is
 * the tile surface itself: `liebe-card` and `data-tier`, stamped here the way
 * `SkeletonCard` stamps them, so the rendered tile takes its tier and its
 * theme with the loaded one. `ErrorDisplay variant="card"` keeps rendering
 * that surface (with its own glance button + dialog, which genuinely carry
 * the message and whatever action the callsite supplies), and the callsites
 * supply what each state is owed: disconnected offers the reload `Retry`,
 * not-found offers no action because no action exists.
 */
export function renderCardLifecycle({
  entityId,
  entity,
  isConnected,
  isLoading,
  isMissing,
  tier = 'row',
  lines = 2,
  showIcon = true,
  showButton = false,
  size,
}: CardLifecycleProps): ReactElement {
  /*
   * Pending, and the whole arm is gated on the connection — including
   * `isLoading`, which is the half that used to escape it.
   *
   * `useEntity` computes `isLoading` as `isInitialLoading && !entity`, and
   * `entityStore` starts at `{ isConnected: false, isInitialLoading: true }`
   * with `isInitialLoading` set false only by `loadInitialStates()`. A panel
   * that never reaches Home Assistant never runs that, so an ungated
   * `isLoading ||` renders a skeleton that can never resolve: this change's own
   * defect, on the connection instead of on the entity. Waiting is only honest
   * over a socket something can arrive on.
   *
   * `!entity && !isMissing` is the defensive half: a caller that reports
   * neither flag for an absent entity on a live connection has not established
   * that Home Assistant lacks it, and waiting cannot be wrong about that.
   * `!isMissing` is what stops this arm swallowing the state below, as it did
   * for every card before this existed.
   */
  if (isConnected && (isLoading || (!entity && !isMissing))) {
    return <SkeletonCard tier={tier} showIcon={showIcon} lines={lines} showButton={showButton} />
  }

  if (isMissing) {
    return (
      <ErrorDisplay
        error={entityNotFoundMessage(entityId)}
        variant="card"
        tier={tier}
        title="Entity Not Found"
        size={size}
      />
    )
  }

  // Connection down. Last rather than guarded, because both arms above require
  // `isConnected` — so once neither has taken the render, the connection is
  // what is left to report. That is an invariant of the code above rather than
  // an aspiration: an arm reachable while disconnected would make this comment
  // false and put a skeleton in front of a panel that cannot load.
  return (
    <ErrorDisplay
      error="Disconnected from Home Assistant"
      variant="card"
      tier={tier}
      title="Disconnected"
      onRetry={() => window.location.reload()}
      size={size}
    />
  )
}
