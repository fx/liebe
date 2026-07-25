# 0009 — Storybook Setup

## Summary

Stand up the component workshop specified in [storybook](../specs/storybook/index.md): Storybook on the Vite builder, entity fixtures and store-seeding decorators, stories for all **existing** cards and shell components, a11y addon, CI build gate, and GitHub Pages publishing. This change MUST land **before** the design-system, theming, and card-option implementation changes — those are developed story-first against this workshop.

**Spec:** [storybook](../specs/storybook/index.md) · also enables [design-system](../specs/design-system/index.md), [theming](../specs/theming/index.md), [entity-cards options](../specs/entity-cards/options/common.md)

**Status:** draft · **Depends on:** —

## Motivation

Visual work is about to dominate the roadmap (token system, three built-in themes, size-adaptive tiers, per-card options). Today the only render surfaces are unit tests and a full Home Assistant round-trip. A workshop with per-state stories makes that work reviewable, keeps themes honest (the LCARS/Liquid Glass galleries are the acceptance surface), and gives every future card PR a place to demonstrate its options.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST pass before any PR.
- `codecov/patch` MUST be 100% on product code; `codecov/project` MUST NOT regress.
- Stories and fixtures are development tooling: `*.stories.tsx` and `.storybook/`/fixture modules MUST be added to the coverage exclusion list in the same PR that introduces them, so the patch gate measures product code only. This exclusion is part of this change's scope, not a per-PR judgment call.
- Vitest continues to own interaction/unit coverage; Storybook adds a `build-storybook` CI gate (below), not a replacement for tests.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

- `npm run storybook` MUST serve the workshop on `0.0.0.0`; `npm run build-storybook` MUST produce a static build; both MUST work offline with no HA instance.
- Global decorators MUST wrap stories in Radix `Theme` + panel providers, seed entity stores from fixtures, and intercept service calls as logged actions ([spec — mocking](../specs/storybook/index.md#entity-data-mocking)).
- Toolbar MUST offer appearance `dark | light`; the theme toolbar MUST be **registry-driven from the start**: this change ships a minimal theme-registry module (`id`, `label`, appearance support — containing only `default`) that the toolbar enumerates, satisfying the [spec's extensibility rule](../specs/storybook/index.md#global-decorators--toolbar). The theming engine (0012) adopts and extends this module as the runtime registry; themes then appear in the toolbar with no workshop changes.
- A grid-cell decorator MUST frame card stories at real grid metrics with width/height span controls.
- Every **entity card** currently in `domainToCard` (plus registered weather variants) MUST have a stories file covering the entity lifecycle matrix: default, active/on, unavailable, error, skeleton, edit-mode. Non-entity surfaces get their applicable stories instead — `TextCard`/`Separator` (no entity hooks, so no lifecycle states): content/alignment/color variants and edit-mode inline editing; `GridCard` shell parts: their own visual states (selected, loading pulse, error border, edit-mode action cluster).
- The a11y addon MUST be enabled globally.
- CI MUST add a `storybook` job running `build-storybook` on every PR; failure blocks merge.
- The deploy workflow MUST publish the static build to GitHub Pages under `/storybook/` on merge to `main`.
- Storybook's preview MUST NOT import panel bootstrap side effects (custom element registration, HA connection). Any provider extraction needed to achieve this MUST preserve current panel behavior and stay covered.

#### Scenario: Card story renders without Home Assistant

- **GIVEN** a checkout with dependencies installed and no network
- **WHEN** `npm run storybook` opens the LightCard "On" story
- **THEN** the card renders from fixture state, and dragging its brightness slider logs a `light.turn_on` action instead of a network call.

#### Scenario: Broken story blocks merge

- **GIVEN** a PR that breaks a story import
- **WHEN** CI runs
- **THEN** the `storybook` job fails and the PR cannot merge.

## Design Decisions

- **Vite builder, own config** — reuses `~/*` aliases; does not touch the panel build (spec requirement). Pin the current stable Storybook major at implementation time and record it here.
- **Fixtures as shared infrastructure** — entity factories live outside `.storybook/` (e.g. `src/test/fixtures/`) so Vitest can adopt them; stories and unit tests converge on one mock shape over time.
- **Publishing path** — extend the existing Pages deploy (single artifact: panel at root, workshop under `/storybook/`) rather than a second workflow.
- **No visual regression yet** — per spec Open Questions; theme gallery stories carry manual review until the theming work proves the need.

## Tasks

- [ ] **PR 1 — Storybook scaffold + fixtures + first stories**
  - [ ] Add Storybook (react-vite framework), `.storybook/main.ts` + `preview.tsx`, npm scripts; verify `~/*` alias resolution
  - [ ] Extract/verify side-effect-free provider entry for preview use
  - [ ] Entity fixture factories for all currently supported domains (`src/test/fixtures/`)
  - [ ] Store-seeding + service-call-interception decorators; appearance toolbar; grid-cell decorator
  - [ ] Stories: `GridCard` shell (all states) + `LightCard`, `ClimateCard`, `SensorCard`, `BinarySensorCard` (state matrix per spec)
  - [ ] Coverage exclusions for stories/fixtures/.storybook; lint/prettier config extended to new files
- [ ] **PR 2 — Full card coverage**
  - [ ] Stories for `CoverCard`, `FanCard`, `ButtonCard`, `WeatherCard` (all 4 variants), `CameraCard` (mock stream states), all 5 input helper cards, `TextCard`, `Separator`
  - [ ] a11y addon enabled globally; audit and record violations as issues (fixes out of scope)
- [ ] **PR 3 — CI + publishing**
  - [ ] `storybook` CI job (build gate) on PRs
  - [ ] Deploy workflow publishes `/storybook/` to GitHub Pages alongside the panel; verify published URL
  - [ ] Document workshop usage in `docs/specs/storybook/index.md` References (update Changelog)

## Out of Scope

- Design-system tokens, themes, layout tiers, new cards, per-card options (follow-up changes, all story-first against this workshop)
- Storybook test-runner in CI; visual regression (spec Open Questions)

## Open Questions

- None beyond those tracked in the [storybook spec](../specs/storybook/index.md#open-questions).
