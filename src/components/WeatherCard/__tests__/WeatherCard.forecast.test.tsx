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
  createForecastResponse,
  createHourlyForecast,
  createTwiceDailyForecast,
  seedWeatherForecast,
} from '~/test/fixtures'
import { deriveDailyFromTwiceDaily, parseForecastResponse } from '~/services/forecastData'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan } from '~/utils/cardTier'
import { resetContentBoxObserver } from '../../cardContentWidth'
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
    // Degree-only, because the unit is stated once by the main readout and MUST
    // NOT repeat per cell (option doc — "Forecast presentation").
    const first = columns('daily')[0]
    expect(first.textContent).toContain('75°')
    expect(first.textContent).toContain('55°')
    expect(first.textContent).not.toContain('°F')
    expect(screen.getByText('°F')).toBeInTheDocument()
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
    // Exactly one temperature in that column: the low it actually has, written
    // degree-only.
    expect(nightOnly.textContent).toContain('13°')
    expect(nightOnly.textContent?.match(/°/g)).toHaveLength(1)
  })

  it('takes the theme’s colours when the card paints no artwork', () => {
    // The strip sits over condition artwork on most cards, where the artwork
    // scope's foreground token carries it; on a flat card it must NOT, or a
    // light theme would render it white-on-white. Both halves ship together, so
    // neither the scrim nor the token reference may appear without the other.
    seedBothForecasts()
    renderWeather({
      span: { width: 4, height: 3 },
      config: { showConditionBackground: false },
    })

    const overArtwork = Array.from(
      strip('hourly')!.querySelectorAll<HTMLElement>('[style]')
    ).filter((node) => node.style.color === 'white' || node.style.color.includes('--liebe-fg'))

    expect(columns('hourly')).toHaveLength(4)
    expect(overArtwork).toHaveLength(0)
    expect(document.querySelector('.liebe-weather-scrim')).toBeNull()
    // The scope carries the foreground tokens, so its absence is the other
    // half of "no artwork treatment" — a scrim-less tile still scoped white
    // would be white-on-white in a light theme.
    expect(document.querySelector('.weather-card-artwork')).toBeNull()
  })

  it('sits on the scrim, and takes its colour from the token, over artwork', () => {
    // The design-system rule reaches the forecast text like every other line on
    // the card: a ground under it, and a colour a theme can still restyle.
    seedBothForecasts()
    renderWeather({ span: { width: 4, height: 3 } })

    expect(document.querySelector('.liebe-weather-scrim')).not.toBeNull()
    expect(document.querySelector('.weather-card-artwork')).not.toBeNull()

    const pinned = Array.from(strip('hourly')!.querySelectorAll<HTMLElement>('[style]')).filter(
      (node) => /^(white|#fff|rgb)/i.test(node.style.color)
    )
    expect(pinned).toHaveLength(0)

    const glyph = strip('hourly')!.querySelector<SVGElement>('svg')
    expect(glyph?.style.color).toBe('var(--liebe-fg)')
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

/* ------------------------------------------------------------------ *
 * The visual pass (change 0030)
 * ------------------------------------------------------------------ */

const sectionLabel = (kind: 'hourly' | 'daily') =>
  document.querySelector(`[data-forecast="${kind}"] .weather-forecast-label`)?.textContent

describe('a section reads as a section', () => {
  beforeEach(seedBothForecasts)

  it('names itself, so the two are tellable apart without reading values', () => {
    /*
     * The defect this rule exists to fix: two identically-styled runs of 12px
     * text a viewer could only tell apart by noticing that one section's labels
     * were weekdays.
     */
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    expect(sectionLabel('hourly')).toBe('Hourly')
    expect(sectionLabel('daily')).toBe('Daily')
  })

  it('puts its columns on one rhythm rather than sizing them to their text', () => {
    // The width comes from the strip's own grid tracks, so a column carries no
    // width of its own — "2 PM" and "10 AM" align because neither measures
    // itself.
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    const strips = document.querySelectorAll('.weather-forecast-strip')
    expect(strips).toHaveLength(2)
    for (const column of columns('hourly')) {
      expect((column as HTMLElement).style.width).toBe('')
      expect((column as HTMLElement).style.flexBasis).toBe('')
    }
  })

  it('draws a daily column’s high and low as an emphasized pair', () => {
    renderWeather({ tier: 'full', span: { width: 4, height: 3 }, config: { forecastDays: 1 } })

    const [day] = columns('daily')
    const pair = day.querySelector('.weather-forecast-temps')!
    const high = pair.querySelector('.weather-forecast-high')!
    const low = pair.querySelector('.weather-forecast-low')!

    // The pair is one node with both readings in it, high first.
    expect(pair.textContent).toBe('24°13°')
    expect(high.textContent).toBe('24°')
    expect(low.textContent).toBe('13°')
    /*
     * The emphasis has to survive the artwork, where every foreground is a
     * white — so it is carried by size and weight, not by colour. The low takes
     * the smaller Radix step; the sheet gives the high the heavier weight.
     */
    expect(high.className).not.toBe(low.className)
    expect(low.className).toContain('rt-r-size-1')
    expect(high.className).toContain('rt-r-size-2')
  })

  it('draws one icon language, at a size that anchors the column', () => {
    // The header glyph and every column glyph come from the same line-art set
    // on every variant — no emoji renders anywhere on the card (option doc —
    // "Scenario: One icon language on the default variant").
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    const card = document.querySelector('.liebe-card')!
    expect(card.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u)

    const headerGlyph = card.querySelector('.liebe-icon svg')
    expect(headerGlyph?.getAttribute('class')).toContain('lucide-sun')

    for (const kind of ['hourly', 'daily'] as const) {
      const glyph = strip(kind)!.querySelector('svg')!
      expect(glyph.getAttribute('class')).toContain('lucide-')
      // At least as tall as the column's 16px text line, and larger than it so
      // the condition is what the eye lands on.
      expect(Number(glyph.getAttribute('height'))).toBeGreaterThan(16)
    }
  })
})

describe('the unit is stated once', () => {
  it('leaves it to the main readout when the card has one', () => {
    seedBothForecasts()
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    expect(sectionLabel('hourly')).toBe('Hourly')
    expect(sectionLabel('daily')).toBe('Daily')
    // Once, on the readout — never per cell.
    expect(strip('hourly')!.textContent).not.toContain('°C')
  })

  it('carries it on the first section when nothing else on the card does', () => {
    /*
     * An entity that publishes forecasts and no current `temperature` renders
     * no main readout, and degree-only cells would then leave `celsius` and
     * `fahrenheit` indistinguishable (option doc — "Forecast presentation").
     */
    seedEntity({ friendly_name: 'Home Weather', temperature_unit: '°C', humidity: 65 })
    seedBothForecasts()
    renderWeather({ tier: 'full', span: { width: 4, height: 3 } })

    expect(sectionLabel('hourly')).toBe('Hourly · °C')
    // Once per CARD, not once per section.
    expect(sectionLabel('daily')).toBe('Daily')
    // On the label, never in a cell.
    for (const column of columns('hourly')) {
      expect(column.textContent).not.toContain('°C')
    }
  })

  it('falls to the daily row when the hourly strip is the one not drawn', () => {
    seedEntity({ friendly_name: 'Home Weather', temperature_unit: '°F', humidity: 65 })
    seedWeatherForecast(ENTITY, createDailyForecast({ count: 3 }), 'daily')
    renderWeather({
      tier: 'full',
      span: { width: 4, height: 3 },
      config: { showHourlyForecast: false },
    })

    expect(strip('hourly')).toBeNull()
    expect(sectionLabel('daily')).toBe('Daily · °F')
  })
})

/**
 * What the card draws once the shell has measured the box it owns.
 *
 * The signal is a real `ResizeObserver` on `.liebe-card`'s content box
 * (`GridCard.tsx`), which jsdom does not implement — the suite's global stub
 * never calls back, which is exactly why an unobserved width imposes no bound.
 * These tests install an observer that reports one width to whatever it is
 * asked to observe, so the card is driven through the same path a browser
 * drives it through rather than through a prop invented for the test.
 */
describe('width-aware horizontal capacity', () => {
  const originalResizeObserver = global.ResizeObserver
  let reportedWidth: number | undefined

  beforeEach(() => {
    seedBothForecasts()
    reportedWidth = undefined
    // The shell's observer is shared and memoised across the module, so the
    // instance a previous spec's global produced has to go before this one's
    // is installed (`cardContentWidth.ts` — the seam's own comment).
    resetContentBoxObserver()

    class WidthReportingResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        if (reportedWidth === undefined) return
        this.callback(
          [
            {
              target,
              contentBoxSize: [{ inlineSize: reportedWidth, blockSize: 0 }],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        )
      }

      unobserve() {}
      disconnect() {}
    }

    global.ResizeObserver = WidthReportingResizeObserver as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    resetContentBoxObserver()
    global.ResizeObserver = originalResizeObserver
  })

  it('draws every configured column when the tile is wide enough', () => {
    reportedWidth = 600

    renderWeather({
      tier: 'full',
      span: { width: 6, height: 4 },
      config: { forecastHours: 12, forecastDays: 7 },
    })

    // 600px holds 13 hourly columns and 10 daily ones, so the configured
    // counts are what bound them — the width-aware rule is an upper bound that
    // has not bitten, not a second budget.
    expect(columns('hourly')).toHaveLength(12)
    expect(columns('daily')).toHaveLength(5)
  })

  it('omits from the end rather than shrinking columns below the floor', () => {
    // 220px: five 44px hourly columns, three 60px daily ones.
    reportedWidth = 220

    renderWeather({
      tier: 'full',
      span: { width: 6, height: 4 },
      config: { forecastHours: 12, forecastDays: 7 },
    })

    expect(columns('hourly')).toHaveLength(5)
    expect(columns('daily')).toHaveLength(3)
    // Omitted FROM THE END: the columns drawn are the leading ones, so the
    // strip still starts at the next hour.
    expect(columns('hourly')[0].textContent).toContain('12 PM')
  })

  it('omits a whole section when not even one column fits', () => {
    /*
     * The narrowest tile the product can produce: a screen stored at 16 columns
     * is honoured at both desktop breakpoints, so 960px lays out a 43px cell —
     * and a theme with a 44px inline inset leaves no content region at all.
     * The section goes entirely, which is the same whole-section omission the
     * availability rules produce; what must NOT happen is a clipped column or a
     * strip that widens the tile.
     */
    reportedWidth = 0

    renderWeather({
      tier: 'full',
      span: { width: 6, height: 4 },
      config: { forecastHours: 12, forecastDays: 7 },
    })

    expect(strip('hourly')).toBeNull()
    expect(strip('daily')).toBeNull()
    // And the card is still a card: the omission takes the forecast, not the
    // conditions.
    expect(screen.getByText('Home Weather')).toBeInTheDocument()
  })

  it('leaves no band of blank space where the omitted strip would have gone', () => {
    /*
     * A `row` tile has no detail line, so the slot the forecast sits in is
     * empty once the width omits the strip — and an empty flex child still
     * collects the body's gap. `weather-card-extra` is what collapses it.
     */
    reportedWidth = 20

    renderWeather({ tier: 'row', span: { width: 2, height: 1 } })

    expect(strip('hourly')).toBeNull()
    const slot = document.querySelector('.weather-card-extra')
    expect(slot).not.toBeNull()
    expect(slot!.childElementCount).toBe(0)
  })

  it('does not narrow a tall tile’s vertical strip', () => {
    // One column wide by definition: how many hours it draws is a question
    // about the tile's height, which a content width cannot answer.
    reportedWidth = 20

    renderWeather({ tier: 'tall', span: { width: 1, height: 6 } })

    expect(strip('hourly')).toHaveAttribute('data-orientation', 'vertical')
    expect(columns('hourly')).toHaveLength(4)
  })

  it('keeps the subscription a tier-and-option decision, not a width one', () => {
    /*
     * A tile too narrow to draw a column still subscribes: the option doc gates
     * a request on the tier and the option, and dropping the subscription as a
     * tile is resized would make the forecast flicker out of the cache and back
     * with a fresh fetch behind it.
     */
    reportedWidth = 0

    renderWeather({ tier: 'full', span: { width: 6, height: 4 } })

    expect(Object.keys(forecastStore.state.entries).sort()).toEqual([
      `${ENTITY}|daily`,
      `${ENTITY}|hourly`,
    ])
  })
})
