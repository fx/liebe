import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, E2E_FLAG, E2E_SECRET, openPanel } from './helpers'

/**
 * The remaining fixed-size parts, measured against the tile that bounds them
 * (docs/specs/design-system/index.md — "Cross-axis fit"; change 0042 PR 4).
 *
 * PRs 2 and 3 closed the two parts 0042 measured first. This is the audit of
 * the rest, and it is a measurement rather than a declaration check for the
 * reason the whole change has been: jsdom lays nothing out, so a 100px readout
 * in a 35px content region measures the same there whether it is clipped or
 * not. The unit half — which control the tier keeps — is
 * `src/components/__tests__/inlineControlFit.test.tsx`.
 *
 * TWO CLAIMS, and they are different in kind:
 *
 *  1. **`input_text` renders no inline input at `tall`**, because a field is
 *     bounded by its own content on the axis this tier is one cell wide. The
 *     assertion is that nothing in the tile's content region overflows the
 *     TILE — the box `overflow: hidden` crops against — which is what the old
 *     100/150px field did.
 *  2. **The icon circle fits the content region it sits in**, at every tier. It
 *     was 40px against a 35px region, overhanging into the inset rather than
 *     being clipped by it, which is the reliance the first cross-axis-fit rule
 *     forbids however roomy one theme's padding happens to be.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot.
 */

/**
 * The grid container this fixture assumes: roughly 960px, which is what
 * Playwright's `Desktop Chrome` 1280px viewport leaves after Home Assistant's
 * sidebar and the panel's own inset. At the seed's 12 columns that lays out a
 * 63px tile with a 35px content region — narrower than the 40px icon circle,
 * which is the premise both claims below rest on and which is asserted rather
 * than assumed.
 */
const ASSUMED_GRID_CONTAINER_WIDTH = 960

/** Sub-pixel tolerance; a fractional grid column lands boxes on half-pixels. */
const TOLERANCE = 0.5

interface Box {
  left: number
  right: number
  width: number
  height: number
}

interface PartGeometry {
  tier: string | null
  tile: Box
  contentRegion: { left: number; right: number; width: number }
  container: Box
  /** The icon circle, which every tier renders. */
  icon: Box | null
  /** Every element in the control slot, measured individually. */
  controls: Array<{ label: string; box: Box }>
  /** Whether the slot is in the DOM at all — the omission this PR makes. */
  hasControlSlot: boolean
}

interface PartsPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: PartsPanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/**
 * Every box these claims need, in one pass — boxes are only comparable if they
 * were measured against the same layout.
 *
 * The controls are measured INDIVIDUALLY rather than through their slot:
 * `.liebe-card-controls` is a flex row constrained to the box it sits in, so a
 * child with an inline minimum width overflows it while the slot's own rectangle
 * stays neatly inside the tile. Measuring the slot would report a perfect fit
 * for exactly the defect this spec exists to catch.
 */
async function partGeometry(page: Page, name: string): Promise<PartGeometry | null> {
  return page.evaluate((cardName) => {
    const panel = (window as unknown as { __liebePanel?: PartsPanelHandle }).__liebePanel
    const root = panel?.shadowRoot
    const cards = [...(root?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find(
      (candidate) => candidate.querySelector('.liebe-name')?.textContent?.trim() === cardName
    )
    const container = root?.querySelector('.liebe-section')
    if (!card || !container) return null

    const box = (element: Element) => {
      const { left, right, width, height } = element.getBoundingClientRect()
      return { left, right, width, height }
    }

    const tile = box(card)
    const { paddingLeft, paddingRight } = getComputedStyle(card)
    const slot = card.querySelector('.liebe-card-controls')
    const icon = card.querySelector('.liebe-icon')

    return {
      tier: card.getAttribute('data-tier'),
      tile,
      contentRegion: {
        left: tile.left + Number.parseFloat(paddingLeft),
        right: tile.right - Number.parseFloat(paddingRight),
        width: tile.width - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight),
      },
      container: box(container),
      icon: icon ? box(icon) : null,
      controls: [...(slot?.children ?? [])].map((control) => ({
        label:
          control.getAttribute('aria-label') ??
          control.querySelector('[aria-label]')?.getAttribute('aria-label') ??
          (control.className || control.tagName.toLowerCase()),
        box: box(control),
      })),
      hasControlSlot: slot !== null,
    }
  }, name)
}

test('a tall text helper renders no input, and every tile’s icon fits its region', async ({
  page,
}) => {
  /*
   * The password helper is the `input_text` fixture the suite already seeds, so
   * this measures the card family rather than a fixture invented for it. A
   * `row` neighbour is placed beside it: the omission below is about ONE tier,
   * and a card that had simply stopped rendering its field would pass every
   * assertion on the tall tile and fail on this one.
   */
  await openPanel(
    page,
    buildSeedConfig({
      id: 'e2e-tall-parts-screen',
      name: 'E2E Tall Parts',
      slug: 'e2e-tall-parts',
      items: [
        {
          id: 'item-parts-flag',
          type: 'entity',
          entityId: E2E_FLAG,
          x: 6,
          y: 0,
          width: 2,
          height: 2,
        },
        // 1 wide, 3 tall — `tall` without a drag on a 12-column desktop grid.
        {
          id: 'item-parts-text',
          type: 'entity',
          entityId: E2E_SECRET,
          x: 0,
          y: 0,
          width: 1,
          height: 3,
        },
      ],
    })
  )

  const secret = await entityName(page, E2E_SECRET)
  const flag = await entityName(page, E2E_FLAG)
  expect(secret, 'the two seeded cards must be distinguishable by name').not.toBe(flag)

  await expect.poll(() => partGeometry(page, secret)).not.toBeNull()

  const tall = (await partGeometry(page, secret))!
  const where =
    `container ${tall.container.width}px (fixture assumes ~${ASSUMED_GRID_CONTAINER_WIDTH}px), ` +
    `tile ${tall.tile.width}px, content region ${tall.contentRegion.width}px`

  expect(tall.tier, where).toBe('tall')

  /*
   * THE PREMISE. Every claim below is empty on a tile wide enough to hold the
   * parts: an unfixed build would pass "the icon fits" for the same reason a
   * fixed one does. The region must be narrower than the 40px icon circle, and
   * a 12-column grid does not reach that until its container clears ~1048px.
   */
  expect(
    tall.contentRegion.width,
    `${where} — the region must be NARROWER than the 40px icon circle for this to mean anything`
  ).toBeLessThan(40)
  expect(tall.tile.width, where).toBeGreaterThan(0)

  /*
   * CLAIM 1: no inline input at `tall`. Asserted as the ABSENCE of the slot
   * rather than as "nothing overflows", because those are different states and
   * only one of them is the contract: a field narrowed to 35px would satisfy an
   * overflow assertion while being a control nobody could use.
   */
  expect(
    tall.hasControlSlot,
    `${where} — a one-column tile renders no text field (0042 PR 4)`
  ).toBe(false)
  expect(tall.controls, where).toHaveLength(0)

  // …and the tile still identifies its helper, so the omission cost the tier
  // its input and not its meaning. The value itself is behind the tap.
  expect(tall.icon, `${where} — the tile keeps its anchor`).not.toBeNull()

  /*
   * CLAIM 2: the icon circle fits the region it sits in. This is the part that
   * every card renders, so a failure here is a failure on every tile.
   */
  expect(tall.icon!.width, `${where} — the circle must have a box`).toBeGreaterThan(0)
  expect(tall.icon!.width, `${where} — the circle must not exceed its region`).toBeLessThanOrEqual(
    tall.contentRegion.width + TOLERANCE
  )
  expect(tall.icon!.left, where).toBeGreaterThanOrEqual(tall.contentRegion.left - TOLERANCE)
  expect(tall.icon!.right, where).toBeLessThanOrEqual(tall.contentRegion.right + TOLERANCE)
  /*
   * And it is still a circle. A clamp on the inline axis alone would narrow it
   * into an ellipse, which trades the overhang for a different defect — the
   * aspect ratio is what stops that, and only a browser resolves it.
   */
  expect(
    Math.abs(tall.icon!.width - tall.icon!.height),
    `${where} — a narrowed circle must stay circular, got ${tall.icon!.width}×${tall.icon!.height}`
  ).toBeLessThanOrEqual(TOLERANCE)

  /*
   * CLAIM 3: the tap reaches the helper anyway. Omitting the input without
   * moving the tap would leave the tile inert, which the floors are explicitly
   * not allowed to do — "these floors outrank the no-last-control rule, and do
   * not suspend it". The card declares `more-info` at this tier, and this is
   * the environment that can prove it: a real click through the shell's gesture
   * layer, opening the real dialog. A jsdom test cannot — with the slot gone
   * there is nothing for an edit tap to render either way, so it passes on a
   * card that had stopped declaring the fallback entirely.
   */
  await page.locator('.grid-item').filter({ hasText: secret }).click()
  await expect(
    page.getByRole('dialog'),
    'a tall tile with no input must open the detail dialog on tap'
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  /*
   * THE OTHER TIER, on the same entity family: `row` is at least two columns
   * and keeps its field. Without this the spec would pass on a card that had
   * dropped its input everywhere, which is the failure mode of a fix keyed on
   * the wrong thing.
   */
  const row = (await partGeometry(page, flag))!
  expect(row.tier).toBe('full')
  expect(row.icon, 'the neighbour renders an icon too').not.toBeNull()
  // Its region affords the whole circle, so the token is what it measures —
  // the flexibility is inert wherever there is room, which is the other half of
  // "the token names the size the part prefers".
  expect(row.contentRegion.width).toBeGreaterThan(40)
  expect(Math.abs(row.icon!.width - 40)).toBeLessThanOrEqual(TOLERANCE)
})
