import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, openPanel } from './helpers'

/**
 * A forced `sliderPlacement`, measured in a real engine.
 *
 * The unit suite can prove the cards route the option through the shared
 * resolver and hand the answer to the slider — it cannot prove the slider then
 * has anything to draw. jsdom applies no stylesheet and lays nothing out, so a
 * bare orientation flip renders a byte-identical DOM: `data-orientation` says
 * `vertical`, every rendered assertion passes, and the track is a zero-height
 * line on a real screen. That is the defect this spec exists for, and it is the
 * same shape as the one `slider-fill-geometry.spec.ts` locks for change 0028.
 *
 * Two placements, one screen, because they are the two halves of one claim
 * (docs/specs/entity-cards/options/common.md — "Shared slider placement", with
 * the geometry rules in docs/specs/design-system/index.md — "Cross-axis fit"):
 *
 *   1. `vertical` on a 3×1 `row` tile — the tier that would have laid the
 *      slider across. It must come out standing up, at the token's thickness,
 *      with a real length, inside the tile.
 *   2. `horizontal` on a 1×3 `tall` tile — the mirror, and the case the floors
 *      answer rather than the stylesheet. Forced means forced, but
 *      omit-never-clip outranks it: a track under the 44px a finger needs is
 *      omitted rather than rendered short. Asserted as that implication rather
 *      than as the outcome one viewport produces — a one-column region is 35px
 *      at 1280px wide and more than that on a larger screen, and a spec pinned
 *      to the narrow case would fail on the wide one without anything having
 *      regressed.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot.
 */

const ROW_ITEM = 'item-forced-vertical'
const TALL_ITEM = 'item-forced-horizontal'

/**
 * The two placements side by side, on a screen of their own.
 *
 * Both cards carry the same light, so they are told apart by the tier the grid
 * derives from their spans rather than by their name — which is also the
 * premise each measurement depends on, and is asserted before anything is
 * measured.
 */
function seedForcedPlacementConfig() {
  return buildSeedConfig({
    id: 'e2e-placement-screen',
    name: 'E2E Placement',
    slug: 'e2e-placement',
    items: [
      {
        id: ROW_ITEM,
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 0,
        y: 0,
        width: 3,
        height: 1,
        config: { sliderPlacement: 'vertical' },
      },
      {
        id: TALL_ITEM,
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 6,
        y: 0,
        width: 1,
        height: 3,
        config: { sliderPlacement: 'horizontal' },
      },
    ],
  })
}

interface PlacementPanelHandle {
  shadowRoot?: ShadowRoot | null
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

interface PlacementGeometry {
  /** `null` where the tile rendered no slider — an outcome, not a failure. */
  orientation: string | null
  slider: Box | null
  track: Box | null
  /** The leading edge, which is the thumb — sized from the same token as the track. */
  thumb: Box | null
  /** The tile's own box, which nothing inside it may hang past. */
  card: Box
  /** The content region the tile's inset leaves, which bounds the parts inside. */
  body: Box
  /** `--liebe-control-height` as it resolves here, read rather than hardcoded. */
  controlHeightToken: string
}

/**
 * Every box one tier's card needs, measured in one pass.
 *
 * `null` when the card itself is missing, so a poll on this waits for the grid
 * to have laid out rather than comparing zeroed rectangles that would agree with
 * each other perfectly. A missing *slider* is not null: at one of the two tiers
 * its absence is the assertion.
 *
 * The lookup is spelled out inline because `page.evaluate` serializes the
 * function it is handed, which cannot close over anything in this module.
 */
async function placementGeometry(page: Page, tier: string): Promise<PlacementGeometry | null> {
  return page.evaluate((wantedTier) => {
    const panel = (window as unknown as { __liebePanel?: PlacementPanelHandle }).__liebePanel
    const card = panel?.shadowRoot?.querySelector(
      `.grid-item .liebe-card[data-tier="${wantedTier}"]`
    )
    const body = card?.querySelector('.liebe-card-body')
    if (!card || !body) return null

    const slider = card.querySelector('.liebe-slider')
    const track = slider?.querySelector('.liebe-slider-track')
    const thumb = slider?.querySelector('.liebe-slider-thumb')

    const box = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    return {
      orientation: slider?.getAttribute('data-orientation') ?? null,
      slider: slider ? box(slider) : null,
      track: track ? box(track) : null,
      thumb: thumb ? box(thumb) : null,
      card: box(card),
      body: box(body),
      controlHeightToken: getComputedStyle(card).getPropertyValue('--liebe-control-height').trim(),
    }
  }, tier)
}

test('a forced placement gets a real axis, or is omitted rather than shrunk past the floor', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedForcedPlacementConfig())

  /*
   * Half brightness, not full and not off: the slider only renders for a light
   * that is on, and a fill at either extreme is degenerate. 128 of Home
   * Assistant's 0–255 is the 50 the card renders, so waiting on the value is
   * waiting on the state having reached the panel rather than on a proxy for it.
   */
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })

  /*
   * Synchronise on the ROW card's slider carrying the requested value. Both
   * cards render in the same pass, so this is also the sync point for the tall
   * card's negative assertion — without it, "no slider" would be satisfied by a
   * tree that had not finished rendering, which is the way an absence assertion
   * passes for the wrong reason.
   */
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = (window as unknown as { __liebePanel?: PlacementPanelHandle }).__liebePanel
        const card = panel?.shadowRoot?.querySelector('.grid-item .liebe-card[data-tier="row"]')
        return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
      })
    )
    .toBe('50')

  const row = await placementGeometry(page, 'row')
  expect(row, 'the 3×1 card should render at the row tier').not.toBeNull()

  const TOLERANCE = 0.5

  /*
   * The token has to resolve to PIXELS, not merely to a length: every
   * comparison below puts it beside a `getBoundingClientRect` reading, and a
   * `2.5rem` would parse to a finite 2.5 and be compared against 40 as though
   * the control had shrunk to nothing.
   */
  expect(
    row!.controlHeightToken,
    '--liebe-control-height must resolve to a px length for these comparisons'
  ).toMatch(/^\d+(\.\d+)?px$/)
  const controlHeight = Number.parseFloat(row!.controlHeightToken)

  // The premise: this is the wide tile, and the option turned its slider on end.
  expect(row!.orientation).toBe('vertical')

  const { slider, track, thumb, card, body } = row!
  expect(slider, 'the row card should render a slider').not.toBeNull()
  expect(track, 'the slider should render a track').not.toBeNull()
  expect(thumb, 'the slider should render its leading edge').not.toBeNull()

  /*
   * THE ASSERTION THIS SPEC EXISTS FOR. A vertical slider takes its length from
   * its host — `block-size: 100%` — and a row line is as tall as the icon
   * circle inside it, which is a height derived from content and therefore not
   * something a percentage can resolve against. Flipping the orientation prop
   * alone leaves the track at zero height: still in the DOM, still stamped
   * `vertical`, and invisible.
   *
   * Compared against the 44px touch floor rather than against zero, because
   * zero is not the only failing length — a track a few pixels tall is the same
   * defect with a less obvious symptom (docs/specs/design-system — "Cross-axis
   * fit").
   */
  expect(track!.height).toBeGreaterThanOrEqual(44)
  expect(slider!.height).toBeGreaterThanOrEqual(track!.height - TOLERANCE)

  // And it is the tile's leftover height it took, not a length of its own: a
  // hardcoded track would not follow the body it sits in.
  expect(slider!.height).toBeLessThanOrEqual(body.height + TOLERANCE)

  // Across the track it keeps the token's thickness, so a forced placement is
  // the same control the tier would have drawn, turned.
  expect(Math.abs(slider!.width - controlHeight)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(track!.width - controlHeight)).toBeLessThanOrEqual(TOLERANCE)

  /*
   * The leading edge spans the track and no more. It is sized from the same
   * token as the track, absolutely positioned and centred by Radix, so a thumb
   * left at the token's width inside a track that had narrowed to fit the row
   * would hang past it on both sides — the same overflow one box further in,
   * which is what the narrow-row rules relax it for. This tile is wide enough
   * that both are at the token's thickness; what is asserted is the
   * relationship, which has to hold at every width.
   */
  expect(thumb!.left).toBeGreaterThanOrEqual(track!.left - TOLERANCE)
  expect(thumb!.right).toBeLessThanOrEqual(track!.right + TOLERANCE)
  expect(Math.abs(thumb!.width - track!.width)).toBeLessThanOrEqual(TOLERANCE)

  // Nothing hangs past the tile, which clips (`overflow: hidden`). This is the
  // half that makes "forced means forced" safe to say.
  expect(slider!.top).toBeGreaterThanOrEqual(card.top - TOLERANCE)
  expect(slider!.bottom).toBeLessThanOrEqual(card.bottom + TOLERANCE)
  expect(slider!.left).toBeGreaterThanOrEqual(card.left - TOLERANCE)
  expect(slider!.right).toBeLessThanOrEqual(card.right + TOLERANCE)

  /*
   * The mirror, and the omission path. A `tall` tile is one column wide by
   * definition, so forcing the slider across it asks for a track as long as the
   * content region, and the rule is that a track under the 44px touch floor is
   * omitted rather than rendered short.
   *
   * Asserted as the RULE rather than as one of its outcomes. The arithmetic
   * behind "the region is 35px" — a 63px tile on a 12-column grid in a 1280px
   * viewport — belongs to the environment this spec happens to run in, and a
   * wider viewport gives the same tile a region that clears the floor. Pinning
   * the outcome would then fail for a reason that is not a regression, which is
   * the way an environment-coupled assertion wastes a CI run; pinning the
   * implication holds either way, and the measured width is reported with it so
   * a failure says which side of the floor it was on.
   */
  const tall = await placementGeometry(page, 'tall')
  expect(tall, 'the 1×3 card should render at the tall tier').not.toBeNull()

  // A real box, so the branch below is taken on a measurement rather than on a
  // card that never laid out.
  expect(tall!.body.width).toBeGreaterThan(0)

  if (tall!.body.width < 44) {
    expect(
      tall!.slider,
      `a ${tall!.body.width}px region is under the 44px touch floor, so the forced horizontal track must be omitted rather than shrunk`
    ).toBeNull()
  } else {
    expect(
      tall!.slider,
      `a ${tall!.body.width}px region clears the 44px touch floor, so the forced horizontal track must render`
    ).not.toBeNull()
    expect(tall!.orientation).toBe('horizontal')
    // And it stays inside the tile it was forced into, which is the same
    // omit-never-clip claim from the other side.
    expect(tall!.slider!.left).toBeGreaterThanOrEqual(tall!.card.left - TOLERANCE)
    expect(tall!.slider!.right).toBeLessThanOrEqual(tall!.card.right + TOLERANCE)
  }
})
