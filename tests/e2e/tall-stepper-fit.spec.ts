import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, E2E_FLAG, E2E_LEVEL, openPanel } from './helpers'

/**
 * The `input_number` card's embedded control stays inside its tile at `tall`.
 *
 * This is the measurement change 0042 requires and that no unit test can make.
 * jsdom lays nothing out, so a unit test can assert WHICH control the tier
 * selects — `src/components/__tests__/inputHelperControlStyle.test.tsx` does —
 * and can never see the geometry that made the selection necessary: a stepper
 * is 40 + 8 + 60 + 8 + 40 = 156px of content-sized buttons, Radix's
 * `.rt-BaseButton` sets `flex-shrink: 0` so it cannot compress, and a `tall`
 * tile on a 12-column desktop grid is 63px wide. The overflow was cut off by
 * `.liebe-card`'s own `overflow: hidden`, which is part of the anatomy contract
 * rather than a bug in the shell (docs/specs/design-system — cross-axis fit;
 * docs/specs/entity-cards/options/input-helpers.md — `input_number`).
 *
 * WHAT THIS SPEC ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. Change 0042
 * requires its two consequences to be asserted separately, because they are
 * different claims at different tolerances: the stepper's was a CLIP past the
 * tile's own edge, and the vertical slider's was a 3.5px-per-side overhang
 * INSIDE the tile's padding. This spec is the clip half — every rendered
 * control's box sits inside the tile's border box, so nothing is cropped — and
 * it stayed that way when PR 3 made the track take the content region's width
 * instead of the token's, which is deliberate: an assertion about the tile's
 * edge must hold whichever of the two the track measures. The track against the
 * REGION, and the floors that omit it below 24px across or 44px along, are
 * `tall-slider-fit.spec.ts`'s. The region-narrower-than-control relationship is
 * therefore measured and reported in the failure messages here, never asserted.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot.
 */

const LEVEL_ITEM = 'item-tall-stepper-level'
const NEIGHBOUR_ITEM = 'item-tall-stepper-neighbour'

/**
 * The intrinsic width of the stepper this tier refuses to render: two 40px
 * `size="3"` icon buttons, the 60px minimum of the click-to-edit value button,
 * and the control row's two 8px gaps. Measured in change 0042 and used here as
 * the threshold that keeps this spec honest — see the fixture note below.
 */
const STEPPER_INTRINSIC_WIDTH = 156

/**
 * The grid container width this fixture assumes: roughly 960px, which is what
 * Playwright's `Desktop Chrome` 1280px viewport leaves after Home Assistant's
 * sidebar and the panel's own inset. At the seed's 12 columns that lays out a
 * 63px tile with a 35px content region.
 *
 * Recorded so a later viewport change cannot quietly turn this spec into a
 * no-op: the defect only exists while the tile is narrower than the stepper
 * above, and a 12-column grid does not reach a 156px column until its container
 * clears roughly 2080px. The assertion below is on the tile rather than on this
 * number — the tile is what the claim is about — and this is what the number
 * means.
 */
const ASSUMED_GRID_CONTAINER_WIDTH = 960

/**
 * A 1×3 `input_number` pinned to `controlStyle: 'stepper'`, and a neighbour
 * that is not it.
 *
 * The option is set EXPLICITLY rather than left to the loader: the default
 * follows the helper's own `mode`, so a fixture that omitted it could render a
 * slider for reasons that have nothing to do with this tier and never exercise
 * the path at all (docs/changes/0042-tall-tile-control-geometry.md — testing
 * requirements).
 *
 * The neighbour is first, so it is the first `.liebe-card` in the shadow root:
 * every read below is scoped by the rendered entity name, and a first-match
 * selector would answer with a 2×2 card whose control was never at risk.
 */
function seedTallStepperConfig() {
  return buildSeedConfig({
    id: 'e2e-tall-stepper-screen',
    name: 'E2E Tall Stepper',
    slug: 'e2e-tall-stepper',
    items: [
      { id: NEIGHBOUR_ITEM, type: 'entity', entityId: E2E_FLAG, x: 6, y: 0, width: 2, height: 2 },
      // 1 wide, 3 tall — `tall`, without a drag, on a 12-column desktop grid.
      {
        id: LEVEL_ITEM,
        type: 'entity',
        entityId: E2E_LEVEL,
        x: 0,
        y: 0,
        width: 1,
        height: 3,
        config: { controlStyle: 'stepper' },
      },
    ],
  })
}

interface TallStepperPanelHandle {
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

interface TallControlGeometry {
  tier: string | null
  /** The tile's border box — what `overflow: hidden` crops against. */
  tile: Box
  /** The tile's content region: its border box less the inline padding. */
  contentRegion: { left: number; right: number; width: number }
  /** The grid container react-grid-layout derived the column width from. */
  container: Box
  /** Every control the slot actually rendered, each measured on its own. */
  controls: Array<{ label: string; box: Box }>
  /** Whether any of the stepper's three surfaces is in the DOM. */
  stepperSurfaces: number
  /** Whether the tier's vertical slider is, and which way it points. */
  sliderOrientation: string | null
}

/** The friendly name the panel currently knows for an entity. */
async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: TallStepperPanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/**
 * The tier stamped on that entity's card, straight off the contract attribute.
 *
 * Polled before anything is measured: the helper's state arrives over the
 * websocket after the panel boots, and a geometry snapshot taken before the
 * card has rendered would compare zeroed rectangles that agree perfectly.
 */
async function cardTier(page: Page, name: string): Promise<string | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: TallStepperPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    return card?.getAttribute('data-tier') ?? null
  }, name)
}

/**
 * Every box the fit claim needs, measured in one pass.
 *
 * One `evaluate` rather than several: boxes are only comparable if they were
 * measured against the same layout, and separate round trips could straddle a
 * re-render. `null` when the card is not there, so a poll on this waits for the
 * card rather than comparing zeroed rectangles that agree with each other
 * perfectly.
 *
 * The controls are measured INDIVIDUALLY rather than through their slot.
 * `.liebe-card-controls` is a flex row constrained to the box it sits in, so a
 * row of `flex-shrink: 0` children overflows it while the slot's own rectangle
 * stays neatly inside the tile — measuring the slot would report a perfect fit
 * for exactly the defect this spec exists to catch.
 *
 * The lookup is spelled out inline because `page.evaluate` serializes the
 * function it is handed, which cannot close over anything in this module.
 */
async function tallControlGeometry(page: Page, name: string): Promise<TallControlGeometry | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: TallStepperPanelHandle }).__liebePanel
    const root = panel?.shadowRoot
    const cards = [...(root?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    const container = root?.querySelector('.liebe-section')
    if (!card || !container) return null

    const box = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    const tile = box(card)
    const { paddingLeft, paddingRight } = getComputedStyle(card)
    const slot = card.querySelector('.liebe-card-controls')
    const slider = card.querySelector('.liebe-slider')

    return {
      tier: card.getAttribute('data-tier'),
      tile,
      contentRegion: {
        left: tile.left + Number.parseFloat(paddingLeft),
        right: tile.right - Number.parseFloat(paddingRight),
        width: tile.width - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight),
      },
      container: box(container),
      /*
       * The slot's direct children, plus the track itself wherever it is.
       * Today the track IS a direct child, so the union is the same set; the
       * union is what keeps this honest if the anatomy ever wraps it, because
       * a wrapper constrained to the slot would measure as a perfect fit
       * around a track that escaped.
       */
      controls: [...new Set([...(slot?.children ?? []), ...(slider ? [slider] : [])])].map(
        (control) => ({
          // Whatever names the control, so a failure says which box escaped.
          label:
            control.getAttribute('aria-label') ??
            control.querySelector('[aria-label]')?.getAttribute('aria-label') ??
            control.className,
          box: box(control),
        })
      ),
      stepperSurfaces: card.querySelectorAll(
        '[aria-label="Increase value"], [aria-label="Decrease value"], [aria-label^="Set value, currently"]'
      ).length,
      sliderOrientation: slider?.getAttribute('data-orientation') ?? null,
    }
  }, name)
}

test('a tall input_number pinned to the stepper renders a control that fits its tile', async ({
  page,
}) => {
  await openPanel(page, seedTallStepperConfig())

  const level = await entityName(page, E2E_LEVEL)
  const neighbour = await entityName(page, E2E_FLAG)
  expect(level, 'the two seeded cards must be distinguishable by name').not.toBe(neighbour)

  // A 1×3 item is `tall` without a drag; waiting on it is what synchronises
  // this spec with the card having rendered at all.
  await expect.poll(() => cardTier(page, level)).toBe('tall')
  // The neighbour was seeded 2×2 and is a different tier, which is the
  // assertion a first-match selector could never make.
  await expect.poll(() => cardTier(page, neighbour)).toBe('full')

  /*
   * And wait for a control to exist before measuring one. The tier is stamped
   * as soon as the card renders, which is before the helper's state has
   * arrived over the websocket — a snapshot taken in between would find an
   * empty slot and pass every "inside the tile" comparison vacuously.
   *
   * The predicate is "any control", deliberately, NOT "the vertical slider":
   * a poll for the slider would turn the defect this spec exists to catch — a
   * stepper rendering here — into a 5-second timeout with no measurement in
   * the failure, instead of the assertions below naming exactly which surface
   * rendered and how far past the edge it reached.
   */
  await expect
    .poll(async () => (await tallControlGeometry(page, level))?.controls.length ?? 0)
    .toBeGreaterThan(0)

  const geometry = await tallControlGeometry(page, level)
  expect(geometry, 'the tall card should have rendered').not.toBeNull()

  const { tile, contentRegion, container, controls, stepperSurfaces, sliderOrientation } = geometry!
  expect(geometry!.tier).toBe('tall')

  /*
   * THE PREMISE, asserted rather than assumed. Every claim below is empty if
   * the tile is wide enough to hold a stepper: an unfixed card would pass it
   * for the same reason a fixed one does. A 12-column grid does not reach a
   * 156px column until its container clears roughly 2080px, so this is the
   * assertion that would trip on a viewport change rather than let the spec
   * quietly become a tautology.
   */
  expect(
    tile.width,
    `the tile must be narrower than the stepper's ${STEPPER_INTRINSIC_WIDTH}px for this spec to mean anything — ` +
      `grid container measured ${container.width}px (fixture assumes ~${ASSUMED_GRID_CONTAINER_WIDTH}px), ` +
      `tile ${tile.width}px, content region ${contentRegion.width}px`
  ).toBeLessThan(STEPPER_INTRINSIC_WIDTH)

  // And the tile is a real, laid-out box rather than a collapsed one.
  expect(tile.width).toBeGreaterThan(0)

  /*
   * The stepper gave way. Not "a slider is present" — all three of the
   * stepper's surfaces are gone, so there is nothing left for the tile to crop,
   * and what renders is the vertical slider the tier's layout asks for.
   */
  expect(stepperSurfaces, 'no stepper surface may render at tall').toBe(0)
  expect(sliderOrientation).toBe('vertical')
  expect(controls.length, 'the tier must still carry a control').toBeGreaterThan(0)

  /*
   * The fit claim itself: every control the slot rendered sits inside the
   * tile's border box, which is what `overflow: hidden` crops against.
   *
   * Sub-pixel tolerance: a fractional grid column lands boxes on half-pixels
   * routinely, and this rule is not about a half-pixel. The stepper's overhang
   * was 46.5px past EACH edge, three orders of magnitude clear of it.
   */
  const TOLERANCE = 0.5
  for (const control of controls) {
    const where =
      `${control.label}: [${control.box.left}, ${control.box.right}] against tile ` +
      `[${tile.left}, ${tile.right}] (content region [${contentRegion.left}, ${contentRegion.right}])`
    expect(control.box.width, `${where} — a control with no box proves nothing`).toBeGreaterThan(0)
    expect(control.box.left, where).toBeGreaterThanOrEqual(tile.left - TOLERANCE)
    expect(control.box.right, where).toBeLessThanOrEqual(tile.right + TOLERANCE)
    expect(control.box.top, where).toBeGreaterThanOrEqual(tile.top - TOLERANCE)
    expect(control.box.bottom, where).toBeLessThanOrEqual(tile.bottom + TOLERANCE)
  }
})
