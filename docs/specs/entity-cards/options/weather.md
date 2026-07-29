# Card Options — Weather

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: implemented** by change [0020](../../../changes/0020-weather-card-to-spec.md) — the tier-adaptive variants, `secondaryInfo` and `showConditionBackground` in PR 1, the forecast options in PR 2, on top of the tier layouts change [0011](../../../changes/0011-layout-tiers.md) PR 3 landed. Every key in the table below is stored under `item.config` and editable in the shared configuration form; the shipped `variant`, `temperatureUnit`, condition backgrounds and the legacy `preset` → `variant` migration are preserved unchanged, so no stored weather config required migrating.

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
- The card MUST NOT request a forecast for a section it will not render — one its tier has no room for, or whose option is `false`. What that saves behind the request is the hook's business, not this spec's. Availability is resolved per type, so an entity publishing hourly data and no daily view still shows its hourly strip.
- A forecast column reporting no high MUST render no high. The twice-daily→daily derivation emits a day built from a nighttime half alone (the leading half of a forecast fetched in the evening) carrying that half's low and deliberately no temperature; rendering the low where the high goes would reintroduce the misreport the derivation exists to avoid.
- The fetch/cache/refresh contract belongs to the entity-state spec's [Weather Forecast](../../entity-state/index.md#weather-forecast) section and is implemented; cards MUST read forecasts through `useWeatherForecast` rather than calling the service themselves. This spec constrains presentation only.

### Secondary info (`secondaryInfo`)

Selects the featured value of the secondary line: `humidity` (`humidity`, %), `wind` (`wind_speed` + unit, SHOULD include bearing when available), `feels-like` (`apparent_temperature`, converted per `temperatureUnit`), `uv` (`uv_index`), `pressure` (`pressure` + unit).

- When the selected attribute is absent on the entity, the card MUST fall back to the first available attribute in the order above (starting from `humidity`) rather than render a blank; if none are available the secondary line is omitted.
- In the `full` tier the detail line MAY show additional attributes after the featured one (see tier table), with the `secondaryInfo` choice always listed first.
- This is a single select rather than a multi-select for now — a third shape (ordered multi-select) is plausible later, which is exactly why the key is not a boolean (common convention 5); see Open Questions.

### Condition background (`showConditionBackground`)

- When `true` and the condition→image map resolves an image for the entity's state, the card MUST render it as a cover background and MUST switch text/icons to white with shadows for legibility, exactly per the shipped behavior ([entity-cards — Weather](../index.md#weather)). The card's own backdrop blur is turned off while artwork renders, so the photograph is not read through frosted glass.
- Background image URLs MUST be prefixed by `window.__LIEBE_ASSET_BASE_URL__` (falling back to `/`) — this existing constraint is load-bearing because the panel is served from different base paths in dev and production ([entity-cards — Constraints](../index.md#constraints)).
- When `false`, or when the condition resolves no image, the card renders on the standard card surface (`--liebe-card-bg`) with normal text colors. The `minimal` variant continues to never render a background regardless of this option.
- The condition→image map MUST answer only for conditions it declares. The lookup key is the entity's state, so any string reaches it, and a plain object literal answers for its prototype's members — `constructor` resolves a truthy function that would be interpolated into a URL. Unmapped conditions then fall to substring rules, and to `null` when none match: the vocabulary belongs to the integration, so an unrecognised condition is a normal state of affairs that leaves the card on its themed surface rather than an error.
- The **condition glyph** (the icon the line-art variants draw, distinct from the artwork) MUST resolve for any condition: substring matching with a neutral cloud fallback, so a condition this build has never met renders rather than blanking. `exceptional` is the exception, matched first and by name — it is Home Assistant's `ATTR_CONDITION_EXCEPTIONAL`, meaning severe weather or an integration reporting it cannot say, and a generic cloud states the opposite. It resolves no artwork, which is a real gap in the condition→image map and a separate one: new artwork is out of scope for 0020.

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts). Content that does not fit MUST be omitted, never clipped or scrolled.

| Tier     | Content                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Condition icon + current temperature (temperature takes the state-line slot; `hideState` hides it). No forecast, no secondary line.                                                                                                                                                                                                                                                                             |
| `row`    | `glance` content plus the condition text (e.g. "Partly cloudy") and the hourly forecast strip (`showHourlyForecast`, up to `forecastHours` compact hour/icon/temp columns). Secondary line shows the `secondaryInfo` value.                                                                                                                                                                                     |
| `tall`   | Condition icon on top, large temperature, condition text, secondary line at the bottom; hourly strip runs **down** the tile (one column wide) and only as far as the tile's own height allows — the icon, readout and meta take the first two grid cells and each cell beyond them carries one hour, so a two-cell `tall` tile shows none. The height comes from the `span` prop, never from measuring the DOM. |
| `full`   | Big temperature readout (`liebe-value` anatomy, tabular-nums), condition text, a detail line leading with `secondaryInfo` and MAY continue with feels-like / wind / humidity (deduplicated against the featured value), the hourly strip, and the multi-day forecast row (`showDailyForecast`, up to `forecastDays` day/icon/high–low columns).                                                                 |

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

- ~~**Forecast fetch in the entity-state pipeline.**~~ Settled and shipped: forecast content comes from [`useWeatherForecast`](../../entity-state/index.md#weather-forecast), which owns the contract — per-type caching, periodic refresh (30min hourly / 2h daily and twice-daily), `unsupported` resolution distinct from errors, and the twice-daily→daily derivation (change [0015](../../../changes/0015-history-and-forecast-data.md) PR 2). Wiring the forecast tiers to it is 0020.
- **`secondaryInfo` as ordered multi-select.** The `full` detail line wants multiple values; whether `secondaryInfo` should grow into an ordered multi-select (with the current single value migrating to a one-element list) or stay a single "featured" select with a fixed supplemental order is open.
- **Variant consolidation under tiers.** Tiers absorb much of what the four variants were built for (density-by-size). Whether `modern`/`detailed` remain worth maintaining as distinct styles once tier layouts ship, or collapse into `default` via a future migration, should be revisited after implementation — `variant` values stay stable either way.
- **Feels-like source.** `apparent_temperature` is not provided by every integration; whether to approximate it (wind chill / heat index) when absent or simply fall back per the `secondaryInfo` rules is undecided (fallback is the specified behavior until then).

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards — Weather](../index.md#weather) — implementation baseline (variants, `temperatureUnit`, condition backgrounds, `preset` → `variant` migration, asset base URL constraint)
- [Card reference — Weather](../card-reference.md#weather) — per-variant attributes and condition→background map
- [Design system](../../design-system/index.md) — tiers, card anatomy, big-value typography
- `src/components/WeatherCard/` — the implementation: `index.tsx` (variant dispatch, configuration modal), `presentation.ts` (temperature, `secondaryInfo` fallback, condition glyphs, artwork and its text treatment), `forecastPresentation.ts` (tier capacity, upper bounds, columns), `WeatherForecast.tsx` (the hook wiring and the two strips), and the four variant files
- `src/store/weatherOptions.ts` — the persisted option contract, its defaults, the config-schema fragment and the `preset` → `variant` rename
