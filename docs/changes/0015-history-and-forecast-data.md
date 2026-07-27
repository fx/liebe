# 0015 — History & Forecast Data Pipeline

## Summary

Extend the entity-state pipeline with the two read-side capabilities the card specs depend on: **recent numeric history** (for sensor sparklines/graphs and the detail dialog) and **weather forecasts** (`weather.get_forecasts`). Closes the "sparkline data source" open question in [design-system](../specs/design-system/index.md#open-questions) and the forecast-fetch open question in [options/weather](../specs/entity-cards/options/weather.md).

**Spec:** [entity-state](../specs/entity-state/index.md) · **Status:** draft · **Depends on:** 0014 (PR 3's detail-dialog graph only — PRs 1–2 are pure pipeline work with no dependencies and can run in parallel with the visual track)

## Motivation

Graphs are the second-most-demanded dashboard capability in the research behind the design system, and the weather card's forecast options are inert without data. PRs 1–2 are pure pipeline work — independent of the visual changes, so they can proceed in parallel with 0010–0014; only PR 3's detail-dialog graph waits for 0014's dialog to exist.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Fetch, cache, downsample, and subscription logic MUST have unit tests including error and empty-history paths; WebSocket messages are mocked at the same layer existing entity-state tests use.
- The e2e suite MUST cover one history fetch against the dockerized HA instance (real `history/history_during_period` response shape).
- Storybook fixtures MUST gain history/forecast factories so graph stories (0018/0020) don't invent shapes.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The entity-state spec's [Entity History](../specs/entity-state/index.md#entity-history) and [Weather Forecast](../specs/entity-state/index.md#weather-forecast) sections own both hook contracts — caching levels and keys, downsampling, delta semantics, raw-ingress and freshness rules, `unsupported` resolution, and its scenarios. This change implements them. What it owns beyond the spec:

- **PRs 1 and 2 are pure pipeline work with no dependencies** and can run in parallel with the visual track; only PR 3's detail-dialog graph depends on [0014](./0014-universal-card-options.md).
- **The two consumers must not be built against assumptions.** [0018](./0018-sensor-cards-to-spec.md) selects `sample` or `delta` per rendering surface and [0020](./0020-weather-card-to-spec.md) consumes forecasts exclusively through the hook; both land after this change, so the projection cache key (entity + window + mode + `points`) MUST be in place from PR 1 rather than retrofitted.
- Fixture factories for history and forecast responses ship with the hooks, since every later graph story and test depends on them.
- An e2e fetch against the dockerized HA instance validates the real WebSocket history API, not just mocked responses — the recorder's payload shape is the part most likely to differ from assumption.

## Design Decisions

- **WebSocket over REST** — the panel already holds an authenticated WS connection; no new auth surface.
- **Windowed cache keyed by entity+hours** — simple and sufficient for card-scale use; no persistence (history is cheap to refetch on reload).
- **Spec sync** — this change updates the entity-state spec with the new hooks/stores and marks the design-system and weather-options open questions resolved (changelog entries in both).
- **Forecasts are cached by REQUESTED type, not fetched type** — a daily request against a twice-daily-only integration is fetched as `twice_daily` and derived before it is cached, so one store lookup answers a subscriber and the derivation never runs per render. The cost is that an entity asked for both `daily` and `twice_daily` fetches the same payload twice; no card does.
- **Twice-daily → daily derivation, case by case** (the spec owns the rule; these are the messy-input decisions behind it). Entries are sorted and grouped by LOCAL calendar day, so reversed halves still pair and a UTC-anchored payload does not split a day. Within a day the first daytime half and the first nighttime half win, so duplicates keep the earlier forecast. Only an explicit `is_daytime: false` marks a night — an integration that omits the flag yields daytime halves rather than nothing. A day with no night keeps its high and condition and falls back to its own `templow`; a day with no daytime half (a forecast fetched in the evening opens with one) is still emitted with the night's condition and low but NO temperature, because a nighttime reading is not the day's high and rendering it as one misreports the day. Nothing is fabricated: a missing low stays missing, and an entry whose `datetime` cannot be parsed is dropped rather than placed on an arbitrary day.
- **`unsupported` is decided by capability first, error second** — `supported_features` is read before the call, so a type the entity does not advertise costs no request; a call that still fails is classified, with "no such service" and "entity does not support this" resolving `unsupported` while a transport failure stays an error. Consumers render the two differently, so collapsing them would either hide faults or show empty forecast furniture on entities that will never have one.

## Tasks

- [x] **PR 1 — History**: WS history fetch + cache + downsampler (sample/delta modes) + `useEntityHistory` + live append/reconnect; unit tests; e2e fetch against dockerized HA; fixture factories; **spec sync in this PR**: flip the entity-state history contract's status from specified to implemented, close the design-system "sparkline data source" open question, and add the changelog entry
- [x] **PR 2 — Forecast**: `weather.get_forecasts` client + cache/refresh + `useWeatherForecast` (hourly/daily/twice-daily) + unsupported detection; unit tests; fixtures; **spec sync in this PR**: flip the entity-state forecast contract's status to implemented, close the weather option doc's forecast-fetch open question, and add the changelog entry
- [ ] **PR 3 — Detail-dialog history + spec sync**: replace the entity detail dialog's history placeholder (from [0014](./0014-universal-card-options.md)) with a graph rendered from `useEntityHistory` via the spark/graph anatomy — numeric entities only, section hidden on `unsupported`/error; component test + story; entity-state spec changelog entry for the dialog integration (the hook contracts and open-question closures were already synced in PRs 1–2)

## Out of Scope

- **Card-level** graph rendering (sparkline component ships in 0010 anatomy; card graph usage lands in 0018/0020 — the detail-dialog graph above is this change's only rendering surface); long-range statistics (`recorder/statistics_during_period`) — note as future work if long windows need it.
