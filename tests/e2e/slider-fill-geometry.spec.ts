import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, E2E_FLAG, openPanel } from './helpers'

/**
 * The vertical embedded slider's geometry, measured in a real engine.
 *
 * This is the one assertion in change 0028 that no unit test can make: the
 * defect was a fill positioned by the *static position* — text flow — and jsdom
 * lays nothing out, so the fill's box has no width to compare with the track's
 * there. The unit-level lock is a declaration assertion
 * (`anatomy/__tests__/anatomyStyles.test.ts`); this is the measurement, and it
 * is what would have caught a fill covering half its track and clipped at the
 * track's edge (docs/specs/design-system — "Vertical slider fill spans its
 * track").
 *
 * It sits beside `card-resize-tiers.spec.ts` rather than inside it: that spec's
 * subject is the tier following a dragged span, and it needs edit mode and two
 * resizes to say so. This one needs a `tall` tile and nothing else, so it seeds
 * one directly — the tier is derived from the span the grid lays out, which for
 * a 1×3 item on a 12-column desktop grid is `tall` without a drag.
 *
 * WHAT THIS SPEC DOES NOT ASSERT, and why: the design system's other vertical-
 * slider rule — centred in its hosting region — is unfalsifiable at this tier,
 * because `tall` is one column wide and that column leaves the control no
 * leftover space to be off-centre in. The reasoning and the measurements are at
 * the thickness assertion near the end. It is pinned in
 * `src/components/__tests__/cardBodyStyles.test.ts` instead, on the declarations
 * that enforce it, where a mutation does turn it red.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot.
 */

const LIGHT_ITEM = 'item-fill-light'
const NEIGHBOUR_ITEM = 'item-fill-neighbour'

/**
 * A `tall` light card, and a neighbour that is NOT it.
 *
 * The neighbour is first, so it is the first `.liebe-card` in the shadow root:
 * every read below is scoped by the rendered entity name, and a first-match
 * selector would answer with this card instead — confidently, and with a
 * horizontal slider whose fill has never been broken.
 */
function seedFillGeometryConfig() {
  return buildSeedConfig({
    id: 'e2e-fill-screen',
    name: 'E2E Fill',
    slug: 'e2e-fill',
    items: [
      { id: NEIGHBOUR_ITEM, type: 'entity', entityId: E2E_FLAG, x: 6, y: 0, width: 2, height: 2 },
      // 1 wide, 3 tall — `tall`, the tier that renders the slider vertically.
      { id: LIGHT_ITEM, type: 'entity', entityId: DEMO_LIGHT, x: 0, y: 0, width: 1, height: 3 },
    ],
  })
}

interface FillPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

/** A rectangle, reduced to the numbers this spec compares. */
interface Box {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface SliderGeometry {
  tier: string | null
  orientation: string | null
  track: Box
  fill: Box
  /** The slider root, whose thickness is the token's and whose fill is measured. */
  slider: Box
  /**
   * The region hosting the control — the `tall` body's inline extent.
   *
   * Measured for the thickness assertion below rather than for a centring one.
   * See the note there: at this tier's real width the region is NARROWER than
   * the control, which is what makes an end-to-end centring assertion
   * impossible here and a thickness one worth making.
   */
  region: Box
  /**
   * `--liebe-control-height` as it resolves on the slider — the token the
   * control's thickness comes from, read rather than hardcoded so a theme that
   * retunes it moves the assertion with it.
   */
  controlHeightToken: string
}

/** The friendly name the panel currently knows for an entity. */
async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: FillPanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/**
 * The value that card's slider currently reports, straight off the element
 * carrying `role="slider"` — the thumb.
 *
 * `null` when the card or its slider is not in the DOM, so a poll on this waits
 * for the card to have rendered AND for the brightness the spec asked for to
 * have arrived, in one predicate.
 *
 * The lookup is spelled out inline for the same reason as below: `page.evaluate`
 * serializes the function it is handed, which cannot close over this module.
 */
async function sliderValueNow(page: Page, name: string): Promise<string | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: FillPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
  }, name)
}

/**
 * Every box the two geometry rules need, measured in one pass.
 *
 * One `evaluate` rather than four: the boxes are only comparable if they were
 * measured against the same layout, and four round trips could straddle a
 * re-render. `null` when any part is missing, so a card that never rendered its
 * slider fails the poll instead of comparing zeroed rectangles that would agree
 * with each other perfectly.
 *
 * The lookup is spelled out inline because `page.evaluate` serializes the
 * function it is handed, which cannot close over anything in this module.
 */
async function sliderGeometry(page: Page, name: string): Promise<SliderGeometry | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: FillPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    if (!card) return null

    const slider = card.querySelector('.liebe-slider')
    const track = slider?.querySelector('.liebe-slider-track')
    const fill = slider?.querySelector('.liebe-slider-fill')
    const region = card.querySelector('.liebe-card-body')
    if (!slider || !track || !fill || !region) return null

    const box = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    return {
      tier: card.getAttribute('data-tier'),
      orientation: slider.getAttribute('data-orientation'),
      track: box(track),
      fill: box(fill),
      slider: box(slider),
      region: box(region),
      controlHeightToken: getComputedStyle(slider)
        .getPropertyValue('--liebe-control-height')
        .trim(),
    }
  }, name)
}

test('a tall card’s vertical slider fill spans its track, at the token’s thickness', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedFillGeometryConfig())

  /*
   * Half brightness, not full and not off: the slider only renders for a light
   * that is on, and a fill at either extreme is degenerate — at 0% it has no
   * length to measure, and at 100% a fill that had inherited the track's box
   * from something other than these declarations would agree with it by
   * accident. Mid-travel, the width claim and the length claim are independent.
   */
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })

  const light = await entityName(page, DEMO_LIGHT)
  const neighbour = await entityName(page, E2E_FLAG)
  expect(light, 'the two seeded cards must be distinguishable by name').not.toBe(neighbour)

  /*
   * Synchronise on the VALUE, not merely on the slider's existence. The REST
   * call above returns before its state update has reached the panel over the
   * websocket, and the demo light may already have been on — at some other
   * brightness — when this spec started. A poll that only waits for a slider
   * would then be satisfied by the card as it was, and the snapshot below would
   * measure a fill at whatever length the OLD brightness gave it: a full-height
   * fill passes the width claims and fails `fill.height < track.height`, which
   * is a red run reporting a defect that is not there.
   *
   * 128 of Home Assistant's 0–255 is the 50 the card renders and its thumb
   * announces (`haBrightnessToPercent`), so this is the requested value arriving
   * rather than a proxy for it.
   */
  await expect.poll(() => sliderValueNow(page, light)).toBe('50')

  const geometry = await sliderGeometry(page, light)
  expect(geometry, 'the tall card should render a vertical slider').not.toBeNull()

  // The premise: this is the `tall` tier's vertical slider. Asserted rather than
  // assumed — every measurement below is meaningless about a horizontal one.
  expect(geometry!.tier).toBe('tall')
  expect(geometry!.orientation).toBe('vertical')

  const { track, fill, slider, region } = geometry!

  // Sub-pixel tolerance throughout: the track's width comes from a token in
  // `px`, but a fractional grid column can still land either box on a
  // half-pixel, and neither rule is about a half-pixel.
  const TOLERANCE = 0.5

  // The track has to have a box of its own before the fill can be compared with
  // it — a collapsed track would make every comparison below trivially true.
  expect(track.width).toBeGreaterThan(0)

  // The fill spans the track's width, flush with both edges — on the same
  // tolerance as the edges themselves, since it is the same claim measured a
  // second way (`toBeCloseTo(…, 1)` would hold the width to 0.05, tighter than
  // the edges it is derived from).
  expect(Math.abs(fill.width - track.width)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(fill.left - track.left)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(fill.right - track.right)).toBeLessThanOrEqual(TOLERANCE)

  // And stays inside it, so the track's `overflow: hidden` clips nothing. This
  // is the half the defect showed: a fill pushed to the track's midline kept its
  // full width and lost the part that hung past the edge.
  expect(fill.left).toBeGreaterThanOrEqual(track.left - TOLERANCE)
  expect(fill.right).toBeLessThanOrEqual(track.right + TOLERANCE)

  // The fill is a real fill at half travel: it rises from the track's foot and
  // stops short of its head. Without this, a zero-height fill would satisfy
  // every width assertion above.
  expect(fill.height).toBeGreaterThan(0)
  expect(fill.height).toBeLessThan(track.height)
  expect(Math.abs(fill.bottom - track.bottom)).toBeLessThanOrEqual(TOLERANCE)

  /*
   * The control takes the region hosting it, because the region is narrower than
   * the token — which is what `--liebe-control-height` now MEANS: the thickness
   * the slider prefers rather than one it always has (docs/specs/design-system —
   * "Cross-axis fit", change 0042 PR 3). This assertion used to read the other
   * way round, pinning the control at 42 inside a 35px region, and the 3.5px per
   * side it hung into the tile's padding is the defect that change removed.
   *
   * WHY THIS RATHER THAN THE CENTRING RULE. The design system also requires a
   * vertical slider to be "horizontally centred within whatever region hosts it,
   * not pinned to the region's leading edge", and that rule CANNOT be falsified
   * at this tier end to end. `tall` is one column wide by definition, which on
   * the 12-column desktop grid is a 63px tile — 35px of content box inside the
   * 14px padding. With the track now taking that whole region there is no
   * leftover inline space at all, so "centred" and "leading-edge flush" are the
   * same place, even more plainly than when the control was wider than the room.
   * The centring rule is therefore pinned where it can fail — on the
   * declarations, in `src/components/__tests__/cardBodyStyles.test.ts`,
   * mutation-verified.
   *
   * The fit itself is `tall-slider-fit.spec.ts`'s subject, floors and all; what
   * is asserted here is only enough to keep THIS spec honest about the box the
   * fill was measured against.
   */
  const controlHeight = Number.parseFloat(geometry!.controlHeightToken)
  expect(
    Number.isFinite(controlHeight),
    `--liebe-control-height should resolve to a length, got "${geometry!.controlHeightToken}"`
  ).toBe(true)

  // The region is a real box, and narrower than the token — the premise that
  // makes the two numbers below different from each other.
  expect(region.width).toBeGreaterThan(0)
  expect(region.width).toBeLessThan(controlHeight)

  expect(Math.abs(slider.width - region.width)).toBeLessThanOrEqual(TOLERANCE)

  // The track spans that thickness, so the fill measured above spans the
  // control rather than a box narrower than it.
  expect(Math.abs(track.width - slider.width)).toBeLessThanOrEqual(TOLERANCE)
})
