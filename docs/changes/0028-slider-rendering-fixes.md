# 0028: Slider Rendering Fixes

## Summary

Fix the rendering defects in the embedded slider's vertical form: the fill covering only half the track's width (and being clipped at its edge), and the `input_number` card's `tall` slider getting no travel because it never receives the fill band. A third defect was expected — the vertical slider sitting left-flush instead of centred in a `tall` tile — and measurement during implementation showed it was not happening; see the struck-through bullet under [Motivation](#motivation). The slider anatomy rules these violate now live in [design-system — card anatomy](../specs/design-system/index.md#card-anatomy).

**Spec:** [design-system](../specs/design-system/), [entity-cards options — input-helpers](../specs/entity-cards/options/input-helpers.md)
**Status:** complete
**Depends On:** —

## Motivation

- The vertical slider's fill renders at roughly half the track's width, pushed into one half and clipped by the track's `overflow: hidden` — visibly broken on every `tall` light, cover and fan card. The mechanism: the slider library positions the range with axis insets only (`top`/`bottom` when vertical), leaving the cross-axis position to the static position — which the `tall` card body's inherited `text-align: center` shifts to the track's midline. The workshop's anatomy stage has no `text-align`, so the primitive's own story looks correct while every real `tall` card does not.
- ~~In `tall`, the vertical slider is pinned to the tile's left edge: the fill band centres its child, but the controls wrapper inside it takes full width with no horizontal distribution, defeating the centring.~~ **Not reproducible as described** — corrected during implementation, from measurements in Chromium against every panel stylesheet and the real rendered markup. The controls wrapper does not take full width: `align-items: center` on the `tall` arrangement makes the fill band a fit-content box, so the band hugs the control (both 42px) and the band itself lands centred. The slider was already centred before this change, on every `tall` slider card. What the change adds for the centring rule is therefore a **second** guard (`justify-content: center` on the band's control row, which holds the rule if a future arrangement ever stretches the band) and the tests that pin the primary mechanism — not a fix for an observed defect. See [Decisions](#decisions) for the geometry this uncovered instead.
- `InputNumberCard` passes no control sizing to the card body, so its `tall` slider has no band to grow in and renders with no length — while [options/input-helpers](../specs/entity-cards/options/input-helpers.md) requires a vertical slider filling the middle at `tall`.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom, shared setup polyfills), `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST pass before the PR.
- `codecov/patch` MUST be 100% — every added or changed line covered by tests; `codecov/project` MUST NOT regress.
- Component tests use Testing Library, colocated under `__tests__/`.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Design-system — card anatomy](../specs/design-system/index.md#card-anatomy) owns the slider geometry rules this change makes true, and [options/input-helpers](../specs/entity-cards/options/input-helpers.md) owns the `input_number` `tall` layout — neither is restated here. What this change itself owns:

- The vertical fill's cross-axis position MUST be pinned to the track (not inherited from surrounding text flow), so the fill is immune to any `text-align` an arrangement sets. jsdom does no layout, so this MUST be locked by a stylesheet-level assertion (the `anatomyStyles` pattern) rather than a rendered-geometry one.
- The centring fix MUST NOT disturb horizontal slider layout in `row`/`full` (controls keep their existing distribution there).
- The `input_number` fix is wiring only — the card adopts the same control sizing the light/cover/fan cards pass at `tall`; no option or stored config changes.
- One browser-level geometry assertion MUST pin the regression class: the existing tier-resize e2e (or a sibling) measures that the vertical fill's box spans the track's width and stays inside it.

Acceptance is the owning specs' own scenarios: [design-system — vertical slider fill spans its track](../specs/design-system/index.md#scenario-vertical-slider-fill-spans-its-track) for the fill geometry and centring, and [options/input-helpers](../specs/entity-cards/options/input-helpers.md#input_number)'s `tall` vertical-slider rule for the `input_number` band.

## Design

### Approach

CSS-first, three small fixes plus tests:

- `src/components/anatomy/anatomy.css` — give the vertical `.liebe-slider-fill` an explicit inline-axis anchor (`inset-inline: 0`) so the cross-axis never comes from static position; correct the comment that claims the library writes width/height (it writes inset pairs).
- `src/components/CardBody.css` / `GridCard.css` — centre the controls content within the fill band at `tall` (scoped so `row`/`full` distribution is untouched).
- `src/components/InputNumberCard.tsx` — pass the fill control sizing at `tall` (same contract as light/cover/fan).
- Tests: extend `src/components/anatomy/__tests__/anatomyStyles.test.ts` (vertical fill anchor present), add the `tall`-centring assertion to the card-shell/body stylesheet tests, extend `controlCardTierLayouts.test.tsx` for the `input_number` band, and add the e2e fill-geometry measurement beside `tests/e2e/card-resize-tiers.spec.ts`.

### Decisions

- **Fix at the stylesheet, not by wrapping the range in another element**: the defect is a missing declaration; adding DOM would churn the stable anatomy structure themes target.
  - **Alternatives considered:** neutralising `text-align` on the track (fixes this symptom but leaves the fill's position implicit — the next inherited property would break it again).
- **Stylesheet tests as the unit-level lock**: jsdom cannot measure the bug; the repo's established `anatomyStyles`/`cardShellStyles` source-assertion pattern can, and the e2e adds one real-layout proof.
- **The centring rule is pinned at the stylesheet, not end to end**, because it cannot fail at `tall`. `tall` is one column wide by definition, and on the 12-column desktop grid that column is a 63px tile — 35px of content box inside the 14px card padding — hosting a 42px control. With no leftover inline space, "centred" and "leading-edge flush" are the same place: measured at that width, removing **both** declarations that centre the control does not move it off centre, it shrinks the control to 35px. So `cardBodyStyles` asserts the declarations (mutation-verified), and the e2e asserts the geometry that does distinguish the two states — the control at its `--liebe-control-height` thickness rather than squeezed to the region.
- **A geometry defect this uncovered is left for its own change document**: at that 63px `tall` tile the 42px control is wider than the 35px content box, so it bleeds 3.5px into each side's padding (not clipped — the bleed is inside the 14px padding, and it stays centred). The same tile clips the `input_number` stepper outright: 156px of controls in a 35px region, 46.5px past the card's edge on each side, against the design system's omit-never-clip rule. Both trace to one unreconciled pair — `--liebe-control-height` and `--liebe-card-padding` against the width a single desktop column actually gives a tile — and the fix is a design-system decision (the spec pins the control at 42px), so neither is made here.

### Non-Goals

- No slider placement options, no forced orientations, no background placement — that is change [0034](./0034-slider-placement.md), which depends on this landing first.
- No Storybook decorator changes — change [0029](./0029-workshop-tier-fidelity.md).

## Tasks

- [x] Fix vertical slider rendering: fill cross-axis anchor in `anatomy.css`, `tall`-band centring, `InputNumberCard` fill sizing; stylesheet + tier-layout unit tests and the e2e fill-geometry assertion

## Open Questions

—

## References

- Spec: [design-system — card anatomy](../specs/design-system/index.md#card-anatomy), [options/input-helpers](../specs/entity-cards/options/input-helpers.md)
- Related changes: [0010-design-tokens-and-anatomy](./0010-design-tokens-and-anatomy.md) (slider primitive), [0011-layout-tiers](./0011-layout-tiers.md) (tall arrangement), [0034-slider-placement](./0034-slider-placement.md) (depends on this)
