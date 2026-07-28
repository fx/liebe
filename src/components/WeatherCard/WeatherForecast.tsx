import { createElement } from 'react'
import { Flex, Text } from '@radix-ui/themes'
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
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { WeatherOptions } from '~/store/weatherOptions'
import { formatTemperature, getConditionGlyph, getWeatherTextStyles } from './presentation'
import {
  forecastColumns,
  planForecastSections,
  toForecastColumn,
  type ForecastColumn,
  type ForecastOrientation,
} from './forecastPresentation'

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

  return {
    hourly: plan.hourly.enabled ? hourlyColumns : [],
    daily: plan.daily.enabled ? dailyColumns : [],
    orientation: plan.hourly.orientation,
    hasContent:
      (plan.hourly.enabled && hourlyColumns.length > 0) ||
      (plan.daily.enabled && dailyColumns.length > 0),
  }
}

interface ForecastStripProps {
  columns: ForecastColumn[]
  /** Whether the card is painting condition artwork, which the text sits over. */
  hasBackground: boolean
}

interface HourlyStripProps extends ForecastStripProps {
  orientation: ForecastOrientation
}

/**
 * One column: when, what, and how warm.
 *
 * Non-interactive by contract — a tap on a forecast column falls through to the
 * card's own tap action (option doc), which is what NOT attaching a handler here
 * achieves: the shell's gesture handling only skips elements that are embedded
 * controls, and these are plain text and a glyph.
 */
function ForecastCell({
  column,
  hasBackground,
  vertical = false,
}: {
  column: ForecastColumn
  hasBackground: boolean
  vertical?: boolean
}) {
  const styles = getWeatherTextStyles(hasBackground)
  const Glyph = getConditionGlyph(column.condition)

  return (
    <Flex
      direction={vertical ? 'row' : 'column'}
      align="center"
      justify={vertical ? 'between' : 'center'}
      gap="1"
      className="weather-forecast-column"
    >
      {column.label && (
        <Text size="1" color={hasBackground ? undefined : 'gray'} style={styles.text}>
          {column.label}
        </Text>
      )}
      {createElement(Glyph, {
        size: 16,
        style: { ...styles.icon, color: hasBackground ? 'white' : 'var(--gray-11)' },
      })}
      <Flex direction={vertical ? 'row' : 'column'} align="center" gap="1">
        {/* A column with no high renders no high. The daily derivation emits a
            day built from a night alone with its low and no temperature, and
            printing that low where the high goes would misreport the day. */}
        {column.high && (
          <Text size="1" weight="bold" style={styles.text}>
            {formatTemperature(column.high)}
          </Text>
        )}
        {column.low && (
          <Text size="1" color={hasBackground ? undefined : 'gray'} style={styles.text}>
            {formatTemperature(column.low)}
          </Text>
        )}
      </Flex>
    </Flex>
  )
}

/**
 * The hourly strip: compact hour/glyph/temperature columns across the tile, or
 * down it where the tier is one column wide.
 */
export function WeatherHourlyStrip({ columns, orientation, hasBackground }: HourlyStripProps) {
  if (columns.length === 0) return null

  const vertical = orientation === 'vertical'

  return (
    <Flex
      direction={vertical ? 'column' : 'row'}
      justify={vertical ? 'start' : 'between'}
      gap={vertical ? '1' : '2'}
      width="100%"
      data-forecast="hourly"
      data-orientation={orientation}
    >
      {columns.map((column) => (
        <ForecastCell
          key={column.key}
          column={column}
          hasBackground={hasBackground}
          vertical={vertical}
        />
      ))}
    </Flex>
  )
}

/** The multi-day row: day/glyph/high–low columns, at `full` only. */
export function WeatherDailyRow({ columns, hasBackground }: ForecastStripProps) {
  if (columns.length === 0) return null

  return (
    <Flex direction="row" justify="between" gap="2" width="100%" data-forecast="daily">
      {columns.map((column) => (
        <ForecastCell key={column.key} column={column} hasBackground={hasBackground} />
      ))}
    </Flex>
  )
}

/** Both sections in the order the option doc lists them, for a card's slot. */
export function WeatherForecastSections({
  sections,
  hasBackground,
}: {
  sections: WeatherForecastSectionsResult
  hasBackground: boolean
}) {
  return (
    <>
      <WeatherHourlyStrip
        columns={sections.hourly}
        orientation={sections.orientation}
        hasBackground={hasBackground}
      />
      <WeatherDailyRow columns={sections.daily} hasBackground={hasBackground} />
    </>
  )
}
