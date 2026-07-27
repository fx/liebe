# 0017 — Climate Card to Spec

## Summary

Implement the [climate option contract](../specs/entity-cards/options/climate.md) on `ClimateCard`: the `variant` select (`dial` preserves the existing arc thermostat for the `full` tier; `compact` is the new stepper/pills default), the display toggles `showModePills`, `showPresets`, `showFanModes`, `showCurrentTemp`, `showHumidity`, and the display-only `displayUnit` conversion — while preserving every existing step/clamp/dual-setpoint MUST. The variant work also resolves the entity-cards open question about `ClimateCard.tsx`'s ~962-line size by splitting the arc/dial into its own file.

**Spec:** [entity-cards](../specs/entity-cards/index.md#climate) → [options/climate](../specs/entity-cards/options/climate.md) · **Status:** complete · **Depends on:** 0011, 0014

## Motivation

The climate card is the densest control surface in the dashboard and today exposes no per-card configuration: it always renders the arc thermostat, which only earns its space at `full` size. The spec's `compact` default degrades cleanly through every tier introduced by 0011, and the `show*`/`displayUnit` options let users tune an already capability-gated control set on top of the universal surface from 0014. The same work is the natural moment to decompose the largest card file in the codebase — the variant mechanism requires separating arc geometry/drag math from shared service logic anyway.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Mode, preset, fan-mode, and setpoint controls MUST be unit-tested for their exact service payloads (`climate.set_hvac_mode`, `climate.set_preset_mode`, `climate.set_fan_mode`, `climate.set_temperature` single and range) and for capability gating (`SUPPORT_PRESET_MODE`, `SUPPORT_FAN_MODE`, `SUPPORT_TARGET_TEMPERATURE_RANGE`) in every variant.
- Every option ships stories ([storybook — story coverage](../specs/storybook/index.md#story-coverage)): both variants across tiers, both values of each `show*` toggle, all three `displayUnit` values.
- The preserved behaviors (step/clamp, bound-disabled steppers, inverted-range rejection, edit-mode control hiding) MUST keep their existing tests passing unchanged in intent through the refactor.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [climate option doc](../specs/entity-cards/options/climate.md) owns the option keys, defaults, tier layouts, the `hvac_action`-first colour precedence, `displayUnit` conversion semantics, the preserved step/clamp/range MUSTs, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- Options are stored under `item.config` and edited via the climate card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- **Legacy pinning** (common convention 7): existing climate items render the arc thermostat today, so the loader writes `variant: 'dial'` onto climate items predating this change — the `compact` default applies only to newly added cards. Unit-tested both ways (legacy item pinned, new item defaulted).
- The `dial` variant registers through the card registry's existing variant mechanism rather than a private switch inside the card, consistent with the weather family.
- The arc thermostat moves into its own file under the climate card's folder so the compact variant is not carried by the same component — see Design Decisions.

## Design Decisions

- **`compact` is the default** — defaults must look right with zero configuration at any size; the arc dial only earns its space at `full`, while compact degrades cleanly through every 0011 tier. Existing climate items are **automatically pinned** to `variant: 'dial'` by the loader migration in the functional requirements — an upgrade never silently replaces a dashboard's arc thermostat; only newly added climate cards start compact.
- **Refactor is in scope, not a side quest** — the entity-cards spec flags `ClimateCard.tsx` (~962 lines, mixing arc geometry, drag math, and service logic) as an open question. The variant mechanism forces the separation anyway, so PR 1 splits the card into a `ClimateCard/` folder (shared service/step/clamp logic in `index.tsx`, arc/dial in its own file) per the component-folder convention WeatherCard already follows, and closes that open question.
- **`displayUnit` is presentation-only by construction** — conversion lives in the render path, never in the stepper/service path, so a display-unit mismatch can never send wrong-unit setpoints. Converted displays round to **one decimal** — the contract the spec's Fahrenheit scenario already encodes (`69.8°F`/`70.7°F`) — shared with the weather card's `temperatureUnit`.
- **Capability gating decides existence, options decide visibility** — preset/fan pill rows require both the feature bit and a non-empty mode list before the `show*` option is even offered; `showPresets`/`showFanModes` default `false` because they are secondary controls that crowd the `full` tier.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [x] **PR 1 — Variant split + compact layout**: decompose `ClimateCard.tsx` into a `ClimateCard/` folder (shared service/step/clamp logic; arc/dial extracted to its own file and registered via `registerCardVariant('climate', 'dial', …)` — or the component's static `variants` map the registry reads — so `getCardVariant('climate', 'dial')` resolves it at dispatch); implement the `compact` variant across `glance`/`row`/`tall`/`full` tiers and the dial's below-`full` fallback; preserved-behavior tests carried over; the legacy-pinning loader migration (`variant: 'dial'` written onto pre-existing climate items) with legacy/new-item tests; setpoint/mode dispatches migrated to the 0014 non-retrying path with the transition-or-timeout guard and an early-acknowledgement boundary test; tier/variant stories
- [x] **PR 2 — Climate options**: `showModePills`, `showPresets`, `showFanModes`, `showCurrentTemp`, `showHumidity` with capability gating and mode-color discipline; `displayUnit` display-only conversion; register the climate controls (setpoint stepper + mode pills) in the detail dialog's domain control slot from [0014](./0014-universal-card-options.md) and, in the same PR, complete the control-free `glance` layout that 0011 deferred for climate (its minimal control was retained until this registration — per 0011's no-regression invariant) — `glance` taps resolve to more-info, and the dialog must be operable, with a glance-tier operability test; config-form controls + YAML round-trip; service-payload and gating unit tests; per-option stories
- [x] **PR 3 — Spec sync**: update the [entity-cards spec Climate section](../specs/entity-cards/index.md#climate) (options implemented, variant registration, compact default) and its changelog; mark [options/climate](../specs/entity-cards/options/climate.md) implemented, close the ClimateCard-size open question, and record the rounding decision

## What shipped

Recorded against the plan above, because three things landed that the task bullets did not name — and a change document that lists only what was planned understates what a reader has to know.

- **PR 1 also closed [#225](https://github.com/fx/liebe/issues/225)**, open since change 0011 and deferred through five PRs: the dial's heat and cool handles were bare SVG `<circle>` elements with mouse and touch handlers — no role, no accessible name, no value, not focusable. They now carry `role="slider"` with the name and value on the element holding that role, and arrow keys that move a handle under the same band-preserving rule as the drag. It was done inside the extraction rather than filed again because the same PR's pinning migration makes `dial` what every pre-0017 dashboard renders, so shipping the split without it would have widened a hole rather than left one.
- **PR 1 also settled the shapes the card had been reading without checking.** A non-numeric or absent temperature attribute now reads as "no reading" instead of throwing at `.toFixed` or printing the literal `undefined°C`; a setpoint of `0` is a setpoint rather than a falsy value; a `target_temp_step` of `0` falls back to Home Assistant's own default instead of a stepper that cannot step; `hvac_modes` that is not a list yields no pill row; collapsed `min_temp`/`max_temp` bounds no longer put `NaN` into SVG coordinates; and a range-only thermostat (bit 2 without bit 1) shows its band on the dial, which it previously hid.
- **A review pass on PR 1 found two more**, both fixed before merge: the mode filter used `mode in HVAC_MODES`, which walks the prototype chain, so an `hvac_modes` entry named after an inherited member (`toString`) passed the filter and was then dereferenced as a config with no label or colour — a crash while rendering; and the drag-end handler committed the band captured by the effect closure, so a release arriving before React flushed the preceding move sent the band from one step _before_ the release. The second predates the extraction: the pre-split card read the same values through a `useCallback` the effect depended on.
- **PR 2's `displayUnit` needed the native unit to move.** Climate entities publish no `temperature_unit`; Home Assistant normalises them to `hass.config.unit_system.temperature`. The card read the attribute before this change, so the unit now comes from the unit system with the attribute kept only as a fallback.

## Out of Scope

- Target-humidity control, swing modes, and aux heat (open questions in the option doc — display/control surface unspecified).
- A semi-dial for `variant: dial` in the `tall` tier (compact fallback stands until specified).
- Universal options and the action system (0014), history data in the detail dialog (0015), other domains' option docs (their own changes).
