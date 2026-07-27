# 0011 — Size-Adaptive Layout Tiers

## Summary

Implement the [design-system layout tiers](../specs/design-system/index.md#size-adaptive-layouts): cards derive a `glance | row | tall | full` tier from their grid span (`data-tier` stamped per the [selector contract](../specs/theming/index.md#stable-selector-contract)) and adapt content instead of scaling. Retires the legacy `size: small|medium|large` card prop. Existing cards get their tier layouts as specified in their [option docs](../specs/entity-cards/options/common.md) — layout only; new controls/options arrive in later changes.

**Spec:** [design-system](../specs/design-system/index.md) · **Status:** complete · **Depends on:** 0010, 0014 (the action system precedes the glance layouts — see the no-operability-regression invariant)

## Motivation

Free resizing is a core Liebe feature, but cards currently render the same layout at every size with a `minHeight` floor. Tier-adaptive content is what makes small tiles legible and big tiles useful, and every per-card change (0016+) assumes it exists.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every card MUST gain stories at each tier it implements (grid-cell decorator spans, [storybook spec](../specs/storybook/index.md)); tier-derivation logic MUST have unit tests including the boundary spans the spec's [boundary-span scenario](../specs/design-system/index.md#size-adaptive-layouts) names (3×1 → `row`, 1×2 → `tall`, 2×2 → `full`).
- The e2e suite MUST verify at least one resize-in-edit-mode flow re-rendering a card across tiers.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [design-system size-adaptive layouts section](../specs/design-system/index.md#size-adaptive-layouts) owns the behaviour: the tier table, the effective-rendered-span definition and its scaling, the omit-never-clip rule, the renderer-computes-and-hands-down rule (including what non-grid surfaces must supply), and the invariant that a tier never removes the last way to operate an entity. What follows is this change's sequencing against those rules — which cards move when, and why the order is what it is:

- The derivation lands first, on its own, so every later PR has one place to read a tier from — see PR 1 below. The rule it implements (renderer-computed tier and effective span, handed to the card, re-derived at the breakpoint) now lives in the [spec](../specs/design-system/index.md#size-adaptive-layouts) alongside the scaling it uses.
- Tier implementation is content placement only at this stage: where an option doc's tier table names a control that does not exist yet, the slot stays empty and the control arrives with that card's own change (0016+). The camera is exempt from the tier layouts entirely — the spec now carries that exception and [0021](./0021-camera-presentation-options.md) owns what replaces it — so here the card gets its stamp and nothing else.
- **The operability invariant is what orders this change**, and the spec states it ([size-adaptive layouts](../specs/design-system/index.md#size-adaptive-layouts) — a tier never removes the last way to operate an entity). The scheduling consequences are this document's: the replacement interaction path (whole-tile actions plus the more-info dialog with domain controls) arrives with [0014](./0014-universal-card-options.md), which is why this change depends on it; the dependency is acyclic at change granularity — 0010 → 0014 → 0011, since 0014 works against the legacy `size` prop and needs nothing from here. Which cards may drop a control here therefore splits in two: those whose glance operability comes from a whole-tile tap (light, switch, input_boolean, cover, fan, sensor more-info) drop theirs in this change, while climate and the non-boolean input helpers — whose replacement is **dialog-registered controls that arrive later**, in 0017/0022 against 0014's initially-empty slot — keep their minimal `glance` control here, and their per-card change completes the control-free layout in the same PR that registers those dialog controls.
- The `size` prop is removed from `CardProps`, and `GridCard`'s size-based `minHeight`/padding/font scaling is replaced by tier-driven layout. Persisted configurations are unaffected — dimensions are already stored — but that had to be **audited and written down** rather than assumed; the result lives in [dashboard-config — Grid Item Mutations](../specs/dashboard-config/index.md#grid-item-mutations) and closes the design-system open question that asked for it.
- **Non-grid consumers migrate in the same change**, since removing `size` breaks them otherwise: the `CardConfig` preview and `QuickControlsWidget` are the two surfaces that render a card outside the grid, and what each must supply is now the spec's ([size-adaptive layouts](../specs/design-system/index.md#size-adaptive-layouts) — the preview shows the tier the card behind it renders at; a fixed-size host supplies its own tier and span, which for the widget is `row` at 2×1). They are named here because they are the migration's blast radius, not because this document defines their behaviour.

## Design Decisions

- **The effective span is exposed by the layout layer rather than recomputed** — the responsive effective dimensions exist only inside `GridLayoutSection`, so its child render callback hands them out alongside the item and `GridView` derives the tier there. The alternative, re-deriving the responsive mapping wherever a tier is wanted, is the same arithmetic in two places and drifts silently. Why the span travels with the tier at all, and why a card never works either out for itself, is the spec's rule ([size-adaptive layouts](../specs/design-system/index.md#size-adaptive-layouts)); the payoff here is that cards stay pure and the boundary table stays unit-testable in isolation.
- **Layout-first, options-later** — per-card changes (0016+) add controls into already-existing tier slots, keeping each of those PRs small.
- **`SkeletonCard`/error/unavailable states land in PR 1**, alongside the derivation rather than after it, because they are the states a card renders while there is no card to render — the tier plumbing is untestable end to end without them. The rules they follow — the placeholder-tier rule and the `glance` error tile's contract — are behaviour and live in the [design-system spec](../specs/design-system/index.md#size-adaptive-layouts); this change only schedules them. They also carry the no-operability-regression invariant above at its sharpest: a `glance` error tile whose `Retry` went nowhere would be the one tile with no way out.

## Tasks

- [x] **PR 1 — Derivation + plumbing**: tier util + unit tests; `GridLayoutSection` exposes effective `{width, height}` through its child callback; `GridView` derives the tier and passes tier + effective span to cards; `data-tier` stamped; `size` prop removed from `CardProps` and `GridCard`; skeleton/error states tier-aware
- [x] **PR 2 — Existing cards, simple set**: sensor, binary sensor, switch/button, input helpers — glance/row (+full where specified) layouts + tier stories, **and a per-card tier assertion for each** (not only a story): PR 1 deleted these cards' `size variants` test blocks as tests of a removed prop rather than of a card, on the condition that real per-card tier coverage lands here
- [x] **PR 3 — Existing cards, control set**: light, climate, cover, fan, weather — tier layouts per option docs (existing controls only) + tier stories, **and a per-card tier assertion for each** (not only a story), replacing the `size variants` blocks PR 1 removed; camera receives only its `data-tier` stamp and a derivation test (all camera tier consumption, including sub-2×2 degradation, is 0021's per the functional-requirement exemption); e2e resize flow; dashboard-config audit note in spec changelog

## Out of Scope

- New controls or options (0014+), new cards (0023+), theming (0012/0013).
