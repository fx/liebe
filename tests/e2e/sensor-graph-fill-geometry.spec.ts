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
  /** The two rendered inter-part gaps, for the failure message. */
  gapAbove: number
  gapBelow: number
}

/**
 * Every full tile's geometry, smallest leftover first — the reader the
 * per-size tests share with the comparison test below. Both seeded cards
 * carry the same entity at the same tier, so neither the name nor the tier
 * tells them apart; the seeded sizes do, through their leftovers.
 */
async function allFullGraphFillGeometries(page: Page): Promise<GraphFillGeometry[]> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: GraphPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])].filter(
      (candidate) => candidate.getAttribute('data-tier') === 'full'
    )
    const box = (card: Element, selector: string) =>
      (card.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect().height ?? null
    const geometries: GraphFillGeometry[] = []
    for (const card of cards) {
      const graph = card.querySelector('[data-testid="sensor-graph"]')
      const bodyEl = card.querySelector('.liebe-card-body')
      if (!bodyEl) continue
      const body = box(card, '.liebe-card-body')
      const line = box(card, '.liebe-card-body-line')
      const footer = box(card, '.liebe-sensor-graph-footer')
      if (body === null || line === null || footer === null || !graph) continue
      // The two gaps as the engine rendered them — the body's content order
      // is line, graph, footer, so each gap is the vertical distance between
      // two neighbouring boxes, measured off `getBoundingClientRect`, never
      // off the declared `row-gap` (change 0045: only real layout reads).
      // Rounded up at zero: sub-pixel boxes can report a hairline overlap
      // that no rule here is about.
      const rect = (element: Element) => element.getBoundingClientRect()
      const gapAbove = Math.max(
        0,
        rect(graph).top - rect(card.querySelector('.liebe-card-body-line')!).bottom
      )
      const gapBelow = Math.max(
        0,
        rect(card.querySelector('.liebe-sensor-graph-footer')!).top - rect(graph).bottom
      )
      geometries.push({
        region: graph?.getAttribute('data-region') ?? null,
        graph: (graph as HTMLElement).getBoundingClientRect().height,
        leftover: body - line - footer - gapAbove - gapBelow,
        gapAbove,
        gapBelow,
      })
    }
    return geometries
  })
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

for (const [label, size, pick] of [
  ['small', '2×2', 'smaller'],
  ['large', '3×3', 'larger'],
] as const) {
  test(`a ${size} full tile's graph fills the tile's leftover (${label})`, async ({ page }) => {
    const { accessToken } = await openPanel(page, seedGraphFillConfig())
    await seedHistory(accessToken, page)

    // Synchronise on BOTH tiles having drawn their series, not merely on a
    // graph's existence: the history arrives over the WebSocket after first
    // paint, and a snapshot taken in between would measure a skeleton. Both
    // seeded cards carry the same entity at the same tier, so the helper
    // below reads every full tile and this picks by seeded size — the smaller
    // leftover is the 2×2, the larger the 3×3.
    let geometries: GraphFillGeometry[] = []
    await expect
      .poll(async () => {
        geometries = await allFullGraphFillGeometries(page)
        return geometries.filter((geometry) => geometry.region === 'full').length
      })
      .toBe(2)

    const ordered = [...geometries].sort((a, b) => a.leftover - b.leftover)
    const geometry = pick === 'smaller' ? ordered[0] : ordered[ordered.length - 1]

    expect(geometry.graph, `the ${label} graph should have a box to compare`).not.toBeNull()

    // The invariant, at this size: the graph is all of the leftover.
    expect(geometry.graph!).toBeCloseTo(geometry.leftover, 0)
  })
}

test('the added tile height goes to the graph, not to the fixed parts', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedGraphFillConfig())
  await seedHistory(accessToken, page)

  // Both tiles draw before either is measured: the leftover is only
  // comparable across tiles once both series have landed.
  let geometries: GraphFillGeometry[] = []
  await expect
    .poll(async () => {
      geometries = await allFullGraphFillGeometries(page)
      return geometries.filter((geometry) => geometry.region === 'full').length
    })
    .toBe(2)

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
