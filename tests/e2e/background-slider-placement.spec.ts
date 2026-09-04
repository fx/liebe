import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, getRestState, openPanel } from './helpers'

/**
 * The background `sliderPlacement`, measured in a real engine.
 *
 * The unit suite proves the cards route `background` through the shared
 * reader, mount the surface behind the body at every tier including `glance`,
 * and split drag from tap — it cannot prove the surface then covers the tile
 * edge to edge, or that a drag on the real grid adjusts the value while a tap
 * toggles. jsdom applies no stylesheet and lays nothing out, so an absolutely
 * positioned layer with a wrong inset renders a byte-identical DOM. That is
 * the defect this spec exists for, beside `forced-slider-placement.spec.ts`.
 *
 * Two tiles, one screen: a 1×1 `glance` tile (the tier no inline placement
 * renders in) and a 3×1 `row` tile (where the surface must still consume no
 * layout space). Both carry the same light at half brightness; the glance tile
 * is the one the gestures drive.
 *
 * Everything geometric is read off `getBoundingClientRect`, never off a
 * screenshot. The tap/drag split is read off HA state over REST.
 */

const GLANCE_ITEM = 'item-background-glance'
const ROW_ITEM = 'item-background-row'

function seedBackgroundPlacementConfig() {
  return buildSeedConfig({
    id: 'e2e-background-screen',
    name: 'E2E Background',
    slug: 'e2e-background',
    items: [
      {
        id: GLANCE_ITEM,
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        config: { sliderPlacement: 'background' },
      },
      {
        id: ROW_ITEM,
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 2,
        y: 0,
        width: 3,
        height: 1,
        config: { sliderPlacement: 'background' },
      },
    ],
  })
}

interface BackgroundPanelHandle {
  shadowRoot?: ShadowRoot | null
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface BackgroundGeometry {
  placement: string | null
  orientation: string | null
  slider: Box | null
  track: Box | null
  card: Box
  body: Box
}

/**
 * Every box one background tile needs, measured in one pass.
 *
 * `null` when the card itself is missing, so a poll on this waits for the grid
 * to have laid out rather than comparing zeroed rectangles that would agree
 * with each other perfectly.
 */
async function backgroundGeometry(page: Page, tier: string): Promise<BackgroundGeometry | null> {
  return page.evaluate((wantedTier) => {
    const panel = (window as unknown as { __liebePanel?: BackgroundPanelHandle }).__liebePanel
    const card = panel?.shadowRoot?.querySelector(
      `.grid-item .liebe-card[data-tier="${wantedTier}"]`
    )
    const body = card?.querySelector('.liebe-card-body')
    if (!card || !body) return null

    const slider = card.querySelector('.liebe-slider[data-placement="background"]')
    const track = slider?.querySelector('.liebe-slider-track')

    const box = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    return {
      placement: slider?.getAttribute('data-placement') ?? null,
      orientation: slider?.getAttribute('data-orientation') ?? null,
      slider: slider ? box(slider) : null,
      track: track ? box(track) : null,
      card: box(card),
      body: box(body),
    }
  }, tier)
}

test('a background slider covers the tile, drags to adjust, taps to toggle', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedBackgroundPlacementConfig())

  // Half brightness: the surface renders only for a light that is on, and a
  // fill at either extreme is degenerate for the geometry below.
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })

  // Synchronise on the glance surface carrying the requested value — both
  // tiles render in the same pass, so this gates the row tile's geometry too.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = (window as unknown as { __liebePanel?: BackgroundPanelHandle }).__liebePanel
        const card = panel?.shadowRoot?.querySelector('.grid-item .liebe-card[data-tier="glance"]')
        return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
      })
    )
    .toBe('50')

  const TOLERANCE = 1

  // The glance tile: the surface exists where no inline slider ever does, it
  // runs bottom→top on a square span, and it covers the tile edge to edge.
  const glance = await backgroundGeometry(page, 'glance')
  expect(glance, 'the 1×1 card should render at the glance tier').not.toBeNull()
  expect(glance!.placement).toBe('background')
  expect(glance!.orientation).toBe('vertical')
  expect(glance!.slider, 'the glance card should render the surface').not.toBeNull()
  expect(glance!.track, 'the surface should render a track').not.toBeNull()
  expect(Math.abs(glance!.slider!.left - glance!.card.left)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(glance!.slider!.right - glance!.card.right)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(glance!.slider!.top - glance!.card.top)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(glance!.slider!.bottom - glance!.card.bottom)).toBeLessThanOrEqual(TOLERANCE)

  // The row tile: same surface, running left→right on the wide span, still
  // consuming no layout space — the body keeps the tier's own shape inside it.
  const row = await backgroundGeometry(page, 'row')
  expect(row, 'the 3×1 card should render at the row tier').not.toBeNull()
  expect(row!.placement).toBe('background')
  expect(row!.orientation).toBe('horizontal')
  expect(row!.slider, 'the row card should render the surface').not.toBeNull()
  expect(Math.abs(row!.slider!.left - row!.card.left)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(row!.slider!.right - row!.card.right)).toBeLessThanOrEqual(TOLERANCE)
  expect(row!.body.width).toBeGreaterThan(0)
  expect(row!.body.height).toBeGreaterThan(0)

  // A tap without travel falls through to the tap action: the light toggles
  // off, and back on for the drag below.
  const glanceCard = page.locator('.grid-item').filter({ hasText: 'Bed Light' }).first()
  await glanceCard.click()
  await expect.poll(() => getRestState(accessToken, DEMO_LIGHT), { timeout: 15_000 }).toBe('off')

  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  await expect.poll(() => getRestState(accessToken, DEMO_LIGHT), { timeout: 15_000 }).toBe('on')

  // A drag across the tile adjusts instead: press near the left edge, drag
  // past the right edge, release — the brightness commits near maximum and no
  // tap fires behind it.
  const box = await glanceCard.boundingBox()
  expect(box, 'the glance tile should lay out').not.toBeNull()
  await page.mouse.move(box!.x + 4, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width + 20, box!.y + box!.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = (window as unknown as { __liebePanel?: BackgroundPanelHandle }).__liebePanel
        const card = panel?.shadowRoot?.querySelector('.grid-item .liebe-card[data-tier="glance"]')
        return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
      })
    )
    .not.toBe('50')
})
