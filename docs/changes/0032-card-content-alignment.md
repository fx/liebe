# 0032: Card Content Alignment

## Summary

Add the universal `alignHorizontal` / `alignVertical` display options — every entity card's content block becomes positionable on both tile axes, applied centrally by the card shell like the existing display options. The option contract lives in [options/common — content alignment](../specs/entity-cards/options/common.md#content-alignment-alignhorizontal--alignvertical).

**Spec:** [entity-cards](../specs/entity-cards/) (options/common)
**Status:** complete
**Depends On:** —

## Motivation

Alignment inside a tile is fixed per tier arrangement (centred column for `glance`, leading row for `row`/`full`, space-between for `tall`) with no user control; the only alignment option in the product is the text widget's, which is not an entity card. Users placing cards on large tiles have no way to anchor content to an edge. The shell already resolves five display options centrally — "a card cannot forget to honour an option it never sees" — and alignment belongs to that seam.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before the PR.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.
- Schema/round-trip changes MUST be exercised through the real import gate (portable-config tests), matching how every prior option key landed.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Options/common — content alignment](../specs/entity-cards/options/common.md#content-alignment-alignhorizontal--alignvertical) owns the pair's behavior; its scenario is this change's acceptance criterion, and none of it is restated here. What this change owns:

- The keys join the universal display option set end to end: display-key registry, per-key tolerant schema, defaults, the shared display config-form fragment, YAML round-trip, and a declared danger-floor stance (alignment survives it, per the owning contract) — the same six surfaces every existing display option touches, so nothing special-cases these two.
- Application is shell-central via stamped attributes + stylesheet rules (the icon-only centring precedent); **no per-card edits** — a card that special-cases alignment is a defect of this change.
- **The application seam MUST be the tile, not only the card body.** The icon-only precedent works because `.liebe-card[data-icon-only]` positions the tile's own content box, which reaches every card whatever it renders inside; rules written only against `CardBody`'s arrangements would silently do nothing for a card that renders its own layout instead (the climate `dial` variant renders without `CardBody` — and legacy climate cards are pinned onto it, so it is a shipped configuration). Body-arrangement rules are the refinement on top, for mapping the values onto the body's own flex axes. An option documented as universal that is inert on a shipped card is a defect of this change, so the bypass audit and its coverage are part of the work — see the parallel audit in [0033](./0033-icon-only-cards.md).
- `auto` MUST be proven unchanged: snapshot-level assertions that a config without the keys renders identical arrangement attributes/styles to today, across all four tiers.
- Stories per common convention 6: both axes, each non-`auto` value, on at least a `glance` and a `full` card.

## Design

### Approach

- `src/store/cardDisplay.ts` — extend `CARD_DISPLAY_KEYS`, defaults, zod fragments (closed enums, per-key tolerance).
- `src/components/configurations/universalOptions.ts` — two select rows in the Display fragment.
- `src/components/GridCard.tsx` — stamp `data-align-h` / `data-align-v` (only when non-`auto`) beside `data-icon-only`.
- `src/components/GridCard.css` / `CardBody.css` — attribute-scoped rules: the tile-level placement first (reaching cards that render their own interior), then the per-arrangement mapping onto the body's flex axes where a card renders through `CardBody` (arrangements map main/cross axes differently; the stylesheet owns that mapping so cards stay ignorant).
- Tests: `cardDisplay` store tests, `GridCard.display.test.tsx` cases (stamping, non-`auto` only, fallback), stylesheet tests for the new rules, portable-config round-trip.

### Decisions

- **Two keys, not one combined value**: axes are independent and the form renders two small selects; a combined nine-value select reads worse and migrates worse if a value is added.
- **`start`/`center`/`end`, not `left`/`top`**: logical properties match the stylesheet's existing logical-axis style and stay correct under any future writing mode; the text widget's `left/right` naming predates the token contract and stays as-is.
- **Attributes stamped only when non-`auto`**: mirrors `data-active`'s presence-only contract and keeps `auto` provably zero-footprint.
- **Not added to the theming stable selector contract**: alignment attributes are layout plumbing, not theme surface; contract promotion can follow demand.

### Non-Goals

- No reordering, resizing, or per-part alignment; no text-widget changes; no `iconOnly` (change [0033](./0033-icon-only-cards.md), which composes with this).

## Tasks

- [x] Universal alignment pair: display-key registry/schema/defaults, config-form selects, shell stamping, stylesheet application at the tile plus per arrangement, an audit that every registered card and variant honours both axes (climate `dial` included), `auto`-unchanged proof, round-trip + display + stylesheet tests, stories

## Open Questions

—

## References

- Spec: [options/common — content alignment](../specs/entity-cards/options/common.md#content-alignment-alignhorizontal--alignvertical)
- Related changes: [0014-universal-card-options](./0014-universal-card-options.md) (the display-option seam), [0011-layout-tiers](./0011-layout-tiers.md) (arrangements)
