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
  /** The slider root, whose centring within its host region is the second rule. */
  slider: Box
  /** The region hosting it — the `tall` body's control band. */
  band: Box
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
    const band = card.querySelector('.liebe-card-body-fill')
    if (!slider || !track || !fill || !band) return null

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
      band: box(band),
    }
  }, name)
}

test('a tall card’s vertical slider fill spans its track and is centred in it', async ({
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

  await expect.poll(() => sliderGeometry(page, light)).not.toBeNull()
  const geometry = (await sliderGeometry(page, light))!

  // The premise: this is the `tall` tier's vertical slider. Asserted rather than
  // assumed — every measurement below is meaningless about a horizontal one.
  expect(geometry.tier).toBe('tall')
  expect(geometry.orientation).toBe('vertical')

  const { track, fill, slider, band } = geometry

  // Sub-pixel tolerance throughout: the track's width comes from a token in
  // `px`, but a fractional grid column can still land either box on a
  // half-pixel, and neither rule is about a half-pixel.
  const TOLERANCE = 0.5

  // The track has to have a box of its own before the fill can be compared with
  // it — a collapsed track would make every comparison below trivially true.
  expect(track.width).toBeGreaterThan(0)

  // The fill spans the track's width, flush with both edges.
  expect(fill.width).toBeCloseTo(track.width, 1)
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

  // The second rule: the slider sits centred in the region hosting it, not
  // against its leading edge.
  expect(band.width).toBeGreaterThan(slider.width)
  const sliderCentre = slider.left + slider.width / 2
  const bandCentre = band.left + band.width / 2
  expect(Math.abs(sliderCentre - bandCentre)).toBeLessThanOrEqual(1)
})
