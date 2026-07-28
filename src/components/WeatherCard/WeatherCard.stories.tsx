import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { WeatherCard } from './index'
import {
  asUnavailable,
  createDailyForecast,
  createHourlyForecast,
  createWeatherEntity,
} from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'weather.home'

type WeatherCardStoryProps = ComponentProps<typeof WeatherCard> & GridCellArgs

/**
 * The weather card has four presentations, and two separate things select one.
 *
 * These stories render `WeatherCard` itself, which does its own selection: it
 * reads `config.variant || config.preset || 'default'` and switches to the
 * matching variant component (`src/components/WeatherCard/index.tsx`). That is
 * the path a legacy `preset`-only config takes, and the path every story below
 * exercises.
 *
 * The static `variants` map attached to the component is for the registry:
 * `GridView` resolves `config.variant` through `getCardVariant(domain, variant)`
 * and renders the variant component directly, skipping `WeatherCard`. The map
 * is declared on the component rather than pushed into `cardRegistry` so the
 * card never imports the registry (that import cycle crashes the bundle).
 */
const meta: Meta<WeatherCardStoryProps> = {
  title: 'Cards/WeatherCard',
  component: WeatherCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 4,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createWeatherEntity()] },
  },
}

export default meta
type Story = StoryObj<WeatherCardStoryProps>

/* The three things every story below has an opinion about. */

/** Everything the tile currently says. */
const cardText = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-card')?.textContent ?? ''

/** The shape the shared body laid the tile out in — the tier's, not the variant's. */
const arrangement = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-card-body')?.getAttribute('data-arrangement') ?? ''

/** The condition artwork actually painted, or `''` for the flat surface. */
const backgroundImage = (canvasElement: HTMLElement) =>
  (canvasElement.querySelector('.liebe-card') as HTMLElement | null)?.style.backgroundImage ?? ''

/** How many columns one forecast section drew, `0` when the section is absent. */
const forecastColumnCount = (canvasElement: HTMLElement, kind: 'hourly' | 'daily') =>
  canvasElement.querySelectorAll(`[data-forecast="${kind}"] .weather-forecast-column`).length

/**
 * Both forecasts in the cache, seeded the way a fetch would have left them.
 *
 * The card reads them through `useWeatherForecast` like the panel does — it
 * never calls `weather.get_forecasts` itself — so a story that stopped showing
 * a forecast would be reporting a real regression rather than a broken stub.
 */
const seededForecasts = [
  { entityId, type: 'hourly' as const, forecast: createHourlyForecast({ count: 12 }) },
  { entityId, type: 'daily' as const, forecast: createDailyForecast({ count: 5 }) },
]

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/**
 * The default variant: condition background image, temperature, and humidity.
 * Weather never reports `on`/`off`, so the two representative states are two
 * distinct conditions — this one and `Rainy` below.
 */
export const Default: Story = {}

/** The `minimal` variant — a transparent tile with just name, temp, condition. */
export const Minimal: Story = {
  args: { config: { variant: 'minimal' }, gridWidth: 2, gridHeight: 2 },
}

/** The `modern` variant — gradient surface with a lucide condition icon. */
export const Modern: Story = {
  args: { config: { variant: 'modern' }, gridWidth: 3, gridHeight: 3 },
}

/** The `detailed` variant — adds pressure, wind, visibility, and the forecast. */
export const Detailed: Story = {
  args: { config: { variant: 'detailed' }, gridWidth: 4, gridHeight: 4 },
}

/**
 * Older dashboards persisted the variant as `preset`; the card still honours it
 * so existing exports keep rendering the variant they were saved with.
 */
export const LegacyPresetConfig: Story = {
  args: { config: { preset: 'modern' }, gridWidth: 3, gridHeight: 3 },
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

/** A second condition: rain swaps both the icon and the background image. */
export const Rainy: Story = {
  parameters: {
    liebe: {
      entities: [createWeatherEntity({ state: 'rainy', attributes: { temperature: 12.8 } })],
    },
  },
}

/** `temperatureUnit` converts the entity's Celsius reading for display. */
export const Fahrenheit: Story = {
  args: { config: { variant: 'minimal', temperatureUnit: 'fahrenheit' }, gridWidth: 2 },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createWeatherEntity())] } },
}

/** `unknown` is treated exactly like `unavailable` by every weather variant. */
export const UnknownState: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createWeatherEntity({ state: 'unknown' })] } },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Weather is read-only — it has no service-call path — so its error story is
 * the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createWeatherEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createWeatherEntity()], mode: 'edit' } },
}

/*
 * Layout tiers (docs/specs/entity-cards/options/weather.md — "Tier layouts").
 * Variant and tier are orthogonal: the variant picks the information density,
 * the tier picks the arrangement and how much of it fits. The absence half of
 * each tier is asserted in `src/components/__tests__/controlCardTierLayouts.test.tsx`.
 */

/** 1×1: condition glyph, name, and the temperature in the state slot. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('stack')
    await expect(cardText(canvasElement)).toContain('22°C')
    // The condition text and the secondary line are what a 1×1 tile drops.
    await expect(cardText(canvasElement)).not.toContain('partlycloudy')
    await expect(cardText(canvasElement)).not.toContain('51%')
  },
}

/** 2×1: the condition text and the secondary line join it. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('row')
    await expect(cardText(canvasElement)).toContain('partlycloudy')
    await expect(cardText(canvasElement)).toContain('51%')
  },
}

/** 1×3: the same content stacked down the tile. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('tall')
    await expect(cardText(canvasElement)).toContain('51%')
  },
}

/** 4×3: the detail line continues with wind. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('row')
    // The featured reading first, then what it did not use — this entity
    // publishes no `apparent_temperature`, so the line continues with wind.
    await expect(cardText(canvasElement)).toContain('51%')
    await expect(cardText(canvasElement)).toContain('Wind 12 km/h SW')
  },
}

/** `detailed` at `row`: pressure is the first thing that does not fit. */
export const TierRowDetailed: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { variant: 'detailed' } },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('Humidity')
    await expect(cardText(canvasElement)).not.toContain('Pressure')
  },
}

/*
 * Every variant at every tier. Variant and tier are orthogonal — the variant
 * picks the density, the tier picks the arrangement — so the grid below is the
 * composition rule itself, and the one place a reviewer can see all four
 * variants degrade the same way.
 */

/** `minimal` at 1×1: a name and the temperature in the state slot. */
export const TierGlanceMinimal: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1, config: { variant: 'minimal' } },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('stack')
    await expect(canvasElement.querySelector('.liebe-value')).toBeNull()
    await expect(cardText(canvasElement)).toContain('22°C')
  },
}

/** `minimal` at 1×3: the big readout, and still nothing else. */
export const TierTallMinimal: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3, config: { variant: 'minimal' } },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('tall')
    await expect(canvasElement.querySelector('.liebe-value')).toHaveTextContent('22°C')
    // `minimal` omits the secondary line at every tier, by its own identity.
    await expect(cardText(canvasElement)).not.toContain('51%')
  },
}

/** `modern` at 1×3: glyph on top, temperature, then the secondary line. */
export const TierTallModern: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3, config: { variant: 'modern' } },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('tall')
    await expect(cardText(canvasElement)).toContain('51%')
  },
}

/** `detailed` at 1×3: the labelled block stacked down the tile. */
export const TierTallDetailed: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3, config: { variant: 'detailed' } },
  play: async ({ canvasElement }) => {
    await expect(arrangement(canvasElement)).toBe('tall')
    await expect(cardText(canvasElement)).toContain('Humidity')
    await expect(cardText(canvasElement)).not.toContain('Pressure')
  },
}

/** `detailed` at 4×4: the whole block, pressure included. */
export const TierFullDetailed: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 4, config: { variant: 'detailed' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-value')).toHaveTextContent('22°C')
    await expect(cardText(canvasElement)).toContain('Pressure')
    await expect(cardText(canvasElement)).toContain('1014 hPa')
  },
}

/** `modern` at 4×3: the big readout and the continued detail line. */
export const TierFullModern: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, config: { variant: 'modern' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-value')).toHaveTextContent('22°C')
    await expect(cardText(canvasElement)).toContain('Wind 12 km/h SW')
  },
}

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

/**
 * `secondaryInfo` picks which reading the secondary line features. Each story
 * below is one value of the select, on an entity that publishes all five.
 */
export const SecondaryInfoWind: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { secondaryInfo: 'wind' } },
  play: async ({ canvasElement }) => {
    // Speed, unit and the bearing named as a compass point rather than "220".
    await expect(cardText(canvasElement)).toContain('12 km/h SW')
  },
}

export const SecondaryInfoFeelsLike: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { secondaryInfo: 'feels-like' } },
  parameters: {
    liebe: { entities: [createWeatherEntity({ attributes: { apparent_temperature: 19.4 } })] },
  },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('19°C')
  },
}

export const SecondaryInfoUv: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { secondaryInfo: 'uv' } },
  parameters: { liebe: { entities: [createWeatherEntity({ attributes: { uv_index: 6 } })] } },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('6')
    await expect(cardText(canvasElement)).not.toContain('51%')
  },
}

export const SecondaryInfoPressure: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { secondaryInfo: 'pressure' } },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('1014 hPa')
  },
}

/**
 * The fallback: `uv` is configured, the entity publishes no `uv_index`, so the
 * line shows humidity — the first available reading in the doc's order — rather
 * than a blank.
 */
export const SecondaryInfoFallback: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { secondaryInfo: 'uv' } },
  parameters: { liebe: { entities: [createWeatherEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('51%')
    await expect(cardText(canvasElement)).not.toContain('undefined')
  },
}

/**
 * An entity publishing none of the five: the secondary line is omitted
 * entirely, and the card lays out as if the option were unset.
 */
export const SecondaryInfoUnavailable: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, config: { secondaryInfo: 'wind' } },
  parameters: {
    liebe: {
      entities: [
        createWeatherEntity({
          attributes: {
            humidity: undefined,
            wind_speed: undefined,
            pressure: undefined,
            apparent_temperature: undefined,
            uv_index: undefined,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('22°C')
    await expect(cardText(canvasElement)).not.toContain('undefined')
    await expect(cardText(canvasElement)).not.toContain('NaN')
  },
}

/** `showConditionBackground: false` — the flat themed surface, normal text. */
export const NoConditionBackground: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, config: { showConditionBackground: false } },
  parameters: { liebe: { entities: [createWeatherEntity({ state: 'rainy' })] } },
  play: async ({ canvasElement }) => {
    await expect(backgroundImage(canvasElement)).toBe('')
  },
}

/** The same card with the option at its default — artwork and white text. */
export const ConditionBackground: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, config: { showConditionBackground: true } },
  parameters: { liebe: { entities: [createWeatherEntity({ state: 'rainy' })] } },
  play: async ({ canvasElement }) => {
    await expect(backgroundImage(canvasElement)).toContain('weather-backgrounds/rain.png')
  },
}

/**
 * A condition this build has no artwork for. The card stays on its themed
 * surface rather than breaking — the vocabulary belongs to the integration, so
 * an unmapped condition is a normal state of affairs.
 */
export const UnmappedCondition: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3 },
  parameters: { liebe: { entities: [createWeatherEntity({ state: 'exceptional' })] } },
  play: async ({ canvasElement }) => {
    await expect(backgroundImage(canvasElement)).toBe('')
    await expect(cardText(canvasElement)).toContain('exceptional')
  },
}

/* ------------------------------------------------------------------ *
 * Forecasts
 *
 * Every story below seeds the forecast CACHE through the fixture factories that
 * shipped with the pipeline (change 0015), so the shapes are the ones a real
 * `weather.get_forecasts` response parses into rather than ones invented here.
 * The card reaches them through `useWeatherForecast` and never fetches for
 * itself.
 * ------------------------------------------------------------------ */

/** 4×3 with both sections at their defaults: four hours, four days. */
export const Forecasts: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, span: { width: 4, height: 3 } },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(4)
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(4)
  },
}

/** The same card tuned wider: eight hours across, seven days configured. */
export const ForecastsWide: Story = {
  args: {
    tier: 'full',
    gridWidth: 6,
    gridHeight: 3,
    span: { width: 6, height: 3 },
    config: { forecastHours: 8, forecastDays: 7 },
  },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(8)
    // Seven days were asked for and the integration sent five: the card draws
    // what arrived and never pads to the count.
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(5)
  },
}

/** 3×1: the hourly strip is a `row` section; the multi-day row is not. */
export const ForecastRowTier: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, span: { width: 3, height: 1 } },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(4)
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(0)
  },
}

/** 1×6: one column wide, so the strip runs down the tile instead of across. */
export const ForecastTallTier: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 6, span: { width: 1, height: 6 } },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-forecast="hourly"]')?.getAttribute('data-orientation')
    ).toBe('vertical')
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(4)
  },
}

/** 1×2: a tall tile with no room left after the readout omits the strip. */
export const ForecastTallTooShort: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 2, span: { width: 1, height: 2 } },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(0)
  },
}

/** Both options off: the sections go, and nothing else moves. */
export const ForecastsHidden: Story = {
  args: {
    tier: 'full',
    gridWidth: 4,
    gridHeight: 3,
    span: { width: 4, height: 3 },
    config: { showHourlyForecast: false, showDailyForecast: false },
  },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(0)
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(0)
    await expect(cardText(canvasElement)).toContain('51%')
  },
}

/**
 * An integration that publishes no forecast at all: the pipeline resolves
 * `unsupported`, and both sections are hidden entirely — no empty strip, no
 * placeholder, no error — with the options still at their defaults.
 */
export const ForecastUnsupported: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, span: { width: 4, height: 3 } },
  parameters: {
    liebe: {
      entities: [createWeatherEntity()],
      forecasts: [
        { entityId, type: 'hourly' as const, unsupported: true },
        { entityId, type: 'daily' as const, unsupported: true },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(0)
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(0)
    await expect(cardText(canvasElement)).not.toMatch(/no forecast|unavailable/i)
  },
}

/**
 * Hourly data and no daily view — availability is per type, so the strip stays
 * and only the multi-day row goes.
 */
export const ForecastHourlyOnly: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3, span: { width: 4, height: 3 } },
  parameters: {
    liebe: {
      entities: [createWeatherEntity()],
      forecasts: [
        { entityId, type: 'hourly' as const, forecast: createHourlyForecast({ count: 12 }) },
        { entityId, type: 'daily' as const, unsupported: true },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(forecastColumnCount(canvasElement, 'hourly')).toBe(4)
    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(0)
  },
}

/**
 * A day the pipeline derived from a twice-daily forecast whose daytime half was
 * missing — the leading day of a forecast fetched in the evening. It carries a
 * low and no high on purpose, because a nighttime reading is not the day's
 * high, and the column renders exactly that: one temperature, in the low slot.
 */
export const ForecastDayWithoutHigh: Story = {
  args: {
    tier: 'full',
    gridWidth: 4,
    gridHeight: 3,
    span: { width: 4, height: 3 },
    config: { showHourlyForecast: false, forecastDays: 3 },
  },
  parameters: {
    liebe: {
      entities: [createWeatherEntity()],
      forecasts: [
        {
          entityId,
          type: 'daily' as const,
          forecast: [
            { datetime: '2026-07-25T20:00:00.000Z', condition: 'clear-night', templow: 12 },
            ...createDailyForecast({ count: 2, start: Date.parse('2026-07-26T12:00:00.000Z') }),
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const [first] = canvasElement.querySelectorAll(
      '[data-forecast="daily"] .weather-forecast-column'
    )

    await expect(forecastColumnCount(canvasElement, 'daily')).toBe(3)
    // One temperature in that column, and it is the low it actually has.
    await expect(first.textContent).toContain('12°C')
    await expect(first.textContent?.match(/°C/g)?.length).toBe(1)
  },
}

/** `temperatureUnit` converts the forecast columns with the rest of the card. */
export const ForecastsFahrenheit: Story = {
  args: {
    tier: 'full',
    gridWidth: 4,
    gridHeight: 3,
    span: { width: 4, height: 3 },
    config: { temperatureUnit: 'fahrenheit', showHourlyForecast: false },
  },
  parameters: { liebe: { entities: [createWeatherEntity()], forecasts: seededForecasts } },
  play: async ({ canvasElement }) => {
    await expect(cardText(canvasElement)).toContain('°F')
    await expect(cardText(canvasElement)).not.toContain('°C')
  },
}
