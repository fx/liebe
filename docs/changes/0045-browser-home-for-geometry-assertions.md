# 0045 — A Browser Home for the Five Geometry Assertions

## Summary

Give the five `BROWSER_ONLY` geometry assertions in `src/__tests__/stories.test.tsx` a home that can actually evaluate them: Playwright specs against the real panel in the dockerized HA instance, one per assertion family. The story `play` functions stay as documentation; the e2e suite becomes where they are enforced. Closes the `docs/tasks.md` backlog item that has tracked this since the runner learned to name what it cannot prove.

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

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- **Every migrated assertion MUST read real layout.** `getBoundingClientRect` (or scroll/clientWidth pairs for the overflow halves), never screenshots, never computed-style declarations — the declaration locks already exist and this suite is the measurement side.
- **Each e2e spec MUST seed directly to the geometry it needs**, per the `slider-fill-geometry` precedent: the tier is derived from the span the grid lays out, so no edit-mode drags to reach a shape a seeded item already has.
- **A `BROWSER_ONLY` entry MUST be removed only in the PR that enforces its claim.** An entry removed without an enforcing spec re-opens the hole the map exists to name; the self-verifying runner enforces the pairing mechanically (a stale entry fails, a missing enforcement is review-visible).
- **The story `play` functions MUST NOT be weakened when the e2e home lands.** They remain the documented claim and the workshop-visible behavior; what moves is where the claim is enforced, never whether the story renders.

Skipping or weakening any of these rules to land the PR is a bug in the PR.

### Functional requirements

[storybook — Story assertions are gate-grade](../specs/storybook/index.md#story-assertions-are-gate-grade) owns the `BROWSER_ONLY` contract — what MUST be named, that entries MUST throw with the pinned message, that the assertions are documentation until e2e picks them up. Those rules are this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **All five claims MUST be enforced in the e2e suite, grouped by family** (forecast capacity, full-tier graph fill, slider drag) — whether that is one spec file or three is the implementer's, but each family seeds only what it measures.
- **The forecast pair needs a weather entity with seeded forecasts in the e2e instance.** The stories use `createWeatherEntity()` plus `seededForecasts` fixtures; the e2e equivalent (demo weather entity, REST-seeded state, or a helper entity from `configuration.yaml`) MUST be settled per family, not assumed — if the dockerized instance cannot serve a forecast, that is a setup task in the implementing PR, not a reason to leave the pair unmigrated.
- **The sensor pair needs seeded history in the e2e instance.** `entity-history.spec.ts` is the precedent for getting samples into the recorder-backed pipeline from a test; the graph-fill specs reuse that path rather than inventing one.
- **The slider drag MUST use real pointer input** (Playwright mouse), asserting `aria-valuenow`, `aria-valuetext` and the single-commit count — the jsdom failure message (`aria-valuenow`) is the pinned behavior, not the mechanism.
- **The `docs/tasks.md` backlog item MUST be closed by the last migrating PR**, and the storybook spec's open question ("A browser home for the five geometry assertions") MUST be updated to point at the enforcing specs.

## Design

### Approach

Family by family, each PR seeds a screen, measures what the story `play` measures, and deletes the corresponding `BROWSER_ONLY` entries. Forecast capacity first (it carries the setup risk — weather data in the e2e instance), then the sensor pair (history seeding precedent exists), then the slider drag (pure pointer mechanics, no data setup).

### Decisions

- **Enforce against the panel, not the workshop.** The claims are about tiles the grid lays out at real breakpoints under real themes — the minimum-width forecast story says so explicitly ("the exact count depends on the cell arithmetic and the theme's padding"). Measuring them in Storybook's grid-cell decorator would re-prove the decorator's fidelity (change 0029's subject), not the panel. The panel is the surface users see; the panel is where they are measured.
- **Stories keep their `play` functions.** Per the spec, the story assertion is documentation of intent that the workshop still executes (and the runner still gates for non-geometry regressions). E2e enforcement adds a second evaluation site for the geometry half only.
- **Sequencing by setup risk, not by file order.** The forecast pair goes first because it may need instance work (weather/forecast availability); discovering that in the third PR would stall the other two.

### Non-Goals

- New declaration-level locks — the existing ones (`anatomyStyles`, `cardBodyStyles`) stay as companions; this change is the measurement side.
- Touching the `BROWSER_ONLY` mechanism itself — self-verification in both directions stays exactly as specified.
- Migrating non-geometry story assertions — only the five named entries are in scope.

## Tasks

- [ ] **PR 1 — Forecast capacity in e2e**: seed a max-count screen and a minimum-width tile; assert the 44px floor, column rhythm, omit-not-overflow and no-widen rules; settle the weather/forecast data path in the e2e instance; remove the two `WeatherCard` entries from `BROWSER_ONLY`
- [ ] **PR 2 — Full-tier graph fill in e2e**: seed small and large `full` sensor tiles with history; assert the graph-fills-leftover invariant at both sizes; remove the two `SensorCard` entries from `BROWSER_ONLY`
- [ ] **PR 3 — Slider drag in e2e**: real-pointer drag past the track edge asserting max value + single commit (and the minimum sibling if cheap); remove the `Slider` entry; close the `docs/tasks.md` item and update the storybook spec's open question to point at the three enforcing specs

## Open Questions

- Can the dockerized HA instance serve a weather forecast (demo `weather` entity with `get_forecasts`, or a template/helper)? PR 1 answers this; if not, the setup work (custom integration fixture or `configuration.yaml` helper) is part of PR 1.
- Should the three families share one spec file (single "geometry" home) or live beside their topical siblings (`forced-slider-placement`, `entity-history`)? Implementer's call; the requirement is only that each seeds what it measures.

## References

- Spec: [storybook — Story assertions are gate-grade](../specs/storybook/index.md#story-assertions-are-gate-grade), [architecture — End-to-End Harness](../specs/architecture/index.md#end-to-end-harness)
- Related changes: [0005-dockerized-ha-e2e](./0005-dockerized-ha-e2e.md) (the suite), [0028-slider-rendering-fixes](./0028-slider-rendering-fixes.md) (the measurement precedent), [0029-workshop-tier-fidelity](./0029-workshop-tier-fidelity.md) (why the panel, not the decorator), [0030](./0030-weather-forecast-legibility.md) (owns the 44px floor rule PR 1 enforces)
