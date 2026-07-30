# 0039 — Responsive Drag Layout Integrity

## Summary

Moving or resizing a single card on a narrow screen silently rewrites the stored geometry of **every other card on that screen**. `GridLayoutSection.handleLayoutChange` inverse-scales every item in the layout on any drag or resize, and that round-trip is lossy at the narrow breakpoints: a card stored at `width: 1` on a 12-column screen renders as 1 effective cell on a 4-column phone — the forward scaling floors at one cell, because a card cannot be narrower than that — and coming back, `round(1 × 12 / 4) = 3`. So a card the user saved as 1 wide is written back as 3 wide, the same arithmetic applies to `x`, and it applies to every item rather than only the one that moved. Preserve the original stored `x` and `width` whenever the effective layout still matches what the item would derive to, and inverse-scale only the fields that genuinely moved.

**Spec:** [grid-layout](../specs/grid-layout/index.md) → [responsive column scaling](../specs/grid-layout/index.md#responsive-column-scaling) and [layout-change persistence](../specs/grid-layout/index.md#layout-change-persistence) · **Status:** complete · **Depends on:** —

Supersedes issue [#219](https://github.com/fx/liebe/issues/219).

## Motivation

This is a data-integrity defect, and every property that makes one expensive is present.

It is **silent**: nothing errors, and the phone view looks correct because it re-derives to the same effective cells. The damage is only visible when the dashboard is next opened on a wide screen. It is **persistent**: the rewritten values go to stored config, so a subsequent export carries them — the corruption outlives the session and travels with a shared configuration. It is **cumulative**: each interaction at a narrow breakpoint can widen items again, so a user who tidies their phone layout repeatedly degrades the desktop layout monotonically. And it is squarely in Liebe's usage pattern: a wall-tablet dashboard whose users routinely also open it on a phone is exactly the narrow-breakpoint case.

The arithmetic is entirely pre-existing. Change [0011](./0011-layout-tiers.md) PR 1 lifted the _forward_ scaling into a named `scaleSpanToColumns` utility and did not touch the handler's inverse. The tier work is what made it legible rather than what introduced it: naming the stored-to-effective mapping made the inverse obviously lossy. It was kept out of that PR deliberately — a data-integrity fix with its own test burden folded into a derivation-and-plumbing change would have made both harder to review.

Worth doing before the per-card tier layouts land, since those will have people dragging cards around at every breakpoint to check the layouts — which is the exact interaction that causes the damage.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The regression test MUST assert **byte-identical** stored values for untouched items, not equivalent ones: seed a screen at 12 columns with a mix of stored widths **including 1**, render at a 4-column breakpoint, move one card, and assert every other card's stored `x` and `width` are unchanged. A tolerance-based assertion would pass on the defect for most widths.
- Width 1 MUST be in the fixture. It is the value the floor collapses, and a fixture of widths 2 and above round-trips losslessly and proves nothing.
- The moved item MUST be asserted too: the fix preserves untouched geometry and MUST still persist a genuine move. A test that only checks the untouched items would pass on a handler that persists nothing at all.
- Both `x` and `width` MUST be covered. The same arithmetic corrupts both and a fix applied to one is a plausible half-fix.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

[grid-layout](../specs/grid-layout/index.md) owns the stored-to-effective column mapping, the breakpoint behaviour and the persistence rules — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **The no-op case MUST be exactly lossless.** That is the case causing the damage: the user is not editing those cards at all, so the round-trip must not be involved in their stored values. Preserving the original when the effective layout still matches what the item would derive to is what makes it lossless rather than merely more accurate.
- **Inverse-scale only fields that genuinely moved.** An item whose effective position or span differs from its derivation has been moved and its new value must be scaled back; an item that matches keeps what it had.
- **The forward mapping is unchanged.** `scaleSpanToColumns` and the floor at one cell are correct — a card cannot render narrower than a cell. The defect is entirely in treating that floor as invertible.
- **The grid-layout spec's persistence section MUST state the invariant**, so the property is owned somewhere rather than living only in a test name: an interaction that changes one item MUST NOT alter another item's stored geometry.

## Design Decisions

- **Preserve-when-unchanged, rather than tracking which item the user dragged.** react-grid-layout hands the handler a whole layout, and deriving "which one moved" from the event would couple the fix to the library's callback semantics. Comparing each item's effective geometry against what it would derive to is a local, stateless test that answers the same question and stays correct if the interaction model changes.
- **Do not attempt to repair already-corrupted stored configurations.** A widened card is indistinguishable from a card the user deliberately widened, so a migration would have to guess, and guessing wrong destroys an intentional layout. Stopping the corruption is the fix; existing damage is the user's to correct, and correcting it is a normal edit at a wide breakpoint.
- **Do not disable drag at narrow breakpoints as a mitigation.** It would stop the corruption and remove a legitimate capability — arranging a phone layout — to work around arithmetic. The arithmetic is fixable.

## Tasks

- [x] **PR 1 — Lossless inverse scaling**: preserve stored `x` and `width` for items whose effective geometry still matches their derivation, inverse-scaling only genuinely moved fields; responsive-drag regression test asserting byte-identical stored geometry for untouched items at a 4-column breakpoint with width-1 items present, plus persistence of the moved item; grid-layout spec's persistence section states the one-interaction-one-item invariant; changelog entry

## Out of Scope

- **Repairing existing corrupted stored layouts** — indistinguishable from intentional widths. See Design Decisions.
- **Per-card tier layouts** ([0011](./0011-layout-tiers.md) PRs 2 and 3). This change should land first because those PRs involve exactly the interaction that triggers the defect, but their content is separate.
- **The breakpoint thresholds and column counts themselves.** Not implicated; the mapping is correct in the forward direction.
