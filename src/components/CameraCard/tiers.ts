import type { CardArrangement } from '../CardBody'
import type { CardTier } from '~/utils/cardTier'

/**
 * What each layout tier does to a camera card.
 *
 * The camera was the one card change 0011 deliberately left alone, because what
 * a camera does when it no longer fits is BEHAVIOUR rather than layout: below
 * 2×2 it does not shrink the feed, it stops streaming altogether and stands a
 * still thumbnail in its place. Change 0021 owns that rule, and this module is
 * where it is written down — pure, so the boundary is unit-testable without a
 * stream (docs/specs/entity-cards/options/camera.md — "Tier layouts").
 *
 * 2×2 (`full`) is the minimum useful size for a live camera. Everything below it
 * is degraded, and the degradation is the design system's omit-never-clip rule
 * applied to a video surface: a feed clipped into a 1×1 tile is illegible, and
 * an overlay and a LIVE badge over one are furniture with no room to stand on.
 */

export interface CameraTierLayout {
  /**
   * Whether the tile mounts the live feed.
   *
   * `false` is load-bearing rather than cosmetic: the card mounts NO
   * `<ha-camera-stream>` at all below 2×2, so a wall of small camera tiles costs
   * no connections. It is also what makes the fullscreen mount on this path lazy
   * — and therefore what makes a fresh connection on entry correct rather than a
   * regression of the no-reconnect guarantee, since no connection existed.
   */
  live: boolean
  /** How the degraded tile arranges its thumbnail and meta. */
  arrangement: CardArrangement
  /**
   * Whether the degraded tile carries a state line beside the name.
   *
   * Only `row` does. `glance` and `tall` are one cell wide, and a state line
   * there would be the clipping the degradation exists to avoid; the tier table
   * gives both of them the name alone.
   */
  showState: boolean
}

const TIER_LAYOUTS: Readonly<Record<CardTier, CameraTierLayout>> = {
  // Thumbnail + name, stacked and centred.
  glance: { live: false, arrangement: 'stack', showState: false },
  // Thumbnail + name/state side by side.
  row: { live: false, arrangement: 'row', showState: true },
  // Thumbnail on top, name below — the same degradation rules as `glance`.
  tall: { live: false, arrangement: 'tall', showState: false },
  // The minimum useful size: the live feed, with everything the options add.
  full: { live: true, arrangement: 'row', showState: true },
}

export function resolveCameraTier(tier: CardTier): CameraTierLayout {
  return TIER_LAYOUTS[tier]
}
