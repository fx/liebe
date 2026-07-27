import type { ReactNode } from 'react'
import type { CardTier } from '~/utils/cardTier'
import './CardBody.css'

/**
 * How a card arranges the slots inside its tile.
 *
 * The tier table in docs/specs/design-system/index.md ("Size-adaptive layouts")
 * describes three shapes, not four: `glance` stacks its content and centres it,
 * `row` puts icon and meta side by side, `tall` runs the same parts down the
 * tile with the control between them, and `full` is the row shape with more
 * room. So the arrangement is a separate axis from the tier — which is exactly
 * what lets a card follow its own option doc where that doc disagrees with the
 * default mapping (the binary sensor's `tall` is specified as "row arrangement,
 * vertically centred", not as the vertical-control shape).
 */
export type CardArrangement = 'stack' | 'row' | 'tall'

/**
 * The tier→arrangement mapping a card gets unless its option doc says
 * otherwise. Exported rather than folded into the component so a card can
 * deviate for one tier and still read the default for the rest.
 */
export const DEFAULT_TIER_ARRANGEMENT: Readonly<Record<CardTier, CardArrangement>> = {
  glance: 'stack',
  row: 'row',
  tall: 'tall',
  full: 'row',
}

export interface CardBodyProps {
  arrangement: CardArrangement
  /**
   * The tile's anchor — the icon circle for most cards, or whatever replaces it
   * where a card's option doc says so (a sensor's big value in `glance`).
   */
  lead?: ReactNode
  /** The name/state stack (`GridCard.Meta`). */
  meta?: ReactNode
  /**
   * The position the tier table calls the primary embedded control: to the
   * trailing edge in `row`, between icon and meta in `tall`, under the meta in
   * `stack`. A read-only card puts its readout here instead — the slot is a
   * position, not a promise that something interactive lives in it.
   */
  control?: ReactNode
  /**
   * Secondary content, below everything else. Only the tiers with room for it
   * pass one; passing `undefined` is how a tier omits it, which is the
   * omit-never-clip rule expressed in the one place a reader can check it.
   */
  extra?: ReactNode
}

/**
 * The layout inside the card shell — the element that turns four slots into one
 * of the three tier shapes.
 *
 * It arranges; it never decides what to arrange. Which slots a tier fills is
 * per-card and comes from that card's option doc under
 * docs/specs/entity-cards/options/, and a slot a tier has no room for is passed
 * as `undefined` so the content is genuinely absent from the DOM rather than
 * hidden by a stylesheet — content that does not fit MUST be omitted, never
 * clipped or scrolled (docs/specs/design-system — "Size-adaptive layouts"), and
 * a `display: none` would satisfy the eye while leaving the omitted content in
 * the accessibility tree.
 *
 * `data-arrangement` is internal, not part of the stable selector contract:
 * `data-tier` on the shell is the public signal. It is stamped because the
 * shape is otherwise only observable through CSS, and a test that cannot see
 * the shape can only prove a tier rendered, not that it rendered as its tier.
 */
export function CardBody({ arrangement, lead, meta, control, extra }: CardBodyProps) {
  if (arrangement === 'row') {
    return (
      <div className="liebe-card-body" data-arrangement="row">
        <div className="liebe-card-body-line">
          {lead}
          {meta}
          {control}
        </div>
        {extra}
      </div>
    )
  }

  return (
    <div className="liebe-card-body" data-arrangement={arrangement}>
      {lead}
      {/* `tall` runs icon → control → meta down the tile; `stack` has no room
          beside the meta, so whatever control it keeps goes underneath. */}
      {arrangement === 'tall' ? control : null}
      {meta}
      {arrangement === 'stack' ? control : null}
      {extra}
    </div>
  )
}
