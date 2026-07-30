import type { ReactNode } from 'react'
import type { CardTier } from '~/utils/cardTier'
import type { SliderOrientation } from '~/store/sliderPlacement'
import { CARD_BODY_ROLE, type CardBodyMarked } from './cardBodyMarker'
import { useCardContentWidth, useGridCardDisplay, useGridCardIconOnlyLabel } from './GridCard'
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
   * Whether a filling `tall` control's band spans the tile's width as well as
   * the height the icon and the meta leave.
   *
   * Off by default, and the default is load-bearing: the band exists for
   * controls whose thickness is their own — a vertical slider is 42px wide
   * whatever the tile is — and a band sized to fit such a control is what puts
   * it on the tile's midline (`CardBody.css`, and the measurements in
   * `__tests__/cardBodyStyles.test.ts`).
   *
   * A card turns it on when what its band holds is the tier's own content
   * rather than a control of fixed thickness. The sensor's `tall` sparkline is
   * specified to span the tile's full width
   * (docs/specs/entity-cards/options/sensor.md — "the graph claims the tile"),
   * and inside a fit-content band it collapsed to the width of the big value's
   * text, because the band was measured from its content and the band's content
   * asked for `100%` of the band.
   *
   * An explicit prop rather than the card's stylesheet selecting this wrapper
   * through `:has()`: layout state here is carried on data attributes, and
   * `:has()`-based mechanisms are prototype-only
   * (docs/specs/theming/index.md — "Constraints").
   */
  stretchControlBand?: boolean
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
  /**
   * Which way the control in the `control` slot runs, where that is a fixed
   * property of the control rather than of the arrangement.
   *
   * Cards with a `sliderPlacement` option pass the orientation they resolved
   * (`resolveSliderOrientation`); everything else leaves it absent and nothing
   * below changes. It is the arrangement that has to accommodate a forced
   * orientation — a vertical control needs a definite long axis, a horizontal
   * one a definite inline axis, and which of those the shape already provides
   * is exactly what this component knows and the card does not.
   *
   * **Two shapes, not three.** `CardBody.css` sizes the row line and the `tall`
   * band, and has nothing for `stack`, which is deliberate rather than missed:
   * `stack` is the `glance` shape, the contract renders no inline slider there
   * under any placement value, and the resolver returns `undefined` for that
   * tier — so a stacked body never receives an orientation to honour. A card
   * that reached this prop by some other route would get the arrangement's own
   * layout, which is the same answer it gets today with no option set.
   */
  controlOrientation?: SliderOrientation
}

/**
 * The floors a control must clear on the axis the tile's content region bounds,
 * from docs/specs/design-system/index.md — "Cross-axis fit". Both are measured
 * on the control as it renders, and a control under either is omitted rather
 * than rendered: too thin, or too short, to land on is the same defect as a
 * clipped one wearing a different symptom.
 */
export const CONTROL_CROSS_AXIS_FLOOR_PX = 24
export const CONTROL_LONG_AXIS_FLOOR_PX = 44

/**
 * Whether a control of this orientation clears the floors in this shape.
 *
 * The tile's content region bounds the **inline** axis — that is the one the
 * shell observes and publishes (`useCardContentWidth`) — so this answers only
 * for orientations whose bounded axis is the inline one:
 *
 *  - a **horizontal** control in the `tall` shape runs along it, so the region's
 *    width is its long axis and the 44px touch floor applies. This is the case
 *    with a real symptom: `tall` is one column wide, which on a 12-column
 *    desktop grid is a 35px content region — a track too short to drag.
 *  - a **vertical** control in a row shape — or, hypothetically, a stacked one;
 *    see `controlOrientation` for why no card produces that — is bounded across
 *    it, so the 24px cross-axis floor applies. The region is not the whole of
 *    what bounds it, since the icon circle and the gaps beside it come out
 *    first, so this is a coarse gate rather than the exact one: what keeps such
 *    a control inside the tile is that `CardBody.css` makes it cross-axis
 *    flexible, so it narrows with the row instead of overflowing it.
 *
 * `undefined` is "not observed", never "no room": a tree that was never laid out
 * carries no information about width, so the width-blind contract stands and the
 * control renders (`useCardContentWidth` owns that distinction). This is why the
 * unit suite and the workshop see every forced placement render.
 *
 * **Two capacities are NOT checked here, and both are the same gap**: the long
 * axis of a vertical control — its band's height, which nothing publishes — and
 * a row line's leftover width once the icon and the gaps are out of it. A card
 * may not measure the DOM for either, and establishing those signals is change
 * 0042 PR 3's, which owns the identical question for the placements the tiers
 * choose on their own (the `tall` vertical slider has it today). Until then a
 * forced control narrows and shortens with the room it is given rather than
 * overflowing it, so the failure mode is a small control and never a clipped
 * one — which is where the tiers' own controls already stand.
 */
export function controlFitsArrangement(
  orientation: SliderOrientation | undefined,
  arrangement: CardArrangement,
  contentWidth: number | undefined
): boolean {
  if (orientation === undefined || contentWidth === undefined) return true

  if (arrangement === 'tall') {
    return orientation === 'vertical' || contentWidth >= CONTROL_LONG_AXIS_FLOOR_PX
  }

  return orientation === 'horizontal' || contentWidth >= CONTROL_CROSS_AXIS_FLOOR_PX
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
  stretchControlBand = false,
  lead,
  meta,
  control: requestedControl,
  extra,
  controlOrientation,
}: CardBodyProps) {
  const { iconOnly } = useGridCardDisplay()
  const iconOnlyLabel = useGridCardIconOnlyLabel()
  const contentWidth = useCardContentWidth()

  /*
   * Omit-never-clip, applied where the shape and the control's fixed
   * orientation meet (docs/specs/design-system/index.md — "Cross-axis fit").
   * The slot is emptied rather than the control being shrunk past a floor
   * nobody could hit, and emptied means genuinely absent from the DOM — the
   * same rule the tiers follow for content they have no room for.
   */
  const control = controlFitsArrangement(controlOrientation, arrangement, contentWidth)
    ? requestedControl
    : undefined

  /*
   * The icon-only tile (docs/specs/entity-cards/options/common.md — "Icon-only
   * presentation").
   *
   * This is the seam the whole option works through: every slot but the lead
   * goes, for every card that composes through a body, without any of them
   * checking a flag — the 0014 lesson that "a card cannot forget to honour an
   * option it never sees", applied where forgetting would mean a forecast
   * bleeding through an icon tile. Which tier the card asked for no longer
   * decides anything, so the arrangement is stamped `stack` rather than the
   * requested one: what is left IS the centred column that arrangement names,
   * and stamping the requested value would have the sheet arrange one child
   * along an axis it is alone on.
   *
   * The meta goes with the rest, and a clipped label takes its place — the
   * accessible name the contract requires an icon-only tile to keep, because
   * "the interactive surface stays fully identified to assistive technology
   * while the glyph alone identifies it visually"
   * (docs/specs/entity-cards/options/common.md — "Visual suppression never
   * removes accessible semantics"). An actionable tile whose only content is a
   * glyph is anonymous to a screen reader otherwise.
   *
   * Its *text* comes from the shell, which is the only thing that knows the
   * entity — a label built out of the slots below would be blank where the user
   * also hid both lines, incomplete where a card carries its reading in the
   * control slot rather than in a meta line (a `tall` sensor), and about the
   * wrong thing where a card's title line is not the entity's name (a media
   * player's is the track). Its *placement* is here, which is the only thing
   * that knows the words were actually removed: a card that renders no body at
   * all keeps its name and state on the tile, and a copy emitted alongside them
   * would announce the same identity twice.
   */
  if (iconOnly) {
    return (
      <div className="liebe-card-body" data-arrangement="stack" data-control-size={controlSize}>
        {lead}
        {iconOnlyLabel ? <span className="liebe-card-body-label">{iconOnlyLabel}</span> : null}
      </div>
    )
  }

  /*
   * Stamped only where a control survived to need it, so the attribute reads as
   * "this is what is in the control slot" rather than as a request that nothing
   * honours. The forced-placement rules in `CardBody.css` select on it.
   */
  const stampedOrientation = control ? controlOrientation : undefined

  if (arrangement === 'row') {
    return (
      <div
        className="liebe-card-body"
        data-arrangement="row"
        data-control-size={controlSize}
        data-control-orientation={stampedOrientation}
      >
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
    <div
      className="liebe-card-body"
      data-arrangement={arrangement}
      data-control-size={controlSize}
      data-control-orientation={stampedOrientation}
    >
      {lead}
      {/* `tall` runs icon → control → meta down the tile; `stack` has no room
          beside the meta, so whatever control it keeps goes underneath. */}
      {arrangement === 'tall' ? (
        filling ? (
          // `data-band-stretch` only where the card asked for it: the attribute
          // IS the opt-in, so a band with no attribute keeps the fit-content
          // width every control-bearing card depends on.
          <div className="liebe-card-body-fill" data-band-stretch={stretchControlBand || undefined}>
            {control}
          </div>
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

/*
 * The marker the shell's icon-only fence looks for — see `cardBodyMarker.ts`
 * for why it is a static property rather than an identity comparison.
 */
;(CardBody as CardBodyMarked).liebeRole = CARD_BODY_ROLE
