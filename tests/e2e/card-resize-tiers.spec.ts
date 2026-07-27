import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, openPanel } from './helpers'

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
 */

const CARD_ID = 'item-resize-light'

function seedResizeConfig() {
  return buildSeedConfig({
    // A dedicated screen, like the camera and theming seeds: this spec drags
    // items around and persists the result, which must not perturb the
    // deterministic seed the other serial specs assert against.
    id: 'e2e-resize-screen',
    name: 'E2E Resize',
    slug: 'e2e-resize',
    items: [
      // 2×2 — `full` on a 12-column desktop grid.
      { id: CARD_ID, type: 'entity', entityId: DEMO_LIGHT, x: 0, y: 0, width: 2, height: 2 },
    ],
  })
}

/** The tier the panel stamped on the card, straight off the contract attribute. */
async function cardTier(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot | null } })
      .__liebePanel
    return panel?.shadowRoot?.querySelector('.liebe-card')?.getAttribute('data-tier') ?? null
  })
}

/** Whether the light's embedded brightness slider is in the DOM at all. */
async function hasBrightnessSlider(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot | null } })
      .__liebePanel
    return Boolean(panel?.shadowRoot?.querySelector('[role="slider"][aria-label="Brightness"]'))
  })
}

test('resizing a card in edit mode re-renders it across tiers', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedResizeConfig())

  // The brightness slider only renders for a light that is on, so put the demo
  // light in a known state rather than inheriting whatever a previous spec left.
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })

  // Starting point: 2×2 is `full`, and the light card carries its slider there.
  await expect.poll(() => cardTier(page)).toBe('full')
  await expect.poll(() => hasBrightnessSlider(page)).toBe(true)

  // Into edit mode through the taskbar button — the same click a user makes.
  await page.locator('[aria-label="View Mode"]').click()
  await expect.poll(() => cardTier(page)).toBe('full')

  // Drag the south-east resize handle up and to the left, past the one-cell
  // minimum (`minW`/`minH` are both 1), so react-grid-layout settles the item
  // at 1×1 however wide the viewport's cells happen to be.
  const card = page.locator('.grid-item').first()
  const handle = page.locator('.react-resizable-handle-se').first()
  const box = await card.boundingBox()
  const handleBox = await handle.boundingBox()
  expect(box, 'the card should be laid out').not.toBeNull()
  expect(handleBox, 'edit mode should expose a resize handle').not.toBeNull()

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  // Two moves: react-grid-layout starts the drag on the first and follows on
  // the second, and a single jump can be swallowed as the start event.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 5 })
  await page.mouse.move(box!.x + 4, box!.y + 4, { steps: 10 })
  await page.mouse.up()

  // The card re-rendered at the tier its new span derives to — one cell is
  // `glance` — without the page reloading or the card remounting.
  await expect.poll(() => cardTier(page)).toBe('glance')

  // Back to view mode: the omit-never-clip rule means the slider is genuinely
  // gone from the DOM at `glance`, not merely shrunk to fit.
  await page.locator('[aria-label="Edit Mode"]').click()
  await expect.poll(() => cardTier(page)).toBe('glance')
  await expect.poll(() => hasBrightnessSlider(page)).toBe(false)

  // And back up again, on the same card instance: the tier follows the span in
  // both directions.
  await page.locator('[aria-label="View Mode"]').click()
  const glanceBox = await page.locator('.grid-item').first().boundingBox()
  const glanceHandle = await page.locator('.react-resizable-handle-se').first().boundingBox()
  await page.mouse.move(
    glanceHandle!.x + glanceHandle!.width / 2,
    glanceHandle!.y + glanceHandle!.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(glanceBox!.x + glanceBox!.width * 2, glanceBox!.y + glanceBox!.height * 2, {
    steps: 5,
  })
  await page.mouse.move(glanceBox!.x + glanceBox!.width * 3, glanceBox!.y + glanceBox!.height * 3, {
    steps: 10,
  })
  await page.mouse.up()

  await expect.poll(() => cardTier(page)).toBe('full')
  await page.locator('[aria-label="Edit Mode"]').click()
  await expect.poll(() => hasBrightnessSlider(page)).toBe(true)
})
