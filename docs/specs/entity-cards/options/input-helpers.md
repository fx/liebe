# Card Options — Input Helpers

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) (universal options are not repeated here). **Status: specified, not yet implemented.**

This document covers the five input helper cards: `InputBooleanCard`, `InputNumberCard`, `InputSelectCard`, `InputTextCard`, and `InputDateTimeCard` (`src/components/Input{Boolean,Number,Select,Text,DateTime}Card.tsx`), registered for the `input_boolean`, `input_number`, `input_select`, `input_text`, and `input_datetime` domains respectively. All five exist today with no per-card configuration surface; this spec defines their target option surface. Input helpers are user-defined entities, so the cards MUST derive everything they can from the helper's own attributes (`min`/`max`/`step`/`mode`, `options`, `min`/`max`/`pattern`/`mode`, `has_date`/`has_time`) — options exist only to tune presentation, never to override what the helper allows (see [common conventions](./common.md#conventions-for-per-card-options), rule 3).

## Primary action

`tapAction: default` means, per domain:

- **`input_boolean`** — **toggle** (`input_boolean.toggle` on the entity). The whole tile is the touch target, like a switch.
- **`input_number`** — **focus the value control**: in tiers showing the stepper, focus the click-to-edit value field (entering edit state); in tiers showing the slider, focus the slider thumb. In `glance` (no embedded control), `default` MUST fall back to `more-info`, where the detail dialog exposes the full control.
- **`input_select`** — **open the control**: open the dropdown (or, in pill presentation, focus the pill group). In `glance`, fall back to `more-info`.
- **`input_text`** — **focus the text field**, entering inline edit state. In `glance`, fall back to `more-info`.
- **`input_datetime`** — **open the native date/time picker** on the embedded input. In `glance`, fall back to `more-info`.

"Focus/open" MUST behave exactly as if the user had tapped the embedded control directly — no service call fires from the tap itself; the control's own commit semantics (submit, blur-revert, option select) apply unchanged. As required by the [common action rules](./common.md#action-type), taps that land **on** an embedded control are consumed by the control and never re-trigger `tapAction`.

## Options per helper

### `input_boolean`

| Key            | Type   | Default | Tiers | Behavior                                     |
| -------------- | ------ | ------- | ----- | -------------------------------------------- |
| `controlStyle` | select | `tile`  | all   | `tile` \| `switch` — how the toggle presents |

- `tile` (default): the card renders no discrete control; the **whole tile is the toggle**, and the `on` state renders with the active tint pattern (domain-colored glyph on a ~20%-alpha tint per the [design-system active-state pattern](../../design-system/index.md#domain-color-discipline)).
- `switch`: the card additionally renders the discrete `Switch` control (current behavior, `InputBooleanCard.tsx`) in tiers with room for it (`row`, `tall`, `full`); the tile tap still toggles. In `glance` the switch is omitted and the card behaves as `tile` — degrade by omission, never clipping.
- Either style MUST call `input_boolean.toggle`, keep the toggle blocked from dispatch until the expected state transition or an acknowledgement timeout (per change 0022 — a promise-scoped guard lets a second tap toggle the helper straight back after early acknowledgement), suppress it when `unavailable` or `unknown` (indeterminate direction — never actuate), and hide interactive controls in edit mode.

### `input_number`

| Key            | Type   | Default       | Tiers         | Behavior                                               |
| -------------- | ------ | ------------- | ------------- | ------------------------------------------------------ |
| `controlStyle` | select | entity `mode` | row/tall/full | `stepper` \| `slider` — which embedded control renders |

- The default MUST follow the helper's own `mode` attribute: `box` → `stepper`, `slider` → `slider`. Setting the option overrides the entity's preference in either direction.
- `stepper`: the current +/- buttons around a click-to-edit value field (`InputNumberCard.tsx`). Increment/decrement MUST step by `step` and clamp to `[min, max]`, with the buttons disabled at the respective bound; typed input MUST be validated, clamped to `[min, max]`, and invalid input MUST revert without calling the service (current behavior — these clamp/validation rules remain MUST regardless of `controlStyle`).
- `slider`: the [design-system embedded slider](../../design-system/index.md#card-anatomy) (`liebe-slider`, 42px track, domain-tint fill, value readout in-track), horizontal in `row`/`full` and vertical in `tall`. Drag MUST hold local state and commit `input_number.set_value` only on release; the committed value MUST be quantized to `step` and clamped to `[min, max]`.
- Both styles send `input_number.set_value` with `{ value }`.

### `input_select`

| Key            | Type   | Default    | Tiers         | Behavior                                    |
| -------------- | ------ | ---------- | ------------- | ------------------------------------------- |
| `controlStyle` | select | `dropdown` | row/tall/full | `dropdown` \| `pills` — how options present |

- `dropdown` (default): the current Radix `Select` of the entity's `options` (`InputSelectCard.tsx`); MUST be disabled when the helper has no options.
- `pills`: an equal-width [pill group](../../design-system/index.md#card-anatomy) (`liebe-pill`), one pill per option, the current state's pill selected via the active tint pattern. Pills render only in the `full` tier **and** only when the option count is ≤ 5; in other tiers, or with more than 5 options, the card MUST fall back to `dropdown` presentation (an oversized pill row would clip — degrade, never scroll).
- Both styles send `input_select.select_option` with `{ option }`.

### `input_text`

No options beyond the [universal set](./common.md#universal-options).

- Inline editing with the helper's `min`/`max` length and `pattern` validation stays as specified in [entity-cards](../index.md#input-helper-cards): `input_text.set_value` fires only for valid input.
- Masking the displayed and edited value when the helper's `mode === 'password'` **remains a MUST** and is not configurable — a presentation option MUST NOT be able to unmask a password helper.
- **The guarantee is per-value, not per-surface.** It binds every surface Liebe renders the helper's state on, not just the card: the [detail dialog](./common.md#action-type) MUST mask or omit a password helper's value in both its state display and any domain control it mounts. The `glance` tier's default tap resolves to `more-info`, so an unmasked dialog would expose exactly the value the card just hid — reachable in one tap, with no option involved.

### `input_datetime`

No options beyond the [universal set](./common.md#universal-options).

- The card renders a native date/time/datetime input driven by `has_date`/`has_time` and shows `(not set)` for empty/unknown values (current behavior).
- **Service mapping (owned by change [0022](../../../changes/0022-switch-input-helpers-to-spec.md)).** `useServiceCall.setValue` has no `input_datetime` branch today, so saves fail with `setValue not supported for domain: input_datetime`. 0022 adds the branch calling `input_datetime.set_datetime` with the payload shaped by `has_date`/`has_time` (`date`, `time`, or `datetime`), and normalizes the state↔input formats — Home Assistant publishes `YYYY-MM-DD HH:MM:SS` while `<input type="datetime-local">` requires `YYYY-MM-DDTHH:mm`. No option here depends on that fix landing first; the picker behavior above is what the card renders either way.

## Tier layouts

Per the [design-system layout tiers](../../design-system/index.md#size-adaptive-layouts). Every input card implements `glance` and `row`; `tall` and `full` as below.

| Helper           | `glance` (1×1)                                                                                                                            | `row` (≥2×1)                                                        | `tall` (1×≥2)                                                   | `full` (≥2×≥2)                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `input_boolean`  | Icon circle + name + state; tile toggles                                                                                                  | Icon + meta + switch (if `controlStyle: switch`); tile toggles      | Icon top, meta bottom, switch between (if `switch`)             | As `row`, extra space is breathing room                                  |
| `input_number`   | **Value big** — the current value as the large numeric readout (`liebe-value`, tabular-nums) with unit muted; no control; tap → more-info | Icon + meta + **stepper** (or horizontal slider per `controlStyle`) | Icon top, **vertical slider** (or compact stepper), meta bottom | `row` control plus the `min – max` range line                            |
| `input_select`   | Icon + name + **current option as state**; tap → more-info                                                                                | Icon + meta + dropdown                                              | Icon top, dropdown, meta bottom                                 | Dropdown, or **pill group** when `controlStyle: pills` and ≤ 5 options   |
| `input_text`     | Icon + name + value as state (masked if password); tap → more-info                                                                        | Icon + meta + inline text field                                     | Icon top, text field, meta bottom                               | As `row`, wider field                                                    |
| `input_datetime` | Icon + name + formatted value / `(not set)`; tap → more-info                                                                              | Icon + meta + native input(s)                                       | Icon top, input(s), meta bottom                                 | As `row`; datetime helpers MAY split date and time inputs onto two lines |

- Content that does not fit a tier MUST be omitted, never clipped or scrolled ([design-system](../../design-system/index.md#size-adaptive-layouts)).
- All interactive controls are hidden in edit mode (selection semantics per [entity-cards](../index.md)).

## Scenarios

### Scenario: Tile-style boolean toggles from anywhere

- **GIVEN** an `input_boolean.guest_mode` card with defaults (`controlStyle: tile`), entity `off`
- **WHEN** the user taps anywhere on the tile
- **THEN** `input_boolean.toggle` is called once and, when the state becomes `on`, the icon circle animates to the active tint pattern
- **WHEN** `controlStyle` is set to `switch` at `row` tier
- **THEN** a discrete switch renders in the controls slot and reflects the same state.

### Scenario: Number card follows the helper's mode, override wins

- **GIVEN** an `input_number.target_volume` helper with `mode: slider`, `min: 0`, `max: 100`, `step: 5`, and no `controlStyle` set, at `row` tier
- **WHEN** the card renders
- **THEN** it shows the embedded horizontal slider
- **WHEN** the user drags to ~62% and releases
- **THEN** exactly one `input_number.set_value` fires with a value quantized to `step` (60) and within `[0, 100]`
- **WHEN** the card's `controlStyle` is set to `stepper`
- **THEN** the +/- stepper renders instead, still clamped to `[0, 100]` by 5.

### Scenario: Pills render only where they fit

- **GIVEN** an `input_select.house_mode` helper with 4 options and `controlStyle: pills`
- **WHEN** the card renders at `full` tier (2×2)
- **THEN** four equal-width pills render, the current option shown with the active tint pattern, and tapping another pill calls `input_select.select_option` with `{ option }`
- **WHEN** the card is resized to `row` (2×1), or the helper grows to 6 options
- **THEN** the card falls back to the dropdown presentation with no configuration change.

### Scenario: Password helper stays masked in every tier

- **GIVEN** an `input_text.wifi_password` helper with `mode: password`
- **WHEN** the card renders at `glance` and at `row`
- **THEN** the value is masked in the state line and in the edit field, and no card option can reveal it.

## Open Questions

- ~~**`input_datetime` service mapping.**~~ Resolved: change [0022](../../../changes/0022-switch-input-helpers-to-spec.md) owns the `setValue` branch and the state↔input format normalization, with a component test covering the realistic space-separated state format in both directions. Not an open decision — a scheduled bugfix.
- ~~**Domain color for input helpers.**~~ Resolved: input helpers use `--liebe-c-default` (blue) per the [design-system color table](../../design-system/index.md#domain-color-discipline) for the boolean active tint and the number slider fill.
- **`glance` fallback action.** Several helpers fall back from `default` to `more-info` in `glance` because the control doesn't fit. Whether this per-tier action fallback should be promoted into the [common action type](./common.md#action-type) (so other control-centric cards can reuse it) is open.
- ~~**Slider default vs. legacy stepper.**~~ Resolved per [common convention 7](./common.md#conventions-for-per-card-options): existing `input_number` items are pinned to `controlStyle: 'stepper'` by loader migration (change 0022); only newly added cards follow the helper's `mode` attribute default.

## References

- Current implementations: `src/components/InputBooleanCard.tsx`, `src/components/InputNumberCard.tsx`, `src/components/InputSelectCard.tsx`, `src/components/InputTextCard.tsx`, `src/components/InputDateTimeCard.tsx` (no config surface today)
- Baseline behavior: [entity-cards — Input helper cards](../index.md#input-helper-cards) · [card reference — Input helpers](../card-reference.md#input-helper-cards)
- Shared contract and conventions: [common.md](./common.md)
- Layout tiers, slider/pill anatomy, colors: [design-system](../../design-system/)
