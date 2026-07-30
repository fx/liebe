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
- **PR split**: scrim first (closes #215 on its own, smallest reviewable diff), forecast visual pass second.

### Non-Goals

- No new forecast data (precipitation/wind columns) — tracked as an open question below.
- No new artwork (the `exceptional` gap stays 0020's recorded gap).
- No variant consolidation (existing open question in the option doc).

## Tasks

- [x] Artwork scrim: scrim layer + scoped foreground-token overrides on every artwork-bearing weather surface, shadow treatment demoted to accent; measure the media backdrop (the rule's reference implementation) against the same 4.5:1 floor and strengthen its gradient where it misses, so the rule's two consumers both comply when it lands; contrast-bearing tests and the `showConditionBackground: false` story; closes #215
- [ ] **Radix controls over artwork.** The scrim task brought every anatomy part and glyph under the floor through the foreground tokens, and a Radix control reads none of them — it colours itself from a Radix scale, so its contrast follows the **appearance** rather than the ground it is standing on. Two shipped instances: the shell's edit-mode configure/delete `IconButton`s on any artwork-bearing tile, and the media card's `Select.Trigger` at `artworkMode: background` with `showSourcePicker` (its story is `BackgroundArtworkWithSourcePicker`, added in PR 1 because the combination had none — which is why nobody had seen this). Measured on PR 1's rig, worst image of each pair, before → after:

  | Control                        | Light           | Dark        | Floor |
  | ------------------------------ | --------------- | ----------- | ----- |
  | Weather edit — configure glyph | 2.62 → **1.66** | 1.06 → 3.97 | 3:1   |
  | Weather edit — delete glyph    | 3.19 → **1.25** | 1.09 → 2.94 | 3:1   |
  | Media picker — trigger label   | 1.02 → **1.35** | 1.02 → 6.66 | 4.5:1 |
  | Media picker — chevron         | 1.76 → **1.26** | 3.64 → 4.76 | 3:1   |

  The scrim **inverted** the problem rather than creating it: in dark appearance these controls were failing on every image (1.06–2.11:1) and the scrim largely fixed them; in light appearance a dark Radix control had been readable on bright artwork, and a reliably dark ground is what takes that away. The media picker's label never met the floor in either appearance — the old scrim painted over it — so that one is unfixed rather than regressed. The delete glyph in dark is still 2.94:1, marginally under.

  Decide the mechanism — a dark-appearance `Theme` scope around overlaid content is the idiomatic Radix answer and covers every control at once, where a per-control override does not — record it under the design-system scrim rule, then implement and re-measure the same way. Found by local review on PR 1

- [ ] Forecast visual pass: section labels, shared column rhythm, width-aware horizontal capacity in `hourlyForecastCapacity`/`dailyForecastCapacity` fed by the shell's content-width signal (per the owning contract), hi–lo pair emphasis, degree-only cells, unified icon language, glyph sizing; forecast stories for `modern`/`detailed`/max-count including a max-count strip on a minimum-width tile; refresh `card-reference.md`'s weather section

## Open Questions

- [ ] **Precipitation in forecast columns** — the hook already passes `precipitation_probability` through and the sidebar widget renders it; whether daily columns should gain it (and under what option) is deferred so this change stays a visual pass.

## References

- Spec: [options/weather — forecast presentation](../specs/entity-cards/options/weather.md#forecast-presentation), [design-system — card anatomy (scrim rule)](../specs/design-system/index.md#card-anatomy)
- Related changes: [0020-weather-card-to-spec](./0020-weather-card-to-spec.md), [0015-history-and-forecast-data](./0015-history-and-forecast-data.md), [0023-media-player-card](./0023-media-player-card.md) (scrim reference)
- External: [#215](https://github.com/fx/liebe/issues/215); prior art — [HA weather forecast card](https://www.home-assistant.io/dashboards/weather-forecast/), [lovelace-hourly-weather](https://github.com/decompil3d/lovelace-hourly-weather)
