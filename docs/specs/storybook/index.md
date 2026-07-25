# Component Workshop (Storybook)

## Overview

Storybook is Liebe's component workshop: every card, anatomy part, and theme renders as isolated stories with mocked entity data, so components can be developed and reviewed without a Home Assistant instance. It complements — not replaces — the dockerized HA e2e suite ([architecture](../architecture/), change 0005). Storybook MUST land **before** the design-system, theming, and card-option implementations so that all of that work is developed and reviewed as stories first.

**Status: specified, not yet implemented.**

## Background

Today the only ways to see a card are unit-test DOM assertions and a full HA round-trip (`npm run dev` + configured HA instance). That makes visual iteration slow and design review nearly impossible. With free card resizing, four layout tiers, three built-in themes, and a per-card option surface arriving (see [design-system](../design-system/), [theming](../theming/), [entity-cards options](../entity-cards/options/common.md)), the state space explodes — a workshop with a story per meaningful state is the only way to keep it reviewable.

## Requirements

### Setup

- Storybook MUST use the Vite builder (`@storybook/react-vite`) with its own Vite config, reusing the project's TS path aliases (`~/*`) and installing no changes to the panel build.
- `npm run storybook` MUST serve the workshop locally (host `0.0.0.0` per workspace conventions) and `npm run build-storybook` MUST produce a static build.
- Stories MUST be colocated with components as `*.stories.tsx` and excluded from the dev-panel rebuild watcher, Vitest coverage, and the production panel bundle.
- Storybook MUST run against mocked data only; it MUST NOT require network access or a Home Assistant instance.

### Global decorators & toolbar

- A global decorator MUST wrap every story in the panel's providers: Radix `Theme` plus the Liebe token layer, mirroring the [theming injection order](../theming/) (base → theme → user) so stories render exactly as the panel does. Because Storybook renders in a normal document (no shadow DOM), the decorator MUST inject the same style set at the preview-document level.
- Toolbar controls MUST include:
  - **Theme**: registry-driven — the toolbar MUST offer exactly the themes currently registered in the built-in registry, so it needs no workshop changes as themes land (only `default` exists until change 0013 registers `liquid-glass` and `lcars`).
  - **Appearance**: `dark | light` (disabled/forced for single-appearance themes).
- A **grid-cell decorator** MUST render card stories inside a fixed-size cell matching real grid metrics (cell height, `--liebe-grid-gap`), with story controls for `width`/`height` spans so every layout tier (`glance`/`row`/`tall`/`full`) is reachable interactively.

#### Scenario: Reviewing a card in LCARS

- **GIVEN** the light card "On" story
- **WHEN** the reviewer switches the theme toolbar to LCARS
- **THEN** the story re-renders with LCARS tokens and scoped rules applied, no story-side changes needed.

### Entity data mocking

- A fixture module MUST provide `HassEntity` factories per supported domain (sensible attributes: brightness, hvac modes, positions, media metadata, device classes), each accepting overrides.
- A store decorator MUST seed the entity store(s) with a story's fixtures and mark the connection as established, so cards read state through their normal hooks (no card-side test props).
- Service calls MUST be intercepted and logged as Storybook actions; stories MUST NOT attempt real WebSocket traffic. Optimistic UI paths (slider drag) MUST behave normally against the mock.
- Fixtures are shared infrastructure: the unit-test suite SHOULD migrate toward the same factories to avoid divergent mock shapes.

### Story coverage

- Every card in the registry MUST have a stories file covering at minimum: default/off, active/on, `unavailable`, error, skeleton/loading, and edit-mode — plus every registered variant and each layout tier the card implements. The error story exercises whichever error state the card can actually reach through its normal hooks: a failed service call for control cards; disconnected / entity-not-found / render-error for read-only cards (sensor, weather, person), which have no service-call path.
- Anatomy parts (icon circle, slider, pills, chips, sparkline) MUST each have their own stories, including active/inactive and both orientations where applicable.
- Theme verification: one "gallery" story per built-in theme rendering a representative screen of mixed cards (the acceptance surface for theme changes).
- New cards and new per-card options MUST NOT merge without corresponding stories (review-gated; see change document).

#### Scenario: New option arrives with stories

- **GIVEN** a PR adding a `showColorTempControl` option to the light card
- **WHEN** it is reviewed
- **THEN** it includes a story (or story controls) demonstrating the option in both states, or the review requests changes.

### Accessibility & interaction checks

- The a11y addon MUST run on all stories; violations at the "serious"/"critical" level SHOULD be treated as defects.
- Stories SHOULD use `play` functions for key interactions (toggle, slider commit, mode select) with assertions via `@storybook/test`; the Storybook test-runner in CI is OPTIONAL initially (see Open Questions).

### CI & publishing

- CI MUST build Storybook (`build-storybook`) on every PR; a broken workshop build fails the pipeline.
- The static build MUST be published to GitHub Pages under `/storybook/` alongside the panel bundle by the existing deploy workflow (matching change 0009's mandatory publishing task), so every merge to `main` refreshes a browsable workshop.

#### Scenario: Broken story blocks merge

- **GIVEN** a PR that renames a component export a story imports
- **WHEN** CI runs
- **THEN** `build-storybook` fails and the PR cannot merge until the story is fixed.

## Design

```
.storybook/
├─ main.ts        framework: @storybook/react-vite; stories: src/**/*.stories.tsx; addons: essentials, a11y
├─ preview.tsx    global decorators: ThemeProvider(tokens+theme layers) · StoreSeed · GridCell
│                 globalTypes: theme, appearance toolbars
src/test/fixtures/  entity factories per domain + screen-level fixture sets
                    (shared with Vitest — outside .storybook/ so the unit suite
                    imports the same factories; excluded from coverage scope)

src/components/LightCard.stories.tsx   (colocated, one file per card/part)
```

Sequencing (the point of this spec): Storybook + fixtures + stories for the **existing** cards land first, ahead of the design-system implementation. The design system, themes, and per-card options are then developed story-first, with the HA e2e suite validating integration at the end. See the change document for tasks.

## Constraints

- Stories/fixtures MUST be excluded from Codecov patch scope (they are development tooling, not product code) — the exclusion is part of the setup change, not a per-PR decision.
- Storybook's preview must not import panel bootstrap code with side effects (custom element registration, HA connection); providers must be importable in isolation — any refactor needed for that is part of the setup change.
- Dev server binding and URL reporting follow the workspace's Tailscale conventions.
- All gates in [architecture — Testing & Quality Conventions](../architecture/index.md#testing--quality-conventions) apply to implementing changes.

## Open Questions

- **Visual regression.** Chromatic or Playwright-based snapshot testing of stories would harden theme changes but adds cost/flake surface; deferred — the theme gallery stories keep review manual for now.
- **Test-runner in CI.** Whether `@storybook/test-runner` (play-function execution) joins CI as a required gate after initial adoption, or interaction coverage stays in Vitest.
- **Storybook major version.** Pin to the current stable major at implementation time; verify Vite version compatibility with the repo's toolchain in the setup PR.

## References

- Related specs: [design-system](../design-system/), [theming](../theming/), [entity-cards](../entity-cards/) (+ [options](../entity-cards/options/common.md)), [architecture](../architecture/)
- Change document: [0009-storybook-setup](../../changes/0009-storybook-setup.md)

## Changelog

| Date       | Change               | Document                                                      |
| ---------- | -------------------- | ------------------------------------------------------------- |
| 2026-07-25 | Initial spec created | [0009-storybook-setup](../../changes/0009-storybook-setup.md) |
