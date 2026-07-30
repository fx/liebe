import { expect, test, type Page } from '@playwright/test'
import { buildSeedConfig, DEMO_LIGHT, dragResizeHandle, gridItemFor, openPanel } from './helpers'

/**
 * The grid's resize-handle geometry, which is a cascade fact and therefore not
 * observable anywhere but here.
 *
 * [grid-layout](../../docs/specs/grid-layout/index.md#touch--pointer) states a
 * MUST: resize handles grow to at least `32×32` on a coarse pointer, edge
 * handles to `32×60` / `60×32`. `GridLayoutSection.css` has always contained
 * exactly those rules — and until change [0036](../../docs/changes/0036-theming-contract-gaps.md)
 * PR 5 not one of them rendered. `react-grid-layout` selects the same handles
 * one class deeper (`.react-grid-item > .react-resizable-handle.react-resizable-handle-s`)
 * and shipped **unlayered**, and unlayered author CSS outranks every cascade
 * layer regardless of specificity, so Liebe's `liebe-base` rules lost every
 * property the vendor also set.
 *
 * Why this file rather than a unit test: nothing about it is a text fact. The
 * stylesheet said `32×32` for the whole time the handle measured 20×20, so a
 * test reading the CSS would have passed throughout. Only a real cascade, in a
 * real browser, over the sheets in the order the panel links them, can answer
 * it — and the workshop cannot help either, because it takes a drag on a
 * measured container to put a handle on screen at all.
 *
 * Everything is measured off the DOM. `offsetWidth`/`offsetHeight` rather than
 * `getBoundingClientRect`, because the vendor rotates its handles (`rotate(45deg)`
 * on the south one) and a rect is transform-inclusive: a rotated 20×20 box
 * measures 28.28 across, which is neither the layout box nor a number any rule
 * here is making a claim about.
 */

const LIGHT_ITEM = 'item-handle-light'

function seedHandleConfig() {
  return buildSeedConfig({
    // Its own screen, like the other interaction specs: this one enters edit
    // mode and drags, and must not perturb the shared deterministic seed.
    id: 'e2e-handle-screen',
    name: 'E2E Handles',
    slug: 'e2e-handles',
    /*
     * Four columns wide, not three. The floor asserted below is written in
     * pixels while a grid cell is not, and the coarse-pointer cap keeps a handle
     * to 40% of its tile — so a 60px edge handle needs a tile of at least 150px
     * to be the number the spec states rather than the number the cap allows. A
     * three-column tile measures 141 here, which is exactly the width at which
     * this file would have been asserting the cap and calling it the floor.
     */
    items: [
      { id: LIGHT_ITEM, type: 'entity', entityId: DEMO_LIGHT, x: 0, y: 0, width: 4, height: 4 },
    ],
  })
}

interface HandleBox {
  /** Layout size, transform excluded — how big the handle IS. */
  width: number
  height: number
  /**
   * Painted centre relative to the card, transform included — where the handle
   * SITS.
   *
   * A centre rather than an edge, and from the rect rather than the layout box,
   * because that combination is the only one both rotation-invariant and
   * transform-aware. The vendor rotates its south handle 45°, which leaves the
   * centre exactly where it was while moving every edge; measuring an edge
   * would report that rotation as a 4.5px displacement and read as the very
   * defect this file is about.
   */
  centreX: number
  centreY: number
  /** Painted extent relative to the card, for the stays-inside-the-card check. */
  paintedLeft: number
  paintedRight: number
}

/**
 * One handle's size and painted position, read together.
 *
 * Both are needed and they fail differently. A wrong size means the sizing rule
 * is not winning; a right size in the wrong place means it won and something
 * else moved the result — which is exactly what the vendor's `margin-left:
 * -10px` does to a handle Liebe already centres with `translateX(-50%)`, the
 * two shifts compounding into a bar hanging off the side of the card.
 */
async function handleBox(page: Page, cardName: string, handle: string): Promise<HandleBox | null> {
  return page.evaluate(
    ({ name, cls }) => {
      const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } })
        .__liebePanel
      const root = panel?.shadowRoot
      if (!root) return null

      const item = Array.from(root.querySelectorAll('.grid-item')).find((element) =>
        element.textContent?.includes(name)
      )
      const element = item?.querySelector<HTMLElement>(`.${cls}`)
      if (!item || !element) return null

      const itemRect = item.getBoundingClientRect()
      const rect = element.getBoundingClientRect()

      return {
        width: element.offsetWidth,
        height: element.offsetHeight,
        centreX: rect.left + rect.width / 2 - itemRect.left,
        centreY: rect.top + rect.height / 2 - itemRect.top,
        paintedLeft: rect.left - itemRect.left,
        paintedRight: rect.right - itemRect.left,
      }
    },
    { name: cardName, cls: handle }
  )
}

async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (
      window as unknown as {
        __liebePanel?: {
          _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
        }
      }
    ).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)

  expect(name, `the ${entityId} fixture should publish a friendly name`).toBeTruthy()
  return name!
}

async function enterEditMode(page: Page) {
  await page.locator('[aria-label="View Mode"]').click()
}

/*
 * A coarse pointer, which is the condition the MUST is written under. Scoped to
 * this block rather than the file, because the fine-pointer geometry below is
 * governed by different rules and running both in one context would leave the
 * media query answering for whichever ran last.
 */
test.use({ hasTouch: true, isMobile: false, viewport: { width: 1280, height: 900 } })

test('the resize handles are the geometry the grid spec states', async ({ page }) => {
  await openPanel(page, seedHandleConfig())
  const light = await entityName(page, DEMO_LIGHT)
  await enterEditMode(page)

  const item = gridItemFor(page, light)
  await expect(item, 'the seeded card should be laid out').toHaveCount(1)
  await expect(
    item.locator('[class*="react-resizable-handle"]'),
    'edit mode exposes eight handles'
  ).toHaveCount(8)

  /*
   * The premise, asserted before the rule that depends on it. `pointer: coarse`
   * is a property of the browser context rather than of anything this repo
   * ships, so a context that reports `fine` would measure 20px for a reason
   * that has nothing to do with the cascade — and would read as the defect
   * still being present. Two failures that look identical, separated.
   */
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
  expect(coarse, 'this context must report a coarse pointer for the floor to apply').toBe(true)

  const corner = await handleBox(page, light, 'react-resizable-handle-se')
  const south = await handleBox(page, light, 'react-resizable-handle-s')
  const east = await handleBox(page, light, 'react-resizable-handle-e')

  expect(corner, 'the south-east handle should be in the DOM').not.toBeNull()
  expect(south, 'the south handle should be in the DOM').not.toBeNull()
  expect(east, 'the east handle should be in the DOM').not.toBeNull()

  /*
   * The floor, verbatim from the spec. These are the four numbers that had
   * never rendered: before PR 5 every one of them measured 20.
   */
  expect(corner!.width, 'coarse-pointer corner handle width').toBeGreaterThanOrEqual(32)
  expect(corner!.height, 'coarse-pointer corner handle height').toBeGreaterThanOrEqual(32)
  expect(south!.width, 'coarse-pointer south handle width').toBeGreaterThanOrEqual(60)
  expect(south!.height, 'coarse-pointer south handle height').toBeGreaterThanOrEqual(32)
  expect(east!.width, 'coarse-pointer east handle width').toBeGreaterThanOrEqual(32)
  expect(east!.height, 'coarse-pointer east handle height').toBeGreaterThanOrEqual(60)

  /*
   * A ceiling as well as a floor, and this one is here because its absence
   * already produced a false green.
   *
   * A handle is an affordance ON a card, so it is smaller than the card by
   * construction — and a lower bound alone cannot tell `32×32` from a handle
   * stretched over the whole tile. That is not hypothetical: the first run of
   * this file after the demotion passed every assertion above while all eight
   * handles measured the full 141×174 card, because `.grid-item > *` had
   * started matching them. Three quarters is loose enough to survive a small
   * tile and tight enough that a full-bleed handle cannot hide behind it.
   */
  const itemBox = (await item.boundingBox())!
  for (const [label, box] of [
    ['corner', corner!],
    ['south', south!],
    ['east', east!],
  ] as const) {
    expect(box.width, `${label} handle is an affordance on the card, not the card`).toBeLessThan(
      itemBox.width * 0.75
    )
    expect(box.height, `${label} handle is an affordance on the card, not the card`).toBeLessThan(
      itemBox.height * 0.75
    )
  }

  /*
   * Visible as well as large. `react-grid-layout` hides handles until `:hover`,
   * which a touch device never fires, so without the reveal this file would be
   * certifying a 32×32 target nobody can see — a floor met on paper in exactly
   * the way the dead rules met it on paper.
   */
  const opacity = await page.evaluate((name) => {
    const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } }).__liebePanel
    const root = panel?.shadowRoot
    const item = Array.from(root?.querySelectorAll('.grid-item') ?? []).find((element) =>
      element.textContent?.includes(name)
    )
    const handle = item?.querySelector('.react-resizable-handle-se')
    return handle ? getComputedStyle(handle).opacity : null
  }, light)
  expect(opacity, 'a coarse-pointer handle is visible without hover').toBe('1')
})

test('an edge handle is centred once, not twice', async ({ page }) => {
  await openPanel(page, seedHandleConfig())
  const light = await entityName(page, DEMO_LIGHT)
  await enterEditMode(page)

  const item = gridItemFor(page, light)
  const itemBox = (await item.boundingBox())!
  const south = (await handleBox(page, light, 'react-resizable-handle-s'))!
  const east = (await handleBox(page, light, 'react-resizable-handle-e'))!

  /*
   * Centred means centred: the handle's painted centre sits on the card's,
   * within a pixel of rounding. The failure this forbids is the compound shift
   * — the vendor's `margin-left: -10px` surviving alongside Liebe's
   * `translateX(-50%)`, which drags the bar half its own width PLUS ten pixels
   * off centre.
   *
   * Note what this test is and is not. It passed before PR 5 as well as after,
   * because before it there was no second shift to compound: Liebe's transform
   * was losing to the vendor's rotation like everything else. It is a guard on
   * the demotion rather than evidence of the defect the floor test measures —
   * remove the margin reset and it goes red.
   */
  expect(
    Math.abs(south.centreX - itemBox.width / 2),
    'south handle is centred on the card'
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(east.centreY - itemBox.height / 2),
    'east handle is centred on the card'
  ).toBeLessThanOrEqual(1)

  /*
   * And it stays inside the card it resizes. A handle that hangs off the edge
   * overlaps the neighbouring cell, where it swallows clicks meant for another
   * card — the reason "make Liebe's rules live" needed evidence rather than a
   * cascade fix.
   */
  expect(south.paintedLeft, 'south handle starts inside the card').toBeGreaterThanOrEqual(0)
  expect(south.paintedRight, 'south handle ends inside the card').toBeLessThanOrEqual(
    Math.ceil(itemBox.width)
  )
})

test('resizing still works with the new handle geometry', async ({ page }) => {
  await openPanel(page, seedHandleConfig())
  const light = await entityName(page, DEMO_LIGHT)
  await enterEditMode(page)

  const item = gridItemFor(page, light)
  const before = (await item.boundingBox())!

  /*
   * The assertion the geometry change could plausibly break, and the reason a
   * before/after resize is what this task asked for: a handle the drag helper
   * can no longer find its centre on would fail here rather than in a
   * measurement. Dragging in, past the one-cell minimum, so the settle point is
   * deterministic whatever the viewport's cell size is.
   */
  await dragResizeHandle(page, item, { x: before.x + 4, y: before.y + 4 })

  await expect
    .poll(
      async () => {
        const box = await item.boundingBox()
        return box ? box.width < before.width && box.height < before.height : false
      },
      { message: 'the card should have shrunk' }
    )
    .toBe(true)
})

/**
 * The same handles with a fine pointer, where none of the coarse-pointer rules
 * apply — and the case the block above structurally cannot see.
 *
 * This exists because a probe found the gap rather than because it was designed
 * in. Unscoping `.grid-item > *` back to matching the handles left every
 * assertion above green: under a coarse pointer the media query's `width: 32px`
 * comes later in the sheet than the fill rule and wins, so the handle stays
 * 32px however wrong the fill rule is. With a fine pointer nothing outranks it
 * and the handle takes the whole card — which is exactly the state that shipped
 * eight invisible full-card handles, so the ceiling belongs here more than it
 * belongs above.
 */
/**
 * Every corner handle draws its dot in its own corner, and carries no vendor
 * paint.
 *
 * Both halves are here because a probe found nothing asserting either, and the
 * first attempt at the first half asserted the wrong handle: `se` is the one
 * corner `react-resizable` does NOT rotate, so a test pointed at it stayed
 * green with the reset removed. The rotations are 90° on `sw`, 180° on `nw`
 * and 270° on `ne` — and Liebe overrides `transform` only on the four EDGE
 * handles, where it needs the property for centring, so the corners keep the
 * vendor's rotation unless the base rule clears it.
 *
 * A rotation is invisible on a square box. The only thing that moves is the
 * `::after` dot, into a corner the cursor is not in — which is why this asserts
 * the resolved offsets and the transform together: one says the rule is right,
 * the other says nothing is spinning the result.
 */
const CORNERS = [
  { handle: 'react-resizable-handle-se', vertical: 'bottom', horizontal: 'right' },
  { handle: 'react-resizable-handle-sw', vertical: 'bottom', horizontal: 'left' },
  { handle: 'react-resizable-handle-ne', vertical: 'top', horizontal: 'right' },
  { handle: 'react-resizable-handle-nw', vertical: 'top', horizontal: 'left' },
] as const

// Playwright's `test` has no `.each`; one `test()` per corner instead.
for (const { handle, vertical, horizontal } of CORNERS) {
  test(`${handle} draws its dot in its own corner`, async ({ page }) => {
    await openPanel(page, seedHandleConfig())
    const light = await entityName(page, DEMO_LIGHT)
    await enterEditMode(page)

    const measured = await page.evaluate(
      ({ name, cls }) => {
        const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } })
          .__liebePanel
        const root = panel?.shadowRoot
        const item = Array.from(root?.querySelectorAll('.grid-item') ?? []).find((element) =>
          element.textContent?.includes(name)
        )
        const element = item?.querySelector<HTMLElement>(`.${cls}`)
        if (!element) return null

        const after = getComputedStyle(element, '::after')
        return {
          top: after.top,
          right: after.right,
          bottom: after.bottom,
          left: after.left,
          transform: getComputedStyle(element).transform,
          backgroundImage: getComputedStyle(element).backgroundImage,
        }
      },
      { name: light, cls: handle }
    )

    expect(measured, `${handle} should be in the DOM`).not.toBeNull()

    // Liebe insets its dot 4px from the two edges the handle occupies.
    expect(measured![vertical], `${handle} dot is inset from the ${vertical}`).toBe('4px')
    expect(measured![horizontal], `${handle} dot is inset from the ${horizontal}`).toBe('4px')
    expect(measured!.transform, `nothing rotates ${handle} out of its corner`).toBe('none')

    /*
     * And no vendor grip behind Liebe's dot. `react-resizable` paints a grey
     * chevron SVG on every handle; with the sheet demoted it survives unless the
     * base rule clears it, so this is the assertion that keeps that reset honest.
     */
    expect(measured!.backgroundImage, `${handle} carries no vendor grip`).toBe('none')
  })
}

test.describe('on the smallest tile a narrow coarse viewport produces', () => {
  /*
   * The 8-column `tablet` breakpoint at 480px, where a 1×1 tile measures 33×51 —
   * smaller than the handles the floor asks for.
   */
  test.use({ hasTouch: true, isMobile: false, viewport: { width: 480, height: 800 } })

  test('a 1x1 card keeps a surface that is not a resize handle', async ({ page }) => {
    await openPanel(
      page,
      buildSeedConfig({
        id: 'e2e-tiny-handle-screen',
        name: 'E2E Tiny Handles',
        slug: 'e2e-tiny-handles',
        items: [
          {
            id: 'item-tiny',
            type: 'entity',
            entityId: DEMO_LIGHT,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        ],
      })
    )
    await enterEditMode(page)

    /*
     * Sampled rather than reasoned about. The floor is written in pixels and a
     * grid cell is not, so whether eight handles cover a tile is a question
     * about this viewport's arithmetic — and the answer before the 40% cap was
     * that they covered ALL of it: 0 of 100 points free, a card that could not
     * be dragged, tapped or opened.
     *
     * `elementFromPoint` on the shadow root is what a touch actually resolves
     * to, so this asks the question the user's finger asks.
     */
    const free = await page.evaluate(() => {
      const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } })
        .__liebePanel
      const root = panel?.shadowRoot
      const item = root?.querySelector('.react-grid-item')
      if (!root || !item) return null

      const rect = item.getBoundingClientRect()
      let uncovered = 0
      let total = 0
      for (let fx = 0.05; fx < 1; fx += 0.1) {
        for (let fy = 0.05; fy < 1; fy += 0.1) {
          total += 1
          const hit = root.elementFromPoint(
            rect.left + rect.width * fx,
            rect.top + rect.height * fy
          )
          if (!hit || !hit.className.toString().includes('react-resizable-handle')) uncovered += 1
        }
      }
      return { uncovered, total, width: Math.round(rect.width), height: Math.round(rect.height) }
    })

    expect(free, 'the 1x1 card should be laid out').not.toBeNull()
    expect(free!.width, 'this viewport should produce a genuinely small tile').toBeLessThan(60)
    expect(
      free!.uncovered,
      `a 1x1 tile must keep somewhere to grab it (${free!.width}x${free!.height})`
    ).toBeGreaterThan(0)
  })
})

test.describe('with a fine pointer', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } })

  test('a handle is still an affordance on the card rather than the card', async ({ page }) => {
    await openPanel(page, seedHandleConfig())
    const light = await entityName(page, DEMO_LIGHT)
    await enterEditMode(page)

    const fine = await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)
    expect(fine, 'this context must report a fine pointer').toBe(true)

    const item = gridItemFor(page, light)
    const itemBox = (await item.boundingBox())!

    for (const handle of [
      'react-resizable-handle-se',
      'react-resizable-handle-s',
      'react-resizable-handle-e',
    ]) {
      const box = await handleBox(page, light, handle)
      expect(box, `${handle} should be in the DOM`).not.toBeNull()
      expect(box!.width, `${handle} is smaller than the card`).toBeLessThan(itemBox.width * 0.75)
      expect(box!.height, `${handle} is smaller than the card`).toBeLessThan(itemBox.height * 0.75)
    }
  })
})
