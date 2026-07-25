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

- A `useEntityHistory(entityId, {hours, points, mode})` hook — `mode: 'sample' | 'delta'`, default `'sample'` — MUST return downsampled numeric series for the window (default 24h). Caching is two-level: **raw history cached per entity + window** (the expensive fetch), with projections (downsample/delta) computed per subscriber request — or, if projections are cached, keyed by entity + window + mode + `points`, since point count changes bucket boundaries and therefore both sampled and delta values; two consumers with different `points` MUST never share a projected series, backed by the HA WebSocket history API (`history/history_during_period` or the recorder equivalent), with: in-memory cache per entity+window, deduped concurrent requests, live append from state changes while subscribed, and refetch on reconnect. Live appends MUST consume the **raw `state_changed` ingress before the entity-state pipeline's debouncing** (or refetch from the recorder): the debounced store slices intentionally keep only the latest update in a window, which would silently drop intermediate counter resets and measurement spikes (`0→10→0→5` collapsing to `0→5`) before delta/min-max processing — boundary-level test required. Live appends only keep a cache entry fresh **while a subscriber is mounted** — so cache entries MUST carry a fetched/last-appended timestamp, and on (re)subscription the hook MUST prune points that have aged out of the rolling window — always retaining **one sentinel sample immediately before the window cutoff**, so `delta` mode's first bucket keeps a predecessor as the rolling window advances (a long-mounted counter kept fresh purely by appends would otherwise undercount its first bucket; the advancing-window case is unit-tested) — and MUST refetch when the entry is stale (no active subscriber maintained it since its last append, or it exceeds a freshness TTL — SHOULD: 5 minutes); a remounting card never renders a series with a gap. **While subscribers stay mounted**, the same maintenance MUST run periodically (SHOULD: each downsample-bucket interval): aged-out points are pruned and, when the entity has emitted no state change within the TTL, the window is refetched — a long-mounted wall-tablet card on a quiet entity never shows an indefinitely stale window.
- Downsampling MUST bound returned points (target ≤ ~100/card) preserving min/max extremes within buckets (graphs must not flatten spikes).
- The hook MUST offer two aggregation modes selected by the caller: `sample` (the min/max-preserving downsample above, for measurements) and `delta` (for counter-style series — `total_increasing`/`total` state classes): in `delta` mode, per-bucket values MUST be computed from the **raw samples before downsampling** (a reset inside a bucket is invisible after min/max reduction — `0→10→0→5` must yield 15, not 10), applying reset-aware summation for `total_increasing` (a decrease starts a new counter run) and signed differences for `total` (decreases are legitimate). Delta correctness across intra-bucket resets MUST be unit-tested.
- Non-numeric entities MUST resolve to an explicit `unsupported` result (cards hide graphs per their option docs).
- A `useWeatherForecast(entityId, {type: hourly|daily|twice_daily})` hook MUST call `weather.get_forecasts` with response caching and a refresh interval (SHOULD: 30min hourly / 2h daily and twice-daily), resolving `unsupported` when the service/feature is unavailable so weather options degrade gracefully per [options/weather](../specs/entity-cards/options/weather.md). Integrations advertising only `FORECAST_TWICE_DAILY` MUST NOT resolve daily as unsupported: the hook MUST offer a daily view derived from twice-daily data — daytime entries (`is_daytime: true`) carry the day's condition/high, with the paired nighttime entry supplying the low.
- Both hooks MUST follow the pipeline's existing store/subscription patterns ([entity-state](../specs/entity-state/index.md) — per-entity slices from [0001](./0001-per-entity-store-selectors.md)) so graph updates don't re-render unrelated cards.
- Failures MUST be non-fatal: cards render without graph/forecast on error; errors surface via the hook result, not thrown.

#### Scenario: Sparkline data for a temperature sensor

- **GIVEN** a numeric sensor with recorder history
- **WHEN** a card mounts `useEntityHistory(id, {hours: 24})`
- **THEN** it receives ≤~100 points spanning 24h with bucket extremes preserved, and a subsequent state change appends without a refetch.

#### Scenario: Forecast unsupported degrades silently

- **GIVEN** a weather entity whose integration lacks `get_forecasts`
- **WHEN** `useWeatherForecast` resolves
- **THEN** it returns `unsupported`, and the weather card hides forecast rows regardless of its options.

## Design Decisions

- **WebSocket over REST** — the panel already holds an authenticated WS connection; no new auth surface.
- **Windowed cache keyed by entity+hours** — simple and sufficient for card-scale use; no persistence (history is cheap to refetch on reload).
- **Spec sync** — this change updates the entity-state spec with the new hooks/stores and marks the design-system and weather-options open questions resolved (changelog entries in both).

## Tasks

- [ ] **PR 1 — History**: WS history fetch + cache + downsampler (sample/delta modes) + `useEntityHistory` + live append/reconnect; unit tests; e2e fetch against dockerized HA; fixture factories; **spec sync in this PR**: entity-state spec gains the history contract, and the design-system "sparkline data source" open question closes with a changelog entry (owning specs update with the decision, never a later PR)
- [ ] **PR 2 — Forecast**: `weather.get_forecasts` client + cache/refresh + `useWeatherForecast` (hourly/daily/twice-daily) + unsupported detection; unit tests; fixtures; **spec sync in this PR**: entity-state spec gains the forecast contract, and the weather option doc's forecast-fetch open question closes with a changelog entry
- [ ] **PR 3 — Detail-dialog history + spec sync**: replace the entity detail dialog's history placeholder (from [0014](./0014-universal-card-options.md)) with a graph rendered from `useEntityHistory` via the spark/graph anatomy — numeric entities only, section hidden on `unsupported`/error; component test + story; entity-state spec changelog entry for the dialog integration (the hook contracts and open-question closures were already synced in PRs 1–2)

## Out of Scope

- **Card-level** graph rendering (sparkline component ships in 0010 anatomy; card graph usage lands in 0018/0020 — the detail-dialog graph above is this change's only rendering surface); long-range statistics (`recorder/statistics_during_period`) — note as future work if long windows need it.
