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

/**
 * How the control slot is sized.
 *
 * `content` — the default — leaves the slot as wide (or as tall) as what is in
 * it: a switch, a stepper, a select trigger. `fill` gives it the room the tier
 * has left over instead — the width the icon and the meta do not use on a row,
 * the height they do not use in `tall`.
 *
 * The distinction is not cosmetic. A slider has no intrinsic length: sized by
 * its content it collapses to nothing, and the whole point of a `tall` tile is
 * that a taller tile gives the control more travel rather than more whitespace
 * (docs/specs/entity-cards/options/light.md, cover.md — "Tier layouts"). A
 * stepper is the opposite case — grown to the tile's height it would float its
 * buttons apart — which is why this is the card's call and not the tier's.
 */
export type CardControlSize = 'content' | 'fill'

export interface CardBodyProps {
  arrangement: CardArrangement
  /** How much of the tier's room the control slot takes. */
  controlSize?: CardControlSize
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
 * clipped or scrolled (docs/specs/design-system — "Size-adaptive layouts").
 *
 * Omitting rather than hiding is not an accessibility-tree argument: a
 * `display: none` node is out of the accessibility tree as well, so hiding
 * would not leak the content to assistive technology. It is a
 * says-what-it-does argument. The DOM is then the whole answer to "what does
 * this tier render", so the claim is checkable without reading a stylesheet;
 * there is no hidden subtree to drift out of step with the tier that stopped
 * rendering it; and no theme or user stylesheet can bring back content this
 * tier decided does not fit, which one `display: revert` in the themable
 * cascade (docs/specs/theming) could otherwise do.
 *
 * `data-arrangement` and `data-control-size` are internal, not part of the
 * stable selector contract: `data-tier` on the shell is the public signal. They
 * are stamped because the shape is otherwise only observable through CSS, and a
 * test that cannot see the shape can only prove a tier rendered, not that it
 * rendered as its tier.
 */
export function CardBody({
  arrangement,
  controlSize = 'content',
  lead,
  meta,
  control,
  extra,
}: CardBodyProps) {
  if (arrangement === 'row') {
    return (
      <div className="liebe-card-body" data-arrangement="row" data-control-size={controlSize}>
        <div className="liebe-card-body-line">
          {lead}
          {meta}
          {control}
        </div>
        {extra}
      </div>
    )
  }

  /*
   * A filling control in `tall` gets a wrapper of its own rather than growing
   * in place. The slot's content is the card's — a `GridCard.Controls`, a
   * stepper, a select — and giving it `flex: 1` here would mean reaching into
   * whatever the card passed. The wrapper is the one element this component
   * owns, so it is the one that can be told to take the height.
   *
   * Only when there is something to put in it: an empty growing box would eat
   * the `space-between` that centres a tall tile whose card has no control.
   */
  const filling = arrangement === 'tall' && controlSize === 'fill' && Boolean(control)

  return (
    <div className="liebe-card-body" data-arrangement={arrangement} data-control-size={controlSize}>
      {lead}
      {/* `tall` runs icon → control → meta down the tile; `stack` has no room
          beside the meta, so whatever control it keeps goes underneath. */}
      {arrangement === 'tall' ? (
        filling ? (
          <div className="liebe-card-body-fill">{control}</div>
        ) : (
          control
        )
      ) : null}
      {meta}
      {arrangement === 'stack' ? control : null}
      {extra}
    </div>
  )
}
