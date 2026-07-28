import type { ForecastEntry } from '~/services/forecastData'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { WeatherOptions, WeatherTemperatureUnit } from '~/store/weatherOptions'
import { getTemperatureDisplay, type TemperatureDisplay } from './presentation'

/**
 * What the forecast sections render, decided before anything is drawn: which
 * tier gets which strip, how many columns fit, and what one column says.
 *
 * Pure and JSX-free, like `presentation.ts` beside it, because these are the
 * rules that have to be identical across four variants and are worth reading in
 * one place: the tier gating (option doc — "Tier layouts"), the upper-bound
 * rule (the card renders what arrived and never pads), and the conversion of
 * every forecast temperature into the unit the card is showing.
 *
 * Forecast CONTENT is not decided here and never fetched here: it arrives from
 * `useWeatherForecast`, which owns capability, caching and refresh
 * (docs/specs/entity-state/index.md — "Weather Forecast"). This module only
 * decides how much of what arrived is drawn.
 */

/** Layout of one strip: columns across, or rows down a narrow tile. */
export type ForecastOrientation = 'horizontal' | 'vertical'

/**
 * How many hourly columns a tier has room for, and which way they run.
 *
 * `0` means the strip is omitted — content that does not fit is omitted, never
 * clipped or scrolled (docs/specs/design-system — "Size-adaptive layouts").
 *
 *  - `glance` never shows one: a 1×1 tile is a glyph, a name and a temperature.
 *  - `row` and `full` run it horizontally, bounded only by `forecastHours`.
 *  - `tall` is one column wide, so the strip runs DOWN the tile, and how many
 *    rows fit is a question about the tile's height rather than its tier. The
 *    icon, the readout and the meta take the first two cells; each cell after
 *    that carries one hour. A `tall` tile of exactly two cells therefore shows
 *    none, which is the option doc's "only if it fits, otherwise omitted".
 *
 * The height comes from `span`, the effective grid span the renderer already
 * hands every card alongside its tier — cards never measure the DOM to find out
 * how big they are (docs/changes/0011-layout-tiers.md). A card rendered with no
 * span at all cannot be promised room, so it takes the floor of its tier: for
 * `tall` that is two cells, and the strip is omitted.
 */
export function hourlyForecastCapacity(
  tier: CardTier,
  span: CardSpan | undefined,
  forecastHours: number
): { capacity: number; orientation: ForecastOrientation } {
  if (tier === 'glance') return { capacity: 0, orientation: 'horizontal' }

  if (tier === 'tall') {
    const cells = Math.max(2, Math.floor(span?.height ?? 2))
    return { capacity: Math.min(forecastHours, cells - 2), orientation: 'vertical' }
  }

  return { capacity: forecastHours, orientation: 'horizontal' }
}

/**
 * How many daily columns a tier has room for.
 *
 * `full` only, per the option doc's tier table — the multi-day row is the one
 * section with a single tier, because it is the widest thing the card draws.
 */
export function dailyForecastCapacity(tier: CardTier, forecastDays: number): number {
  return tier === 'full' ? forecastDays : 0
}

/**
 * The entries a section actually draws.
 *
 * The upper-bound rule in one function: `capacity` is a maximum, never a
 * target, so a forecast with fewer entries than configured renders what arrived
 * and is NEVER padded out with placeholder columns (option doc — "Forecast data
 * availability"). A capacity of zero, or an empty forecast, yields nothing —
 * which is how a section disappears rather than rendering an empty strip.
 */
export function forecastColumns(entries: ForecastEntry[], capacity: number): ForecastEntry[] {
  if (capacity <= 0) return []
  return entries.slice(0, capacity)
}

/** One column's rendered content. */
export interface ForecastColumn {
  /** Stable key: the entry's own instant. */
  key: number
  /** "2 PM" for an hour, "Wed" for a day — the viewer's locale, absent if unplaceable. */
  label: string | undefined
  /** The condition, for the glyph. */
  condition: string | undefined
  /**
   * The period's high (a daily entry) or that hour's reading (an hourly one),
   * already converted into the card's unit.
   */
  high: TemperatureDisplay | undefined
  /** The period's low, on the entries that report one. */
  low: TemperatureDisplay | undefined
}

/**
 * A timestamp as an hour or a weekday, in the VIEWER's locale — the same
 * formatting the sidebar weather widget already uses, so the two surfaces do
 * not disagree about what a forecast column is called.
 *
 * `undefined` for a timestamp that is not a real instant. The pipeline's parser
 * drops such entries before they reach a card (`parseForecastResponse` requires
 * a parseable `datetime`), so this is the belt to that braces: a column with no
 * time on it renders without a label rather than printing "Invalid Date".
 */
export function forecastColumnLabel(
  timestamp: number,
  granularity: 'hourly' | 'daily'
): string | undefined {
  if (!Number.isFinite(timestamp)) return undefined

  const date = new Date(timestamp)
  return granularity === 'hourly'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric' })
    : date.toLocaleDateString(undefined, { weekday: 'short' })
}

export interface ForecastColumnInput {
  granularity: 'hourly' | 'daily'
  /** The entity's own `temperature_unit`, which forecast values are stated in. */
  entityUnit: unknown
  temperatureUnit: WeatherTemperatureUnit
}

/**
 * One forecast entry as a column.
 *
 * Both temperatures go through the same conversion as the current reading, so
 * the card never mixes units across the values it shows at once (option doc —
 * "Temperature unit" MUSTs conversion "newly, every forecast temperature").
 *
 * **A missing high is rendered as a missing high, not as the low.** The daily
 * derivation emits a day built from a nighttime half alone — the leading half of
 * a forecast fetched in the evening — deliberately carrying that half's low and
 * NO temperature, because a nighttime reading is not the day's high
 * (`deriveDailyFromTwiceDaily`). Substituting one for the other here would
 * reintroduce exactly the misreport the derivation went out of its way to
 * avoid, so the column simply has no high, and says so by omitting it.
 */
export function toForecastColumn(
  entry: ForecastEntry,
  { granularity, entityUnit, temperatureUnit }: ForecastColumnInput
): ForecastColumn {
  return {
    key: entry.timestamp,
    label: forecastColumnLabel(entry.timestamp, granularity),
    condition: entry.condition,
    high: getTemperatureDisplay(entry.temperature, entityUnit, temperatureUnit),
    low: getTemperatureDisplay(entry.templow, entityUnit, temperatureUnit),
  }
}

/** Which sections a tier and the options between them leave switched on. */
export interface ForecastSectionPlan {
  hourly: { enabled: boolean; capacity: number; orientation: ForecastOrientation }
  daily: { enabled: boolean; capacity: number }
}

/**
 * The plan for one card: what its tier has room for, narrowed by what its
 * options allow.
 *
 * Both halves matter and they are different questions. The OPTION is the user's
 * ("do not show me an hourly strip"); the CAPACITY is the tile's ("there is no
 * room for one here"). Resolving them together, before any data is consulted,
 * is what lets a disabled section skip its subscription entirely rather than
 * fetch a forecast nothing will draw — options gate presentation, and a
 * presentation that cannot happen needs no data behind it.
 */
export function planForecastSections(
  tier: CardTier,
  span: CardSpan | undefined,
  options: WeatherOptions
): ForecastSectionPlan {
  const hourly = hourlyForecastCapacity(tier, span, options.forecastHours)
  const dailyCapacity = dailyForecastCapacity(tier, options.forecastDays)

  return {
    hourly: {
      enabled: options.showHourlyForecast && hourly.capacity > 0,
      capacity: hourly.capacity,
      orientation: hourly.orientation,
    },
    daily: {
      enabled: options.showDailyForecast && dailyCapacity > 0,
      capacity: dailyCapacity,
    },
  }
}
