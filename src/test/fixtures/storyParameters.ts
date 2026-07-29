/**
 * The `liebe` story parameter — the contract between a story and the workshop
 * decorators that seed the stores and intercept service calls.
 *
 * Lives beside the entity fixtures (shared infrastructure, excluded from
 * coverage) rather than inside `.storybook/` so stories colocated with
 * components can import it without reaching across the repo root.
 */
import type { HassEntity } from '~/store/entityTypes'
import type { ForecastType } from '~/services/forecastData'
import type { RawForecastEntry } from './forecast'

/**
 * One seeded forecast, in the cache the way a fetch would have left it.
 *
 * Stories seed the CACHE rather than a hook, so a card story reads its forecast
 * through the same `useWeatherForecast` the panel does — and a story whose card
 * started fetching for itself would stop showing what it seeded.
 */
export interface LiebeStoryForecast {
  entityId: string
  /** The requested granularity this entry answers. Default `daily`. */
  type?: ForecastType
  /** Raw entries, put through the real parser. Ignored when `unsupported`. */
  forecast?: RawForecastEntry[]
  /** The entity cannot forecast this type at all — not the same as an empty one. */
  unsupported?: boolean
}

export interface LiebeStoryParameters {
  /** Entities seeded into the entity store before the story renders. */
  entities?: HassEntity[]
  /**
   * Entity REGISTRY entries — what joins an entity to its device.
   *
   * Separate from `entities` above, which seeds STATES. A card that resolves a
   * sibling through `~/utils/deviceSiblings` reads this map; everything else
   * ignores it, and leaving it unset is the correct default rather than a gap.
   */
  registryEntries?: Array<{ entity_id: string; device_id?: string }>
  /** Whether the entity store reports a live Home Assistant connection. Default `true`. */
  connected?: boolean
  /** Whether the entity store is still doing its first load. Default `false`. */
  initialLoading?: boolean
  /** Dashboard mode the story renders in. Default `'view'`. */
  mode?: 'view' | 'edit'
  /**
   * How intercepted service calls resolve. `'error'` makes every call reject,
   * which is how control cards reach their error state through their normal
   * hooks. Default `'success'`.
   */
  serviceCall?: 'success' | 'error' | 'pending'
  /** Message the rejected service call fails with. */
  serviceCallError?: string
  /**
   * The placed item's stored options (`item.config`), published the way the
   * grid publishes them. This is how a card story exercises the universal
   * options: the shell reads them from the item context rather than from a card
   * prop, so a story that set a prop would be testing something the dashboard
   * does not do (docs/specs/entity-cards/options/common.md).
   */
  itemConfig?: Record<string, unknown>
  /** Forecasts seeded into the forecast cache before the story renders. */
  forecasts?: LiebeStoryForecast[]
}
