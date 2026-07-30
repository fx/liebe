# 0031: Sensor Graph Fill

## Summary

Make the sensor card's history graph claim its tile: the `full`-tier graph grows with the card instead of staying a fixed 72px band, and the `tall` sparkline band spans the tile's width. The rule lives in [options/sensor — tier layouts](../specs/entity-cards/options/sensor.md#tier-layouts) ("the graph claims the tile").

**Spec:** [entity-cards](../specs/entity-cards/) (options/sensor)
**Status:** complete
**Depends On:** —

## Motivation

The sparkline SVG is fully stretchable by construction (`preserveAspectRatio="none"`, non-scaling strokes, percentage-positioned endpoint dot) — the CSS box around it is what pins it. The `full` region is a literal `block-size: 72px`, so a 2×2 and a 6×6 card render the same band while the body's `justify-content: center` turns the surplus into dead space above and below; the graph and footer are plain flex children with nothing set to grow. In `tall`, the band grows vertically but sits inside a centred, shrink-to-fit column, so its width collapses to roughly the big value's text width. The spec already said "large graph … full-width" and pinned no height; the fixed band was a code-side choice. The literals (32px inline, 72px full, 96px dialog) are also outside the token contract — a stylesheet test in this repo exists precisely to keep tier geometry on tokens, and none covers these files.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before the PR.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.
- Geometry that jsdom cannot measure MUST be locked at the stylesheet-source level (this repo's established pattern).

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Options/sensor — tier layouts](../specs/entity-cards/options/sensor.md#tier-layouts) owns the graph-claims-the-tile rule, its per-tier consequences and its scenario — this change's acceptance criteria, not restated here. What this change owns:

- The growth MUST be delivered without disturbing the other cards that share the card-body layout — any new grow rule is scoped to the graph region (or an explicit opt-in), not blanket `extra`-slot behavior, since every card renders `extra` children.
- The `row` sparkline's 32px and the detail dialog's 96px stay fixed **but move onto the tokens the [design-system geometry table](../specs/design-system/index.md#token-contract) now names** — `--liebe-graph-height-inline` and `--liebe-graph-height-dialog`, defaulting to those same literals so no theme or card changes appearance. The `full` region's 72px literal is deleted, not tokenised — it becomes flexible.
- Bar-mode rendering at larger tiles keeps its 24-bucket cap (a data choice, unchanged here); wider tiles spread the same buckets.
- A stylesheet test MUST cover `SensorCard.css`/the card-body sheet for the growth rules and the absence of graph-height literals (the gap that let 72px ship unpinned).

Acceptance is the spec's own scenario, [options/sensor — bigger tile, bigger graph](../specs/entity-cards/options/sensor.md#scenario-bigger-tile-bigger-graph).

## Design

### Approach

- `src/components/SensorCard/SensorCard.css` — `full` region becomes `flex: 1 1 auto; min-block-size: 0` (floor via token if needed); `inline` literal moves to `--liebe-graph-height-inline`.
- Card body integration (`src/components/SensorCard/index.tsx`, `CardBody.css`) — let the `full` arrangement's graph region grow: the graph enters a growing slot (or the extra region gains a scoped grow hook), and the `tall` band stretches horizontally (`align-self: stretch` reach for the sensor's control, mirroring the existing controls escape hatch).
- `src/components/EntityDetailDialog/DetailHistory.tsx` — `GRAPH_HEIGHT` onto `--liebe-graph-height-dialog`.
- Tests: new stylesheet test for `SensorCard.css` + body growth rules; placement tests extended in `SensorCard.test.tsx`; stories at 2×2 and 3×3 `full` (none exists above 3×2 today).

### Decisions

- **Grow the region, keep the SVG untouched**: the anatomy already stretches; only boxes change. No `Sparkline` API change.
- **`row` stays line-height** — deliberate per the existing CSS comment and the spec's tier table; only its literal moves to a token.
- **The `full` footer reserves two lines, and is allowed to wrap.** On a fixed tile, "show both extrema", "never reflow when the series lands" and "never clip" cannot all hold for arbitrary text: `unitOverride` takes any string, so no fixed reservation is total. Of the three, showing both extrema is the tier table's `MUST`, so the footer wraps rather than ellipsizing; the reservation is **two** lines because "Min 0.0 °C · Max 9.0 °C" is wider than the card's own default 2×2 tile, making two the height at the commonest `full` size rather than a pessimistic guess. A single line is centred in the reserved box, so a wide tile shows no gap. What remains is that a long enough unit wraps to three and costs the graph one line — the cheapest of the three failures, and the only one that neither hides a reading nor clips one.
- **The `tall` band's width is an explicit `CardBody` opt-in** (`stretchControlBand`), not a `:has()` reach from the card's stylesheet: the band's fit-content default is what centres a vertical slider on the tile's midline, so the stretch has to be the exception rather than the rule, and [theming — constraints](../specs/theming/index.md#constraints) keeps layout state on data attributes with `:has()` prototype-only.

### Non-Goals

- No graph feature work (axes, gridlines, more points, interactivity); no `graphMode` changes.
- No universal "fill" option — this is the sensor card meeting its own tier table.

## Tasks

- [x] Graph claims the tile: `full` region grows, `tall` band stretches to tile width, loading placeholder reserves the graph-plus-footer region (per the owning tier rule), 32/96px literals onto the `--liebe-graph-height-inline`/`--liebe-graph-height-dialog` tokens (declared with the other geometry tokens), 72px literal removed; stylesheet + placement tests and 2×2/3×3 stories

## Open Questions

—

## References

- Spec: [options/sensor — tier layouts](../specs/entity-cards/options/sensor.md#tier-layouts), [design-system — card anatomy (sparkline)](../specs/design-system/index.md#card-anatomy)
- Related changes: [0018-sensor-cards-to-spec](./0018-sensor-cards-to-spec.md), [0015-history-and-forecast-data](./0015-history-and-forecast-data.md)
