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

The [storybook spec](../specs/storybook/index.md) owns the workshop's observable contract — decorators and entity mocking, the toolbar, story-coverage rules per surface, a11y, the CI gate, and Pages publishing. This change stands that up. What it owns beyond the spec:

- **Scope is the cards that exist today**: every entity card currently in `domainToCard` plus the registered weather variants, and the non-entity surfaces (`TextCard`, `Separator`, `GridCard` shell parts). Cards introduced by 0023–0027 bring their own stories in their own changes.
- **The theme toolbar is registry-driven from the start.** This change ships a minimal theme-registry module (`id`, `label`, appearance support) containing only `default`, which the toolbar enumerates. [0012](./0012-theming-engine.md) adopts and extends that same module as the runtime registry, so later themes appear in the toolbar with no workshop changes — the alternative, a hardcoded toolbar list, would have to be torn out three changes later.
- **The preview MUST NOT import panel bootstrap side effects** (custom-element registration, HA connection). Any provider extraction needed to achieve this MUST preserve current panel behavior and stay covered — this is the one place the change touches production code.
- CI gains a `storybook` job running `build-storybook` on every PR, and the deploy workflow publishes the static build under `/storybook/` on merge to `main`.

## Design Decisions

- **Vite builder, own config** — reuses `~/*` aliases; does not touch the panel build (spec requirement). **Pinned to Storybook 10** (`^10.5.4`, the current stable major), on Vite 7 / React 19. `.storybook/main.ts` sets `framework.options.builder.viteConfigPath` to a dedicated `.storybook/vite.config.ts`, because Storybook otherwise loads the repo's root Vite config — which carries the TanStack Start plugin and the dev-panel plugin that rebuilds `panel.js` on every change.
- **The card registry must not be reachable from a card's module graph.** Standing up the workshop exposed a latent cycle (`cardRegistry` → every card → `CardConfig` → `WeatherCard` → `cardRegistry`) that crashes with a temporal-dead-zone error in any bundle whose entry reaches a card before the registry; the panel bundle only survived it by accident of entry order. Cards therefore declare presentation variants as a static `variants` map on the component (which `getCardVariant` already reads) instead of calling `registerCardVariant` at module scope.
- **Fixtures as shared infrastructure** — entity factories live outside `.storybook/` (e.g. `src/test/fixtures/`) so Vitest can adopt them; stories and unit tests converge on one mock shape over time.
- **Publishing path** — extend the existing Pages deploy (single artifact: panel at root, workshop under `/storybook/`) rather than a second workflow.
- **No visual regression yet** — per spec Open Questions; theme gallery stories carry manual review until the theming work proves the need.

## Tasks

- [x] **PR 1 — Storybook scaffold + fixtures + first stories**
  - [x] Add Storybook (react-vite framework), `.storybook/main.ts` + `preview.tsx`, npm scripts; verify `~/*` alias resolution
  - [x] Extract/verify side-effect-free provider entry for preview use
  - [x] Entity fixture factories for all currently supported domains (`src/test/fixtures/`)
  - [x] Store-seeding + service-call-interception decorators; appearance toolbar; grid-cell decorator
  - [x] Stories: `GridCard` shell (all states) + `LightCard`, `ClimateCard`, `SensorCard`, `BinarySensorCard` (state matrix per spec)
  - [x] Coverage exclusions for stories/fixtures/.storybook; lint/prettier config extended to new files
- [x] **PR 2 — Full card coverage**
  - [x] Stories for `CoverCard`, `FanCard`, `ButtonCard`, `WeatherCard` (all 4 variants), `CameraCard` (mock stream states), all 5 input helper cards, `TextCard`, `Separator`
  - [x] a11y addon enabled globally; audit and record violations as issues (fixes out of scope)
- [ ] **PR 3 — CI + publishing**
  - [ ] `storybook` CI job (build gate) on PRs
  - [ ] Deploy workflow publishes `/storybook/` to GitHub Pages alongside the panel; verify published URL
  - [ ] Document workshop usage in `docs/specs/storybook/index.md` References (update Changelog)

## Out of Scope

- Design-system tokens, themes, layout tiers, new cards, per-card options (follow-up changes, all story-first against this workshop)
- Storybook test-runner in CI; visual regression (spec Open Questions)

## Open Questions

- None beyond those tracked in the [storybook spec](../specs/storybook/index.md#open-questions).
