import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, E2E_LEVEL, openPanel } from './helpers'

/**
 * Full-tier graph fill, measured in a real engine — the browser home of the
 * `SensorCard/GraphInFullSmallTile` and `SensorCard/GraphInFullLargeTile`
 * story assertions (change 0045 PR 2, dual enforcement: both entries stay).
 *
 * jsdom lays nothing out, so "the graph claims the tile" is unobservable
 * there — every box is 0×0 and the ratio assertion fails on `NaN`. The unit
 * side lives in the `sensorGraphStyles` declaration lock; this is the
 * measurement side, and it asserts the comparison rather than a pixel
 * threshold: the graph takes the tile's own leftover (body minus value line
 * minus footer minus the two body gaps), at both sizes. A fixed band tall
 * enough would satisfy a threshold; only a region that grows with the tile
 * satisfies the leftover.
 *
 * History comes through the recorder-backed pipeline, seeded the
 * `entity-history.spec.ts` way: REST writes spaced so the recorder commits
 * separate rows, then a poll on the drawn sparkline rather than on a row
 * count the card never exposes.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot or
 * computed style.
 */

// Values written to input_number.e2e_level, after a baseline write: the suite
// shares one HA instance whose database persists, so writing a value the
// helper already holds changes no state and records no row.
const BASELINE = 0
const WRITTEN = [10, 25, 60, 85]

function seedGraphFillConfig() {
  return buildSeedConfig({
    id: 'e2e-graph-fill-screen',
    name: 'E2E Graph Fill',
    slug: 'e2e-graph-fill',
    items: [
      // 2×2 — the smallest tile that reaches `full`.
      {
        id: 'item-graph-small',
        type: 'entity',
        entityId: 'sensor.e2e_level_doubled',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        config: { graphHours: 1 },
      },
      // 3×3 — one cell taller and wider, so the leftover is bigger here.
      {
        id: 'item-graph-large',
        type: 'entity',
        entityId: 'sensor.e2e_level_doubled',
        x: 3,
        y: 0,
        width: 3,
        height: 3,
        config: { graphHours: 1 },
      },
    ],
  })
}

interface GraphPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

/** A height, reduced to the number this spec compares. */
interface GraphFillGeometry {
  /** `null` where the tile rendered no graph — an outcome, not a failure. */
  region: string | null
  graph: number | null
  leftover: number
}

/**
 * The graph's height and the tile's leftover, measured in one pass.
 *
 * `null` while the tile itself is missing, so a poll on this waits for the
 * grid to have laid out. A missing *graph* is not null: the poll that waits
 * for the series to be drawn is the caller's, on `region`.
 */
async function graphFillGeometry(page: Page, tier: string): Promise<GraphFillGeometry | null> {
  return page.evaluate((wantedTier) => {
    const panel = (window as unknown as { __liebePanel?: GraphPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find((candidate) => candidate.getAttribute('data-tier') === wantedTier)
    if (!card) return null

    const box = (selector: string) =>
      (card.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect().height ?? null
    const graph = card.querySelector('[data-testid="sensor-graph"]')
    const rowGap = Number.parseFloat(
      getComputedStyle(card.querySelector('.liebe-card-body')!).rowGap
    )

    const body = box('.liebe-card-body')
    const line = box('.liebe-card-body-line')
    const footer = box('.liebe-sensor-graph-footer')
    if (body === null || line === null || footer === null) return null

    return {
      region: graph?.getAttribute('data-region') ?? null,
      graph: graph ? (graph as HTMLElement).getBoundingClientRect().height : null,
      // The body is a column with one gap above the graph and one below it;
      // the graph is what remains of the tile after the line, the footer and
      // those gaps.
      leftover: body - line - footer - rowGap * 2,
    }
  }, tier)
}

async function seedHistory(accessToken: string, page: Page) {
  for (const value of [BASELINE, ...WRITTEN]) {
    await callService(accessToken, 'input_number', 'set_value', {
      entity_id: E2E_LEVEL,
      value,
    })
    // The recorder commits on an interval; spacing the writes keeps them as
    // separate rows rather than one coalesced state.
    await page.waitForTimeout(1500)
  }
}

for (const [label, size] of [
  ['small', '2×2'],
  ['large', '3×3'],
] as const) {
  test(`a ${size} full tile's graph fills the tile's leftover (${label})`, async ({ page }) => {
    const { accessToken } = await openPanel(page, seedGraphFillConfig())
    await seedHistory(accessToken, page)

    // Synchronise on the drawn sparkline, not merely on the graph's
    // existence: the history arrives over the WebSocket after first paint,
    // and a snapshot taken in between would measure a skeleton.
    let geometry: GraphFillGeometry | null = null
    await expect
      .poll(async () => {
        geometry = await graphFillGeometry(page, 'full')
        return geometry?.region ?? null
      })
      .toBe('full')

    expect(geometry, 'the full tile should have rendered').not.toBeNull()
    expect(geometry!.graph, 'the graph should have a box to compare').not.toBeNull()

    // The invariant, at this size: the graph is all of the leftover.
    expect(geometry!.graph!).toBeCloseTo(geometry!.leftover, 0)
  })
}

test('the added tile height goes to the graph, not to the fixed parts', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedGraphFillConfig())
  await seedHistory(accessToken, page)

  // Both tiles draw before either is measured: the leftover is only
  // comparable across tiles once both series have landed. Both seeded cards
  // carry the same entity, so the tier alone cannot tell them apart — the
  // pair is read as every full tile on the screen, small and large together.
  await expect
    .poll(async () => (await graphFillGeometry(page, 'full'))?.region ?? null)
    .toBe('full')

  const geometries = await page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: GraphPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])].filter(
      (candidate) => candidate.getAttribute('data-tier') === 'full'
    )
    const box = (card: Element, selector: string) =>
      (card.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect().height ?? null
    return cards.map((card) => {
      const graph = card.querySelector('[data-testid="sensor-graph"]')
      const rowGap = Number.parseFloat(
        getComputedStyle(card.querySelector('.liebe-card-body')!).rowGap
      )
      const body = box(card, '.liebe-card-body')!
      const line = box(card, '.liebe-card-body-line')!
      const footer = box(card, '.liebe-sensor-graph-footer')!
      return {
        graph: graph ? (graph as HTMLElement).getBoundingClientRect().height : null,
        leftover: body - line - footer - rowGap * 2,
      }
    })
  })

  expect(geometries, 'both full tiles should have rendered').toHaveLength(2)
  const drawn = geometries.filter((geometry) => geometry.graph !== null)
  expect(drawn, 'both tiles should have drawn their series').toHaveLength(2)
  for (const geometry of drawn) {
    expect(geometry.graph!).toBeCloseTo(geometry.leftover, 0)
  }

  // The comparison the pair exists for: the leftovers differ (different tile
  // sizes), and the graphs differ with them.
  const [a, b] = drawn.map((geometry) => geometry.leftover).sort((x, y) => x - y)
  expect(b).toBeGreaterThan(a)
  const [ga, gb] = drawn.map((geometry) => geometry.graph!).sort((x, y) => x - y)
  expect(gb).toBeGreaterThan(ga)
})
