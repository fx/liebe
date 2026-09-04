# 0045 — A Browser Home for the Five Geometry Assertions

## Summary

Give the five `BROWSER_ONLY` geometry assertions in `src/__tests__/stories.test.tsx` a home that can actually evaluate them: Playwright specs against the real panel in the dockerized HA instance, one per assertion family. The story `play` functions stay as documentation; the e2e suite becomes where they are enforced. This change plans the work that will close the `docs/tasks.md` backlog item that has tracked this since the runner learned to name what it cannot prove.

**Spec:** [storybook](../specs/storybook/index.md) → [Story assertions are gate-grade](../specs/storybook/index.md#story-assertions-are-gate-grade)
**Status:** draft
**Depends On:** 0005

## Motivation

**The runner proves these five cannot pass where they run.** `src/__tests__/stories.test.tsx:159-180` names them with reasons: `WeatherCard/ForecastsMaxCount` (a forecast column at least 44px wide), `WeatherCard/ForecastsMaxCountOnMinimumWidthTile` (capacity omits columns rather than overflowing, from measured widths), `SensorCard/GraphInFullSmallTile` and `SensorCard/GraphInFullLargeTile` (graph-to-tile height ratios from measured boxes), `Slider/DragToMaximum` (a drag across the track by client coordinates jsdom reports as 0). jsdom lays nothing out — every box is 0×0 — so a width assertion fails and its overflow neighbour (`scrollWidth <= clientWidth`) passes on `0 <= 1` without proving anything.

**The map is self-verifying, and that is containment, not coverage.** Each entry is still executed and MUST throw with its pinned message, so a story that starts passing is reported and a non-geometry regression in the same story still fails the gate. That keeps the exemption from rotting. It does not enforce the geometry claim anywhere: today nothing asserts a forecast column is 44px wide, that a narrow tile omits rather than clips, that the full-tier graph fills its leftover, or that a drag across a real track commits once at maximum.

**The e2e suite is the only environment that can evaluate them, and it already speaks this language.** `slider-fill-geometry.spec.ts` (change 0028) reads the same class of claim off `getBoundingClientRect` in a real engine, seeded directly to the tier it needs; `card-resize-tiers.spec.ts`, `grid-handle-geometry.spec.ts`, `tall-slider-fit.spec.ts` and `forced-slider-placement.spec.ts` are the same pattern. The decision this change records — e2e against the panel, not a second storybook-side claim — follows from that precedent and from the spec's own framing: "a browser-only story's assertions are documentation until an e2e check picks them up" ([storybook](../specs/storybook/index.md#story-assertions-are-gate-grade)).

**Why not panel-layout claims instead.** The open alternative was asserting the same claims against the panel's own layout — declaration-level locks of the kind `anatomyStyles.test.ts` and `cardBodyStyles.test.ts` already hold for 0028's rules. Those pin that the stylesheet _says_ the right thing; they cannot see what the engine _does_ with it (a fill positioned by static flow, a strip that scrolls because the tile is narrower than the theme's padding assumed). For capacity-omits and drag-by-coordinates there is no declaration to pin at all — the claim is about measured boxes and pointer geometry. Declaration locks stay as the unit-level companion where they exist; enforcement moves to the browser.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- **Every migrated assertion MUST read real layout.** `getBoundingClientRect` (or scroll/clientWidth pairs for the overflow halves), never screenshots, never computed-style declarations — the declaration locks already exist and this suite is the measurement side.
- **Each e2e spec MUST seed directly to the geometry it needs**, per the `slider-fill-geometry` precedent: the tier is derived from the span the grid lays out, so no edit-mode drags to reach a shape a seeded item already has.
- **A `BROWSER_ONLY` entry MUST be removed only in the PR that enforces its claim _and_ keeps `npm test` green without it.** Each family PR takes exactly one of two routes: (a) _dual enforcement_ — keep the entry and add the e2e spec, so the runner still gates the story in jsdom while the browser enforces the geometry; or (b) _split_ — rewrite the story `play` to assert only what jsdom can evaluate and move the geometry half to the e2e spec in the same PR as the entry removal. An entry removed with neither (no enforcing spec, or a `play` that still fails in jsdom) re-opens the hole the map exists to name; the self-verifying runner enforces the pairing mechanically (a stale entry fails, a missing enforcement is review-visible).
- **The story `play` functions MUST NOT be weakened beyond the split.** Route (a) leaves them byte-identical. Route (b) keeps every jsdom-evaluable assertion (counts, regions, presence) in the story and moves only the measured-box / pointer-geometry assertions to e2e — the story still renders the same tile; what moves is where the geometry half is enforced, never whether the story renders.

Skipping or weakening any of these rules to land the PR is a bug in the PR.

### Functional requirements

[storybook — Story assertions are gate-grade](../specs/storybook/index.md#story-assertions-are-gate-grade) owns the `BROWSER_ONLY` contract — what MUST be named, that entries MUST throw with the pinned message, that the assertions are documentation until e2e picks them up. Those rules are this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **All five claims MUST be enforced in the e2e suite, grouped by family** (forecast capacity, full-tier graph fill, slider drag) — whether that is one spec file or three is the implementer's, but each family seeds only what it measures.
- **The forecast pair needs a weather entity with seeded forecasts in the e2e instance.** The stories use `createWeatherEntity()` plus `seededForecasts` fixtures; the e2e equivalent (demo weather entity, REST-seeded state, or a helper entity from `configuration.yaml`) MUST be settled per family, not assumed — if the dockerized instance cannot serve a forecast, that is a setup task in the implementing PR, not a reason to leave the pair unmigrated.
- **The sensor pair needs seeded history in the e2e instance.** `entity-history.spec.ts` is the precedent for getting samples into the recorder-backed pipeline from a test; the graph-fill specs reuse that path rather than inventing one.
- **Removal route per family — `npm test` stays green in every family PR.** An entry comes out only in the PR that both enforces its claim in e2e and leaves a `play` that passes in jsdom; otherwise the entry stays and e2e becomes the second enforcement site (consistent with the spec's self-verifying rule — a kept entry still gates non-geometry regressions in jsdom):
  - **Forecast — split one, keep one.** `ForecastsMaxCount` splits: the column-count assertion stays in the `play` (it passes in jsdom today — the pinned throw is the 44px floor, which proves the count already passed), the width-floor/rhythm assertions move to the e2e spec, and its entry is removed in PR 1. `ForecastsMaxCountOnMinimumWidthTile` stays dual: even the omit-count needs layout (the pinned throw _is_ the count), so no jsdom-evaluable assertion survives a split and its entry stays while e2e enforces count, floor and no-overflow.
  - **Sensor pair — dual, both entries stay.** Every assertion but the large tile's `data-region` pin is measured-box; a split would leave plays that render without asserting. E2e enforces the fill-leftover invariant at both sizes.
  - **Slider — dual, the entry stays.** The drag-to-maximum claim is pointer geometry end to end; nothing jsdom-evaluable survives a split. E2e with a real pointer enforces max value plus the single-commit count.

## Design

### Approach

Family by family, each PR seeds a screen, measures what the story `play` measures, and — per the removal-route bullet above — either splits the `play` and deletes the entry (only `ForecastsMaxCount`) or keeps the entry and adds e2e as the second enforcement site. Forecast capacity first (it carries the setup risk — weather data in the e2e instance), then the sensor pair (history seeding precedent exists), then the slider drag (pure pointer mechanics, no data setup).

### Decisions

- **Stories keep their `play` functions except the one split.** `ForecastsMaxCount` is the exception: its width-floor/rhythm assertions move to e2e and its `play` keeps the column count. Every other story's `play` stays byte-identical — per the spec, the story assertion is documentation of intent that the workshop still executes (and the runner still gates for non-geometry regressions). E2e enforcement adds a second evaluation site for the geometry half.
- **Sequencing by setup risk, not by file order.** The forecast pair goes first because it may need instance work (weather/forecast availability); discovering that in the third PR would stall the other two.

### Non-Goals

- New declaration-level locks — the existing ones (`anatomyStyles`, `cardBodyStyles`) stay as companions; this change is the measurement side.
- Touching the `BROWSER_ONLY` mechanism itself — self-verification in both directions stays exactly as specified.
- Migrating non-geometry story assertions — only the five named entries are in scope.

## Tasks

- [ ] **PR 1 — Forecast capacity in e2e (split one, keep one)**: seed a max-count screen and a minimum-width tile; assert the 44px floor, column rhythm, omit-not-overflow and no-widen rules; settle the weather/forecast data path in the e2e instance; split `ForecastsMaxCount` (count stays in the `play`, geometry moves to e2e) and remove its entry; keep the `ForecastsMaxCountOnMinimumWidthTile` entry (dual enforcement)
- [ ] **PR 2 — Full-tier graph fill in e2e (dual, both entries stay)**: seed small and large `full` sensor tiles with history; assert the graph-fills-leftover invariant at both sizes; the two `SensorCard` entries stay as the jsdom gate
- [ ] **PR 3 — Slider drag in e2e (dual, entry stays)**: real-pointer drag past the track edge asserting max value + single commit (and the minimum sibling if cheap); the `Slider` entry stays as the jsdom gate; close the `docs/tasks.md` item and update the storybook spec's open question to point at the three enforcing specs

## Open Questions

- Can the dockerized HA instance serve a weather forecast (demo `weather` entity with `get_forecasts`, or a template/helper)? PR 1 answers this; if not, the setup work (custom integration fixture or `configuration.yaml` helper) is part of PR 1.
- Should the three families share one spec file (single "geometry" home) or live beside their topical siblings (`forced-slider-placement`, `entity-history`)? Implementer's call; the requirement is only that each seeds what it measures.

## References

- Spec: [storybook — Story assertions are gate-grade](../specs/storybook/index.md#story-assertions-are-gate-grade), [architecture — End-to-End Harness](../specs/architecture/index.md#end-to-end-harness)
- Related changes: [0005-dockerized-ha-e2e](./0005-dockerized-ha-e2e.md) (the suite), [0028-slider-rendering-fixes](./0028-slider-rendering-fixes.md) (the measurement precedent), [0029-workshop-tier-fidelity](./0029-workshop-tier-fidelity.md) (why the panel, not the decorator), [0030](./0030-weather-forecast-legibility.md) (owns the 44px floor rule PR 1 enforces)
