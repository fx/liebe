# 0022 — Switch & Input Helper Cards to Spec

## Summary

Implement the domain options from the [switch option contract](../specs/entity-cards/options/switch.md) and the [input-helper option contract](../specs/entity-cards/options/input-helpers.md) on top of the tier layouts (0011) and universal option surface (0014): switch/fallback `confirm`, `deviceClassIcon`, `stateLabels`, and `showLastChanged` (every option safe for the card's fallback role on unmapped domains); `input_boolean` `controlStyle: tile | switch`; `input_number` `controlStyle: stepper | slider` (defaulting from the helper's own `mode` attribute); `input_select` `controlStyle: dropdown | pills` (pills gated to the `full` tier and ≤ 5 options); `input_text` and `input_datetime` stay universal-only. Also fixes the real `input_datetime` service gap: `useServiceCall.setValue` gains an `input_datetime` → `input_datetime.set_datetime` branch so the card's save actually reaches Home Assistant.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/switch](../specs/entity-cards/options/switch.md) + [options/input-helpers](../specs/entity-cards/options/input-helpers.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

`ButtonCard` doubles as the `switch` card and the fallback for every unmapped domain, yet exposes no configuration at all — no confirmation for critical loads, a hardcoded icon table, and no way to relabel states or show recency. The five input helper cards likewise ship a fixed presentation with no per-card surface, ignoring the helper's own `mode` preference for numbers and offering no touch-friendlier alternative to the select dropdown. Worst, `InputDateTimeCard` is silently broken at runtime: `useServiceCall.setValue` has no `input_datetime` branch, so saving returns `setValue not supported for domain: input_datetime` and never calls `input_datetime.set_datetime` — tests pass only because `setValue` is mocked ([entity-cards Open Questions](../specs/entity-cards/index.md#open-questions)). This change lands the specified option surface for both families and closes that bug, making the datetime card's primary action meaningful for the first time.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every option MUST ship stories demonstrating its values ([storybook — story coverage](../specs/storybook/index.md#story-coverage)): the confirm dialog flow, `deviceClassIcon` both values (outlet vs. override), custom `stateLabels`, `showLastChanged` per tier, and each `controlStyle` value per helper — including the pills→dropdown fallback.
- The `input_datetime` fix MUST have an **unmocked-service-mapping unit test**: exercising the real `useServiceCall.setValue` mapping (stubbing only the Home Assistant connection boundary, never `setValue` itself) for an `input_datetime` entity and proving `input_datetime.set_datetime` is called with the correct payload — so the current tests-pass-because-mocked failure mode cannot be reintroduced.
- Every switch option MUST have fallback-safety unit tests exercising it on a non-`switch` domain entity (no crash, no `device_class` lookup, raw state preserved).
- Service-payload and gating unit tests per option: exactly-one-toggle on confirm and zero calls on cancel; `input_number.set_value` quantization/clamping for both control styles; `input_select.select_option` from a pill tap; pills falling back to dropdown at > 5 options or below `full` tier.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Switch option keys, types, defaults, and tier behavior exactly per the [switch options table](../specs/entity-cards/options/switch.md#options): `confirm` (default `false`), `deviceClassIcon` (default `true`), `stateLabels` (default `{}`), `showLastChanged` (default `false`) — each editable via the card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- `confirm: true` gates every toggle-equivalent action on the card at action resolution — `tapAction: default`/`toggle`, `toggle` bound to hold/double-tap, **and configured `call-service` targeting the same entity's toggle-equivalent services** (`switch.toggle`/`turn_on`/`turn_off`, and the generic `homeassistant.toggle`/`turn_on`/`turn_off` aliases — classification by effect, per the common dispatch guarantees) — behind a Radix `AlertDialog` naming the entity and target state; confirming fires exactly one call of the **configured service** (a gated `switch.turn_off` stays `switch.turn_off`, never converted to `homeassistant.toggle`), cancelling fires nothing; `call-service` targeting unrelated services is never gated. Confirmation tests cover each route.
- Default-icon precedence per spec: universal `icon` override first; then, for the `switch` domain with `deviceClassIcon !== false`, the `device_class` glyph (`outlet` → plug, `switch` → power); then the domain default. Fallback domains always get the generic glyph and MUST NOT consult `device_class`.
- `stateLabels.onLabel`/`offLabel` remap only the `on`/`off` state text (plain text, single line, ellipsized); every other state — including anything a fallback-domain entity reports, and `unavailable` — renders raw. State-line coloring is unaffected.
- `showLastChanged` appends muted relative "since" text to the state line, refreshing at least once per minute; rendered in `row`/`tall`/`full`, omitted in `glance`, hidden entirely with `hideState`.
- **Every switch option MUST be safe in the fallback role**: no crash and no misleading UI when the entity is not `switch.*`, per the [switch contract](../specs/entity-cards/options/switch.md).
- **Fallback config routing**: `CardConfig`'s type resolution currently derives the raw entity domain as the card type, so an unmapped domain (e.g. `siren`) shows "No configuration options available" even though it renders `ButtonCard`. This change MUST route configuration through the card registry: any entity domain that resolves to the fallback card MUST resolve to the switch/fallback `ConfigDefinition`, so these options are editable wherever the card renders (with `deviceClassIcon` applying only to the `switch` domain, per the contract).
- `input_boolean` `controlStyle: tile | switch` (default `tile`): `tile` renders no discrete control and the whole tile toggles with the active tint pattern; `switch` additionally renders the discrete `Switch` in `row`/`tall`/`full` (omitted in `glance`). Either style calls `input_boolean.toggle` **via the non-retrying path from [0014](./0014-universal-card-options.md)** — the current `useServiceCall.toggle` reaches the retry wrapper, and a retried toggle after an ambiguous timeout toggles the helper back and can fire automations twice; a boundary test MUST prove one gesture yields one call. Either style keeps the toggle blocked from dispatch until the expected state transition is observed or an acknowledgement timeout elapses (the 0024 guard pattern — HA often acknowledges before the entity state updates, and a promise-scoped guard would let a second tap toggle the helper straight back), suppresses toggling when `unavailable` or `unknown` (indeterminate direction — never actuate, per the option contract; both states in the boundary tests), and hides controls in edit mode.
- **Legacy pinning** (common convention 7): existing `input_boolean` items render the discrete `Switch` today and existing `input_number` items render the stepper, so the loader MUST write `controlStyle: 'switch'` / `controlStyle: 'stepper'` onto pre-existing items respectively, discriminated by the configuration version marker (never key absence — a new `mode: slider` card intentionally leaves the key absent and must not be pinned on reload, per common convention 7); only newly added cards get the new defaults. Migrations unit-tested including the new-card save/reload case.
- `input_number` `controlStyle: stepper | slider`, defaulting from the helper's `mode` attribute (`box` → `stepper`, `slider` → `slider`); the option overrides in either direction. Stepper keeps the existing clamp/validate/revert rules; slider holds local drag state and commits `input_number.set_value` on release, quantized to `step` and clamped to `[min, max]`.
- `input_select` `controlStyle: dropdown | pills` (default `dropdown`): pills render only at `full` tier **and** with ≤ 5 options, current option selected via the active tint pattern; otherwise the card falls back to the dropdown with no configuration change. Both styles send `input_select.select_option` with `{ option }`; the control is disabled with no options.
- `input_text` and `input_datetime` gain **no keys beyond the universal set**; password-mode masking remains a non-configurable MUST.
- **Bugfix:** `useServiceCall.setValue` gains an `input_datetime` branch calling `input_datetime.set_datetime`, with the payload shaped by the helper's `has_date`/`has_time` (`date`, `time`, or `datetime`), so `InputDateTimeCard`'s save reaches Home Assistant instead of erroring locally. The fix MUST also normalize state↔input formats for combined helpers: HA publishes `YYYY-MM-DD HH:MM:SS` while `<input type="datetime-local">` requires `YYYY-MM-DDTHH:mm` — the card currently assigns state directly, leaving the input blank on real data (existing tests miss it by using a synthetic `T`-containing state). A component test with the realistic space-separated state format MUST cover the combined-helper round-trip in both directions.

#### Scenario: Confirm gates the toggle — even in the fallback role

- **GIVEN** an unmapped-domain entity (e.g. `siren.garage`) rendered by the fallback card with `confirm: true` and `deviceClassIcon: true`
- **WHEN** the user taps the card and cancels the dialog
- **THEN** no service is called, the icon is the generic glyph (no `device_class` lookup), and the state line shows the raw state
- **WHEN** the user taps again and confirms
- **THEN** exactly one `homeassistant.toggle` is attempted, with any failure surfacing through the standard card error state.

#### Scenario: Number card follows the helper's mode, override wins

- **GIVEN** an `input_number.target_volume` helper with `mode: slider`, `min: 0`, `max: 100`, `step: 5`, and no `controlStyle` set, at `row` tier
- **WHEN** the card renders and the user drags the slider to ~62% and releases
- **THEN** exactly one `input_number.set_value` fires with a value quantized to `step` (60) and within `[0, 100]`
- **WHEN** the card's `controlStyle` is set to `stepper`
- **THEN** the +/- stepper renders instead, still clamped to `[0, 100]` by 5.

#### Scenario: Datetime save reaches Home Assistant

- **GIVEN** an `input_datetime.alarm_time` helper with `has_time: true` and `has_date: false`
- **WHEN** the user picks `06:30` in the embedded input and commits
- **THEN** `input_datetime.set_datetime` is called with `{ time: '06:30:00' }` — no `setValue not supported for domain: input_datetime` error — verified by the unmocked-service-mapping unit test.

## Design Decisions

- **Bugfix first, in the service layer** — the `input_datetime` branch lands in `useServiceCall` (owned by the [entity-state spec](../specs/entity-state/index.md)) as its own PR before any option work, because the card's primary action is meaningless until saves reach Home Assistant. The current `setValue(entityId, value)` signature carries neither `has_date` nor `has_time`, so the branch MUST resolve the entity's attributes itself (look up the entity by id inside the service layer — or extend the API with an attributes argument) to choose the payload: `{ date }` for date-only, `{ time }` for time-only, `{ datetime }` for combined helpers. Tests MUST cover all three helper shapes, not just one, keeping the card free of service knowledge.
- **`stateLabels` as two flat form fields** — resolves the switch doc's nested-option-shape open question narrowly: the config form renders two plain string controls (`onLabel`, `offLabel`) that read/write into the nested `stateLabels` key; no `ConfigDefinition` schema extension. A generic object control is deferred until a second nested option exists.
- **Confirm gates every toggle-equivalent route** — the gate applies after action resolution (the lock/scene pattern), so `default`, `toggle`, and any configured `call-service` targeting the **same entity's toggle-equivalent services** (`switch.toggle`/`turn_on`/`turn_off` and the generic `homeassistant.toggle`/`turn_on`/`turn_off` aliases) are all gated and stale-state-guarded alike; `call-service` targeting unrelated services stays ungated (a future per-action `confirm` flag in the common action type can cover those, per the switch doc's open question).
- **Domain gating at the icon-resolution helper** — the `device_class` lookup lives behind a `domain === 'switch'` check in one pure, unit-tested helper, so the fallback path structurally cannot consult a foreign domain's `device_class`.
- **`input_number` default resolved at render, never stored** — an absent `controlStyle` key reads the entity's `mode` attribute each render, so a helper reconfigured in Home Assistant keeps steering unconfigured cards; only an explicit option value pins the style.
- **Pills degrade at render, not at config validation** — the tier and option-count checks run where the control renders, because helper option lists change at runtime; the stored config stays `pills` and simply re-engages when it fits again (degrade, never scroll, per the design system).

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — `input_datetime` service bugfix**: add the `input_datetime` → `input_datetime.set_datetime` branch to `useServiceCall.setValue` (payload per `has_date`/`has_time`); unmocked-service-mapping unit test proving `set_datetime` is called with the correct payload; close the "InputDateTimeCard service mapping is missing" open question in [entity-cards](../specs/entity-cards/index.md#open-questions) and the [card reference](../specs/entity-cards/card-reference.md#input-helper-cards), update the input-helpers option doc's carried-forward note, and record the fix in the spec changelog
- [ ] **PR 2 — Switch & fallback card options**: `confirm` (AlertDialog gating), `deviceClassIcon`, `stateLabels`, `showLastChanged` with config-form entries; fallback-safety tests for every option; stories; update [entity-cards — Button and fallback card](../specs/entity-cards/index.md#button-and-fallback-card), the switch option doc's status line, and the spec changelog
- [ ] **PR 3 — Input helper `controlStyle` options**: `input_boolean` tile|switch, `input_number` stepper|slider with the `mode`-attribute default, `input_select` dropdown|pills with tier/count gating; register the helpers' primary controls in the detail dialog's domain control slot (from [0014](./0014-universal-card-options.md)) and, in the same PR, complete the control-free `glance` layouts that 0011 deferred for the non-boolean helpers (their minimal controls were retained until this registration — per 0011's no-regression invariant) so `glance`-tier taps land on an operable dialog per the option doc; config-form entries; the legacy-pinning loader migrations (`controlStyle: 'switch'` / `'stepper'` onto pre-existing boolean/number items) with legacy/new-item tests; helper dispatches migrated to the 0014 non-retrying path with the transition-or-timeout guard and an early-acknowledgement boundary test; payload/gating tests + stories; update [entity-cards — Input helper cards](../specs/entity-cards/index.md#input-helper-cards), the input-helpers option doc's status line, and the spec changelog

## Out of Scope

- Universal options and the action system (0014); layout tiers (0011); tokens and the slider/pill primitives (0010).
- Nothing color-related remains deferred: `switch` and the input helpers use `--liebe-c-default` per the [design-system color table](../specs/design-system/index.md#domain-color-discipline), delivered as a token by 0010; this change only consumes it (including replacing ButtonCard's current amber active styling).
- `confirm` for `call-service` actions targeting **unrelated** services (same-entity toggle-equivalent routes ARE gated, per the functional requirements — this exclusion covers only services on other entities/domains, deferred to a future per-action `confirm` flag in the common action type); a `more-info` tap default for non-toggleable fallback domains; promoting the per-tier `glance` action fallback into the common action type (open questions carried forward). The `mode: slider` migration question is NOT deferred — it is resolved by the legacy-pinning requirement above (existing items pinned to `controlStyle: 'stepper'`; only new cards follow the `mode` attribute).
- Other domain cards (0016–0021, 0023+); history data in the detail dialog (0015).
