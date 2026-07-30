# 0030: Weather Forecast Legibility

## Summary

Give the weather card's forecast sections the visual pass the spec now requires — labelled, distinguishable hourly/daily sections on a shared column rhythm, emphasized high–low pairs, degree-only cells, one icon language — and put a real scrim under text rendered over condition artwork, closing [#215](https://github.com/fx/liebe/issues/215). The presentation rules live in [options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation); the scrim rule in [design-system — card anatomy](../specs/design-system/index.md#card-anatomy).

**Spec:** [entity-cards](../specs/entity-cards/) (options/weather), [design-system](../specs/design-system/)
**Status:** draft
**Depends On:** —

## Motivation

The forecast data plumbing (0015/0020) is correct and fully tested, but what renders is a text dump: one cell component styles hourly and daily identically (12px text, 16px grey glyphs, no labels, no separator, no column widths), the unit repeats in every cell, a daily high/low is two same-size stacked lines that become the _same colour_ over artwork, and the `default` variant pairs an emoji header icon with line-art forecast glyphs. Over condition artwork, all card text sits directly on photographs with shadow-only treatment measured at 2.64:1 — while the media player card ships a proper scrim whose comment claims it copies "the same legibility approach as the weather condition backgrounds", which does not exist. The sidebar `WeatherWidget` (heading, separator, min-width columns) is internal prior art that the card never adopted.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules ([architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test` (Vitest, jsdom), `npm run lint`, and `npm run typecheck` MUST pass before each PR.
- `codecov/patch` MUST be 100% on added/changed lines; `codecov/project` MUST NOT regress.
- Every visual rule that can be asserted at the stylesheet or DOM level MUST be (this repo's stylesheet-test pattern); stories are the visual acceptance surface for the rest.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Functional requirements

[Options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation) owns the section-label, rhythm, high–low, degree-only and icon-language rules with their scenario; [design-system](../specs/design-system/index.md#card-anatomy) owns the scrim rule. Neither is restated here. What this change owns:

- **No data or option changes**: every existing forecast option, its tier gates, and the availability/no-padding rules are untouched; this is presentation only. No option key is added, removed, or redefaulted.
- **One behavioural exception, forced by the presentation rules**: horizontal forecast capacity becomes width-aware, owned entirely by [options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation) (the canonical minimum column widths and the omission floor are that spec's, not restated here). What it costs this change: the shell grows the content-width signal ([design-system](../specs/design-system/index.md#size-adaptive-layouts) — a single shell-owned content-box observation, which by construction covers every host the card renders in, grid or not), the capacity functions change shape (`hourlyForecastCapacity` is width-blind for `row`/`full` today), no config migrates, and existing forecast tests pinning a count the contract no longer yields are restated from the contract, not loosened.
- **Scrim delivery** follows the media player's shipped pattern (scrim layer + scoped foreground-token overrides so themed text stays reachable), applied wherever the weather card paints artwork — all tiers, all artwork-bearing variants. The `emphasis`/`standard` shadow split MAY remain as accent on top of the scrim.
- The degree-only cell formatting MUST NOT change the card's main readout (unit stays there) nor the `temperatureUnit` conversion path.
- The icon-language decision is the spec's, already made: all variants unify on the line-art condition-glyph set and the `default` variant's emoji header is retired ([options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation)); this change implements it.
- **Docs sync task**: `docs/specs/entity-cards/card-reference.md`'s weather section predates 0020 (stale line references, no forecast section, a "no tests cover backgrounds" claim that is no longer true) and MUST be refreshed in this change.
- Storybook gaps closed alongside: forecast stories on `modern` and `detailed`, a forecast story with `showConditionBackground: false`, and a max-count (12h) story.

## Design

### Approach

Weather-card work lives in `src/components/WeatherCard/`; two pieces are deliberately outside it — the shell's content-width signal (`GridCard`/card-body layer, the design-system channel above) and the media backdrop scrim measurement (`MediaPlayerCard.css`) the scrim task names:

- `WeatherForecast.tsx` + a small stylesheet (the family has none today; the unstyled `weather-forecast-column` class becomes real): section labels (eyebrow typography), equal-width column tracks, hi–lo pair markup, degree-only formatting, glyph sizing.
- `presentation.ts` — glyph set unification; `formatTemperature` grows a degree-only form.
- Variant files — mount the scrim layer with artwork (pattern from `MediaPlayerCard.css`'s backdrop/scrim) and drop per-node white `style` colour in favour of scoped token overrides.
- Tests: extend `WeatherCard.forecast.test.tsx` (labels present, degree-only cells, pair emphasis markup, scrim present with artwork and absent without), stylesheet test for the new CSS, stories per the coverage gaps.

### Decisions

- **Scrim + token override instead of stronger shadows**: shadows trace glyphs and can never guarantee a floor against arbitrary photos; the scrim pattern already shipped for media and is what the design-system rule now names as reference.
- **Keep one `ForecastCell` component**: the sections differ by label, data and emphasis, not by anatomy — differentiation comes from section labels and the hi–lo pair, not a second component to drift.
- **The width gates the drawing, not the subscription** — recorded because it is a knowing deviation from the letter of one rule. The option doc says a card MUST NOT request a forecast for a section it will not render, naming two reasons: the tier has no room, or the option is `false`. A section omitted for WIDTH is a third, and it still subscribes. Two reasons. The signal is the shell's, so it is readable only inside the shell, while the hook that subscribes runs in the variant's body above it — gating there would mean moving forecast acquisition inside the shell subtree, which is a restructuring of all three forecast-bearing variants rather than a line. And it would be worse behaviour: width omission is resize-driven and reversible, so dropping the subscription would evict a cached forecast every time a tile narrowed past the floor and refetch it on the way back, making the strip flicker through a loading state that the cache exists to prevent. The case only arises on a tile with no room for a single 44px column, which is already the pathological end of the grid. Revisit if forecast acquisition ever moves into the shell for other reasons.
- **No gap between forecast columns.** Capacity is the contract's `floor(contentWidth / minColumnWidth)`, which budgets columns and nothing between them, so an inter-column gap is width the formula cannot see and every track pays for — at 220px the rule picks five 44px columns and four 4px gaps leave 40.8px each, under the floor the rule exists to hold. Separation is `padding` inside the column instead. Changing the formula to subtract gaps was the alternative and was rejected: the formula is the option doc's, not this change's.
- **PR split**: scrim first (closes #215 on its own, smallest reviewable diff), forecast visual pass second.

#### Measuring contrast here: four rules, three of them learned the expensive way

Every figure in this change comes from decoding **painted pixels** in headless Chromium against a static Storybook build — the real components, the real stylesheets, the real artwork — rather than from reading token values. That much was settled before the work started, because a translucent surface over a gradient cannot be evaluated any other way. What was not settled is how to take the reading, and three of the four rules below exist because the rig reported a **false 1.00:1** on a card that was perfectly legible. That failure mode is the one to fear: 1.00:1 reads as the strongest possible evidence of a defect, so a rig that emits it is worse than no rig at all — it does not merely fail to find a problem, it manufactures one, and it will be believed.

1. **Take the ground PER RUN, with only that run hidden.** One shared screenshot with the whole card body hidden measures the scrim, not the surface a control actually stands on: a `Select.Trigger` has a translucent background of its own between its label and the artwork, and hiding the body takes that away. It flatters exactly the surface being indicted — the picker would have scored against the scrim rather than against its own chip.
2. **Intersect a text run's box with its clip chain.** A text range's rect is **not** clipped by its container: `.liebe-name` ellipsizes at 25px while the range for the same text reports 41px, running on into whatever sits beside it — in the `row` tier, a white thermometer glyph. One 255 pixel anywhere in the box pins the ratio at 1.00:1.
3. **Hide the clipping block, not just the inline element.** `text-overflow` paints its ellipsis from the **clipping block's** line box rather than from the inline element inside it, so hiding the Radix `<Text>` span leaves three white dots standing in the box being measured. Same 1.00:1, same innocent card — this one bit immediately after rule 2 was applied, on the same title.
4. **A run whose ground is indistinguishable from its painting is INVALID, not a failure.** Score it as a miss and a hide that silently did not take is recorded as the worst defect on the card. This is the same discipline as invalidating a mutation probe that did not apply ([AGENTS.md](../../AGENTS.md) — "Probing a test"), and for the same reason: the failure and the broken instrument produce identical output, so only the instrument can tell them apart.

The rig itself is deliberately **not** committed — it depends on a Storybook build and a static server, and a checked-in copy would rot between the changes that need it. What is worth inheriting is this list.

### Non-Goals

- No new forecast data (precipitation/wind columns) — tracked as an open question below.
- No new artwork (the `exceptional` gap stays 0020's recorded gap).
- No variant consolidation (existing open question in the option doc).

## Tasks

- [x] Artwork scrim: scrim layer + scoped foreground-token overrides on every artwork-bearing weather surface, shadow treatment demoted to accent; measure the media backdrop (the rule's reference implementation) against the same 4.5:1 floor and strengthen its gradient where it misses, so the rule's two consumers both comply when it lands; contrast-bearing tests and the `showConditionBackground: false` story; closes #215
- [ ] **Radix controls over artwork.** A Radix control colours itself from a Radix scale and reads none of the Liebe foreground tokens, so its contrast follows the **appearance** rather than the ground it stands on. Two shipped instances: the shell's edit-mode configure/delete `IconButton`s on any artwork-bearing tile, and the media card's `Select.Trigger` at `artworkMode: background` with `showSourcePicker` (story: `BackgroundArtworkWithSourcePicker`, added in PR 1 because the combination had none — which is why the defect had never been seen). Measured on PR 1's rig, worst image of each pair, before → after:

  | Control                        | Light           | Dark        | Floor |
  | ------------------------------ | --------------- | ----------- | ----- |
  | Weather edit — configure glyph | 2.62 → **1.60** | 1.06 → 4.17 | 3:1   |
  | Weather edit — delete glyph    | 3.19 → **1.18** | 1.09 → 3.32 | 3:1   |
  | Media picker — trigger label   | 1.02 → **1.23** | 1.02 → 7.09 | 4.5:1 |
  | Media picker — chevron         | 1.76 → **1.20** | 3.64 → 4.97 | 3:1   |

  **Start from the inversion, because it changes the fix.** The scrim did not create this failure, it moved it between appearances: dark was the worse half before — every one of these controls was failing on every image, the configure glyph at 1.06:1 — and the scrim fixed it. Light is where it now fails, because a dark Radix control had been readable on bright artwork and a reliably dark ground is exactly what takes that away. Consequences for whoever picks this up:
  - **Only one surface actually crosses pass → fail**: the delete glyph in light, 3.19 → 1.18. The configure glyph was already under its floor at 2.62 and merely got worse.
  - **The picker's label and chevron were never compliant in either appearance.** The label read 1.02:1 before because the old scrim painted over it; it is unfixed rather than regressed, and it improved in light and cleared the floor in dark (1.02 → 1.23 light, → 7.09 dark).
  - **Dark needs nothing.** An appearance-scoped dark `Theme` around overlaid content is therefore the obvious mechanism rather than one candidate among several: it is the scope light is missing, it covers every control at once, and it leaves the half that already works alone. A per-control override would have to be written and re-written for each new control.

  Record the mechanism under the design-system scrim rule, then implement and re-measure the same way. Found by local review on PR 1.

- [x] Forecast visual pass: section labels, shared column rhythm, width-aware horizontal capacity in `hourlyForecastCapacity`/`dailyForecastCapacity` fed by the shell's content-width signal (per the owning contract), hi–lo pair emphasis, degree-only cells, unified icon language, glyph sizing; forecast stories for `modern`/`detailed`/max-count including a max-count strip on a minimum-width tile; refresh `card-reference.md`'s weather section

## Open Questions

- [ ] **Precipitation in forecast columns** — the hook already passes `precipitation_probability` through and the sidebar widget renders it; whether daily columns should gain it (and under what option) is deferred so this change stays a visual pass.

## References

- Spec: [options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation), [design-system — card anatomy (scrim rule)](../specs/design-system/index.md#card-anatomy)
- Related changes: [0020-weather-card-to-spec](./0020-weather-card-to-spec.md), [0015-history-and-forecast-data](./0015-history-and-forecast-data.md), [0023-media-player-card](./0023-media-player-card.md) (scrim reference)
- External: [#215](https://github.com/fx/liebe/issues/215); prior art — [HA weather forecast card](https://www.home-assistant.io/dashboards/weather-forecast/), [lovelace-hourly-weather](https://github.com/decompil3d/lovelace-hourly-weather)
