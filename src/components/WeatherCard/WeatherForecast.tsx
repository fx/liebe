import { createElement } from 'react'
import { Text } from '@radix-ui/themes'
/*
 * The same specifier the rest of this folder uses for `src/hooks`, not the
 * `~/hooks` alias. One module reached two ways is two module ids: a test that
 * mocks one path leaves the other live, and a bundler can end up instantiating
 * both. That last part is not hypothetical here — `useWeatherForecast` fronts a
 * per-entity cache with its own refresh timers, so a second instance would mean
 * a second cache, a second timer, and a strip disagreeing with everything else
 * reading the same forecast.
 */
import { useWeatherForecast } from '../../hooks'
import { useCardContentWidth } from '../GridCard'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { WeatherOptions } from '~/store/weatherOptions'
import {
  formatTemperatureDegrees,
  getConditionGlyph,
  getWeatherTextStyles,
  WEATHER_ARTWORK_FG,
} from './presentation'
import {
  forecastColumns,
  planForecastSections,
  toForecastColumn,
  type ForecastColumn,
  type ForecastOrientation,
} from './forecastPresentation'
import './WeatherForecast.css'

/**
 * The weather card's forecast sections: the hourly strip and the multi-day row.
 *
 * Content comes **exclusively** from `useWeatherForecast` — the card never calls
 * `weather.get_forecasts` itself (docs/changes/0020, and the option doc's
 * "cards MUST read forecasts through `useWeatherForecast`"). That hook owns
 * capability resolution, per-type caching and refresh, the `unsupported`
 * distinction, and the twice-daily → daily derivation, none of which is
 * reimplemented or second-guessed here. This module maps what it returns onto
 * columns.
 *
 * Shared by the three variants that draw forecasts, so `default`, `modern` and
 * `detailed` cannot drift in what a forecast column means. `minimal` renders
 * none at any tier and therefore does not call this at all — which is also how
 * it avoids subscribing to a forecast it would never draw.
 */

export interface UseWeatherForecastSectionsInput {
  entityId: string
  tier: CardTier
  /** The effective grid span, which is what decides a `tall` strip's height. */
  span: CardSpan | undefined
  options: WeatherOptions
  /** The entity's `temperature_unit`; forecast values are stated in it. */
  entityUnit: unknown
}

export interface WeatherForecastSectionsResult {
  hourly: ForecastColumn[]
  daily: ForecastColumn[]
  /** Which way the hourly strip runs at this tier. */
  orientation: ForecastOrientation
  /** Whether anything at all is drawable — what a caller composes its slot on. */
  hasContent: boolean
  /**
   * The unit the columns are stated in — the one the card's main readout also
   * shows, since both go through the same conversion. `undefined` when no
   * column carries a temperature at all.
   *
   * Degree-only cells drop the suffix, so this is what the section label
   * restates for an entity that publishes forecasts and no current
   * `temperature`: with no main readout, `celsius` and `fahrenheit` columns
   * would otherwise be indistinguishable (option doc — "Forecast
   * presentation").
   */
  unit: string | undefined
  /**
   * The inputs the width-aware capacity is recomputed from, echoed back so the
   * strips can apply it where the content-width signal actually exists.
   *
   * Echoed rather than passed separately by each variant on purpose: three
   * variants call this hook and render these sections, and a variant handing
   * the strip a different tier or span than it handed the hook would draw a
   * capacity for a tile it is not on. There is one source, so there is nothing
   * to disagree with.
   */
  capacityInput: {
    tier: CardTier
    span: CardSpan | undefined
    options: WeatherOptions
  }
}

/**
 * The forecast columns one card should draw, or none.
 *
 * A section that its tier has no room for, or whose option is off, subscribes to
 * nothing: the hook treats an empty entity id as "no entity", so the fetch, the
 * cache entry and the refresh timer never happen for a strip that could not be
 * shown. That is the cheap half of "options gate presentation only" — the
 * expensive half is that a section whose data is unavailable renders nothing at
 * all, which falls out of the columns simply being empty.
 *
 * Nothing distinguishes "loading" or "failed" from "nothing to draw" in the
 * output, and that is deliberate: the option doc requires an unavailable
 * section to be hidden entirely, with no empty strip, no placeholder and no
 * error state. What the hook's states DO change is what the columns contain — a
 * failed refresh leaves the previously cached entries in place, so a card that
 * had a forecast a minute ago keeps drawing it instead of blanking, while an
 * `unsupported` forecast is empty forever and its section simply never appears.
 */
export function useWeatherForecastSections({
  entityId,
  tier,
  span,
  options,
  entityUnit,
}: UseWeatherForecastSectionsInput): WeatherForecastSectionsResult {
  const plan = planForecastSections(tier, span, options)

  /*
   * Two subscriptions, one per forecast type, because availability is per type:
   * an integration can publish hourly data and no daily view, or the reverse.
   * Collapsing them into one request would make either section's absence hide
   * the other's content.
   */
  const hourly = useWeatherForecast(plan.hourly.enabled ? entityId : '', { type: 'hourly' })
  const daily = useWeatherForecast(plan.daily.enabled ? entityId : '', { type: 'daily' })

  const hourlyColumns = forecastColumns(hourly.forecast, plan.hourly.capacity).map((entry) =>
    toForecastColumn(entry, {
      granularity: 'hourly',
      entityUnit,
      temperatureUnit: options.temperatureUnit,
    })
  )
  const dailyColumns = forecastColumns(daily.forecast, plan.daily.capacity).map((entry) =>
    toForecastColumn(entry, {
      granularity: 'daily',
      entityUnit,
      temperatureUnit: options.temperatureUnit,
    })
  )

  const hourlySection = plan.hourly.enabled ? hourlyColumns : []
  const dailySection = plan.daily.enabled ? dailyColumns : []

  /*
   * Any column's unit is every column's unit: all of them go through the same
   * conversion as the card's own reading, so the card never mixes units across
   * the values it shows at once. The low is consulted too because a day derived
   * from a nighttime half alone carries one and no high.
   */
  const stated = [...hourlySection, ...dailySection]
    .map((column) => column.high ?? column.low)
    .find((display) => display !== undefined)

  return {
    hourly: hourlySection,
    daily: dailySection,
    orientation: plan.hourly.orientation,
    hasContent: hourlySection.length > 0 || dailySection.length > 0,
    unit: stated?.unit,
    capacityInput: { tier, span, options },
  }
}

/**
 * The glyph size in a forecast column.
 *
 * The option doc requires the glyph to read as the column's anchor and to be
 * "at least as tall as the column's text line". A column's text is Radix
 * `size="1"` — 12px on a 16px line — so 16 is the floor and 20 is what makes
 * the condition, rather than the hour, the thing the eye lands on. It is also
 * what the 44px minimum column width is sized around: glyph, hour and a
 * degree-only reading.
 */
const FORECAST_GLYPH_SIZE = 20

interface ForecastSectionProps {
  columns: ForecastColumn[]
  /** Whether the card is painting condition artwork, which the text sits over. */
  hasBackground: boolean
  /**
   * The unit to state once, on this section's label, or `undefined` when the
   * card's own readout already states it.
   */
  unit?: string
}

interface HourlyStripProps extends ForecastSectionProps {
  orientation: ForecastOrientation
}

/**
 * One column: when, what, and how warm.
 *
 * Non-interactive by contract — a tap on a forecast column falls through to the
 * card's own tap action (option doc), which is what NOT attaching a handler here
 * achieves: the shell's gesture handling only skips elements that are embedded
 * controls, and these are plain text and a glyph.
 *
 * One component for both sections, deliberately: they differ by label, data and
 * emphasis, not by anatomy, and a second cell component would be a second place
 * for the rhythm to drift.
 */
function ForecastCell({
  column,
  hasBackground,
}: {
  column: ForecastColumn
  hasBackground: boolean
}) {
  const styles = getWeatherTextStyles(hasBackground)
  const Glyph = getConditionGlyph(column.condition)

  return (
    <div className="weather-forecast-column">
      {column.label && (
        <Text
          size="1"
          color={hasBackground ? undefined : 'gray'}
          className="weather-forecast-when"
          style={styles.text}
        >
          {column.label}
        </Text>
      )}
      {createElement(Glyph, {
        size: FORECAST_GLYPH_SIZE,
        style: { ...styles.icon, color: hasBackground ? WEATHER_ARTWORK_FG : 'var(--gray-11)' },
      })}
      {/*
       * The high–low pair, emphasized high over subordinate low. The
       * distinction is weight and size rather than colour, because over
       * artwork every foreground is a white and colour can carry nothing
       * (option doc — "A daily column's high and low MUST read as a pair").
       */}
      <div className="weather-forecast-temps">
        {/* A column with no high renders no high. The daily derivation emits a
            day built from a night alone with its low and no temperature, and
            printing that low where the high goes would misreport the day. */}
        {column.high && (
          <Text size="2" className="weather-forecast-high" style={styles.text}>
            {formatTemperatureDegrees(column.high)}
          </Text>
        )}
        {column.low && (
          <Text
            size="1"
            color={hasBackground ? undefined : 'gray'}
            className="weather-forecast-low"
            style={styles.text}
          >
            {formatTemperatureDegrees(column.low)}
          </Text>
        )}
      </div>
    </div>
  )
}

/**
 * A labelled section: its eyebrow and its strip of equal-width columns.
 *
 * The label is the rule the sections were missing — "the hourly strip and the
 * daily row MUST be visually distinguishable without reading their values, and
 * each section MUST carry a label". `unit` appends it once where nothing else
 * on the card states it, which is the option doc's alternative to a unit in
 * every cell.
 */
function ForecastSection({
  kind,
  label,
  columns,
  hasBackground,
  unit,
  orientation = 'horizontal',
}: ForecastSectionProps & {
  kind: 'hourly' | 'daily'
  label: string
  orientation?: ForecastOrientation
}) {
  return (
    <div className="weather-forecast-section" data-forecast={kind} data-orientation={orientation}>
      <span className="weather-forecast-label">{unit ? `${label} · ${unit}` : label}</span>
      <div className="weather-forecast-strip">
        {columns.map((column) => (
          <ForecastCell key={column.key} column={column} hasBackground={hasBackground} />
        ))}
      </div>
    </div>
  )
}

/**
 * The hourly strip: compact hour/glyph/temperature columns across the tile, or
 * down it where the tier is one column wide.
 */
export function WeatherHourlyStrip({
  columns,
  orientation,
  hasBackground,
  unit,
}: HourlyStripProps) {
  if (columns.length === 0) return null

  return (
    <ForecastSection
      kind="hourly"
      label="Hourly"
      columns={columns}
      hasBackground={hasBackground}
      unit={unit}
      orientation={orientation}
    />
  )
}

/** The multi-day row: day/glyph/high–low columns, at `full` only. */
export function WeatherDailyRow({ columns, hasBackground, unit }: ForecastSectionProps) {
  if (columns.length === 0) return null

  return (
    <ForecastSection
      kind="daily"
      label="Daily"
      columns={columns}
      hasBackground={hasBackground}
      unit={unit}
    />
  )
}

/**
 * Both sections in the order the option doc lists them, for a card's slot —
 * and the place the width-aware capacity is applied.
 *
 * This component renders INSIDE the card shell (a variant builds it in its own
 * render body, but React resolves context where an element is placed, not where
 * it is created), which is the only place the shell's content-width signal
 * exists. So the hook above plans the SUBSCRIPTION width-blind and this plans
 * the DRAWING with the width — see `planForecastSections` for why those are two
 * different questions.
 *
 * `statesUnit` is the card telling the sections that nothing else on it carries
 * the unit: an entity publishing forecasts and no current `temperature` renders
 * no main readout, and degree-only cells would then leave Celsius and
 * Fahrenheit indistinguishable. Only the first section drawn takes it — the
 * rule is once per card, not once per section.
 */
export function WeatherForecastSections({
  sections,
  hasBackground,
  statesUnit = false,
}: {
  sections: WeatherForecastSectionsResult
  hasBackground: boolean
  statesUnit?: boolean
}) {
  const contentWidth = useCardContentWidth()
  const { tier, span, options } = sections.capacityInput
  const plan = planForecastSections(tier, span, options, contentWidth)

  const hourly = forecastColumns(sections.hourly, plan.hourly.capacity)
  const daily = forecastColumns(sections.daily, plan.daily.capacity)

  const unit = statesUnit ? sections.unit : undefined

  return (
    <>
      <WeatherHourlyStrip
        columns={hourly}
        orientation={sections.orientation}
        hasBackground={hasBackground}
        unit={unit}
      />
      <WeatherDailyRow
        columns={daily}
        hasBackground={hasBackground}
        unit={hourly.length > 0 ? undefined : unit}
      />
    </>
  )
}
