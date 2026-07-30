# 0029: Workshop Tier Fidelity

## Summary

Make the Storybook grid-cell decorator derive the layout tier from the configured cell span — exactly as the grid renderer does — and reconcile every card story whose hand-set `tier` arg contradicts its cell size. The rule this implements now lives in [storybook — global decorators](../specs/storybook/index.md#global-decorators--toolbar).

**Spec:** [storybook](../specs/storybook/)
**Status:** complete
**Depends On:** —

## Motivation

The grid-cell decorator sizes the cell but never derives a tier, so every story renders whatever `tier` arg it was given regardless of the cell — most card stories default to `tier: 'row'` inside a 2×2 cell that the real grid would render as `full`. Whole classes of tier-dependent rendering are therefore unrepresented in the workshop: the light card's vertical slider never appears unless a story explicitly asks for `tall`, and resizing the cell controls changes nothing. The theme gallery already derives the tier correctly; the per-card stories are the surface that decoupled it. The workshop's purpose is to show what the panel shows — a story surface that renders combinations the grid cannot produce fails design review and hid the slider bugs 0028 fixes.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before the PR; the CI `build-storybook` gate MUST stay green.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

The [storybook spec](../specs/storybook/index.md#global-decorators--toolbar) owns the decorator rule and its escape hatch — not restated here. What this change owns:

- The decorator MUST reuse the production tier derivation (`deriveCardTier`) — not a copy — so a boundary change in the renderer flows to the workshop automatically.
- **Story audit:** every card stories file is reconciled — cell spans become the driver, hand-set `tier` args are removed or their cells resized to agree (e.g. the light stories' `tier: 'row'` default inside a 2×2 cell becomes a 2×1 cell). Explicit tier stories (`TierGlance` etc.) keep their names but get matching cells.
- Play-function assertions keyed to a story's old mismatched tier MUST be updated with the story, not loosened.
- A test MUST pin the decorator's derivation by **executing the decorator** and observing the tier and span it supplies, and it MUST be one a merge gate executes — a Vitest test. A Storybook `play` assertion does **not** satisfy this: the repo runs no Storybook test runner, CI only runs `build-storybook`, so play functions execute in neither `npm test` nor CI and an assertion no gate executes is documentation rather than verification ([REVIEW.md](../../REVIEW.md), and [#259](https://github.com/fx/liebe/issues/259), where exactly that hid a false assertion). Play assertions MAY be added on top; they cannot be the pin.

Acceptance is the spec's own scenario, [storybook — cell controls drive the tier](../specs/storybook/index.md#scenario-cell-controls-drive-the-tier), exercised against the `gridWidth`/`gridHeight` story controls.

## Design

### Approach

- `.storybook/decorators.tsx` — `withGridCell` computes `tier` (and the span pair) from `gridWidth`/`gridHeight` via `src/utils/cardTier.ts` and injects them into the story args/props; the standalone `tier` argType becomes either derived-readonly or an explicit override that also drives the cell.
- Audit all `*.stories.tsx` under `src/components/` for `tier:` args (light, cover, fan, sensor, weather, climate, media player, etc.): drop redundant args, fix inconsistent cells, keep the theme gallery as-is (already correct).
- Add the decorator derivation test as a Vitest test that **executes `withGridCell` itself** and observes the `tier`/`span` it hands the story. Testing `deriveCardTier` directly does not pin this change — that helper is already correct and already tested; the defect is that the decorator never calls it, so a helper-level test stays green against the very wiring this change fixes.

### Decisions

- **Derive in the decorator rather than delete the `tier` arg everywhere**: some stories legitimately frame artificial comparisons (tier grids); the spec's escape hatch (override must size its cell to match) keeps those honest without forbidding them.
- **One PR**: the decorator change and the story audit are inseparable — landing the decorator alone would flip mismatched stories to new tiers and break their play assertions.

### Non-Goals

- No new stories for the polish features (each polish change ships its own, per common convention 6).
- No slider fixes — [0028](./0028-slider-rendering-fixes.md) is independent and orthogonal.

## Tasks

- [x] Derive the tier in `withGridCell` from the cell span via the production derivation; audit and reconcile every card story's `tier`/cell combination; update affected play assertions; add the gate-executed (Vitest) decorator derivation test

## Open Questions

—

## References

- Spec: [storybook](../specs/storybook/index.md#global-decorators--toolbar), [design-system — size-adaptive layouts](../specs/design-system/index.md#size-adaptive-layouts)
- Related changes: [0009-storybook-setup](./0009-storybook-setup.md), [0011-layout-tiers](./0011-layout-tiers.md)
