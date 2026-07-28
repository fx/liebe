import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  Droplets,
  Gauge,
  Sun,
  Thermometer,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  WEATHER_SECONDARY_INFO,
  type WeatherSecondaryInfo,
  type WeatherTemperatureUnit,
} from '~/store/weatherOptions'
import type { CSSProperties } from 'react'

/**
 * One derivation of what a weather card shows: how a temperature is formatted,
 * which attribute the secondary line ends up featuring, which condition maps to
 * which artwork, and what the artwork does to the text over it.
 *
 * Spec: docs/specs/entity-cards/options/weather.md — "Secondary info",
 * "Temperature unit", "Condition background". The four variants differ in
 * density and style, never in what a value MEANS, so every one of them reads
 * this module rather than carrying its own copy: the three temperature
 * converters that used to sit one per variant file were the same function
 * three times, and the fallback order has to be identical everywhere by
 * specification ("the `full` detail line leads with this value").
 *
 * It is deliberately free of JSX and of the card graph, so it is unit-testable
 * on its own and importing it from a variant costs no import cycle.
 */

/* ------------------------------------------------------------------ *
 * Attribute reading
 * ------------------------------------------------------------------ */

/**
 * A weather attribute as a usable number, or `undefined`.
 *
 * Home Assistant's own integrations publish these as numbers, but the state
 * object is JSON off a websocket and a template sensor feeding
 * `weather.template` publishes whatever its template rendered — commonly a
 * numeric *string*. So a numeric string is read, and everything else is
 * declined: `null`, `''`, `'unknown'`, a boolean, an object.
 *
 * The distinction matters because the alternative is not a missing value but a
 * wrong one. `Math.round(null)` is `0`, so a card reading attributes without
 * this would report a null humidity as "0%" — a plausible reading, on a card
 * whose whole job is to be believed.
 */
export function readWeatherNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** A unit-ish attribute as a non-empty string, or `undefined`. */
function readWeatherUnit(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/* ------------------------------------------------------------------ *
 * Temperature
 * ------------------------------------------------------------------ */

export interface TemperatureDisplay {
  value: number
  unit: string
}

function convertTemperature(
  temp: number,
  fromUnit: 'celsius' | 'fahrenheit',
  toUnit: 'celsius' | 'fahrenheit'
): number {
  if (fromUnit === toUnit) return temp
  if (fromUnit === 'celsius' && toUnit === 'fahrenheit') return (temp * 9) / 5 + 32
  return ((temp - 32) * 5) / 9
}

/**
 * A temperature attribute resolved for display, in the unit the option asks
 * for.
 *
 * `auto` shows the entity's native unit; `celsius` / `fahrenheit` convert, so
 * the card never mixes units across the readings it shows at once
 * (option doc — "Temperature unit"). An entity publishing no
 * `temperature_unit` is read as Celsius, which is Home Assistant's own default
 * for a weather platform that declares nothing.
 */
export function getTemperatureDisplay(
  temp: unknown,
  entityUnit: unknown,
  configUnit: WeatherTemperatureUnit
): TemperatureDisplay | undefined {
  const value = readWeatherNumber(temp)
  if (value === undefined) return undefined

  const currentUnit = readWeatherUnit(entityUnit)?.toLowerCase().includes('f')
    ? 'fahrenheit'
    : 'celsius'

  if (configUnit === 'auto') {
    return { value, unit: currentUnit === 'fahrenheit' ? '°F' : '°C' }
  }

  return {
    value: convertTemperature(value, currentUnit, configUnit),
    unit: configUnit === 'fahrenheit' ? '°F' : '°C',
  }
}

/** The rounded reading with its unit — "22°C" — for a single-line readout. */
export function formatTemperature(display: TemperatureDisplay): string {
  return `${Math.round(display.value)}${display.unit}`
}

/* ------------------------------------------------------------------ *
 * Secondary info
 * ------------------------------------------------------------------ */

/** The 16-point compass name for a bearing in degrees. */
const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const

/**
 * `wind_bearing` as a compass point.
 *
 * Two shapes, because Home Assistant publishes both: a number of degrees
 * (nearly every integration) and an already-named point like `"NW"` (some
 * templates and the older `wind_bearing` contract). A number is named here so
 * the card never prints "220" next to a speed and calls it a direction;
 * anything else is passed through as written, and an absent or unreadable value
 * simply omits the direction rather than the wind reading.
 */
export function formatWindBearing(bearing: unknown): string | undefined {
  const degrees = readWeatherNumber(bearing)
  if (degrees !== undefined) {
    const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % COMPASS_POINTS.length
    return COMPASS_POINTS[index]
  }

  return readWeatherUnit(bearing)
}

/** One resolved secondary reading, in the three shapes the variants render. */
export interface WeatherSecondaryReading {
  /** Which attribute this actually is — after the fallback, not before it. */
  kind: WeatherSecondaryInfo
  /** The row label the labelled (`detailed`) layout puts above the value. */
  label: string
  /** The bare formatted value: "65%", "12 km/h NW", "19°C". */
  value: string
  /** The self-describing one-liner a detail line uses: "Feels like 19°C". */
  text: string
  /** The glyph the compact layouts put beside it. */
  icon: LucideIcon
}

/** The glyph each kind carries, so every variant labels them identically. */
export const WEATHER_SECONDARY_ICONS: Readonly<Record<WeatherSecondaryInfo, LucideIcon>> = {
  humidity: Droplets,
  wind: Wind,
  'feels-like': Thermometer,
  uv: Sun,
  pressure: Gauge,
}

export interface WeatherSecondaryInput {
  attributes: Record<string, unknown> | undefined
  temperatureUnit: WeatherTemperatureUnit
}

/**
 * Resolve one kind against the entity, or `undefined` when the entity does not
 * publish it.
 *
 * Availability is decided by the *value*, not by the key: an attribute present
 * as `null` — which is how several integrations spell "this sensor has nothing
 * to say right now" — is not a reading, and treating it as one would put "0%"
 * on the card. That is what makes the fallback chain below fire on the cases it
 * is meant to.
 */
export function readWeatherReading(
  kind: WeatherSecondaryInfo,
  { attributes, temperatureUnit }: WeatherSecondaryInput
): WeatherSecondaryReading | undefined {
  const icon = WEATHER_SECONDARY_ICONS[kind]

  switch (kind) {
    case 'humidity': {
      const humidity = readWeatherNumber(attributes?.humidity)
      if (humidity === undefined) return undefined
      const value = `${Math.round(humidity)}%`
      return { kind, label: 'Humidity', value, text: value, icon }
    }
    case 'wind': {
      const speed = readWeatherNumber(attributes?.wind_speed)
      if (speed === undefined) return undefined
      const unit = readWeatherUnit(attributes?.wind_speed_unit)
      const bearing = formatWindBearing(attributes?.wind_bearing)
      const value = `${Math.round(speed)}${unit ? ` ${unit}` : ''}${bearing ? ` ${bearing}` : ''}`
      return { kind, label: 'Wind', value, text: `Wind ${value}`, icon }
    }
    case 'feels-like': {
      /*
       * `apparent_temperature` or nothing. Approximating it from wind chill or
       * a heat index when the integration does not publish one is an open
       * question in the option doc, and until it is settled the specified
       * behaviour is to fall through to the next available attribute rather
       * than to invent a number and present it as the entity's.
       */
      const display = getTemperatureDisplay(
        attributes?.apparent_temperature,
        attributes?.temperature_unit,
        temperatureUnit
      )
      if (!display) return undefined
      const value = formatTemperature(display)
      return { kind, label: 'Feels like', value, text: `Feels like ${value}`, icon }
    }
    case 'uv': {
      const uv = readWeatherNumber(attributes?.uv_index)
      if (uv === undefined) return undefined
      const value = `${Math.round(uv)}`
      return { kind, label: 'UV index', value, text: `UV ${value}`, icon }
    }
    default: {
      const pressure = readWeatherNumber(attributes?.pressure)
      if (pressure === undefined) return undefined
      const unit = readWeatherUnit(attributes?.pressure_unit) ?? 'hPa'
      const value = `${Math.round(pressure)} ${unit}`
      return { kind, label: 'Pressure', value, text: `Pressure ${value}`, icon }
    }
  }
}

/**
 * The reading the secondary line features: the configured attribute, or the
 * first available one in the option doc's order when the entity does not
 * publish it.
 *
 * `undefined` when the entity publishes none of the five — the line is omitted
 * rather than rendered blank, which is the specified behaviour and also the
 * only honest one: a card cannot say "humidity: —" about an entity that never
 * claimed to measure it.
 *
 * The chain starts at `humidity` and runs the whole list, so it can land back
 * on the configured kind only by finding it available, and a configuration
 * naming an attribute this build does not know falls through the same path as
 * any other unavailable one (`readWeatherOptions` has already resolved an
 * unknown value to the default).
 */
export function resolveSecondaryReading(
  secondaryInfo: WeatherSecondaryInfo,
  input: WeatherSecondaryInput
): WeatherSecondaryReading | undefined {
  const configured = readWeatherReading(secondaryInfo, input)
  if (configured) return configured

  for (const kind of WEATHER_SECONDARY_INFO) {
    const fallback = readWeatherReading(kind, input)
    if (fallback) return fallback
  }

  return undefined
}

/**
 * The order the `full` detail line continues in after the featured value.
 *
 * The three the option doc names — "MAY continue with feels-like / wind /
 * humidity" — in its order, and the featured kind is deduplicated out by
 * `supplementalReadings` rather than by each caller.
 */
const SUPPLEMENTAL_ORDER = ['feels-like', 'wind', 'humidity'] as const

/** What the `full` detail line adds after its featured reading. */
export function supplementalReadings(
  featured: WeatherSecondaryReading | undefined,
  input: WeatherSecondaryInput
): WeatherSecondaryReading[] {
  return SUPPLEMENTAL_ORDER.filter((kind) => kind !== featured?.kind)
    .map((kind) => readWeatherReading(kind, input))
    .filter((reading): reading is WeatherSecondaryReading => reading !== undefined)
}

/* ------------------------------------------------------------------ *
 * Condition glyphs
 * ------------------------------------------------------------------ */

/**
 * The lucide glyph for a condition, for the variants drawn in line art.
 *
 * Substring matching on purpose: the condition vocabulary belongs to the
 * integration, so `rainy`, `light-rain` and `possible-rain-day` all have to
 * reach the rain glyph without this build having met each spelling. Anything
 * unrecognised — including a condition added by a newer Home Assistant — lands
 * on the neutral cloud rather than on nothing.
 *
 * `exceptional` is checked FIRST and by name, because it is not a kind of
 * weather. It is Home Assistant's own "something is wrong" condition
 * (`ATTR_CONDITION_EXCEPTIONAL`, `homeassistant/components/weather/__init__.py`)
 * — severe weather, or an integration reporting that it cannot say — and
 * rendering it as a generic cloud tells the viewer the opposite of what the
 * entity is saying. It resolves no background artwork either, which is a real
 * gap but a separate one: new artwork and condition-map changes are out of
 * scope for change 0020.
 */
export function getConditionGlyph(condition: unknown): LucideIcon {
  const lowerCondition = typeof condition === 'string' ? condition.toLowerCase() : ''

  if (lowerCondition.includes('exceptional')) return AlertTriangle
  if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) return Sun
  if (lowerCondition.includes('rain')) return CloudRain
  if (lowerCondition.includes('drizzle')) return CloudDrizzle
  if (lowerCondition.includes('snow')) return CloudSnow
  if (lowerCondition.includes('thunder') || lowerCondition.includes('lightning')) return Zap
  return Cloud
}

/** The same resolution in emoji, for the `default` variant's warmer look. */
export function getConditionEmoji(condition: unknown): string {
  const lowerCondition = typeof condition === 'string' ? condition.toLowerCase() : ''

  if (lowerCondition.includes('exceptional')) return '⚠️'
  if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) return '☀️'
  if (lowerCondition.includes('rain')) return '🌧️'
  if (lowerCondition.includes('cloud')) return '☁️'
  if (lowerCondition.includes('snow')) return '❄️'
  if (lowerCondition.includes('thunder')) return '⛈️'
  return '🌤️'
}

/* ------------------------------------------------------------------ *
 * Condition background and its text treatment
 * ------------------------------------------------------------------ */

/**
 * The base URL assets resolve against.
 *
 * The panel publishes `window.__LIEBE_ASSET_BASE_URL__` at initialisation
 * (`src/panel.ts`) because Home Assistant serves `panel.js` from wherever the
 * user hosted it — `/local/liebe/`, a GitHub Pages path, an add-on origin — and
 * a background referenced from the origin root would 404 everywhere but the dev
 * server. The fallback to `/` is that dev server
 * (docs/specs/entity-cards/index.md — "Constraints").
 */
function getAssetBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__LIEBE_ASSET_BASE_URL__) {
    return window.__LIEBE_ASSET_BASE_URL__
  }

  return '/'
}

/**
 * The condition → artwork map, keyed on the vocabularies Liebe has met: Home
 * Assistant's own `weather` states, and Pirate Weather's icon names, which many
 * dashboards run with.
 *
 * Values are file names rather than URLs: the base URL is applied once, at
 * lookup, so a build cannot resolve half its backgrounds against one base and
 * half against another.
 */
const CONDITION_BACKGROUNDS: Readonly<Record<string, string>> = {
  'clear-day': 'clear-day',
  'clear-night': 'clear-night',
  rain: 'rain',
  snow: 'snow',
  sleet: 'sleet',
  wind: 'wind',
  fog: 'fog',
  cloudy: 'cloudy',
  'partly-cloudy-day': 'partly-cloudy-day',
  'partly-cloudy-night': 'partly-cloudy-night',

  // Additional Pirate Weather icons (with icon=pirate)
  'mostly-clear-day': 'clear-day',
  'mostly-clear-night': 'clear-night',
  'mostly-cloudy-day': 'cloudy',
  'mostly-cloudy-night': 'cloudy',
  'possible-rain-day': 'rain',
  'possible-rain-night': 'rain',
  'possible-snow-day': 'snow',
  'possible-snow-night': 'snow',
  'possible-sleet-day': 'sleet',
  'possible-sleet-night': 'sleet',
  'possible-precipitation-day': 'rain',
  'possible-precipitation-night': 'rain',
  precipitation: 'rain',
  drizzle: 'rain',
  'light-rain': 'rain',
  'heavy-rain': 'rain',
  flurries: 'snow',
  'light-snow': 'snow',
  'heavy-snow': 'snow',
  'very-light-sleet': 'sleet',
  'light-sleet': 'sleet',
  'heavy-sleet': 'sleet',
  breezy: 'wind',
  'dangerous-wind': 'wind',

  // Common weather conditions (for non-Pirate Weather integrations)
  sunny: 'clear-day',
  clear: 'clear-day',
  rainy: 'rain',
  snowy: 'snow',
  windy: 'wind',
  foggy: 'fog',
  overcast: 'cloudy',
  partlycloudy: 'partly-cloudy-day',
}

/**
 * The background image URL for a weather condition, or `null` when this build
 * has no artwork for it.
 *
 * Forward compatibility is the point of the `null`: the condition vocabulary is
 * the integration's, not Liebe's, so a condition nobody has heard of (`hail`,
 * `pouring`, a Pirate Weather icon added next year) MUST leave the card on its
 * normal surface rather than break it. That is why the direct map is followed
 * by substring rules and then by `null`, and why a non-string condition — which
 * no HA state object produces, but a hand-built fixture or a future state shape
 * might — is declined instead of thrown on.
 *
 * The lookup is an **own-property** check rather than a bare index, for the
 * reason the climate card's `hvacModeConfig` states: the key is the ENTITY's
 * state, so any string can reach it, and a plain object literal answers for its
 * prototype's members. `CONDITION_BACKGROUNDS['constructor']` is a function —
 * truthy — so a condition named after an inherited member would pass the guard
 * below and be interpolated into a URL as `[object Function]`. This is the
 * second instance of that shape on the project, so it is worth naming: a lookup
 * table keyed on entity-supplied data must answer only for keys it declared.
 */
export function getWeatherBackground(condition: unknown): string | null {
  if (typeof condition !== 'string') return null

  const normalizedCondition = condition.toLowerCase().trim()
  const baseUrl = getAssetBaseUrl()
  const image = (name: string) => `${baseUrl}weather-backgrounds/${name}.png`

  const mapped = Object.prototype.hasOwnProperty.call(CONDITION_BACKGROUNDS, normalizedCondition)
    ? CONDITION_BACKGROUNDS[normalizedCondition]
    : undefined
  if (mapped) return image(mapped)

  // Partial matches, for the compound names each vocabulary spells its own way
  // ("clearsky", "lightrainy", "cloudy-night").
  if (normalizedCondition.includes('clear') || normalizedCondition.includes('sunny')) {
    return image(normalizedCondition.includes('night') ? 'clear-night' : 'clear-day')
  }

  if (normalizedCondition.includes('rain')) return image('rain')

  if (normalizedCondition.includes('snow')) return image('snow')

  if (normalizedCondition.includes('cloud')) {
    if (normalizedCondition.includes('partly') || normalizedCondition.includes('mostly')) {
      return image(
        normalizedCondition.includes('night') ? 'partly-cloudy-night' : 'partly-cloudy-day'
      )
    }
    return image('cloudy')
  }

  if (normalizedCondition.includes('wind') || normalizedCondition.includes('breezy')) {
    return image('wind')
  }

  if (normalizedCondition.includes('fog') || normalizedCondition.includes('mist')) {
    return image('fog')
  }

  return null
}

/**
 * The artwork a card should actually paint, once the option and the variant
 * have had their say.
 *
 * Three separate reasons for no background, resolved in one place so no variant
 * can honour two of them and forget the third: the user turned it off, this
 * variant never paints one (`minimal` — a transparent tile is its whole
 * identity), or the condition maps to nothing.
 */
export function resolveConditionBackground({
  condition,
  showConditionBackground,
  variantPaintsBackground = true,
}: {
  condition: unknown
  showConditionBackground: boolean
  variantPaintsBackground?: boolean
}): string | null {
  if (!showConditionBackground || !variantPaintsBackground) return null

  return getWeatherBackground(condition)
}

interface WeatherTextStyles {
  text: CSSProperties
  icon: CSSProperties
}

/**
 * The text/icon treatment over a condition background.
 *
 * Artwork is photographic and its luminance is not knowable in advance, so text
 * over it goes white with a shadow rather than taking a theme colour that might
 * land on a bright sky (option doc — "Condition background"). Without a
 * background the card is on its themed surface and this returns nothing at all,
 * so the token colours apply untouched — which is the half a `false`
 * `showConditionBackground` depends on.
 */
export function getWeatherTextStyles(
  hasBackground: boolean,
  variant: 'default' | 'emphasis' = 'default'
): WeatherTextStyles {
  if (!hasBackground) {
    return { text: {}, icon: {} }
  }

  const standardTextShadow = '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)'
  const emphasisTextShadow = '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)'

  return {
    text: {
      color: 'white',
      textShadow: variant === 'emphasis' ? emphasisTextShadow : standardTextShadow,
    },
    icon: {
      color: 'white',
      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
    },
  }
}

/**
 * The same treatment for the big `liebe-value` readout, which cannot take the
 * one above.
 *
 * The anatomy parts colour themselves from `--liebe-fg` / `--liebe-muted` in
 * the `liebe-base` cascade layer, so an inline `color` on a wrapper would never
 * reach them. Custom properties do: they inherit, and the part's own
 * `color: var(--liebe-fg)` then resolves to the value set here. Overriding a
 * token in a scope is using the theming channel rather than going around it —
 * the same mechanism the card shell's `backdrop` prop uses — where a hard-coded
 * `color` on `.liebe-value` would be a declaration no theme could reach.
 *
 * `text-shadow` inherits on its own, so the wrapper carries it for both spans.
 */
export function getWeatherValueStyles(hasBackground: boolean): CSSProperties {
  if (!hasBackground) return {}

  return {
    '--liebe-fg': 'white',
    '--liebe-muted': 'rgba(255, 255, 255, 0.85)',
    textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)',
  } as CSSProperties
}

/**
 * The Radix `color` prop for a text node: `undefined` over a background, where
 * the white treatment above owns the colour, and the caller's default without
 * one.
 */
export function getWeatherTextColor<T extends string>(
  hasBackground: boolean,
  defaultColor: T | undefined = undefined
): T | undefined {
  return hasBackground ? undefined : defaultColor
}
