import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { CardTier } from '~/utils/cardTier'
import type { SliderOrientation } from '~/store/sliderPlacement'
import { CARD_BODY_ROLE, type CardBodyMarked } from './cardBodyMarker'
import { observeContentBox, type ContentBoxSize } from './cardContentWidth'
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
 * A **vertical** control in the `tall` band is bounded on BOTH axes, and it is
 * the one case answered from the band rather than from the region: the band IS
 * the control's box there, so `band.inlineSize` is the track's rendered
 * thickness and `band.blockSize` its rendered length. Both floors are then
 * measured "on the control as it renders" as the spec requires, rather than
 * inferred from the tile — which matters in two directions the region alone
 * cannot see. Short: "a tile that clears 120px can still leave a band that does
 * not clear 44px", since the inset, the icon circle, the meta block and the gaps
 * all come out first. Thin: `--liebe-control-height` is public theming API, so a
 * theme may pin the track at 10px in a 35px region, and a region-only check
 * would let a 10px track render. This is the tier's own placement rather than a
 * forced one, so it is every `tall` light, cover, fan and `input_number` card
 * that these two floors reach.
 *
 * `undefined` is "not observed", never "no room": a tree that was never laid out
 * carries no information about either axis, so the size-blind contract stands
 * and the control renders (`useCardContentWidth` owns that distinction). This is
 * why the unit suite and the workshop see every placement render.
 *
 * **One capacity is still NOT checked here**: a row line's leftover width, once
 * the icon circle and the gaps are out of it. `contentWidth` is a coarse gate
 * for that case rather than the exact one, and it is not a clip risk — the
 * forced-placement rules in `CardBody.css` make that slot cross-axis flexible,
 * so the control narrows with the row instead of overflowing it. What is left is
 * that a vertical control on a very narrow row line may be thinner than the
 * region suggests, which is a smaller control and never a cropped one. A row
 * line has no band, so the box the `tall` case reads does not exist there.
 */
export function controlFitsArrangement(
  orientation: SliderOrientation | undefined,
  arrangement: CardArrangement,
  contentWidth: number | undefined,
  band?: ContentBoxSize
): boolean {
  if (orientation === undefined) return true

  if (arrangement === 'tall') {
    if (orientation === 'horizontal') {
      // The region's width IS this control's long axis, so it answers to the
      // touch floor rather than to the cross-axis one. A horizontal control is
      // not what the band is sized for, so the region is still the reading.
      return contentWidth === undefined || contentWidth >= CONTROL_LONG_AXIS_FLOOR_PX
    }

    return (
      band === undefined ||
      (band.inlineSize >= CONTROL_CROSS_AXIS_FLOOR_PX &&
        band.blockSize >= CONTROL_LONG_AXIS_FLOOR_PX)
    )
  }

  return (
    orientation === 'horizontal' ||
    contentWidth === undefined ||
    contentWidth >= CONTROL_CROSS_AXIS_FLOOR_PX
  )
}

/**
 * The `tall` control band's box, observed and published to the decision above —
 * the capacity signal change 0042 PR 3 owes the cross-axis-fit rules
 * (docs/specs/design-system/index.md — "Cross-axis fit").
 *
 * The band is the vertical control's own box: `CardBody.css` gives it
 * `min(--liebe-control-height, 100%)` across and the tier's leftover height
 * along, and the slot and the track inside read 100% of it. So this reports the
 * control **as it renders**, which is what the floors are specified against —
 * not the tile, and not the token.
 *
 * It is measured rather than derived because there is nothing to derive it from:
 * the length is what the tile's height leaves after the inset, the icon circle,
 * the meta block and the gaps, and of those only the inset is a token. The
 * prohibition it has to respect is that a **card** never measures the DOM — this
 * is the body, which owns the band element, is one implementation shared by every
 * card, and uses the same shared instrument the shell's content width comes from
 * (`cardContentWidth.ts`, whose header carries the argument in full).
 *
 * **The band stays in the DOM when the control is omitted**, keeping its own
 * width with it (`data-band-axis`, not the body's survivor-only orientation
 * stamp). That is what makes this a measurement rather than an oscillator: were
 * either taken away with the control, the capacity would report `undefined` or
 * `0`, and the control would either alternate forever or never come back on a
 * tile that had grown. Kept, the box is the same whether or not a control is
 * inside it — the width is definite, and the height is the body's leftover,
 * which `flex-grow` absorbs any difference in flex basis into. An empty band
 * also holds the tier's shape still as a tile is resized across a floor: the
 * icon and the meta stay where they were and only the control comes and goes.
 */
function useControlBandBox(): {
  band: ContentBoxSize | undefined
  bandRef: (node: HTMLDivElement | null) => void
} {
  const [band, setBand] = useState<ContentBoxSize | undefined>(undefined)
  const stopObserving = useRef<(() => void) | undefined>(undefined)

  /*
   * Driven from the ref callback rather than from an effect, for the reason the
   * shell's own observation gives: React hands it the node on attach and `null`
   * on detach, which is exactly the pair of events an observation needs.
   */
  const bandRef = useCallback((node: HTMLDivElement | null) => {
    stopObserving.current?.()
    stopObserving.current = node ? observeContentBox(node, setBand) : undefined

    // Detached: the shape no longer has a band, so the capacity it published is
    // no longer a fact about anything. Back to "not observed", which renders —
    // a card that has just become `row` must not carry a `tall` band's verdict.
    if (!node) setBand(undefined)
  }, [])

  return { band, bandRef }
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
  const { band, bandRef } = useControlBandBox()

  /*
   * Omit-never-clip, applied where the shape and the control's fixed
   * orientation meet (docs/specs/design-system/index.md — "Cross-axis fit").
   * The slot is emptied rather than the control being shrunk past a floor
   * nobody could hit, and emptied means genuinely absent from the DOM — the
   * same rule the tiers follow for content they have no room for.
   */
  const control = controlFitsArrangement(controlOrientation, arrangement, contentWidth, band)
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
   * Only when the card HAS a control for it: an empty growing box would eat the
   * `space-between` that centres a tall tile whose card has no control at all.
   *
   * `requestedControl` rather than `control`, so a control the floors omitted
   * still leaves its band standing. That is not a cosmetic choice — the band is
   * where the long-axis capacity is measured, and a band that disappeared with
   * its control would take the measurement with it and oscillate (see
   * `useControlBandBox`).
   */
  const filling = arrangement === 'tall' && controlSize === 'fill' && Boolean(requestedControl)

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
          <div
            className="liebe-card-body-fill"
            data-band-stretch={stretchControlBand || undefined}
            /*
             * The axis the band is SIZED for, which is the card's requested
             * orientation rather than the survivor stamped on the body above.
             * The distinction is the whole mechanism: the band's own width is
             * what the floors are measured on, so it has to hold whether or not
             * a control currently clears them — a band that lost its width with
             * its control would report zero and never let one back
             * (`useControlBandBox`, and the rule it drives in `CardBody.css`).
             */
            data-band-axis={controlOrientation}
            ref={bandRef}
          >
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
