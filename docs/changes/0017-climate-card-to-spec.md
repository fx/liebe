# 0017 — Climate Card to Spec

## Summary

Implement the [climate option contract](../specs/entity-cards/options/climate.md) on `ClimateCard`: the `variant` select (`dial` preserves the existing arc thermostat for the `full` tier; `compact` is the new stepper/pills default), the display toggles `showModePills`, `showPresets`, `showFanModes`, `showCurrentTemp`, `showHumidity`, and the display-only `displayUnit` conversion — while preserving every existing step/clamp/dual-setpoint MUST. The variant work also resolves the entity-cards open question about `ClimateCard.tsx`'s ~962-line size by splitting the arc/dial into its own file.

**Spec:** [entity-cards](../specs/entity-cards/index.md#climate) → [options/climate](../specs/entity-cards/options/climate.md) · **Status:** draft · **Depends on:** 0011, 0014

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

- [ ] **PR 1 — Variant split + compact layout**: decompose `ClimateCard.tsx` into a `ClimateCard/` folder (shared service/step/clamp logic; arc/dial extracted to its own file and registered via `registerCardVariant('climate', 'dial', …)` — or the component's static `variants` map the registry reads — so `getCardVariant('climate', 'dial')` resolves it at dispatch); implement the `compact` variant across `glance`/`row`/`tall`/`full` tiers and the dial's below-`full` fallback; preserved-behavior tests carried over; the legacy-pinning loader migration (`variant: 'dial'` written onto pre-existing climate items) with legacy/new-item tests; setpoint/mode dispatches migrated to the 0014 non-retrying path with the transition-or-timeout guard and an early-acknowledgement boundary test; tier/variant stories
- [ ] **PR 2 — Climate options**: `showModePills`, `showPresets`, `showFanModes`, `showCurrentTemp`, `showHumidity` with capability gating and mode-color discipline; `displayUnit` display-only conversion; register the climate controls (setpoint stepper + mode pills) in the detail dialog's domain control slot from [0014](./0014-universal-card-options.md) and, in the same PR, complete the control-free `glance` layout that 0011 deferred for climate (its minimal control was retained until this registration — per 0011's no-regression invariant) — `glance` taps resolve to more-info, and the dialog must be operable, with a glance-tier operability test; config-form controls + YAML round-trip; service-payload and gating unit tests; per-option stories
- [ ] **PR 3 — Spec sync**: update the [entity-cards spec Climate section](../specs/entity-cards/index.md#climate) (options implemented, variant registration, compact default) and its changelog; mark [options/climate](../specs/entity-cards/options/climate.md) implemented, close the ClimateCard-size open question, and record the rounding decision

## Out of Scope

- Target-humidity control, swing modes, and aux heat (open questions in the option doc — display/control surface unspecified).
- A semi-dial for `variant: dial` in the `tall` tier (compact fallback stands until specified).
- Universal options and the action system (0014), history data in the detail dialog (0015), other domains' option docs (their own changes).
