# Card Options — Weather

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: specified, not yet implemented.** The current weather card family already ships four visual variants (`default`, `modern`, `detailed`, `minimal`), the `temperatureUnit` option, condition-based background images, and the legacy `preset` → `variant` config migration (see [entity-cards — Weather](../index.md#weather)). Tier-adaptive layouts, forecast options, `secondaryInfo`, and `showConditionBackground` are new.

## Primary action

The weather card is read-only ([common contract](./common.md#universal-options)): `tapAction: default` resolves to `more-info` (the stored default remains the literal `default`), opening Liebe's entity detail dialog for the weather entity. The card MUST NOT call any service from its default actions. The whole tile is the tap target; the card embeds no interactive controls in any tier.

## Options

All keys live under `item.config`, camelCase, and follow [common conventions](./common.md#conventions-for-per-card-options) — in particular convention 3: forecast options can only hide or tune forecast presentation; they MUST NOT conjure forecast content the entity/integration cannot provide (see [Forecast data availability](#forecast-data-availability)).

| Key                       | Type                                                               | Default    | Behavior                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant`                 | select: `default` \| `modern` \| `detailed` \| `minimal`           | `default`  | Existing key, preserved. Selects information density and visual style; the layout tier selects arrangement (see [Variants and tiers](#variants-and-tiers)).                                        |
| `temperatureUnit`         | select: `auto` \| `celsius` \| `fahrenheit`                        | `auto`     | Existing key, preserved. `auto` shows the entity's native `temperature_unit`; the other values convert. Applies to every temperature the card renders, including forecast temperatures. All tiers. |
| `showHourlyForecast`      | boolean                                                            | `true`     | Renders the hourly forecast strip when hourly forecast data is available. Tiers: `row`, `tall`, `full`. Never in `glance`.                                                                         |
| `forecastHours`           | number (1–12)                                                      | `4`        | How many upcoming hours the hourly strip shows. Inert when the strip is hidden or unavailable.                                                                                                     |
| `showDailyForecast`       | boolean                                                            | `true`     | Renders the multi-day forecast row when daily forecast data is available. Tier: `full` only.                                                                                                       |
| `forecastDays`            | number (1–7)                                                       | `4`        | How many upcoming days the daily row shows. Inert when the row is hidden or unavailable.                                                                                                           |
| `secondaryInfo`           | select: `humidity` \| `wind` \| `feels-like` \| `uv` \| `pressure` | `humidity` | Which attribute the secondary/detail line features. Tiers: `row`, `tall`, `full` (the `full` detail line leads with this value; see [Secondary info](#secondary-info-secondaryinfo)).              |
| `showConditionBackground` | boolean                                                            | `true`     | Renders the existing condition-mapped background image with white text/shadow treatment. All tiers except where the variant opts out (`minimal` today).                                            |

### Variants and tiers

The existing variant system and the new [size-adaptive layout tiers](../../design-system/index.md#size-adaptive-layouts) are orthogonal and MUST compose:

- **`variant` selects information density and style** — which attributes are favored, how prominent the temperature is, whether chrome is minimal or rich. The four shipped variants keep their identities: `minimal` (temperature only, no background), `default`/`modern` (temperature + humidity emphasis), `detailed` (adds pressure).
- **The tier selects layout** — how the chosen variant's content is arranged and how much of it fits, derived from the item's grid span, never from `variant`.

Consequences:

- Every variant MUST implement all four tiers (`glance`, `row`, `tall`, `full`), degrading per the tier content tables below. A variant MAY render _less_ than the tier allows (e.g. `minimal` omits the secondary line and forecasts in every tier) but MUST NOT render more.
- **Existing configs keep working unchanged**: the `variant` key is preserved with its current values and default, and the legacy `preset` → `variant` migration ([entity-cards — Weather](../index.md#weather)) remains in force — a stored `preset` MUST still be read as a fallback and rewritten to `variant` on save. No stored weather config requires any new key to render.
- Where a stored config predates the tier system, the card's grid span alone determines the tier ([design-system](../../design-system/index.md#size-adaptive-layouts)); a legacy `size` value never influences weather layout.

### Temperature unit (`temperatureUnit`)

Behavior is unchanged from the shipped implementation and becomes a MUST here: `auto` MUST display the entity's native `temperature_unit`; `celsius` / `fahrenheit` MUST convert both the current temperature and, newly, every forecast temperature and the feels-like value, so the card never mixes units.

### Forecast data availability

Forecast content depends on the `weather.get_forecasts` service (modern Home Assistant; forecast attributes on the state object are deprecated/removed upstream). Availability rules:

- Hourly and daily availability MUST be derived per type from what the integration actually provides (`supported_features` forecast flags and/or a successful `weather.get_forecasts` response for that type) — where **daily availability includes the derived twice-daily path**: an integration advertising only `FORECAST_TWICE_DAILY` yields a daily view built from daytime entries with paired-night lows (per change 0015's hook contract), and the daily section renders rather than hiding.
- When a forecast type is unavailable, the corresponding section MUST be hidden entirely — no empty strip, no placeholder, no error state — regardless of `showHourlyForecast` / `showDailyForecast` being `true`. Options gate presentation only; capability comes from the entity (common convention 3).
- `forecastHours` / `forecastDays` are upper bounds: when the service returns fewer entries than configured, the card MUST render what it received and MUST NOT pad.
- The entity-state pipeline currently has no forecast fetch; the fetch/cache/refresh contract is defined by change 0015 (see the answered question below). This spec constrains presentation only.

### Secondary info (`secondaryInfo`)

Selects the featured value of the secondary line: `humidity` (`humidity`, %), `wind` (`wind_speed` + unit, SHOULD include bearing when available), `feels-like` (`apparent_temperature`, converted per `temperatureUnit`), `uv` (`uv_index`), `pressure` (`pressure` + unit).

- When the selected attribute is absent on the entity, the card MUST fall back to the first available attribute in the order above (starting from `humidity`) rather than render a blank; if none are available the secondary line is omitted.
- In the `full` tier the detail line MAY show additional attributes after the featured one (see tier table), with the `secondaryInfo` choice always listed first.
- This is a single select rather than a multi-select for now — a third shape (ordered multi-select) is plausible later, which is exactly why the key is not a boolean (common convention 5); see Open Questions.

### Condition background (`showConditionBackground`)

- When `true` and `getWeatherBackground(entity.state)` resolves a condition image, the card MUST render it as a cover background and MUST switch text/icons to white with shadows for legibility, exactly per the shipped behavior ([entity-cards — Weather](../index.md#weather)).
- Background image URLs MUST be prefixed by `window.__LIEBE_ASSET_BASE_URL__` (falling back to `/`) — this existing constraint is load-bearing because the panel is served from different base paths in dev and production ([entity-cards — Constraints](../index.md#constraints)).
- When `false`, or when the condition resolves no image, the card renders on the standard card surface (`--liebe-card-bg`) with normal text colors. The `minimal` variant continues to never render a background regardless of this option.

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts). Content that does not fit MUST be omitted, never clipped or scrolled.

| Tier     | Content                                                                                                                                                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Condition icon + current temperature (temperature takes the state-line slot; `hideState` hides it). No forecast, no secondary line.                                                                                                                                                                                                             |
| `row`    | `glance` content plus the condition text (e.g. "Partly cloudy") and the hourly forecast strip (`showHourlyForecast`, up to `forecastHours` compact hour/icon/temp columns). Secondary line shows the `secondaryInfo` value.                                                                                                                     |
| `tall`   | Condition icon on top, large temperature, condition text, secondary line at the bottom; hourly strip renders vertically-condensed only if it fits, otherwise omitted.                                                                                                                                                                           |
| `full`   | Big temperature readout (`liebe-value` anatomy, tabular-nums), condition text, a detail line leading with `secondaryInfo` and MAY continue with feels-like / wind / humidity (deduplicated against the featured value), the hourly strip, and the multi-day forecast row (`showDailyForecast`, up to `forecastDays` day/icon/high–low columns). |

Forecast columns are non-interactive; taps on them fall through to the card's tap action.

## Scenarios

### Scenario: Existing variant config renders unchanged under tiers

- **GIVEN** a stored grid item with `config: { variant: 'detailed', temperatureUnit: 'fahrenheit' }` created before this spec
- **WHEN** the dashboard loads and the card renders at a 2×2 span (`full` tier)
- **THEN** the detailed variant renders with Fahrenheit temperatures and its pressure emphasis, with no config migration or new keys required.

### Scenario: Forecast options degrade gracefully without the service

- **GIVEN** a weather entity whose integration provides no hourly or daily forecasts, on a `full`-tier card with defaults (`showHourlyForecast: true`, `showDailyForecast: true`)
- **WHEN** the card renders
- **THEN** neither the hourly strip nor the daily row appears — no placeholder, no error — and the current-conditions content lays out as if the options were `false`.

### Scenario: Secondary info falls back when the attribute is missing

- **GIVEN** a weather entity without `uv_index`, configured with `secondaryInfo: 'uv'`
- **WHEN** the card renders in `row` tier
- **THEN** the secondary line shows humidity (the first available fallback), not a blank or "undefined".

### Scenario: Disabling the condition background restores the flat surface

- **GIVEN** a weather entity in state `rain` (which resolves a background image) with `showConditionBackground: false`
- **WHEN** the card renders
- **THEN** no background image is applied, text uses standard colors without shadows, and the card surface is `--liebe-card-bg`.

## Open Questions

- ~~**Forecast fetch in the entity-state pipeline.**~~ Answered by change [0015](../../../changes/0015-history-and-forecast-data.md) (pending implementation): a `useWeatherForecast(entityId, {type: hourly|daily|twice_daily})` hook with response caching, periodic refresh (≈30min hourly / 2h daily), `unsupported` resolution, and the twice-daily→daily derivation. Forecast tiers land with 0020 consuming it.
- **`secondaryInfo` as ordered multi-select.** The `full` detail line wants multiple values; whether `secondaryInfo` should grow into an ordered multi-select (with the current single value migrating to a one-element list) or stay a single "featured" select with a fixed supplemental order is open.
- **Variant consolidation under tiers.** Tiers absorb much of what the four variants were built for (density-by-size). Whether `modern`/`detailed` remain worth maintaining as distinct styles once tier layouts ship, or collapse into `default` via a future migration, should be revisited after implementation — `variant` values stay stable either way.
- **Feels-like source.** `apparent_temperature` is not provided by every integration; whether to approximate it (wind chill / heat index) when absent or simply fall back per the `secondaryInfo` rules is undecided (fallback is the specified behavior until then).

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards — Weather](../index.md#weather) — implementation baseline (variants, `temperatureUnit`, condition backgrounds, `preset` → `variant` migration, asset base URL constraint)
- [Card reference — Weather](../card-reference.md#weather) — per-variant attributes and condition→background map
- [Design system](../../design-system/index.md) — tiers, card anatomy, big-value typography
- `src/components/WeatherCard/index.tsx` — current implementation (variant dispatch, background resolution, preset migration)
