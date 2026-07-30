# 0035 — Light-Appearance Contrast & Residual Accessible Names

## Summary

Close the accessibility conformance gaps the card wave left behind, all three of which are colour or naming decisions made in a shared layer rather than in any one card. Two are the same defect in different elements — a colour calibrated against one background and rendered against another, failing only in **light** appearance: the `-text` companions of the domain triplet miss AA on the near-white card surface, and the domain glyph misses 3:1 on its own 20% tint. The third is the residue of the `button-name` audit: the anatomy migration gave most icon-only controls a name, and two still have none — `InputSelectCard`'s select trigger, and the switch `InputBooleanCard` renders in its own tile at `controlStyle: switch`.

The weather card's text over condition artwork is the same family and is **not** in this change: [0030](./0030-weather-forecast-legibility.md) owns it, having landed the design system's content-imagery scrim rule and the measurement obligation with it.

**Spec:** [design-system](../specs/design-system/index.md) → [domain color discipline](../specs/design-system/index.md#domain-color-discipline) · **Status:** draft · **Depends on:** —

Supersedes issues [#191](https://github.com/fx/liebe/issues/191), [#197](https://github.com/fx/liebe/issues/197) and [#210](https://github.com/fx/liebe/issues/210). [#215](https://github.com/fx/liebe/issues/215) was folded here first and moved to [0030](./0030-weather-forecast-legibility.md) on rebase — that change already owns the scrim rule and the text treatment, so keeping a second task for it would have been the duplication this grouping exists to avoid.

## Motivation

The design system states a contrast floor and the token layer does not meet it. That is a worse failure than a card getting a colour wrong, because every card inherits it and no card can fix it: the anatomy correctly routes all colour through the triplet rather than hardcoding, so the only place the value can change is where it is chosen.

The measured figures, all light appearance:

| Element                      | Token                               | Measured | Required |
| ---------------------------- | ----------------------------------- | -------- | -------- |
| state line (small text)      | `--liebe-c-light-text` → `amber-11` | 4.497:1  | 4.5:1    |
| state line (small text)      | `--liebe-c-heat-text` → `orange-11` | 4.398:1  | 4.5:1    |
| state line (small text)      | `--liebe-c-vacuum-text` → `teal-11` | 4.450:1  | 4.5:1    |
| domain glyph on its 20% tint | `--liebe-c-light` → `amber-9`       | 1.40:1   | 3:1      |
| domain glyph on its 20% tint | `--liebe-c-ok` → `green-9`          | 2.50:1   | 3:1      |

What settles these as system defects rather than theme choices: the glyph figures sit within noise of each other across two visually unrelated themes (Default 1.40 vs. Liquid Glass 1.24), because step 9 on a 20% tint of step 9 over a near-white card cannot reach 3:1 whatever the hue. No theme choice fixes it while the pattern stands.

Liquid Glass is the useful counter-example for the `-text` half: it pins `-text` to step 12 and consequently has no violation at all (11.37:1 against Default's 4.50:1), which is direct evidence that repinning solves that half.

The accessible-name half has largely resolved itself. The anatomy's `Pill` requires a `label` and moves it to `aria-label` when the pill renders icon-only, so the HVAC mode row is now named; `ClimateSetpointControls`, `CoverCard`'s tilt row, `InputNumberCard`, `InputTextCard` and `InputDateTimeCard` all carry explicit labels. What remains is `InputSelectCard`'s select trigger, which carries no `aria-label` anywhere in the file, and the switch `InputBooleanCard` renders in its **own tile** — the `controlStyle: switch` control slot, at non-`glance` tiers. Note which switch that is: `InputBooleanDetailControls` names its switch correctly, so the unnamed one is the card's inline control rather than the dialog's.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The token contract test (`src/theme/__tests__/tokens.test.ts`) asserts every companion derives from its base. A repin changes what that test asserts, so it MUST be updated in the same PR rather than relaxed — a derivation rule loosened to accommodate a fix is the rule failing, not the fix.
- Contrast MUST be verified by **measurement, not computation** wherever the colour composites: a 20% tint over a card surface cannot be evaluated from token values, because the figure depends on what it composites onto. Decode rendered pixels.
- The workshop's a11y addon MUST report zero `button-name` and zero `color-contrast` violations for the affected stories in **both** appearances ([storybook — accessibility & interaction checks](../specs/storybook/index.md#accessibility--interaction-checks)).
- Automated contrast checking does **not** work under a theme with non-flat surfaces — axe reports `color-contrast` as incomplete ×31 under Liquid Glass ("background gradient"). A PR MUST NOT treat a clean axe run under that theme as coverage; pixel measurement is the only method that works there.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [design system](../specs/design-system/index.md) owns the token contract, the domain triplet's derivation rule, the 20%-tint active pattern and the contrast floors — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **The `-text` repin is a spec edit, not only a value edit.** The design system currently states that the default theme pins `-text` to step 11 and that the base layer defines it as `var(--liebe-c-<name>)`. Whichever remedy is chosen changes that rule, so the spec's normative bullet and the token contract test MUST move with it.
- **Only the failing hues are in scope for a per-hue remedy.** If the fix is per-appearance rather than a blanket step-12 repin, the change MUST NOT silently darken hues that already pass — the state line's weight is part of the anatomy and pulling every domain darker is a visual change beyond the defect.
- **The glyph remedy changes the pattern, not a token.** No repin fixes it. The design system's 20%-tint active pattern MUST be amended to whatever clears 3:1 — a darker glyph step, a lighter tint, or a bounding treatment on the icon circle — and the amended rule is what the acceptance scenario measures.
- **Repoint the issue references.** `docs/specs/design-system/index.md` cites these defects in its Outstanding list, and `src/theme/themes/*.css` comments cite them by issue number. Each MUST become a reference to this change or be deleted as resolved, in the PR that resolves it.

## Design Decisions

- **Per-appearance `-text` is preferred over a blanket step-12 repin.** The surface tokens already resolve exactly this class of problem that way — light aliases different gray steps than dark — so the mechanism exists and is precedented in the same file. A blanket step 12 clears AA comfortably but darkens the state line under both appearances to fix a light-only defect, and it contradicts the "step 11 is the text step" rule rather than scoping an exception to it.
- **Accepting 4.4–4.5:1 as within tolerance is rejected.** It is a defensible engineering position and a poor one for this product: the design system states the floor as a MUST, three hues sit under it, and recording an exception makes the floor advisory for every future hue. The margin being small is an argument that the fix is cheap, not that the failure is acceptable.
- **The glyph fix is scoped to the pattern's own parameters.** Widening it into "reconsider domain colour" would pull in every card. The pattern has three knobs — glyph step, tint alpha, and whether the circle carries a border — and one of them clears 3:1 without touching what a domain hue _is_.
- **The name residue is two controls, not a re-audit.** The original audit's 66 nodes were mostly closed by the anatomy migration as a side effect. This change fixes the two remaining and re-runs the audit to confirm the count is zero, rather than re-deriving the table.

## Tasks

Spec restatements update **in the same PR** as each behaviour change they describe (repo consistency rule — the living spec must never lag a merged PR).

PR 4 was **not** part of this change as proposed. It was measured while implementing PR 2 and is recorded here because it is the same defect one layer down — the pattern's glyph step cannot reach a part whose colour arrives inline — and because this is the change that made it visible. It depends on PR 2 (there is no appearance-aware glyph step to bypass without it) and is independent of PR 3, so the two may land in either order. It carries a decision the other three do not: what a live hue's glyph should be is a question for the light card and the person card, not one this change can settle by measurement alone, so it may reasonably be moved to a change document of its own instead.

- [x] **PR 1 — `-text` contrast**: repin the failing `-text` companions per appearance; update the design system's domain-colour bullet and the token contract test; measured before/after figures for all ten hues in both appearances; drop #197 from the spec's outstanding list
- [x] **PR 2 — Glyph on tint**: amend the 20%-tint active pattern so the glyph clears 3:1 in light appearance on every built-in theme; pixel-measured evidence per domain hue per theme; update the design system's pattern rule and the affected theme stories; drop #210 from the outstanding list
- [ ] **PR 3 — Residual accessible names**: name `InputSelectCard`'s select trigger and the switch `InputBooleanCard` renders in its own tile at `controlStyle: switch` (**not** the detail-controls switch, which is already named); re-run the `button-name` audit across every story in both appearances and record the resulting count; drop #191 from the outstanding list
- [ ] **PR 4 — The live hue on its own tint**: decide and implement what the glyph takes when a data-driven hue overrides the triplet — the light card's bulb colour under `useLightColor` and the person avatar's identity colour, one mechanism in `hueStyle` (`src/components/anatomy/anatomyPart.ts`) rather than two card defects; measure both against their floors (the avatar's initials are text at 4.5:1, not a glyph at 3:1) and move [options/light](../specs/entity-cards/options/light.md) and [options/person](../specs/entity-cards/options/person.md) with whatever is decided
- [ ] **PR 5 — The dark-appearance glyph on `media`**: `indigo-9` on its own 20% tint over the dark card measures **2.81:1**, under the 3:1 glyph floor — the only hue of the ten that misses in dark (next worst: `brand` 3.60:1, `alert` 3.60:1; every other hue clears 4:1). Found while implementing [0033](./0033-icon-only-cards.md)'s icon-only tile tint, which reproduces this pattern's exact composite at tile scale and so inherits the figure rather than introducing it. It contradicts this change's Out-of-Scope claim that "all four defects pass in dark", which was made about the light-appearance repin and never measured per hue in dark; resolving this task MUST correct that line as well. Same three knobs as PR 2 — glyph step, tint alpha, circle border — decided for dark this time, and measured for all ten hues on every built-in theme.

## Out of Scope

- **Slider thumb names** — already fixed ([#192](https://github.com/fx/liebe/issues/192), closed).
- **Weather text over condition artwork** — [0030](./0030-weather-forecast-legibility.md). Same family, and that change owns the design system's content-imagery scrim rule, the measurement against an adversarial condition image, and the `getWeatherTextStyles` / `getWeatherTextColor` tests change [0020](./0020-weather-card-to-spec.md) deferred.
- **Making automated contrast checking work under non-flat surfaces.** Axe cannot evaluate a translucent surface over a gradient, and that is a property of axe. Recording the limitation is in scope; replacing the a11y addon with a pixel-measuring gate is a testing-infrastructure change, and belongs with [0040](./0040-test-harness-reliability.md) if it is wanted at all.
- **Dark appearance.** All four defects pass in dark; nothing here changes it, and a PR that moves a dark-appearance figure has overreached.
- **The theming contract gaps that also block a theme's colour choices** — pill and chip label colour, and the `--part-*` internals ([0036](./0036-theming-contract-gaps.md)). Related in subject, opposite in direction: those are about what a theme MAY change, this is about what the default MUST measure.
