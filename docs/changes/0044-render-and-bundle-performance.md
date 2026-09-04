# 0044 — Render & Bundle Performance Pass

## Summary

Finish the render-churn work [0001](./0001-per-entity-store-selectors.md) started — narrow the remaining whole-store subscriptions, share one clock per tick rate instead of one interval per consumer, and coalesce the history/forecast/health timers — then put the shipped bundle on a diet (dev routes out of prod, Radix weight audited) and delete the dead code the reviews have already named. A tech-debt bundle in the shape of [0002](./0002-repo-hygiene.md): no behavior changes, only fewer renders, fewer timers, fewer bytes.

**Spec:** [entity-state](../specs/entity-state/index.md) → [Entity Store](../specs/entity-state/index.md#entity-store) and [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks); bundle items reference [architecture](../specs/architecture/index.md) (build/bundle)
**Status:** draft
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

[entity-state — Entity Store](../specs/entity-state/index.md#entity-store) owns the subscription bookkeeping and [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks) owns what each hook selects — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Narrow without widening anywhere else.** Each narrowed subscription MUST select exactly the fields its consumers read today — `useConnectionStatus` splits into the existing slice hooks or a field-parameterized selector; the dashboard default selector MUST NOT remain whole-state (narrow the default or remove it so callers name their slice). No consumer may observe a value it did not observe before. The unfiltered `useEntities` whole-map path stays as the spec's Consumer Hooks contract states (re-rendering on every batch is the accepted cost of needing the whole map); changing that contract belongs to a future spec amendment, not this change.
- **One clock per rate.** A shared `useNow(1000)` / `useNow(60000)` pair (naming is the implementer's) owns the only intervals; `CameraStats`, media-player progress, recency/since lines and everything else that renders "now" subscribe to it. Tick phases MUST align — the point is one wake per second, not N. Consumers needing sub-second precision (none today) are the documented exception, not a third shared rate.
- **One scheduler for pipeline maintenance.** History window maintenance, forecast refresh, connection health and staleness checks coalesce onto a single wheel (or one per rate class if the rates genuinely differ — 30s health vs hourly forecast refresh need not share a tick, but two per-entity wheels MUST NOT grow with dashboard size). Per-entity/per-forecast timer maps are removed, not wrapped.
- **Dev routes MUST NOT ship in the prod artifact.** `test-store` and the `__root/test/performance` harness resolve to nothing (or to the not-found route) in the production build while remaining available in dev — whichever mechanism, the built `panel.js` MUST NOT contain them. The Radix audit records what the token alias costs and drops what no anatomy part references; if the audit finds nothing worth dropping, the record _is_ the deliverable.
- **Delete, don't deprecate.** `getTablerIcon` goes and its callers (and the comment explaining it) go with it; one format helper survives and every callsite uses it; unreferenced icon-map entries are removed. No re-export shims, no `/** @deprecated */` — this is a single-repo panel, every caller is in scope.

#### Scenario: An unrelated batch leaves a narrowed consumer asleep

- **GIVEN** a component subscribed via the narrowed `useConnectionStatus` path to `status` only
- **WHEN** a batch updates `reconnectAttempts` without touching `status`
- **THEN** the component does not re-render

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

- [ ] **PR 1 — Narrow the whole-store subscriptions**: slice `useConnectionStatus` and fix the dashboard default selector; render-count probes per path showing unrelated writes no longer wake consumers
- [ ] **PR 2 — Shared clocks + coalesced scheduler**: `useNow`-style shared hooks adopted by every per-second/per-minute consumer; history/forecast/health/staleness wheels coalesced with per-entity timer maps removed; single-wake and call-count assertions under fake timers
- [ ] **PR 3 — Prod-bundle diet + dead-code removal**: dev routes out of the production artifact with an artifact-level assertion; Radix weight audited with findings recorded; `getTablerIcon` alias, format-helper duplication and dead icon-map entries deleted with all callsites migrated

## Open Questions

- Do the forecast refresh rates (30min hourly, 2h daily) share a wheel with 30s health, or is PR 2 two wheels (fast/slow)? Implementer's call; the requirement is only that no wheel grows with dashboard size.

## References

- Spec: [entity-state — Entity Store](../specs/entity-state/index.md#entity-store), [Consumer Hooks](../specs/entity-state/index.md#consumer-hooks), [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)
- Related changes: [0001-per-entity-store-selectors](./0001-per-entity-store-selectors.md) (the hot path this finishes), [0002-repo-hygiene](./0002-repo-hygiene.md) (the bundle precedent), [0005-dockerized-ha-e2e](./0005-dockerized-ha-e2e.md) (the e2e identity pattern PR 3's assertion follows)
