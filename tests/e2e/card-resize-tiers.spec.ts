import { test, expect, type Locator, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, E2E_FLAG, openPanel } from './helpers'

/**
 * Resizing a card in edit mode re-renders it across layout tiers.
 *
 * This is the flow change 0011 requires the e2e suite to cover, and it is the
 * one that cannot be faked in jsdom: the tier is derived from the span
 * `GridLayoutSection` actually lays the item out at, and that span only exists
 * once react-grid-layout has measured a real container and processed a real
 * drag of its resize handle. A unit test can only assert what a card does with
 * a tier it was handed; this asserts that dragging a corner changes the tier.
 *
 * Everything is read off the DOM — `data-tier` on the tile and the presence of
 * the embedded control — never off a screenshot.
 *
 * Every read is scoped to the card under test by the entity's own name, never
 * to the first `.liebe-card` in the shadow root. A first-match selector in a
 * shadow root is a latent false result in both directions, so the seed below
 * deliberately places a SECOND card on the screen: a query that took the first
 * tile would be reading a card this spec never resizes, and would report a tier
 * confidently either way.
 */

const LIGHT_ITEM = 'item-resize-light'
const NEIGHBOUR_ITEM = 'item-resize-neighbour'

function seedResizeConfig() {
  return buildSeedConfig({
    // A dedicated screen, like the camera and theming seeds: this spec drags
    // items around and persists the result, which must not perturb the
    // deterministic seed the other serial specs assert against.
    id: 'e2e-resize-screen',
    name: 'E2E Resize',
    slug: 'e2e-resize',
    items: [
      /*
       * The neighbour is FIRST on purpose. Items render in this order, so it is
       * the first `.liebe-card` in the shadow root — which means a first-match
       * selector would read this card rather than the one the test resizes, and
       * the scoping below is proven rather than merely intended. Parked at x:6,
       * out of the path of drags that never take the light past three columns.
       */
      { id: NEIGHBOUR_ITEM, type: 'entity', entityId: E2E_FLAG, x: 6, y: 0, width: 2, height: 2 },
      // 2×2 — `full` on a 12-column desktop grid.
      { id: LIGHT_ITEM, type: 'entity', entityId: DEMO_LIGHT, x: 0, y: 0, width: 2, height: 2 },
    ],
  })
}

interface ResizePanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

/*
 * How a card is found, and why the lookup below is spelled out twice.
 *
 * The rendered name is the only identifier a tile carries that says WHICH item
 * it came from — `data-tier`, `data-domain` and the rest describe what the tile
 * IS — so it is what scopes every read here. The `.grid-item` prefix keeps the
 * search inside placed cards, so a dialog or a sidebar widget rendering the
 * same entity cannot answer for the grid.
 *
 * `page.evaluate` serializes the function it is handed, which cannot close over
 * anything in this module, so the four lines are repeated in each reader rather
 * than shared. Repeating them beats the alternatives: a `new Function` built
 * from source text would be the one construct Home Assistant's CSP is entitled
 * to block, and a shared init script would put test-only code in the page under
 * test.
 */

/** The friendly name the panel currently knows for an entity. */
async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: ResizePanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/** The tier stamped on that entity's card, straight off the contract attribute. */
async function cardTier(page: Page, name: string): Promise<string | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: ResizePanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    return card?.getAttribute('data-tier') ?? null
  }, name)
}

/** Whether that entity's card has its embedded brightness slider in the DOM at all. */
async function hasBrightnessSlider(page: Page, name: string): Promise<boolean> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: ResizePanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    return Boolean(card?.querySelector('[role="slider"][aria-label="Brightness"]'))
  }, name)
}

/** The grid item holding that entity's card — the thing this spec drags. */
function gridItemFor(page: Page, name: string): Locator {
  return page.locator('.grid-item').filter({ hasText: name })
}

/**
 * Drags a grid item's south-east resize handle to a point, in two moves:
 * react-grid-layout starts the drag on the first and follows on the second, and
 * a single jump can be swallowed as the start event.
 */
async function dragResizeHandle(page: Page, item: Locator, to: { x: number; y: number }) {
  await expect(item, 'the card should be laid out').toHaveCount(1)
  const handle = item.locator('.react-resizable-handle-se')
  await expect(handle, 'edit mode should expose a resize handle').toHaveCount(1)

  const handleBox = (await handle.boundingBox())!
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move((handleBox.x + to.x) / 2, (handleBox.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('resizing a card in edit mode re-renders it across tiers', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedResizeConfig())

  // The brightness slider only renders for a light that is on, so put the demo
  // light in a known state rather than inheriting whatever a previous spec left.
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })

  const light = await entityName(page, DEMO_LIGHT)
  const neighbour = await entityName(page, E2E_FLAG)
  expect(light, 'the two seeded cards must be distinguishable by name').not.toBe(neighbour)

  // Starting point: 2×2 is `full`, and the light card carries its slider there.
  await expect.poll(() => cardTier(page, light)).toBe('full')
  await expect.poll(() => hasBrightnessSlider(page, light)).toBe(true)

  // Into edit mode through the taskbar button — the same click a user makes.
  await page.locator('[aria-label="View Mode"]').click()
  await expect.poll(() => cardTier(page, light)).toBe('full')

  // Drag the handle up and to the left, past the one-cell minimum (`minW`/`minH`
  // are both 1), so react-grid-layout settles the item at 1×1 however wide the
  // viewport's cells happen to be.
  const item = gridItemFor(page, light)
  const box = (await item.boundingBox())!
  await dragResizeHandle(page, item, { x: box.x + 4, y: box.y + 4 })

  // The card re-rendered at the tier its new span derives to — one cell is
  // `glance` — without the page reloading or the card remounting.
  await expect.poll(() => cardTier(page, light)).toBe('glance')
  // The neighbour was not resized and did not follow it, which is the assertion
  // a first-match selector could never make.
  await expect.poll(() => cardTier(page, neighbour)).toBe('full')

  // Back to view mode: the omit-never-clip rule means the slider is genuinely
  // gone from the DOM at `glance`, not merely shrunk to fit.
  await page.locator('[aria-label="Edit Mode"]').click()
  await expect.poll(() => cardTier(page, light)).toBe('glance')
  await expect.poll(() => hasBrightnessSlider(page, light)).toBe(false)

  // And back up again, on the same card instance: the tier follows the span in
  // both directions.
  await page.locator('[aria-label="View Mode"]').click()
  const glanceBox = (await gridItemFor(page, light).boundingBox())!
  await dragResizeHandle(page, gridItemFor(page, light), {
    x: glanceBox.x + glanceBox.width * 3,
    y: glanceBox.y + glanceBox.height * 3,
  })

  await expect.poll(() => cardTier(page, light)).toBe('full')
  await page.locator('[aria-label="Edit Mode"]').click()
  await expect.poll(() => hasBrightnessSlider(page, light)).toBe(true)
})
