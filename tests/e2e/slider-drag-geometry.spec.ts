import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, getRestState, openPanel } from './helpers'

/**
 * Slider drag to maximum with a real pointer — the browser home of the
 * `Slider/DragToMaximum` story assertion (change 0045 PR 3, dual enforcement:
 * the entry stays).
 *
 * A play function can only dispatch a *synthetic* pointer sequence, and Radix
 * gates `pointermove`/`pointerup` on `hasPointerCapture()`, which a synthetic
 * sequence cannot establish in jsdom — the story's coordinates are all 0,
 * so the drag lands nowhere and the value assertion fails there. Here the
 * pointer is real (Playwright's trusted mouse), the coordinates come off the
 * track's own measured box, and nothing is stubbed.
 *
 * The claim is the whole point of separating change from commit: dragging
 * past the track's edge drives the value to its maximum and dispatches
 * exactly one service call, not one per pixel of travel. The value is read
 * off the thumb's `aria-valuenow`; the single commit is counted at the
 * WebSocket boundary — every `call_service` frame the panel sends for this
 * entity during the drag — with the final brightness 255 (via REST) as the
 * converging evidence that the one counted call carried the maximum.
 *
 * The minimum sibling rides along: the same gesture the other way parks the
 * value at zero, through `light.turn_off`.
 */

function seedSliderDragConfig() {
  return buildSeedConfig({
    id: 'e2e-slider-drag-screen',
    name: 'E2E Slider Drag',
    slug: 'e2e-slider-drag',
    items: [
      // 3×1 — `row`, the tier that runs the brightness slider horizontally.
      {
        id: 'item-drag-light',
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 0,
        y: 0,
        width: 3,
        height: 1,
      },
    ],
  })
}

interface DragPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

interface TrackBox {
  left: number
  top: number
  width: number
  height: number
}

/** The friendly name the panel currently knows for an entity. */
async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: DragPanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/** The value that card's slider currently reports, off the thumb. */
async function sliderValueNow(page: Page, name: string): Promise<string | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: DragPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
  }, name)
}

/**
 * The track's box in viewport coordinates, measured in the page — the numbers
 * the drag below is computed from, so the gesture lands on the rendered
 * control rather than on a guess about it.
 */
async function sliderTrackBox(page: Page, name: string): Promise<TrackBox> {
  const box = await page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: DragPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    const track = card?.querySelector('.liebe-slider-track')
    if (!track) return null
    const { left, top, width, height } = track.getBoundingClientRect()
    return { left, top, width, height }
  }, name)
  expect(box, 'the card should render a slider track').not.toBeNull()
  return box as TrackBox
}

/**
 * A real-pointer drag across the track, in the `dragResizeHandle` idiom: move
 * to the origin first, press, then travel in steps so the drag is a drag
 * rather than a jump the control could swallow as its start event.
 */
async function dragPointer(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('dragging past the track edge drives the value to maximum with a single commit', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedSliderDragConfig())

  // Mid-travel, not off and not full: the slider only renders for a light
  // that is on, and starting at an extreme would leave the drag nothing to
  // prove. 128 of 255 is the 50 the card announces, so waiting on the value
  // is waiting on the state having reached the panel.
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  const light = await entityName(page, DEMO_LIGHT)
  await expect.poll(() => sliderValueNow(page, light)).toBe('50')

  const track = await sliderTrackBox(page, light)
  expect(track.width, 'the track should have a box to drag across').toBeGreaterThan(0)

  // Count every `call_service` frame the panel sends for this entity from
  // here on: the counter starts after the setup `turn_on` above has settled
  // (the `sliderValueNow` poll is that settlement), so what it counts is the
  // drag's own dispatches and nothing else. Registered on the raw socket —
  // the same boundary `hass.callService` writes to — so the gesture is
  // observed, never stubbed. A card that dispatched per pointer-move would
  // fail here with one frame per travel step while still converging on the
  // same final brightness.
  const turnOnFrames: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      const payload =
        typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8')
      let message:
        | { type?: unknown; domain?: unknown; service?: unknown; service_data?: unknown }
        | undefined
      try {
        message = JSON.parse(payload) as NonNullable<typeof message>
      } catch {
        return
      }
      // Scoped to this entity's service data (`entity_id` travels in
      // `service_data` per `hassService.buildServiceData`), so a stray
      // `light.turn_on` for any other entity could not satisfy the count.
      const serviceData = (message?.service_data ?? {}) as { entity_id?: unknown }
      if (
        message?.type === 'call_service' &&
        message?.domain === 'light' &&
        message?.service === 'turn_on' &&
        serviceData.entity_id === DEMO_LIGHT
      ) {
        turnOnFrames.push(payload)
      }
    })
  })

  // Press on the track's centre, drag well past its right edge so the value
  // clamps to the maximum rather than landing on whatever fraction a pixel
  // offset works out to.
  const middleY = track.top + track.height / 2
  await dragPointer(
    page,
    { x: track.left + track.width / 2, y: middleY },
    { x: track.left + track.width + 100, y: middleY }
  )

  // The thumb announces the maximum — the story's own assertion, evaluated
  // where the coordinates are real.
  await expect.poll(() => sliderValueNow(page, light)).toBe('100')

  // And the drag committed exactly once: one `light.turn_on` carrying full
  // brightness. The REST poll comes first (the service call resolves before
  // the state reaches the panel over the websocket); the panel poll then
  // waits for that state to have arrived, so a snapshot taken in between
  // cannot read the pre-drag brightness and report a defect that is not
  // there. The entity id travels as an argument — `page.evaluate`
  // serializes its function, which cannot close over this module.
  await expect.poll(() => getRestState(accessToken, DEMO_LIGHT), { timeout: 15_000 }).toBe('on')
  await expect
    .poll(async () => {
      const attributes = await page.evaluate((entityId) => {
        const panel = (window as unknown as { __liebePanel?: DragPanelHandle }).__liebePanel
        return (
          (panel?._hass?.states?.[entityId] as { attributes?: { brightness?: number } } | undefined)
            ?.attributes ?? null
        )
      }, DEMO_LIGHT)
      return attributes?.brightness ?? null
    })
    .toBe(255)
  expect(
    turnOnFrames,
    'one drag should dispatch one light.turn_on, not one per pixel'
  ).toHaveLength(1)
})

test('dragging past the leading edge parks the value at zero', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedSliderDragConfig())

  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  const light = await entityName(page, DEMO_LIGHT)
  await expect.poll(() => sliderValueNow(page, light)).toBe('50')

  const track = await sliderTrackBox(page, light)
  expect(track.width, 'the track should have a box to drag across').toBeGreaterThan(0)

  const middleY = track.top + track.height / 2
  await dragPointer(
    page,
    { x: track.left + track.width / 2, y: middleY },
    { x: track.left - 100, y: middleY }
  )

  await expect.poll(() => sliderValueNow(page, light)).toBe('0')
  await expect.poll(() => getRestState(accessToken, DEMO_LIGHT), { timeout: 15_000 }).toBe('off')
})
