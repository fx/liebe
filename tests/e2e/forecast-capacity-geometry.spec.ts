import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, openPanel } from './helpers'

/**
 * Forecast capacity geometry, measured in a real engine — the browser home of
 * the `WeatherCard/ForecastsMaxCount` and
 * `WeatherCard/ForecastsMaxCountOnMinimumWidthTile` story assertions
 * (change 0045).
 *
 * jsdom lays nothing out, so a column's width and the strip's overflow are
 * unobservable there: the 44px floor fails on a 0-width box and the
 * no-overflow halves pass on `0 <= 1` without proving anything. The story
 * `play` functions keep the jsdom-evaluable half (column counts); this spec
 * enforces the measured-box half here.
 *
 * Data path: the demo integration's North weather entity publishes hourly,
 * daily and twice-daily forecasts through the same `weather.get_forecasts`
 * response-service the `useWeatherForecast` hook calls, so no fixture or
 * instance setup is needed — PR 1's open question answers itself. The demo
 * serves seven hourly entries rather than the story's twelve, so the wide
 * tile asserts the rule rather than the number: every available entry drawn
 * (capacity is an upper bound, never a target), equal rhythm, none under the
 * 44px floor.
 *
 * Everything is read off `getBoundingClientRect` (or scroll/clientWidth pairs
 * for the overflow halves), never off a screenshot or computed style.
 */

const WEATHER_NORTH = 'weather.demo_weather_north'

function seedForecastCapacityConfig() {
  return buildSeedConfig({
    id: 'e2e-forecast-capacity-screen',
    name: 'E2E Forecast Capacity',
    slug: 'e2e-forecast-capacity',
    items: [
      // 8×3 — `full`, room for everything the integration sends.
      {
        id: 'item-forecast-max',
        type: 'entity',
        entityId: WEATHER_NORTH,
        x: 0,
        y: 0,
        width: 8,
        height: 3,
        config: { forecastHours: 12, forecastDays: 7 },
      },
      // 2×1 — `row` at its narrowest, the tile the capacity rule exists for.
      {
        id: 'item-forecast-min',
        type: 'entity',
        entityId: WEATHER_NORTH,
        x: 8,
        y: 0,
        width: 2,
        height: 1,
        config: { forecastHours: 12 },
      },
    ],
  })
}

interface ForecastPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: {
    callWS?: (message: unknown) => Promise<unknown>
    states?: Record<string, { attributes?: { friendly_name?: string } }>
  }
}

interface ForecastGeometry {
  count: number
  widths: number[]
  stripScrollWidth: number
  stripClientWidth: number
  cardScrollWidth: number
  cardClientWidth: number
}

/**
 * How many hourly entries the integration actually serves, through the panel's
 * own authenticated WebSocket — the same transport the hook uses.
 */
async function servedHourlyCount(page: Page): Promise<number> {
  return page.evaluate(async (entityId) => {
    const panel = (window as unknown as { __liebePanel?: ForecastPanelHandle }).__liebePanel
    const callWS = panel?._hass?.callWS
    if (!callWS) throw new Error('panel has no callWS')
    const raw = (await callWS({
      type: 'call_service',
      domain: 'weather',
      service: 'get_forecasts',
      service_data: { type: 'hourly' },
      target: { entity_id: entityId },
      return_response: true,
    })) as { response?: Record<string, { forecast?: unknown[] }> }
    const bucket = raw?.response?.[entityId]
    if (!bucket || !Array.isArray(bucket.forecast)) throw new Error('no hourly forecast served')
    return bucket.forecast.length
  }, WEATHER_NORTH)
}

/**
 * Every box one forecast card needs, measured in one pass. `null` while the
 * card or its strip is missing, so a poll on this waits for the fetch to have
 * landed rather than comparing zeroed rectangles.
 *
 * Both seeded cards show the same entity, so the tier — not the name — tells
 * them apart, which is also the premise each measurement depends on.
 */
async function forecastGeometry(page: Page, tier: string): Promise<ForecastGeometry | null> {
  return page.evaluate((wantedTier) => {
    const panel = (window as unknown as { __liebePanel?: ForecastPanelHandle }).__liebePanel
    const card = panel?.shadowRoot?.querySelector(
      `.grid-item .liebe-card[data-tier="${wantedTier}"]`
    )
    const strip = card?.querySelector('[data-forecast="hourly"] .weather-forecast-strip')
    if (!card || !strip) return null
    const columns = [
      ...card.querySelectorAll<HTMLElement>('[data-forecast="hourly"] .weather-forecast-column'),
    ]
    if (columns.length === 0) return null
    return {
      count: columns.length,
      widths: columns.map((column) => column.getBoundingClientRect().width),
      stripScrollWidth: (strip as HTMLElement).scrollWidth,
      stripClientWidth: (strip as HTMLElement).clientWidth,
      cardScrollWidth: (card as HTMLElement).scrollWidth,
      cardClientWidth: (card as HTMLElement).clientWidth,
    }
  }, tier)
}

test('a wide tile draws every served hour at an equal rhythm above the legible floor', async ({
  page,
}) => {
  await openPanel(page, seedForecastCapacityConfig())

  const served = await servedHourlyCount(page)
  expect(served, 'the demo entity should serve hourly entries').toBeGreaterThan(0)

  // Synchronise on the columns, not merely on the card: the forecast arrives
  // over the WebSocket after first paint, and a snapshot taken in between
  // would measure a strip that has not drawn yet.
  let geometry: ForecastGeometry | null = null
  await expect
    .poll(async () => {
      geometry = await forecastGeometry(page, 'full')
      return geometry?.count ?? null
    })
    .toBe(served)

  // The configured count is an upper bound: twelve asked, `served` sent, all
  // of them drawn rather than padded or cut.
  expect(geometry!.count).toBeLessThanOrEqual(12)

  // Equal-width columns: the widest and the narrowest agree to within a
  // sub-pixel, because the width comes from the grid's tracks rather than
  // from each column's own text.
  const widths = geometry!.widths
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1)
  // And none of them is under the legible floor the capacity rule promises.
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(44)
})

test('a minimum-width tile omits columns rather than clipping, scrolling or squeezing', async ({
  page,
}) => {
  await openPanel(page, seedForecastCapacityConfig())

  let geometry: ForecastGeometry | null = null
  await expect
    .poll(async () => {
      geometry = await forecastGeometry(page, 'row')
      return geometry?.count ?? null
    })
    .not.toBeNull()

  // Fewer than were configured, because this tile cannot hold twelve.
  expect(geometry!.count).toBeLessThan(12)
  // Every column still legible: capacity omits, it does not squeeze.
  expect(Math.min(...geometry!.widths)).toBeGreaterThanOrEqual(44)

  // Nothing overflows the strip, and the strip does not widen the tile: the
  // two shapes "clipped" and "scrolled" would take, which the rule forbids.
  expect(geometry!.stripScrollWidth).toBeLessThanOrEqual(geometry!.stripClientWidth + 1)
  expect(geometry!.cardScrollWidth).toBeLessThanOrEqual(geometry!.cardClientWidth + 1)
})
