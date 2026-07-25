# 0020 — Weather Card to Spec

## Summary

Implement the weather-specific options from the [weather option contract](../specs/entity-cards/options/weather.md) on top of the tier layouts (0011), the universal option surface (0014), and the forecast pipeline (0015): the existing `variant` key preserved and made tier-adaptive (every variant implements all four tiers per the variant×tier reconciliation), `showHourlyForecast`/`forecastHours`, `showDailyForecast`/`forecastDays`, `secondaryInfo` with attribute fallback, and `showConditionBackground` — plus their config-form entries. The condition-background feature keeps the `window.__LIEBE_ASSET_BASE_URL__` resolution rule and finally gains the unit tests the entity-cards spec flags as missing. Universal options and the action system are already in place per 0014 and are not re-implemented here.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/weather](../specs/entity-cards/options/weather.md) · **Status:** draft · **Depends on:** 0011, 0014, 0015

## Motivation

The weather card family already ships four visual variants (`default`, `modern`, `detailed`, `minimal`), `temperatureUnit`, condition-mapped background images, and the legacy `preset` → `variant` migration — but its layout is fixed rather than tier-adaptive, it renders no forecasts, the secondary line is hardcoded per variant, and the background cannot be turned off. The option doc specifies all of this, and 0015's `useWeatherForecast` hook removed the last data blocker (its forecast-fetch open question is closed). Landing this makes weather the first read-only card fully to spec and closes a known coverage gap: [entity-cards — Open Questions](../specs/entity-cards/index.md#open-questions) records that `getWeatherBackground`, the white-text/shadow treatment, and `__LIEBE_ASSET_BASE_URL__` resolution (PR #140) have no tests — adding that coverage is in scope here.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every option MUST ship stories demonstrating its values ([storybook — story coverage](../specs/storybook/index.md#story-coverage)): each variant across all four tiers, forecast strips at differing `forecastHours`/`forecastDays`, each `secondaryInfo` value plus the missing-attribute fallback, `showConditionBackground` both values — and the forecast-unsupported state (hook resolving `unsupported`, sections absent), using the forecast fixture factories from 0015.
- Forecast rendering MUST have unit tests for gating (option off, `unsupported`, empty response → section hidden with no placeholder), the upper-bound rule (fewer entries than configured → render what arrived, never pad), tier gating (no hourly strip in `glance`; daily row in `full` only), and `temperatureUnit` conversion applied to forecast and feels-like temperatures.
- The condition-background feature MUST gain the currently missing unit tests: `getWeatherBackground` condition→image mapping (incl. unmapped conditions resolving nothing), `__LIEBE_ASSET_BASE_URL__` prefixing with and without the global set (falling back to `/`), white-text/shadow treatment applied only when a background renders, `showConditionBackground: false` restoring the flat surface, and `minimal` never rendering a background.
- `secondaryInfo` fallback resolution MUST be unit-tested across the full order (`humidity` → `wind` → `feels-like` → `uv` → `pressure`), including the none-available case omitting the line.
- Loader tests MUST confirm the `preset` → `variant` migration still holds and that stored configs predating this change render without new keys.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Option keys, types, defaults, and tier placements exactly per the [weather options table](../specs/entity-cards/options/weather.md#options): `variant` (existing values and default preserved), `temperatureUnit` (existing, now also converting every forecast temperature and feels-like value), `showHourlyForecast` (row/tall/full, never glance) with `forecastHours` (1–12, default 4), `showDailyForecast` (full only) with `forecastDays` (1–7, default 4), `secondaryInfo` (row/tall/full), `showConditionBackground` (all tiers except where the variant opts out) — each editable via the weather card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- Variant and tier compose per [Variants and tiers](../specs/entity-cards/options/weather.md#variants-and-tiers): `variant` selects density and style, the grid span alone selects the tier, every variant implements all four tier layouts (a variant MAY render less than the tier allows — `minimal` stays temperature-only — but never more), and existing configs keep working unchanged including the `preset` → `variant` migration; a legacy `size` value never influences weather layout.
- Forecast data comes exclusively from `useWeatherForecast` ([0015](./0015-history-and-forecast-data.md)); the card never calls `weather.get_forecasts` itself. When the hook resolves `unsupported` (or errors, or returns nothing) for a type, that section is hidden entirely — no empty strip, no placeholder, no error state — regardless of the option being `true` (common convention 3). `forecastHours`/`forecastDays` are upper bounds; the card renders what it received and never pads.
- `secondaryInfo` features the selected attribute on the secondary/detail line; when absent on the entity it falls back through the specified order starting at `humidity`, omitting the line only when none are available; in `full` the detail line leads with the featured value and MAY append deduplicated extras per the tier table.
- `showConditionBackground: true` renders the condition-mapped image as a cover background with white text/shadows exactly per shipped behavior; image URLs remain prefixed by `window.__LIEBE_ASSET_BASE_URL__` (falling back to `/`) — this constraint is load-bearing across dev/production base paths ([entity-cards — Constraints](../specs/entity-cards/index.md#constraints)). `false`, or an unresolved condition, renders the standard `--liebe-card-bg` surface with normal text; `minimal` never renders a background.
- The card stays read-only: `tapAction: default` resolves to `more-info` (stored default stays literal `default`), no default action calls a service, forecast columns are non-interactive, and taps on them fall through to the card's tap action.

#### Scenario: Existing variant config renders unchanged under tiers

- **GIVEN** a stored grid item with `config: { variant: 'detailed', temperatureUnit: 'fahrenheit' }` created before this change
- **WHEN** the dashboard loads and the card renders at a 2×2 span (`full` tier)
- **THEN** the detailed variant renders with Fahrenheit temperatures and its pressure emphasis, with no config migration and no new keys required.

#### Scenario: Forecast options degrade gracefully without the service

- **GIVEN** a weather entity whose integration lacks `weather.get_forecasts`, on a `full`-tier card with defaults (`showHourlyForecast: true`, `showDailyForecast: true`)
- **WHEN** `useWeatherForecast` resolves `unsupported` and the card renders
- **THEN** neither the hourly strip nor the daily row appears — no placeholder, no error — and the current-conditions content lays out as if both options were `false`.

## Design Decisions

- **Variant × tier composition, not replacement** — the four shipped variants keep their identities (density/style) while the tier system owns arrangement, per the option doc's reconciliation. Whether `modern`/`detailed` eventually collapse into `default` stays an open question in the option doc; this change implements all four across all tiers so no stored config breaks.
- **Forecast capability lives in the hook** — `useWeatherForecast` (0015) is the single source for availability, caching, and refresh; the card only maps hook results to sections. This keeps the option semantics purely presentational (hide/tune, never conjure) and makes the unsupported path trivially testable.
- **Background logic becomes a tested unit** — `getWeatherBackground` and asset-URL resolution are covered as pure functions plus render-level assertions for the text treatment, closing the spec's "weather background feature is untested" open question rather than re-shipping untested behavior behind a new toggle.
- **`secondaryInfo` fallback is a pure helper** — attribute selection and the fallback order live in one unit-tested function in the WeatherCard component folder, shared by the row/tall secondary line and the `full` detail line, keeping the order identical everywhere. It stays a single select (not a boolean) so a future ordered multi-select remains non-breaking (common convention 5).

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Tier-adaptive variants, secondary info, background option**: tier layouts (`glance`/`row`/`tall`/`full`) for all four variants per the option doc's tier table; `secondaryInfo` select + fallback helper; `showConditionBackground` option; config-form entries; the missing `getWeatherBackground`/asset-base-URL/text-treatment unit tests; loader tests for `preset` → `variant` and legacy configs; stories per tier/variant/option
- [ ] **PR 2 — Forecasts**: hourly strip and daily row wired to `useWeatherForecast`; `showHourlyForecast`/`forecastHours` and `showDailyForecast`/`forecastDays` with tier gating; unsupported/empty/upper-bound degradation; `temperatureUnit` conversion for forecast and feels-like values; config-form entries; unit tests; stories incl. the forecast-unsupported state
- [ ] **PR 3 — Spec sync**: update [entity-cards — Weather](../specs/entity-cards/index.md#weather) to the implemented behavior, close the "weather background feature is untested" open question, flip the weather option doc's status line to implemented, and record the change in the spec changelog

## Out of Scope

- Universal options and the action system (0014); layout tiers themselves (0011); the forecast/history pipeline incl. hook refresh cadence (0015).
- `secondaryInfo` as an ordered multi-select; variant consolidation; approximating feels-like when `apparent_temperature` is absent (fallback per the option doc remains the behavior) — all tracked as open questions in the option doc.
- New background artwork or condition-map changes; other domain cards (0016–0022 siblings).
