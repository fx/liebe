# 0034: Slider Placement Options

## Summary

Add the shared `sliderPlacement` option to the slider-bearing cards (light brightness, cover position, fan speed): force the slider's orientation in the tiers that render one, or render it as the card surface itself in every tier — the whole tile becomes the slider, edge to edge, with the card's content overlaid (tier interaction per the owning contract). The shared contract lives in [options/common — shared slider placement](../specs/entity-cards/options/common.md#shared-slider-placement-sliderplacement); the background placement's anatomy in [design-system — background slider placement](../specs/design-system/index.md#background-slider-placement).

**Spec:** [entity-cards](../specs/entity-cards/) (options/common, options/light, options/cover, options/fan), [design-system](../specs/design-system/)
**Status:** draft
**Depends On:** 0028, 0033

## Motivation

Slider placement is tier-automatic with no override: users who want a vertical dimmer on a wide tile, or a horizontal one on a tall tile, have no lever. And the most requested compact form — the Mushroom-style card-as-slider, where the tile's fill _is_ the brightness — has no equivalent, which also blocks dimmable 1×1 tiles (`glance` never shows a slider because it has no room; background placement needs none).

Dependencies: [0028](./0028-slider-rendering-fixes.md) because forcing orientations multiplies the vertical slider's exposure, so its rendering defects must be fixed first; and [0033](./0033-icon-only-cards.md) because PR 2's `background` + `iconOnly` composition — required by the option contract and by this change's stories — cannot be built or tested until the `iconOnly` option exists.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before each PR.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.
- Every dispatch route this change touches carries the boundary-level single-call test the common contract mandates (non-retrying, at-most-once per gesture, early-acknowledgement case included).

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Options/common — shared slider placement](../specs/entity-cards/options/common.md#shared-slider-placement-sliderplacement) owns the key contract and the background gesture semantics with their scenario; [design-system — background slider placement](../specs/design-system/index.md#background-slider-placement) owns the visual anatomy; the three per-card docs own their domain nuances. None of that is restated here, and those scenarios are this change's acceptance criteria. What this change owns:

- **One implementation of the contract, three consumers**: placement resolution and the background gesture machinery live in shared code (option read + shell/slider layer), with the cards contributing only their existing value/commit/colour bindings — three parallel implementations is how the shared semantics would drift.
- **Gesture discrimination is the risk center**: the drag/tap split MUST be built on the same press pipeline that already distinguishes tap/hold/double-tap (0014's action system), with an explicit travel threshold; tests MUST cover tap-without-travel → action, drag → commit-without-action, hold-during-touch → hold action, and drag-ending-outside-tile → commit.
- **Cover safety**: [options/cover](../specs/entity-cards/options/cover.md) owns which routes the `confirmOpen` gate confirms and how unclassifiable routes resolve; this change wires the background-drag commit through that existing gate as one more position-commit route and carries the route's tests, including the unknown-position conservative case.
- **No migration**: `auto` reproduces today's behavior; the key is additive (common convention 7's additive class).
- An e2e exercise of background placement on the real grid (drag adjusts, tap toggles) beside the existing tier-resize spec.
- Stories per convention 6: each value on each of the three cards, background at `glance` and `full`, background+`iconOnly` composition.

## Design

### Approach

- `src/store/` — a shared placement option module (read/validate/default) consumed by `lightOptions`/`coverOptions`/`fanOptions`-level reads; config-form select added per card's definition.
- `src/components/anatomy/Slider.tsx` + `anatomy.css` — a background variant of the slider anatomy: absolutely-filled track behind the card body, fill-direction from the effective span (per the design-system placement rule), leading edge; `GridCard` hosts it behind content the way the media backdrop mounts behind the body.
- Forced orientation: placement resolution feeds the existing `orientation` prop the cards already set from tier — but the prop alone is not sufficient outside `tall`. A vertical slider's **length comes from its host**, not from itself (`anatomy.css` gives it `block-size: 100%` and the inline axis the control-height token), and only `tall`'s fill band establishes a definite block size for that percentage to resolve against; dropped into a `row`/`full` line the track collapses. So forcing `vertical` in those tiers MUST also give the slider a definite long-axis size — the arrangement adopting the fill band's sizing contract for the forced case, rather than the orientation prop being flipped in isolation. The mirror case (`horizontal` forced in `tall`) is the easy direction: the horizontal track already takes its length from the inline axis the band gives it.
- Gesture layer: pointer handling shared with the action system's press pipeline; drag claims the pointer past the travel threshold and suppresses the action resolution for that gesture.
- Tests: shared placement module, per-card orientation forcing (tier-layout suite), gesture discrimination suite, cover gate routing, e2e. Forced-orientation **geometry** is locked where jsdom cannot measure it (the 0028 pattern): stylesheet-level assertions that a forced vertical slider in `row`/`full` receives a definite long-axis size (a bare `orientation` flip collapses it) and that horizontal-in-`tall` keeps a definite width, plus a browser-level (e2e) bounding-box check for one forced placement.

### Decisions

- **Contract defined once in options/common, not per card**: identical semantics in three docs would drift; per-card docs carry only their domain nuances. (Matches the spec structure added for this change.)
- **Fill direction from the effective span, not measured pixels**: the span is an input the card already receives and is settled before first interaction, where a pixel aspect would need a measurement the size contract forbids; the design-system placement section owns the rule (wider-than-tall in cells → horizontal, otherwise — squares included — vertical). An override option can follow demand.
- **Background is placement, not a card variant**: it reuses the card's slider bindings verbatim, so 0%-commit-off, turn-on-implied, optimistic drag and colour resolution hold without restatement.
- **PR split**: (1) option + forced orientations (small, pure layout); (2) background placement (gesture machinery, safety gating, e2e).

### Non-Goals

- No placement option for secondary sliders (light colour-temperature, media volume/seek) — primary slider only; media player's `tall` question stays open in its own doc.
- No changes to slider value semantics, dispatch guarantees, or capability gating.

## Tasks

- [x] `sliderPlacement` option with forced `horizontal`/`vertical`: shared placement module, per-card config rows (light/cover/fan), tier-suite orientation tests plus the stylesheet/e2e geometry locks for forced placements, stories per value
- [ ] `background` placement: card-surface slider anatomy, gesture split on the shared press pipeline (travel threshold; tap/hold/double-tap preserved), cover `confirmOpen` routing, `iconOnly` composition, gesture + gate tests, e2e on the real grid, stories

**Sequencing with [0042](./0042-tall-tile-control-geometry.md).** The forced placements land the omission path only on the axis the shell already publishes — the content width — which covers a forced `horizontal` slider at `tall`, the case with a real symptom. The **long axis of a forced `vertical` slider outside `tall` is not bounded here**, because nothing publishes the height its band gets and a card may not measure the DOM for it; establishing that capacity signal is 0042 PR 3's, for every vertical slider rather than only the forced ones. Until it lands a forced vertical control shortens with its band rather than overflowing it, so the failure mode is a short control and never a clipped one.

## Open Questions

- [ ] **Fill-direction override** — square spans are defined (vertical, per the design-system rule); whether an explicit direction option is still wanted for taste is deferred until real usage.
- [ ] **`input_number` as a fourth consumer** — its `controlStyle: slider` renders the same slider anatomy, so the contract fits it mechanically. What is undecided is the interaction with `controlStyle` itself, which already follows the helper's `mode` attribute: whether placement is a second independent key there, or whether the helper's own attributes should keep deciding. Answering it belongs to [options/input-helpers](../specs/entity-cards/options/input-helpers.md), so this change scopes to the three domain-control cards and the contract stays open to the fourth.

## References

- Spec: [options/common — shared slider placement](../specs/entity-cards/options/common.md#shared-slider-placement-sliderplacement), [design-system — background slider placement](../specs/design-system/index.md#background-slider-placement), [options/light](../specs/entity-cards/options/light.md), [options/cover](../specs/entity-cards/options/cover.md), [options/fan](../specs/entity-cards/options/fan.md)
- Related changes: [0028-slider-rendering-fixes](./0028-slider-rendering-fixes.md) (dependency), [0014-universal-card-options](./0014-universal-card-options.md) (press pipeline), [0033-icon-only-cards](./0033-icon-only-cards.md) (composes)
- External: Mushroom light card's card-as-slider prior art — https://smarthomescene.com/blog/home-assistant-light-cards-collection/
