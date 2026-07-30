# 0033: Icon-Only Cards

## Summary

Add the universal `iconOnly` display option: any card reduces to its centred icon on a tile that itself carries the active/inactive state tint — a 1×1 light becomes a full-tile icon whose background follows on/off/level. The option contract lives in [options/common — icon-only presentation](../specs/entity-cards/options/common.md#icon-only-presentation-icononly); the tile-tint exception in [design-system — card anatomy](../specs/design-system/index.md#card-anatomy).

**Spec:** [entity-cards](../specs/entity-cards/) (options/common), [design-system](../specs/design-system/), [theming](../specs/theming/)
**Status:** complete
**Depends On:** —

## Motivation

`hideName` + `hideState` already yields an icon-only tile — but only for cards whose content is the meta lines. Cards with bespoke interiors (weather forecasts, sensor graphs, media transport, the thermostat dial) keep rendering them, so there is no way to make an arbitrary card a compact glyph tile. And the resulting tile is inert visually: the tile never tints, so an icon-only light shows a 40px circle changing colour inside a large neutral tile instead of the tile itself reading as the state — the treatment users know from every polished HA dashboard's icon tiles.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before each PR.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.
- Danger-floor behavior MUST be covered wherever it is touched (the existing display-suite pattern).

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Options/common — icon-only presentation](../specs/entity-cards/options/common.md#icon-only-presentation-icononly) owns the option's behavior and its scenarios; [design-system — card anatomy](../specs/design-system/index.md#card-anatomy) owns the tile tint pattern. Those scenarios are this change's acceptance criteria and are not restated here. What this change owns:

- **Suppression mechanism**: content suppression is enforced at the composition seam (shell + card body), not by asking each of 20+ cards to check a flag — the card-body slots render only the lead under `iconOnly`, and card-rendered content outside the body (backdrops, overlays, badges) is fenced by the shell.
- **Cards and variants that bypass the seam need explicit icon-only forms.** The seam only reaches what renders through the card body, so an audit of every registered card **and variant** for the two ways it can miss — rendering its own layout instead of `CardBody`, or rendering no icon slot — is part of this change, not an afterthought. Known cases at the time of writing: the climate `dial` variant (`ClimateDial.tsx` renders neither `CardBody` nor `GridCard.Icon`, and legacy climate cards are pinned onto it by 0017's migration, so it is a shipped configuration, not an edge case) and the weather `minimal` variant (renders no icon at all); the anchor exceptions the option contract names (camera thumbnail, person avatar, sensor icon fallback) already have an icon-form fallback to reuse. Every card resolving an icon-only form is the acceptance bar the spec sets — the audit exists so the list above being incomplete is caught by the work rather than by a blank tile in production.
- **Key registration** across the same six display-option surfaces as every prior key (registry, schema, defaults, form, round-trip, danger floor — where `iconOnly` joins the reverted set).
- **Tile tint delivery**: `data-active` and the hue custom-property plumbing already on the tile carry the colour; the base stylesheet gains the tile-scale tint rules. Level modulation reads the same normalized level the cards already compute (brightness %, fan %, cover position).
- **The tint MUST NOT key off the existing `data-icon-only` attribute.** That attribute is already stamped for the derived `hideName` + `hideState` case (`GridCard.tsx` — `isIconOnly = display.hideName && display.hideState`) and means only "centre this tile's content"; hanging the tint on it would tint every legacy both-hidden card, which is exactly what the contract's unchanged-tiles scenario forbids. The tint therefore rides only on the option's own contract marker (next bullet); the derived attribute keeps its current meaning and its current neutral tile.
- **Stable selector contract**: the marker's name, semantics and presence guarantee are owned by [theming — stable selector contract](../specs/theming/index.md#stable-selector-contract) (`data-icon-tile`, recorded there as specified-not-yet-stamped). This change stamps it and moves it to the contract's stamped set, updating that spec's status and changelog when it does.
- Stories per convention 6: icon-only across a control card (light on/off/level), a read-only card (weather), and the danger reversion.

The legacy-compatibility acceptance criterion lives with the contract, not here: [options/common — Scenario: Existing hideName+hideState tiles are unaffected](../specs/entity-cards/options/common.md#scenario-existing-hidenamehidestate-tiles-are-unaffected).

## Design

### Approach

- `src/store/cardDisplay.ts`, `configurations/universalOptions.ts`, `configSchema` — key end to end; danger floor gains `iconOnly`.
- `src/components/GridCard.tsx` / `CardBody.tsx` — `iconOnly` from display context collapses body slots to the lead; shell fences non-body layers; the option stamps its own tile marker alongside the existing derived `data-icon-only`, which keeps stamping (and meaning) exactly what it does today.
- `src/components/GridCard.css` / `anatomy.css` — tile-scale tint rules (active tint / neutral inactive / transition / level modulation via a custom property).
- Per-card anchors: `CameraCard` (thumbnail tile), `PersonCard` (avatar), `SensorCard` (icon fallback) route their existing icon-form fallbacks through the option.
- Seam bypasses: `ClimateDial.tsx` and `WeatherCardMinimal.tsx` gain an icon-only form (the glyph their sibling variants already resolve for the same entity — the compact layout's, reached by the delegation the dial already uses below `full`, and the weather condition glyph respectively), reached before their own layout runs. The audit added a third the list above did not have: `InputNumberCard`'s `glance` lead is its reading rather than a glyph, so it takes the same icon fallback the sensor card took in the first task.
- Theming spec contract edit + `themeStructure`/stylesheet tests.
- Tests: display suite (suppression per card family via the tier-layout test harness), tile tint + level modulation, danger reversion, round-trip.

### Decisions

- **Boolean, not a select**: it joins the `hideName`/`hideState` family and composes with them; a future "minimal" density would be a different option, not a third value of this one (convention 5 weighed — no plausible third value shares this key's semantics).
- **Suppress at the seam, not per card**: the 0014 lesson ("a card cannot forget to honour an option it never sees") applies with more force here, where forgetting means a forecast bleeding through an icon tile.
- **Level modulates tint strength, not hue**: hue stays the domain/bulb resolution; strength is the one-dimensional signal a background can carry without breaking the colour discipline.
- **PR split**: (1) option + total suppression + centred icon; (2) tile state tint + level modulation + contract promotion.

### Non-Goals

- No background slider (change [0034](./0034-slider-placement.md) — composes, not contained).
- No badge/overlay "mini" content on icon-only tiles (future option if demanded).

## Tasks

- [x] `iconOnly` option end to end with seam-level content suppression, centred icon, per-card anchors (camera/person/sensor), danger-floor reversion; display + round-trip tests, suppression coverage across card families, stories
- [x] Audit every registered card and variant for seam bypass (own layout instead of `CardBody`, or no icon slot) and give each one its icon-only form — climate `dial` and weather `minimal` included; a test asserting every registered card and variant resolves exactly one identity anchor under `iconOnly` — the glyph for most cards, the thumbnail or avatar for the cards the contract exempts — with all other content suppressed
- [x] Tile state tint: active/inactive tile treatment on the option's own marker (never the derived `data-icon-only`), colour resolution reuse (incl. bulb colour), level modulation, the new marker promoted into the theming stable selector contract (spec + changelog + structure tests), a regression test that a legacy `hideName` + `hideState` tile stays neutral, tint stories

## Open Questions

—

## References

- Spec: [options/common — icon-only presentation](../specs/entity-cards/options/common.md#icon-only-presentation-icononly), [design-system — card anatomy](../specs/design-system/index.md#card-anatomy), [theming — stable selector contract](../specs/theming/index.md#stable-selector-contract)
- Related changes: [0014-universal-card-options](./0014-universal-card-options.md), [0032-card-content-alignment](./0032-card-content-alignment.md) (composes)
