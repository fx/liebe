/**
 * Pure weather-forecast data handling: the `weather.get_forecasts` request, the
 * response parser, the capability resolution behind `unsupported`, and the
 * twice-daily → daily derivation.
 *
 * Deliberately free of store, React, and Home Assistant imports, for the same
 * reason `historyData` is: the shapes here are what stories, fixtures, and tests
 * outside the panel bundle consume.
 *
 * Contract owner: docs/specs/entity-state/index.md — "Weather Forecast Hook".
 */

/** The forecast granularities Home Assistant's service accepts. */
export type ForecastType = 'hourly' | 'daily' | 'twice_daily'

export const FORECAST_TYPES: readonly ForecastType[] = ['hourly', 'daily', 'twice_daily']

/** Requested type when configuration supplies none, or supplies junk. */
export const DEFAULT_FORECAST_TYPE: ForecastType = 'daily'

/**
 * `WeatherEntityFeature` bits, as Home Assistant reports them in the entity's
 * `supported_features` attribute. They are what says whether a forecast type
 * exists at all — asking for one the integration does not advertise is an error
 * from the service, not an empty forecast.
 */
export const WEATHER_FEATURE_FORECAST_DAILY = 1
export const WEATHER_FEATURE_FORECAST_HOURLY = 2
export const WEATHER_FEATURE_FORECAST_TWICE_DAILY = 4

/**
 * How long a cached forecast is trusted before it is fetched again. Hourly data
 * moves within the hour; daily and twice-daily forecasts are recomputed by the
 * providers a few times a day, so refreshing them faster only costs requests.
 */
export const FORECAST_REFRESH_MS: Record<ForecastType, number> = {
  hourly: 30 * 60_000,
  daily: 2 * 3_600_000,
  twice_daily: 2 * 3_600_000,
}

/**
 * One forecast entry, normalised out of a `weather.get_forecasts` response.
 *
 * The named fields are the ones the weather card family reads; everything else
 * an integration sends is carried through untouched, because a forecast payload
 * this build does not fully understand still has to reach the render path
 * (docs/specs/dashboard-config — Forward Compatibility).
 */
export interface ForecastEntry {
  /** The entry's own timestamp, as the integration wrote it. */
  datetime: string
  /** `datetime` as epoch milliseconds — what grouping and rendering sort on. */
  timestamp: number
  condition?: string
  /**
   * The entry's temperature. On a daily or twice-daily entry that is the
   * period's high, paired with `templow`; on an hourly entry it is simply that
   * hour's reading and there is no high to speak of.
   */
  temperature?: number
  /** The lower value, on daily and twice-daily entries that report one. */
  templow?: number
  /** Twice-daily only: whether this half is the day or the night. */
  is_daytime?: boolean
  [key: string]: unknown
}

/** A raw forecast record as it arrives inside the service response. */
type RawForecastEntry = Record<string, unknown>

/**
 * A requested forecast type that survived configuration.
 *
 * `type` reaches the hook from card options, and a dashboard document this
 * build cannot fully interpret still renders, so an unknown value is read as
 * "no preference" rather than rejected.
 */
export function normalizeForecastType(type: unknown): ForecastType {
  return FORECAST_TYPES.includes(type as ForecastType)
    ? (type as ForecastType)
    : DEFAULT_FORECAST_TYPE
}

/** Whether an entity id can have a forecast at all. */
export function isWeatherEntity(entityId: string): boolean {
  return entityId.startsWith('weather.')
}

/**
 * The WebSocket command for one forecast. `get_forecasts` is a response-service:
 * without `return_response` Home Assistant executes it and hands back nothing.
 */
export function buildForecastRequest(
  entityId: string,
  type: ForecastType
): Record<string, unknown> {
  return {
    type: 'call_service',
    domain: 'weather',
    service: 'get_forecasts',
    service_data: { type },
    target: { entity_id: entityId },
    return_response: true,
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  // Some integrations template their forecast fields, which arrives as a string.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Which forecast type to actually ask for, given what the entity advertises.
 *
 * An integration offering only `FORECAST_TWICE_DAILY` still has a daily view in
 * it, so a daily request resolves to a twice-daily fetch and is derived on
 * arrival (spec: daily MUST NOT resolve unsupported in that case). `null` means
 * the entity cannot answer the request at all.
 *
 * An entity that advertises nothing — no `supported_features` attribute — is not
 * assumed to be incapable: the requested type is attempted and the service's own
 * answer decides.
 */
export function resolveForecastType(
  requested: ForecastType,
  supportedFeatures: unknown
): ForecastType | null {
  const features = toNumber(supportedFeatures)
  if (features === undefined) return requested

  if (requested === 'hourly') {
    return features & WEATHER_FEATURE_FORECAST_HOURLY ? 'hourly' : null
  }
  if (requested === 'twice_daily') {
    return features & WEATHER_FEATURE_FORECAST_TWICE_DAILY ? 'twice_daily' : null
  }
  if (features & WEATHER_FEATURE_FORECAST_DAILY) return 'daily'
  return features & WEATHER_FEATURE_FORECAST_TWICE_DAILY ? 'twice_daily' : null
}

/**
 * Whether a failed call means "this entity has no such forecast" rather than
 * "the call went wrong". The two render differently: an unsupported forecast is
 * hidden silently, an error is a fault the consumer may surface.
 *
 * Home Assistant reports the first as a `not_found` service error or as a
 * `home_assistant_error` whose message says the entity does not support the
 * feature; a timeout or a dropped socket says neither.
 */
export function isUnsupportedForecastError(error: unknown): boolean {
  if (!isRecord(error)) return false
  const { code, message } = error
  if (code === 'not_found' || code === 'service_not_found') return true
  if (typeof message !== 'string') return false
  return /not\s+support|unsupported|unknown\s+service|service\s+not\s+found|no\s+forecast/i.test(
    message
  )
}

function parseEntry(raw: RawForecastEntry): ForecastEntry | undefined {
  const { datetime } = raw
  if (typeof datetime !== 'string') return undefined
  const timestamp = Date.parse(datetime)
  // An entry that cannot be placed in time can neither be ordered nor grouped
  // into a day, and a forecast column with no time on it is not renderable.
  if (Number.isNaN(timestamp)) return undefined

  const entry: ForecastEntry = { ...raw, datetime, timestamp }

  const temperature = toNumber(raw.temperature)
  if (temperature === undefined) delete entry.temperature
  else entry.temperature = temperature

  const templow = toNumber(raw.templow)
  if (templow === undefined) delete entry.templow
  else entry.templow = templow

  if (typeof raw.condition === 'string') entry.condition = raw.condition
  else delete entry.condition

  if (typeof raw.is_daytime === 'boolean') entry.is_daytime = raw.is_daytime
  else delete entry.is_daytime

  return entry
}

/**
 * The forecast for one entity out of a `weather.get_forecasts` response.
 *
 * Returns `null` when the response says nothing about the entity — a service
 * that ran but produced no bucket for it is the shape "this entity has no
 * forecast" takes when it does not raise. An empty array is a different answer:
 * the entity has a forecast and it is currently empty.
 */
export function parseForecastResponse(raw: unknown, entityId: string): ForecastEntry[] | null {
  if (!isRecord(raw)) return null
  // Service responses arrive wrapped in `{ context, response }`; a caller that
  // already unwrapped one is accepted as-is.
  const root = isRecord(raw.response) ? raw.response : raw
  const bucket = root[entityId]
  if (!isRecord(bucket)) return null
  const { forecast } = bucket
  if (!Array.isArray(forecast)) return null

  const entries: ForecastEntry[] = []
  for (const item of forecast) {
    if (!isRecord(item)) continue
    const entry = parseEntry(item)
    if (entry) entries.push(entry)
  }
  // The parse is the boundary where order is established, so everything
  // downstream may assume ascending time.
  entries.sort((a, b) => a.timestamp - b.timestamp)
  return entries
}

/**
 * Local calendar day of a timestamp — the unit a twice-daily pair belongs to.
 *
 * "Local" here is the VIEWING DEVICE's clock, not Home Assistant's. A panel
 * opened from a device in a different timezone than the home therefore draws its
 * day boundaries at the viewer's midnight, which can push a late-evening
 * nighttime half into the next day and split a pair. This is a deliberate
 * choice, not an oversight: Liebe's surface is a wall tablet in the home, whose
 * clock is the home's, and a viewer in another timezone reading "today" as their
 * own today is at least self-consistent with every other time the panel renders.
 * The spec is silent on which clock owns the boundary.
 *
 * The exact fix, if a real case ever appears: group with
 * `Intl.DateTimeFormat(..., { timeZone })` using `hass.config.time_zone`, passed
 * in by the caller so this module keeps its freedom from Home Assistant imports.
 */
function localDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * A daily view of a twice-daily forecast: one entry per calendar day, taking the
 * day's condition and high from the daytime half and its low from the nighttime
 * half (spec: an integration advertising only `FORECAST_TWICE_DAILY` still has a
 * daily forecast in it).
 *
 * The recorder and the integrations behind it produce messier data than the
 * happy path, so each case is settled explicitly (see the change doc's Design
 * Decisions):
 *
 * - **Order is not assumed.** Entries are sorted before grouping, so a payload
 *   whose halves arrive reversed still pairs correctly.
 * - **A day with no nighttime half** (a trailing daytime entry) keeps its high
 *   and condition, and takes its low from its own `templow` if it carries one.
 *   Nothing is fabricated: with no low available, the day carries none.
 * - **A day with no daytime half** (the leading half of a forecast fetched in
 *   the evening) is still emitted, with the night's condition and low — but with
 *   NO temperature, because a nighttime reading is not the day's high and
 *   presenting it as one would misreport the day. Consumers that need a high
 *   skip such an entry.
 * - **A missing `is_daytime`** counts as a daytime half. Only an explicit
 *   `false` marks a night, so an integration that omits the flag yields
 *   day-level entries rather than nothing.
 * - **Duplicate halves** within one day keep the earlier entry — the forecast
 *   for the day as first stated.
 */
export function deriveDailyFromTwiceDaily(entries: ForecastEntry[]): ForecastEntry[] {
  const days = new Map<string, ForecastEntry[]>()
  for (const entry of [...entries].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = localDayKey(entry.timestamp)
    const group = days.get(key)
    if (group) group.push(entry)
    else days.set(key, [entry])
  }

  const derived: ForecastEntry[] = []
  for (const group of days.values()) {
    const day = group.find((entry) => entry.is_daytime !== false)
    const night = group.find((entry) => entry.is_daytime === false)
    // The group exists because something was pushed into it, so a day-less group
    // is a night-only one and its first entry is that night.
    const base = day ?? group[0]

    // A derived day is not a half of one, and neither half's temperatures carry
    // over unexamined — the night's reading in particular is not the day's high.
    const entry: ForecastEntry = { ...base }
    delete entry.is_daytime
    delete entry.temperature
    delete entry.templow

    if (day?.temperature !== undefined) entry.temperature = day.temperature
    const low = night ? (night.templow ?? night.temperature) : day?.templow
    if (low !== undefined) entry.templow = low

    derived.push(entry)
  }

  return derived
}

/** Whether a cached forecast has aged past its type's refresh interval. */
export function isForecastStale(updatedAt: number, type: ForecastType, now: number): boolean {
  return now - updatedAt >= FORECAST_REFRESH_MS[type]
}
