# 0011 — Size-Adaptive Layout Tiers

## Summary

Implement the [design-system layout tiers](../specs/design-system/index.md#size-adaptive-layouts): cards derive a `glance | row | tall | full` tier from their grid span (`data-tier` stamped per the [selector contract](../specs/theming/index.md#stable-selector-contract)) and adapt content instead of scaling. Retires the legacy `size: small|medium|large` card prop. Existing cards get their tier layouts as specified in their [option docs](../specs/entity-cards/options/common.md) — layout only; new controls/options arrive in later changes.

**Spec:** [design-system](../specs/design-system/index.md) · **Status:** draft · **Depends on:** 0010, 0014 (the action system precedes the glance layouts — see the no-operability-regression invariant)

## Motivation

Free resizing is a core Liebe feature, but cards currently render the same layout at every size with a `minHeight` floor. Tier-adaptive content is what makes small tiles legible and big tiles useful, and every per-card change (0016+) assumes it exists.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every card MUST gain stories at each tier it implements (grid-cell decorator spans, [storybook spec](../specs/storybook/index.md)); tier-derivation logic MUST have unit tests including boundary spans.
- The e2e suite MUST verify at least one resize-in-edit-mode flow re-rendering a card across tiers.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [design-system size-adaptive layouts section](../specs/design-system/index.md#size-adaptive-layouts) owns the tier table, the effective-rendered-span definition, and the omit-never-clip rule. This change applies them across the existing cards:

- Tiers are computed by the renderer from the item's effective rendered span (stored width scaled by `effectiveColumns / resolution.columns` at the active breakpoint) and passed to cards as props — cards MUST NOT read the DOM to infer their own size, and the tier MUST re-derive when the breakpoint changes.
- Tier implementation is content placement only at this stage — controls that do not exist yet render nothing. **Exception: `CameraCard`**, whose sub-2×2 degradation is behavioral rather than layout (stream unmount, still thumbnail, lazy-mount fullscreen) and is owned by [0021](./0021-camera-presentation-options.md); here it keeps its current rendering at every span and receives its `data-tier` stamp without consuming it.
- **No operability regression at any merge point.** `glance` layouts remove embedded controls, and the replacement interaction path (whole-tile actions plus the more-info dialog with domain controls) arrives with [0014](./0014-universal-card-options.md) — which is why this change depends on it. The dependency is acyclic at change granularity: 0010 → 0014 → 0011, since 0014 works against the legacy `size` prop and needs nothing from here. Concretely: cards whose glance operability comes from a whole-tile tap (light, switch, input_boolean, cover, fan, sensor more-info) drop embedded controls in this change; cards whose glance operability depends on **dialog-registered controls that arrive later** (climate and the non-boolean input helpers, registered in 0017/0022 against 0014's initially-empty slot) MUST retain their current minimal control in `glance` here, and their per-card change completes the control-free layout in the same PR that registers the dialog controls.
- The `size` prop is removed from `CardProps`, and `GridCard`'s size-based `minHeight`/padding/font scaling is replaced by tier-driven layout. Persisted configurations are unaffected — dimensions are already stored — but the audit against [dashboard-config](../specs/dashboard-config/index.md) MUST be recorded, closing that spec's open question.
- **Non-grid consumers migrate in the same change**, since removing `size` breaks them otherwise: the `CardConfig` preview MUST derive tier and effective span from the item's stored dimensions scaled through the same responsive mapping `GridLayoutSection` applies at the current breakpoint (stored dimensions alone would preview `row` for an item actually rendering `glance` on a 4-column grid), and `QuickControlsWidget` MUST pass an explicit `row` tier with a 2×1 effective span. Cards accept tier and span as props from any renderer; `GridView` is the only place that _derives_ them from a grid layout.

#### Scenario: Boundary span

- **GIVEN** a card resized to 3×1
- **WHEN** the tier is derived
- **THEN** it is `row` (≥2 wide, 1 tall), covered by a unit test alongside 1×2 → `tall` and 2×2 → `full`.

## Design Decisions

- **Renderer-computed tier, effective span exposed by the layout layer** — the responsive effective dimensions exist only inside `GridLayoutSection` (stored width scaled to the breakpoint's column count), so its child render callback MUST expose the effective `{width, height}` alongside the item; `GridView` derives the tier there — one derivation site, passed as a prop — and forwards **both** the tier and the effective span to cards. The span matters because some card contracts key on width beyond the tier boundary (e.g. wider `row` variants at ≥3 or ≥4 effective columns); tier alone is lossy. Cards stay pure and the boundary table stays unit-testable in isolation.
- **Layout-first, options-later** — per-card changes (0016+) add controls into already-existing tier slots, keeping each of those PRs small.
- **`SkeletonCard`/error/unavailable states land in PR 1**, alongside the derivation rather than after it, because they are the states a card renders while there is no card to render — the tier plumbing is untestable end to end without them. The rules they follow — the placeholder-tier rule and the `glance` error tile's contract — are behaviour and live in the [design-system spec](../specs/design-system/index.md#size-adaptive-layouts); this change only schedules them. They also carry the no-operability-regression invariant above at its sharpest: a `glance` error tile whose `Retry` went nowhere would be the one tile with no way out.

## Tasks

- [x] **PR 1 — Derivation + plumbing**: tier util + unit tests; `GridLayoutSection` exposes effective `{width, height}` through its child callback; `GridView` derives the tier and passes tier + effective span to cards; `data-tier` stamped; `size` prop removed from `CardProps` and `GridCard`; skeleton/error states tier-aware
- [x] **PR 2 — Existing cards, simple set**: sensor, binary sensor, switch/button, input helpers — glance/row (+full where specified) layouts + tier stories, **and a per-card tier assertion for each** (not only a story): PR 1 deleted these cards' `size variants` test blocks as tests of a removed prop rather than of a card, on the condition that real per-card tier coverage lands here
- [ ] **PR 3 — Existing cards, control set**: light, climate, cover, fan, weather — tier layouts per option docs (existing controls only) + tier stories, **and a per-card tier assertion for each** (not only a story), replacing the `size variants` blocks PR 1 removed; camera receives only its `data-tier` stamp and a derivation test (all camera tier consumption, including sub-2×2 degradation, is 0021's per the functional-requirement exemption); e2e resize flow; dashboard-config audit note in spec changelog

## Out of Scope

- New controls or options (0014+), new cards (0023+), theming (0012/0013).
