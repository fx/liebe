/**
 * The layout tier a card renders at, and the effective span it derives from.
 *
 * docs/specs/design-system/index.md ("Size-adaptive layouts") owns the tier
 * table. This module owns nothing but the arithmetic: it is deliberately free
 * of React and of the grid, so the boundary table is unit-testable on its own
 * and there is exactly one place the boundaries are written down.
 *
 * A card never calls this. `GridView` derives the tier once from what
 * `GridLayoutSection` lays out and passes it down as a prop — cards MUST NOT
 * read the DOM to infer their own size (docs/changes/0011-layout-tiers.md).
 */

/**
 * `glance` 1×1 · `row` ≥2 wide, 1 tall · `tall` 1 wide, ≥2 tall · `full` ≥2×≥2.
 *
 * Stamped on the tile as `data-tier`, which is public API — the stable selector
 * contract (docs/specs/theming/index.md) makes renaming a member of this union
 * a breaking change.
 */
export type CardTier = 'glance' | 'row' | 'tall' | 'full'

/** Grid cells, not pixels. */
export interface CardSpan {
  width: number
  height: number
}

/**
 * The tier for an **effective** span — the dimensions the grid actually lays
 * out at the active breakpoint, not the stored ones. A stored 2×1 item that
 * collapses to a single effective cell on a narrow grid is `glance`, and the
 * tier re-derives when the breakpoint changes because the span it is given
 * changes with it.
 *
 * Total by construction: the two comparisons partition every span into exactly
 * one tier, so there is no span — including a degenerate 0 or a negative one,
 * which no grid produces — without an answer. `glance` is the floor.
 */
export function deriveCardTier({ width, height }: CardSpan): CardTier {
  const isWide = width >= 2
  const isTall = height >= 2

  if (isWide && isTall) return 'full'
  if (isWide) return 'row'
  if (isTall) return 'tall'
  return 'glance'
}

/**
 * A stored span scaled to the column count the grid is actually using.
 *
 * This is the mapping `GridLayoutSection` applies when it builds the layout, and
 * it lives here so every consumer that needs an effective span — the grid, and
 * the configuration preview that must show the same tier the card will render
 * at — scales it the same way. Getting this wrong is not academic: stored
 * dimensions alone would preview `row` for an item that renders `glance` on a
 * four-column grid.
 *
 * Height is untouched, because rows do not scale: the responsive breakpoints
 * change how many columns a screen has, and the grid hands `item.height`
 * straight to react-grid-layout.
 *
 * The `Math.max(1, …)` floor is the grid's own: an item is never laid out
 * narrower than one cell, however small the ratio gets.
 */
export function scaleSpanToColumns(
  span: CardSpan,
  storedColumns: number,
  effectiveColumns: number
): CardSpan {
  const columnRatio = effectiveColumns / storedColumns

  return {
    width: Math.max(1, Math.round(span.width * columnRatio)),
    height: span.height,
  }
}
