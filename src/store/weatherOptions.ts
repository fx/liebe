import { z } from 'zod'

/**
 * The weather card's option contract — the persisted shape of `variant`,
 * `temperatureUnit`, `secondaryInfo` and `showConditionBackground` under
 * `item.config`, plus the legacy `preset` rename.
 *
 * Spec: docs/specs/entity-cards/options/weather.md. Lives in the store beside
 * `cardDisplay.ts` for the same two reasons as its siblings: `configSchema.ts`
 * gates imports with it, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
 *
 * This module is the contract only. What the options RESOLVE TO on screen —
 * which attribute the secondary line features, how a temperature is formatted,
 * whether a condition maps to artwork — is
 * `src/components/WeatherCard/presentation.ts`, because that is presentation
 * rather than config validation.
 *
 * **No pinning migration ships with these keys**, deliberately. Convention 7's
 * pinning boundary is the removal or replacement of a *control surface*, and
 * the weather card has none: it is read-only at every tier. Both new keys
 * default to what the card already did — the secondary line has always featured
 * humidity, the condition artwork has always rendered — so no existing card
 * changes, and there is nothing for a version marker to discriminate.
 */

/** The four shipped presentations. `variant` is the current key; see below. */
export const WEATHER_VARIANTS = ['default', 'modern', 'detailed', 'minimal'] as const

export type WeatherVariant = (typeof WEATHER_VARIANTS)[number]

export const WEATHER_TEMPERATURE_UNITS = ['auto', 'celsius', 'fahrenheit'] as const

export type WeatherTemperatureUnit = (typeof WEATHER_TEMPERATURE_UNITS)[number]

/**
 * Which attribute the secondary line features — **and**, read in order, the
 * fallback chain when the configured one is absent from the entity.
 *
 * One array for both, because they are one rule: the option doc specifies the
 * fallback as "the first available attribute in the order above (starting from
 * `humidity`)", where "the order above" is the order the values are listed in.
 * Two arrays would be two spellings of that sentence, free to drift.
 */
export const WEATHER_SECONDARY_INFO = ['humidity', 'wind', 'feels-like', 'uv', 'pressure'] as const

export type WeatherSecondaryInfo = (typeof WEATHER_SECONDARY_INFO)[number]

export interface WeatherOptions {
  /** Information density and visual style; the tier owns arrangement. */
  variant: WeatherVariant
  /** `auto` shows the entity's own unit; the others convert every temperature. */
  temperatureUnit: WeatherTemperatureUnit
  /** Which attribute the secondary/detail line leads with. */
  secondaryInfo: WeatherSecondaryInfo
  /** Renders the condition-mapped artwork with the white-text treatment. */
  showConditionBackground: boolean
}

/**
 * The stored defaults — every one of them "leave the card as it shipped".
 *
 * `secondaryInfo: 'humidity'` and `showConditionBackground: true` are what the
 * variants have always rendered, which is what makes the pinning question above
 * moot rather than merely answered.
 */
export const WEATHER_OPTION_DEFAULTS: Readonly<WeatherOptions> = {
  variant: 'default',
  temperatureUnit: 'auto',
  secondaryInfo: 'humidity',
  showConditionBackground: true,
}

const weatherVariantSchema = z.enum(WEATHER_VARIANTS)
const weatherTemperatureUnitSchema = z.enum(WEATHER_TEMPERATURE_UNITS)
const weatherSecondaryInfoSchema = z.enum(WEATHER_SECONDARY_INFO)

/**
 * The weather fragment of `item.config`, merged into the item schema.
 *
 * `secondaryInfo` is a closed enum a typo turns into nonsense rather than into
 * a default: `secondaryInfo: windspeed` would quietly feature humidity instead
 * of the wind the document asked for — a document whose author needs telling,
 * rather than a card that silently disagrees with them
 * (docs/specs/entity-cards/options/weather.md).
 *
 * `variant` is deliberately **not** in it, for the reason the climate card
 * states at `CLIMATE_VARIANT_KEY`: the item config schema is one shape shared
 * by every domain, and `variant` is also the climate card's key with a
 * different set of legal values, so validating either card's enum here would
 * reject every stored card of the other. Whose variants are legal is the card's
 * question, and both resolve it at render.
 *
 * The legacy `preset` is absent for a different reason: it is a key this build
 * renames on the way in, and validating it would reject the very documents the
 * rename exists to accept.
 */
export const weatherOptionsConfigSchema = z.object({
  temperatureUnit: weatherTemperatureUnitSchema.optional(),
  secondaryInfo: weatherSecondaryInfoSchema.optional(),
  showConditionBackground: z.boolean().optional(),
})

/** The key older builds stored the variant under. */
export const LEGACY_WEATHER_PRESET_KEY = 'preset'

const WEATHER_VARIANT_KEY = 'variant'

/**
 * Rename a stored weather card's legacy `preset` to `variant`.
 *
 * Renaming a shipped option key is a loader job (common contract, convention 1
 * — which names this very rename as its example), so the card and its
 * configuration form only ever see the current key. Keyed on the legacy key's
 * presence rather than on a version marker, exactly like the light card's
 * `enableBrightness` rename: a rename has no default to pin, so there is no new
 * card for an absence to wrongly rewrite.
 *
 * Returns the config unchanged, by reference, when nothing applies. An absent
 * config becomes an empty one rather than a second `undefined` for callers to
 * branch on: this runs on both the load path (where a stored item always has a
 * config object) and the save path (where the modal always sends one), and a
 * guard in each caller would be two untestable branches instead of one tested
 * here.
 */
export function migrateWeatherCardConfig(
  config: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (config === undefined) return {}
  if (!Object.prototype.hasOwnProperty.call(config, LEGACY_WEATHER_PRESET_KEY)) return config

  const { [LEGACY_WEATHER_PRESET_KEY]: legacy, ...rest } = config

  // Both keys present means a config migrated once and then given the legacy
  // key back by hand or by an older build's export. The current key is the one
  // the form last wrote, so it wins and the legacy one is simply dropped.
  if (Object.prototype.hasOwnProperty.call(rest, WEATHER_VARIANT_KEY)) return rest

  return { ...rest, [WEATHER_VARIANT_KEY]: legacy }
}

/**
 * Read the weather options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * `variant` additionally reads the legacy `preset` as a fallback. The loader
 * rewrites the key on the way in, but this path is reached by configs that
 * never went through it — a story, the configuration preview, a card handed a
 * literal — and the option doc requires a stored `preset` to keep rendering the
 * variant it was saved with either way.
 */
export function readWeatherOptions(config: Record<string, unknown> | undefined): WeatherOptions {
  const variant = weatherVariantSchema.safeParse(
    config?.[WEATHER_VARIANT_KEY] ?? config?.[LEGACY_WEATHER_PRESET_KEY]
  )
  const temperatureUnit = weatherTemperatureUnitSchema.safeParse(config?.temperatureUnit)
  const secondaryInfo = weatherSecondaryInfoSchema.safeParse(config?.secondaryInfo)
  const showConditionBackground = config?.showConditionBackground

  return {
    variant: variant.success ? variant.data : WEATHER_OPTION_DEFAULTS.variant,
    temperatureUnit: temperatureUnit.success
      ? temperatureUnit.data
      : WEATHER_OPTION_DEFAULTS.temperatureUnit,
    secondaryInfo: secondaryInfo.success
      ? secondaryInfo.data
      : WEATHER_OPTION_DEFAULTS.secondaryInfo,
    showConditionBackground:
      typeof showConditionBackground === 'boolean'
        ? showConditionBackground
        : WEATHER_OPTION_DEFAULTS.showConditionBackground,
  }
}
