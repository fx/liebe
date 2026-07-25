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

- Tier derivation MUST follow the spec table (1×1 glance; ≥2 wide × 1 tall row; 1 wide × ≥2 tall tall; ≥2×≥2 full), computed from the item's **effective rendered span** — the responsive-scaled dimensions `GridLayoutSection` actually lays out at the active breakpoint (stored width scaled by `effectiveColumns / resolution.columns`), not the stored dimensions — and provided to cards by the renderer (cards MUST NOT read the DOM to infer size). A stored 2×1 item on a 12-column screen rendered on a 4-column mobile grid occupies one effective cell and MUST receive `glance`, not `row`; the tier MUST re-derive when the breakpoint/effective column count changes.
- Every card MUST implement `glance` and `row`; cards whose option docs specify `tall`/`full` implement those layouts (content placement only — controls that don't exist yet render nothing). **Exception: `CameraCard`** — its sub-2×2 degradation is behavioral, not layout (stream unmount, still thumbnail, lazy-mount fullscreen) and is owned by change [0021](./0021-camera-presentation-options.md); under this change the camera card keeps its current rendering at every span, receiving its `data-tier` stamp without consuming it.
- Content that does not fit a tier MUST be omitted, never clipped or scrolled (spec MUST).
- **No operability regression at any merge point**: `glance` layouts remove embedded controls, and their replacement interaction path (whole-tile actions and the more-info dialog with domain controls) arrives with [0014](./0014-universal-card-options.md) — which is why this change **depends on 0014** (acyclic at change granularity: 0010 → 0014 → 0011; 0014 works against the legacy `size` prop and needs nothing from this change). A responsive 1×1 card MUST be operable on every mainline commit: either its old control is still present or the new tap/dialog path already works. Concretely: cards whose glance operability comes from a whole-tile tap (light, switch, input_boolean, cover, fan, sensor more-info, …) drop embedded controls in this change; cards whose glance operability depends on **dialog-registered controls that arrive later** (climate and the non-boolean input helpers — registrations land in 0017/0022 against 0014's initially-empty slot) MUST **retain their current minimal control in `glance`** under this change, and their per-card change completes the control-free glance layout in the same PR that registers the dialog controls.
- The `size` prop MUST be removed from `CardProps`; `GridCard`'s size-based `minHeight`/padding/font scaling is replaced by tier-driven layout. Persisted configurations are unaffected (dimensions are already stored; nothing to migrate — verify against [dashboard-config](../specs/dashboard-config/index.md) and record the audit result, closing the spec's open question).
- **Non-grid consumers MUST be migrated in the same change** — cards render outside `GridView` too, and removing `size` breaks them otherwise: the `CardConfig` preview (currently `size="medium"`) MUST derive tier + effective span from the item's stored dimensions **scaled through the same responsive mapping `GridLayoutSection` applies at the current viewport breakpoint** (stored dimensions alone would preview `row` for an item actually rendering `glance` on a 4-column mobile grid), and `QuickControlsWidget` (currently `size="small"`) MUST pass an explicit `row` tier with a 2×1 effective span. Cards therefore accept tier/span as props from any renderer; `GridView` is the only place that _derives_ them from a grid layout.
- `data-tier` MUST be stamped on `liebe-card` for themes/tests.

#### Scenario: Shrinking a card simplifies it

- **GIVEN** a light card at 2×1 (`row`) showing its existing brightness slider
- **WHEN** the user resizes it to 1×1 in edit mode
- **THEN** it re-renders as `glance` (icon + name + state, no slider) with the whole tile toggling, and restoring 2×1 restores the slider — using only controls that exist at this stage (new controls arrive in 0016+).

#### Scenario: Boundary span

- **GIVEN** a card resized to 3×1
- **WHEN** the tier is derived
- **THEN** it is `row` (≥2 wide, 1 tall), covered by a unit test alongside 1×2 → `tall` and 2×2 → `full`.

## Design Decisions

- **Renderer-computed tier, effective span exposed by the layout layer** — the responsive effective dimensions exist only inside `GridLayoutSection` (stored width scaled to the breakpoint's column count), so its child render callback MUST expose the effective `{width, height}` alongside the item; `GridView` derives the tier there — one derivation site, passed as a prop — and forwards **both** the tier and the effective span to cards. The span matters because some card contracts key on width beyond the tier boundary (e.g. wider `row` variants at ≥3 or ≥4 effective columns); tier alone is lossy. Cards stay pure and the boundary table stays unit-testable in isolation.
- **Layout-first, options-later** — per-card changes (0016+) add controls into already-existing tier slots, keeping each of those PRs small.
- **`SkeletonCard`/error/unavailable states** MUST also respect tiers (a 1×1 skeleton is a small tile, not a truncated large one).

## Tasks

- [ ] **PR 1 — Derivation + plumbing**: tier util + unit tests; `GridLayoutSection` exposes effective `{width, height}` through its child callback; `GridView` derives the tier and passes tier + effective span to cards; `data-tier` stamped; `size` prop removed from `CardProps` and `GridCard`; skeleton/error states tier-aware
- [ ] **PR 2 — Existing cards, simple set**: sensor, binary sensor, switch/button, input helpers — glance/row (+full where specified) layouts + tier stories
- [ ] **PR 3 — Existing cards, control set**: light, climate, cover, fan, weather — tier layouts per option docs (existing controls only) + tier stories; camera receives only its `data-tier` stamp and a derivation test (all camera tier consumption, including sub-2×2 degradation, is 0021's per the functional-requirement exemption); e2e resize flow; dashboard-config audit note in spec changelog

## Out of Scope

- New controls or options (0014+), new cards (0023+), theming (0012/0013).
