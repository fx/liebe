import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { forecastStore, forecastStoreActions } from '~/store/forecastStore'
import { weatherForecastService } from '~/services/weatherForecast'
import { WEATHER_VARIANTS } from '~/store/weatherOptions'
import {
  createDailyForecast,
  createHourlyForecast,
  createTwiceDailyForecast,
  seedWeatherForecast,
} from '~/test/fixtures'
import { deriveDailyFromTwiceDaily, parseForecastResponse } from '~/services/forecastData'
import { createForecastResponse } from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan } from '~/utils/cardTier'
import { WeatherCard } from '..'

/**
 * The weather card's forecast sections (change 0020 PR 2).
 *
 * Content reaches the card through `useWeatherForecast` and nothing else, so
 * every case here is set up by seeding the forecast CACHE the way the pipeline
 * fills it — through the 0015 fixture factories and the real parser — rather
 * than by stubbing a hook. That is what makes these tests able to fail when the
 * card starts fetching for itself, and what keeps them honest about the shapes
 * the pipeline actually produces.
 *
 * The rules themselves (tier gating, the upper bound, the conversion) are unit
 * tested in `forecastPresentation.test.ts`. What is asserted here is that they
 * reach the DOM, and — the half that rots — that a section with nothing to show
 * is genuinely absent rather than an empty strip.
 */

const ENTITY = 'weather.home'

const ATTRIBUTES = {
  friendly_name: 'Home Weather',
  temperature: 22,
  temperature_unit: '°C',
  humidity: 65,
}

function seedEntity(attributes: Record<string, unknown> = ATTRIBUTES, state = 'sunny') {
  const entity: HassEntity = {
    entity_id: ENTITY,
    state,
    attributes: attributes as HassEntity['attributes'],
    last_changed: '2026-07-25T12:00:00.000Z',
    last_updated: '2026-07-25T12:00:00.000Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }

  entityStore.setState((current) => ({
    ...current,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY]: entity },
    staleEntities: new Set<string>(),
  }))
}

function renderCard(ui: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={createMockHomeAssistant()}>{ui}</HomeAssistantProvider>
    </Theme>
  )
}

/** A card at a span, the way the grid hands one down. */
function renderWeather({
  tier = 'full',
  span,
  config,
}: {
  tier?: 'glance' | 'row' | 'tall' | 'full'
  span?: CardSpan
  config?: Record<string, unknown>
} = {}) {
  return renderCard(<WeatherCard entityId={ENTITY} tier={tier} span={span} config={config} />)
}

const strip = (kind: 'hourly' | 'daily') =>
  document.querySelector<HTMLElement>(`[data-forecast="${kind}"]`)

const columns = (kind: 'hourly' | 'daily') =>
  Array.from(document.querySelectorAll(`[data-forecast="${kind}"] .weather-forecast-column`))

beforeEach(() => {
  dashboardActions.resetState()
  /*
   * The pipeline is a module-level singleton, so a previous test's subscribers,
   * refresh timers and cache would otherwise decide this one's outcome. `reset`
   * is its documented test seam.
   */
  weatherForecastService.reset()
  seedEntity()
})

afterEach(() => {
  weatherForecastService.reset()
})

/** Both forecast types present, which is the ordinary case. */
function seedBothForecasts() {
  seedWeatherForecast(ENTITY, createHourlyForecast({ count: 12 }), 'hourly')
  seedWeatherForecast(ENTITY, createDailyForecast({ count: 5 }), 'daily')
}

describe('forecast sections at each tier', () => {
  beforeEach(seedBothForecasts)

  it('draws both sections at full', () => {
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    // The defaults: four hours, four days.
    expect(columns('hourly')).toHaveLength(4)
    expect(columns('daily')).toHaveLength(4)
  })

  it('draws only the hourly strip at row', () => {
    renderWeather({ tier: 'row', span: { width: 3, height: 1 } })

    expect(columns('hourly')).toHaveLength(4)
    // The multi-day row is a `full`-only section.
    expect(strip('daily')).toBeNull()
  })

  it('draws neither at glance', () => {
    renderWeather({ tier: 'glance', span: { width: 1, height: 1 } })

    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
  })

  it('runs a tall tile’s strip down it, and omits it where it does not fit', () => {
    const { unmount } = renderWeather({ tier: 'tall', span: { width: 1, height: 4 } })

    expect(strip('hourly')).toHaveAttribute('data-orientation', 'vertical')
    expect(columns('hourly')).toHaveLength(2)
    expect(strip('daily')).toBeNull()
    unmount()

    // Two cells hold the icon, the readout and the meta and nothing else.
    renderWeather({ tier: 'tall', span: { width: 1, height: 2 } })
    expect(strip('hourly')).toBeNull()
  })

  it('never draws one on the minimal variant, at any tier', () => {
    for (const tier of ['row', 'tall', 'full'] as const) {
      const { unmount } = renderWeather({
        tier,
        span: { width: 4, height: 4 },
        config: { variant: 'minimal' },
      })

      expect(strip('hourly')).toBeNull()
      expect(strip('daily')).toBeNull()
      unmount()
    }
  })

  it('draws them on every variant that does', () => {
    for (const variant of WEATHER_VARIANTS.filter((name) => name !== 'minimal')) {
      const { unmount } = renderWeather({
        tier: 'full',
        span: { width: 4, height: 4 },
        config: { variant },
      })

      expect(columns('hourly')).toHaveLength(4)
      expect(columns('daily')).toHaveLength(4)
      unmount()
    }
  })
})

describe('the counts are upper bounds', () => {
  it('draws the configured number when the forecast has at least that many', () => {
    seedBothForecasts()
    renderWeather({ span: { width: 6, height: 4 }, config: { forecastHours: 8, forecastDays: 3 } })

    expect(columns('hourly')).toHaveLength(8)
    expect(columns('daily')).toHaveLength(3)
  })

  it('draws what arrived when the integration sent fewer, and never pads', () => {
    seedWeatherForecast(ENTITY, createHourlyForecast({ count: 2 }), 'hourly')
    seedWeatherForecast(ENTITY, createDailyForecast({ count: 1 }), 'daily')
    renderWeather({ span: { width: 6, height: 4 }, config: { forecastHours: 12, forecastDays: 7 } })

    expect(columns('hourly')).toHaveLength(2)
    expect(columns('daily')).toHaveLength(1)
  })

  it('clamps a count no build can draw rather than rejecting the card', () => {
    seedBothForecasts()
    renderWeather({ span: { width: 6, height: 4 }, config: { forecastHours: 99, forecastDays: 0 } })

    // 99 hours clamps to the option doc's maximum; `0` is not a count at all
    // and falls back to the default.
    expect(columns('hourly')).toHaveLength(12)
    expect(columns('daily')).toHaveLength(4)
  })
})

describe('a section with nothing to show', () => {
  it('is absent when its option is off, even with a forecast in the cache', () => {
    seedBothForecasts()
    renderWeather({
      span: { width: 4, height: 3 },
      config: { showHourlyForecast: false, showDailyForecast: false },
    })

    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
    // The current conditions are untouched: an option that hides a forecast
    // moves nothing else.
    expect(screen.getByText('Home Weather')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('asks the pipeline for nothing it could not draw', () => {
    /*
     * Nothing seeded, so a subscription is observable: the service creates a
     * cache entry for every forecast it is asked about, even one it fails to
     * fetch. A card whose sections are all off must leave the cache untouched —
     * an option that hid the strip but still fetched it every half hour would
     * look identical on screen and cost the same as showing it.
     */
    const { unmount } = renderWeather({
      tier: 'full',
      span: { width: 4, height: 3 },
      config: { showHourlyForecast: false, showDailyForecast: false },
    })

    expect(Object.keys(forecastStore.state.entries)).toEqual([])
    unmount()

    // The control: with the sections on, the same card does subscribe — so the
    // assertion above is about the gating and not about the seam being dead.
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    expect(Object.keys(forecastStore.state.entries).sort()).toEqual([
      `${ENTITY}|daily`,
      `${ENTITY}|hourly`,
    ])
  })

  it('asks for neither at a tier with no room for either', () => {
    renderWeather({ tier: 'glance', span: { width: 1, height: 1 } })

    expect(Object.keys(forecastStore.state.entries)).toEqual([])
  })

  it('is absent when the entity cannot forecast at all', () => {
    // `unsupported` is what the pipeline resolves for an integration that
    // publishes no forecast of this type — not an error, and not an empty one.
    for (const type of ['hourly', 'daily'] as const) {
      forecastStoreActions.patchEntry(ENTITY, type, {
        forecast: [],
        isLoading: false,
        error: null,
        unsupported: true,
        updatedAt: Date.now(),
      })
    }

    renderWeather({ span: { width: 4, height: 3 } })

    // No placeholder, no empty strip, no error state — and the
    // current-conditions content lays out as if the options were `false`.
    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
    expect(document.body.textContent).not.toMatch(/no forecast|unavailable|error/i)
    expect(screen.getByText('Home Weather')).toBeInTheDocument()
  })

  it('is absent when the forecast came back empty', () => {
    seedWeatherForecast(ENTITY, [], 'hourly')
    seedWeatherForecast(ENTITY, [], 'daily')

    renderWeather({ span: { width: 4, height: 3 } })

    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
  })

  it('leaves no empty slot behind it', () => {
    /*
     * The scenario's real claim: a card with no forecast lays out exactly like
     * one whose options are off. Both are rendered and their bodies compared,
     * so an empty wrapper left where a strip would have gone fails here.
     */
    for (const type of ['hourly', 'daily'] as const) {
      forecastStoreActions.patchEntry(ENTITY, type, {
        forecast: [],
        isLoading: false,
        error: null,
        unsupported: true,
        updatedAt: Date.now(),
      })
    }

    const { unmount } = renderWeather({ span: { width: 4, height: 3 } })
    const unsupportedBody = document.querySelector('.liebe-card-body')!.innerHTML
    unmount()

    weatherForecastService.reset()
    seedEntity()
    renderWeather({
      span: { width: 4, height: 3 },
      config: { showHourlyForecast: false, showDailyForecast: false },
    })

    expect(document.querySelector('.liebe-card-body')!.innerHTML).toBe(unsupportedBody)
  })
})

describe('the states the pipeline distinguishes', () => {
  it('keeps drawing a forecast whose last refresh failed', () => {
    /*
     * An error is NOT `unsupported`: the service leaves the entries it already
     * has in place and reports the failure alongside them, so a card that had a
     * forecast a minute ago keeps it rather than blanking. The option doc's
     * "no error state" is about not DRAWING one, not about discarding data.
     */
    seedWeatherForecast(ENTITY, createDailyForecast({ count: 5 }), 'daily')
    forecastStoreActions.patchEntry(ENTITY, 'daily', { error: 'Connection lost' })

    renderWeather({ span: { width: 4, height: 3 } })

    expect(columns('daily')).toHaveLength(4)
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument()
  })

  it('hides one type without hiding the other', () => {
    // Availability is per type, which is why the card holds two subscriptions:
    // an integration with hourly data and no daily view still gets its strip.
    seedWeatherForecast(ENTITY, createHourlyForecast({ count: 6 }), 'hourly')
    forecastStoreActions.patchEntry(ENTITY, 'daily', {
      forecast: [],
      isLoading: false,
      error: null,
      unsupported: true,
      updatedAt: Date.now(),
    })

    renderWeather({ span: { width: 4, height: 3 } })

    expect(columns('hourly')).toHaveLength(4)
    expect(strip('daily')).toBeNull()
  })

  it('draws nothing while the first fetch is still out', () => {
    forecastStoreActions.patchEntry(ENTITY, 'daily', {
      forecast: [],
      isLoading: true,
      updatedAt: Date.now(),
    })
    forecastStoreActions.patchEntry(ENTITY, 'hourly', {
      forecast: [],
      isLoading: true,
      updatedAt: Date.now(),
    })

    renderWeather({ span: { width: 4, height: 3 } })

    // No skeleton and no reserved space for a forecast that may never arrive.
    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
  })
})

describe('what a column says', () => {
  it('converts every forecast temperature with the rest of the card', () => {
    seedWeatherForecast(ENTITY, createDailyForecast({ count: 2 }), 'daily')
    renderWeather({
      span: { width: 4, height: 3 },
      config: { temperatureUnit: 'fahrenheit', showHourlyForecast: false },
    })

    // 24°C / 13°C, the fixture's first day, in the unit the card was told to
    // show — the card never mixes units across the values it shows at once.
    const first = columns('daily')[0]
    expect(first.textContent).toContain('75°F')
    expect(first.textContent).toContain('55°F')
  })

  it('renders a derived day that has only a low without inventing a high', () => {
    /*
     * The twice-daily derivation emits a day built from a nighttime half alone,
     * carrying that half's low and no temperature, because a nighttime reading
     * is not the day's high. The card has to render such a column as a low and
     * nothing else.
     */
    const twiceDaily = createTwiceDailyForecast({ count: 2 })
    const parsed = parseForecastResponse(createForecastResponse(ENTITY, twiceDaily), ENTITY) ?? []
    // Drop the first day's daytime half, which is what a forecast fetched in
    // the evening looks like.
    const derived = deriveDailyFromTwiceDaily(parsed.slice(1))

    forecastStoreActions.patchEntry(ENTITY, 'daily', {
      forecast: derived,
      isLoading: false,
      error: null,
      unsupported: false,
      updatedAt: Date.now(),
    })

    renderWeather({
      span: { width: 4, height: 3 },
      config: { showHourlyForecast: false, forecastDays: 2 },
    })

    const [nightOnly] = columns('daily')
    expect(derived[0].temperature).toBeUndefined()
    // Exactly one temperature in that column: the low it actually has.
    expect(nightOnly.textContent).toContain('13°C')
    expect(nightOnly.textContent?.match(/°C/g)).toHaveLength(1)
  })

  it('carries no interactive control, so a tap falls through to the card', () => {
    seedBothForecasts()
    renderWeather({ span: { width: 4, height: 3 } })

    // Forecast columns are non-interactive by contract: the card's own tap
    // action owns the whole tile, and an embedded control would consume it.
    for (const kind of ['hourly', 'daily'] as const) {
      expect(strip(kind)!.querySelectorAll('button, a[href], [role="button"]')).toHaveLength(0)
    }
  })
})
