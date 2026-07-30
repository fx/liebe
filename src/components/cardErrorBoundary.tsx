import type { ComponentType, FunctionComponent } from 'react'
import type { CardTier } from '~/utils/cardTier'
import { EntityErrorBoundary } from './ErrorBoundary'

/**
 * Where a component's name can be found, across the shapes a card is exported
 * in: a function or class carries `name`/`displayName` directly, while `memo`
 * returns an exotic object that carries neither and holds the component it
 * wrapped on `type`.
 */
interface NameCarrier {
  displayName?: string
  name?: string
  type?: { displayName?: string; name?: string }
}

/**
 * The name to show for the boundary in a React component stack.
 *
 * Cards are wrapped after `memo`, so without the `type` hop the stack a caught
 * error prints would name the wrapper `undefined` — at the one moment the stack
 * is being read.
 */
function innerName(Card: NameCarrier): string {
  return Card.displayName || Card.name || Card.type?.displayName || Card.type?.name || 'Card'
}

/** The two props the fallback needs; every card takes both from `CardProps`. */
interface CardBoundaryProps {
  entityId?: string
  tier?: CardTier
}

interface CardBoundaryOptions {
  /**
   * The tier the fallback renders at when the caller passes no `tier` — which
   * MUST be the tier the wrapped card itself defaults to in that case.
   *
   * `tier` is optional on `CardProps`, and a card handed none falls back to its
   * own default rather than to a shared one: `ActionCard` renders at `glance`
   * where every other card renders at `row`. The boundary cannot read that
   * default — it is a destructuring default inside the card — so a card whose
   * own differs from `row` states it here, and a mismatch shows up as a failure
   * tile the wrong shape for its cell. `cardErrorBoundary.test.tsx` compares the
   * two for every registered card rather than trusting this to stay in step.
   */
  fallbackTier?: CardTier
}

/**
 * Wraps a card component in its own error boundary — the convention AGENTS.md
 * states under "Entity Card Registration", applied to every component the
 * registry dispatches to and to every variant it exposes.
 *
 * **Why a card needs one when `GridView` already has one.** `GridView` wraps
 * each tile in `EntityErrorBoundary`, and that covers the dashboard path only.
 * Three other paths render a card with nothing above it: a Storybook story
 * (every card family has one), the configuration preview — which renders
 * `LightCard` and `BinarySensorCard` directly from `CardConfig.tsx` — and
 * anything handed a literal `entityId`. On those the nearest boundary above a
 * throwing card is `Dashboard`'s, so one card's render error blanks the whole
 * dashboard rather than one tile; in a story there is no boundary at all.
 *
 * **Why `EntityErrorBoundary` rather than the base `ErrorBoundary`.** On the
 * dashboard this boundary is now the inner one, so it — not `GridView`'s —
 * decides what a failed tile looks like. The base boundary's fallback is a
 * 600px-wide panel with a 400px minimum height, which is a dialog rather than a
 * tile: in a 1×1 cell it would overflow its own card and cover its neighbours.
 * `EntityErrorBoundary` renders the card-shaped `ErrorDisplay` the grid already
 * shows for a disconnected or missing entity, and this one can pass the `tier`
 * as well, so the fallback degrades with the cell the way every other tile
 * does — including when the caller passes none, which is what `fallbackTier` is
 * for.
 *
 * **Why it goes outside the memo.** Several cards carry a load-bearing `memo`
 * comparator — the by-value `span` check the grid depends on, pinned by
 * `cardSpanMemo.test.tsx`. The boundary is a plain wrapper whose own render
 * costs nothing, so keeping `memo` closest to the content leaves every
 * comparator doing exactly what it did before; placing the boundary inside the
 * memo would add a render layer beneath it.
 *
 * Call it on the memoized component and attach statics to the result:
 *
 * ```tsx
 * export const LightCard = Object.assign(withCardErrorBoundary(MemoizedLightCard), {
 *   defaultDimensions: { width: 2, height: 2 },
 * })
 * ```
 *
 * This module deliberately imports no card and not `cardRegistry`: importing the
 * registry from anything a card imports closes the cycle `cardRegistry` → every
 * card → `CardConfig` → that card → `cardRegistry`, which is a temporal-dead-zone
 * crash in any bundle whose entry reaches a card before the registry.
 */
export function withCardErrorBoundary<P extends CardBoundaryProps>(
  Card: ComponentType<P>,
  { fallbackTier = 'row' }: CardBoundaryOptions = {}
  /*
   * A function component rather than the wider `ComponentType`: Storybook's
   * `Meta<T>` assigns the card to a `ComponentType<P & GridCellArgs>`, and the
   * class arm of that union compares its construct signature invariantly, so a
   * `ComponentType` return breaks every card story at the type level while the
   * function arm is fine.
   */
): FunctionComponent<P> {
  const Wrapped = (props: P) => (
    <EntityErrorBoundary entityId={props.entityId} tier={props.tier ?? fallbackTier}>
      <Card {...props} />
    </EntityErrorBoundary>
  )

  Wrapped.displayName = `${innerName(Card)}WithBoundary`
  return Wrapped
}
