# 0044 — Render & Bundle Performance Pass

## Summary

Finish the render-churn work [0001](./0001-per-entity-store-selectors.md) started — narrow the remaining whole-store subscriptions, share one clock per tick rate instead of one interval per consumer, and coalesce the history/forecast/health timers — then put the shipped bundle on a diet (dev routes out of prod, Radix weight audited) and delete the dead code the reviews have already named. A tech-debt bundle in the shape of [0002](./0002-repo-hygiene.md): no behavior changes, only fewer renders, fewer timers, fewer bytes.

**Spec:** [entity-state](../specs/entity-state/index.md) → [Entity Store](../specs/entity-state/index.md#entity-store) and [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks); bundle items reference [architecture](../specs/architecture/index.md) (build/bundle)
**Status:** complete
**Depends On:** 0001

## Motivation

**0001 narrowed the hot path and left the edges wide.** `useEntity`/`useEntities` subscribe to per-entity slices, but two whole-store subscriptions remain, each re-rendering its consumers on every batch:

- `useConnectionStatus` subscribes to the _entire_ connection store (`useConnectionStatus.ts:6` — `useStore(connectionStore, (state) => state)`), so any field change re-renders every consumer of any field. Its siblings in the same file (`useIsConnected`, `useIsConnecting`, `useConnectionDetails`) already select slices; the whole-state hook is the one everything reaches for.
- `useDashboardStore`'s default selector returns the whole state (`dashboardStore.ts:441`), so any consumer that forgets a selector re-renders on every dashboard mutation including `isDirty` flips from the persistence subscriber.

**Every consumer that wants "now" runs its own clock.** `CameraStats` ticks every second (`CameraCard/CameraStats.tsx:88`), the media player extrapolates progress on `PROGRESS_TICK_MS = 1000` (`MediaPlayerCard/index.tsx:80`), and since-time/recency lines (person, binary-sensor full tier) each need their own. N independent 1s intervals wake N subtrees at slightly different phases, so a dashboard with a camera, a media player and a presence card re-renders three times a second instead of once.

**Each pipeline owns its own timer wheel.** The history service keeps one maintenance timer per watched entity (`entityHistory.ts:70`, armed at `:260`), the forecast service one refresh timer per requested forecast (`weatherForecast.ts:33`, armed at `:155`), the connection monitor checks health every 30s (`hassConnection.ts:316`), and the stale-entity monitor polls on its own cadence (`staleEntityMonitor.ts:16`). Four wheels, four phases, each waking the pipeline alone — and the history/forecast wheels grow with the dashboard (one entry per entity, per forecast) rather than with time.

**The prod bundle ships the workshop.** `src/routes/test-store.tsx` (the store test page) and `src/routes/__root.test.performance.tsx` (the entity-browser perf harness) are file routes, so they ride the file-based router into the production IIFE the panel serves. Whatever Radix weight the anatomy actually needs is unaudited — the token contract aliases Radix, but nothing has measured what share of the bundle that alias costs.

**The dead code is already named, just not deleted.** `getTablerIcon` is a one-line alias of `getIcon` (`utils/icons.ts:8-11`) — `BinarySensorCard/index.tsx:111-113` even carries a comment explaining the alias exists, left behind by the caller that stopped needing it. `InputNumberCard` formats with its own `formatHelperNumber` (`InputNumberCard.tsx:64`) beside the sensor pipeline's `formatSensorNumber` (`SensorCard/format.ts`), two helpers for one job. The icon-map index carries entries no card resolves.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- **Render-count assertions, not render-existence assertions.** Each narrowing PR MUST assert the consumer does _not_ re-render on an unrelated store write (the probe pattern `useEntities.test.tsx`/`useEntity.test.tsx` already use: render a probe, mutate an unrelated slice, count renders). A test that only renders the consumer green passes on the un-narrowed subscription.
- **Timer PRs MUST run under fake timers and assert single-wake behavior.** Advancing 1s with N mounted clock consumers MUST produce one notification, not N; coalescing MUST be asserted by advancing past the longest member interval and counting service calls.
- **Bundle PRs MUST assert the artifact, not the source.** Excluding a route from source proves nothing about the file-based router; the test MUST assert the built panel artifact no longer contains the dev route (the served-vs-built identity pattern in `tests/e2e/bundleIdentity.ts` is the model).
- **Dead-code PRs MUST fail if the deleted symbol is referenced.** The test is the suite itself under `typecheck` + the glance that no import remains — plus an explicit assertion where the alias had callers (the `BinarySensorCard` single-lookup comment is the spec of that behavior).

Skipping or weakening any of these rules to land the PR is a bug in the PR.

### Functional requirements

[entity-state — Entity Store](../specs/entity-state/index.md#entity-store) owns the subscription bookkeeping and [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks) owns what each hook selects; [architecture](../specs/architecture/index.md) owns the build/bundle contract. Those specs hold the normative behavior — this change's acceptance criteria, not restated here. What implementing them requires of this change (sequencing and files; the specs decide what is correct):

- **Narrowing without widening (PR 1).** Slice `useConnectionStatus` into the existing slice hooks (or a field-parameterized selector following them) and fix the dashboard default selector so callers name their slice — the plan counterpart of the Consumer Hooks selection contract linked above. The unfiltered `useEntities` whole-map path is out of scope: the spec's Consumer Hooks contract accepts per-batch re-renders there, and changing that contract belongs to a future spec amendment, not this change.
- **Clocks (PR 2, first half).** A shared `useNow`-style hook pair (1s/1min; naming is the implementer's) adopted by `CameraStats`, media-player progress, recency/since lines and the other "now" consumers, replacing one interval per consumer with one tick per rate so phases align.
- **Scheduler (PR 2, second half).** History window maintenance, forecast refresh, connection health and staleness checks coalesce onto a single wheel — or one per rate class if the rates genuinely differ (30s health vs hourly forecast refresh need not share a tick) — with the per-entity/per-forecast timer maps deleted, not wrapped.
- **Bundle diet (PR 3, first half).** `test-store` and the `__root/test/performance` harness resolve to nothing (or the not-found route) in the production build while staying available in dev, so the built `panel.js` no longer carries them; the Radix audit records what the token alias costs and drops what no anatomy part references (if the audit finds nothing worth dropping, the record _is_ the deliverable).
- **Dead code (PR 3, second half).** `getTablerIcon` goes with its callers and the `BinarySensorCard` comment explaining it; one format helper survives with every callsite migrated; unreferenced icon-map entries are removed — no re-export shims, no `@deprecated` markers (single-repo panel, every caller in scope).

#### Worked example: what PR 1's probes show

PR 1 adds a probe rendering a component on the narrowed `useConnectionStatus` path, then batches an update to an unrelated field (`reconnectAttempts`, say) and counts renders. The expectation the probe checks — which fields each hook observes — comes from [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks); the probe is how this change demonstrates the contract, not a second statement of it.

## Design

### Approach

Three render PRs then one bundle PR, each independently landable and each with the probe-style tests the suite already models. The subscription work is mechanical (selectors), the clock/scheduler work is the only design surface (shared hook shape, wheel ownership — likely living beside the entity-state pipeline singletons), and the bundle work is build config plus deletion.

### Decisions

- **Bundle groups with 0002's precedent, not a new spec.** Like repo-hygiene, this is project-level quality work spanning specs; entity-state owns the render requirements, architecture owns the build ones, and the change document is the single home rather than a spec edit in either.
- **Clocks and schedulers share one PR (PR 2).** Both replace N private intervals with shared ticks; reviewing them apart would re-litigate the same "who owns the wheel" question twice.
- **Bundle diet and dead code share one PR (PR 3).** Both change what ships rather than how it renders; the artifact assertion covers both.
- **No new spec sections.** Nothing here changes observable behavior — a dashboard that renders identically with fewer wakes needs no contract update. If a PR discovers a behavior the spec misstates, that finding goes to the spec first.

### Non-Goals

- Virtualizing the entity browser or any list-window work — fewer renders per batch, not fewer rows.
- Changing refresh cadences (30s health, 30min/2h forecasts) — coalescing aligns phases, it does not retune rates.
- Tree-shaking Radix out of the anatomy — audit and drop the unreferenced, not a component-library migration.
- The `sharp`-in-dependencies question (architecture spec open question) — packaging hygiene adjacent to this, owned elsewhere.

## Tasks

- [x] **PR 1 — Narrow the whole-store subscriptions**: `useConnectionStatus` subscribes its seven read fields individually; the dashboard default selector is removed (selector required, whole-state opt-in explicit); every no-arg callsite names its slice; render-count probes (`useConnectionStatus.narrowing.test.tsx`) show unrelated writes no longer wake consumers
- [x] **PR 2 — Shared clocks + coalesced scheduler**: `useNow`/`useNowSecond`/`useNowMinute` (+`subscribeSecondTick`) adopted by media progress, CameraStats, ClockWidget, since/last-activated lines; history/forecast/health/staleness ride the two-wheel `pipelineScheduler` with per-entity timer maps deleted; single-wake and call-count assertions (`useNow.test.tsx`, `pipelineScheduler.test.ts`) under fake timers
- [x] **PR 3 — Prod-bundle diet + dead-code removal**: dev routes render-gated behind `import.meta.env.DEV` with artifact assertion (`prodBundleDiet.test.ts`: harness content absent, paths still registered); Radix audit dropped 5 unreferenced packages (dialog/dropdown-menu/switch/tabs/tooltip; slider+icons+themes stay); `getTablerIcon` module + BinarySensorCard comment, `formatHelperNumber` duplication (into `formatFixedNumber`), and 6 dead icon-map entries deleted with all callsites migrated

## Open Questions

- Do the forecast refresh rates (30min hourly, 2h daily) share a wheel with 30s health, or is PR 2 two wheels (fast/slow)? Implementer's call; the requirement is only that no wheel grows with dashboard size.

## References

- Spec: [entity-state — Entity Store](../specs/entity-state/index.md#entity-store), [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks), [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)
- Related changes: [0001-per-entity-store-selectors](./0001-per-entity-store-selectors.md) (the hot path this finishes), [0002-repo-hygiene](./0002-repo-hygiene.md) (the bundle precedent), [0005-dockerized-ha-e2e](./0005-dockerized-ha-e2e.md) (the e2e identity pattern PR 3's assertion follows)
