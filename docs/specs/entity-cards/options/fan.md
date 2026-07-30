# Card Options — Fan

Extends the [common contract](./common.md); universal options apply as specified there and are not repeated here.

**Status: implemented** by change [0019](../../../changes/0019-cover-fan-cards-to-spec.md) PR 2, on the tier layouts change [0011](../../../changes/0011-layout-tiers.md) PR 3 laid down. Every option key below is live, edited from the shared configuration form and capability-gated from the entity. Two consequences of the new defaults are worth stating here: existing fan cards keep their step buttons through a **version-marker loader migration** (common convention 7 — the slider default replaces how a placed card is operated, so only newly created cards get it), and the preset row moved to `full`, with the detail dialog's domain control slot carrying speed and presets for every tier that shows neither. The hardcoded quartile buttons are gone: pills now derive from the fan's own speed count. See [entity-cards — Covers and fans](../index.md#covers-and-fans) for the card-level requirements. One row below is only partly covered by this status: `sliderPlacement` arrived with change [0034](../../../changes/0034-slider-placement.md) PR 1, which carries the schema and the configuration row for `auto`, `horizontal` and `vertical`; its `background` value is specified there and not yet implemented.

## Primary action

`tapAction: default` MUST toggle the fan — with `unavailable`/`unknown` resolved first as **inert** (no service dispatch against an unavailable device): `fan.turn_off` when the entity state is `on`, `fan.turn_on` for any other real state. This is the rule for a fan that advertises the capability; the capability gate immediately below qualifies it, and the direction it names is what the one-bit gap would revisit. The whole tile is the tap target; embedded controls (speed slider, step pills, preset pills, oscillate/direction toggles) consume their own events and MUST NOT trigger the tap action (per [common contract — Action type](./common.md#action-type)).

**No card gesture switches a fan advertising neither `TURN_ON` (32) nor `TURN_OFF` (16).** This covers the tile's primary action and every gesture that routes to a toggle; the embedded controls are a separate question, and one of them is the documented gap two paragraphs below. Home Assistant gates `fan.turn_on`, `fan.turn_off` and `fan.toggle` on that pair — either bit alone satisfies `fan.toggle`, and neither leaves all three refused with `ServiceNotSupported` — and as of 2026.7.2 the compatibility shim that used to supply the bits for entities implementing the methods is gone, so the mask is the whole answer. On such a fan `tapAction: default` MUST resolve to `more-info`, and a `toggle` stored on any gesture MUST reach the detail dialog rather than a service call. Falling back rather than suppressing the tap is deliberate: at `glance` the tap is the card's only affordance, so an inert tile would be an operability regression, and the dialog is where this card's speed and presets already live at that tier. **`confirm` MUST NOT prompt on such a fan**: the confirmation gate classifies a route by what it is rather than by what the card does with it, so a stored `toggle` would otherwise be announced as "Turn on …" in front of a dialog that switches nothing — a prompt naming an action the entity cannot perform. No gesture route this card resolves actuates the power of a fan advertising neither bit, so that gate — which sees resolved gestures and not embedded controls — has nothing left to guard.

**A fan advertising exactly one of the pair is not covered by this gate, and is a known gap.** `fan.turn_on` requires `TURN_ON` and `fan.turn_off` requires `TURN_OFF` individually, so a `TURN_ON`-only fan that is already `on` — and a `TURN_OFF`-only fan that is already `off` — is still sent the service it lacks. The gate above reads the pair as a union because that is what `fan.toggle` requires, which answers "can this fan be switched at all" and not "can it be switched in the direction this tap implies". Making the resolution state-aware, or dispatching `fan.toggle` for a one-bit entity, are the two candidate answers; neither is specified here. Entities publishing exactly one of the pair are rare — the shim that supplied the bits supplied both — which is why this is recorded rather than guessed at.

Setting a **speed** is outside this gate: `fan.set_percentage` carries no such requirement and implies turn-on, which is how a speed-capable fan of this kind is started. Its **zero** commit is not, and is a known gap rather than a contract — a slider committed at `0` dispatches `fan.turn_off` (below, "Slider committed at zero turns the fan off"), which this fan refuses for exactly the reason above. What a zero commit should do where the fan cannot be turned off is unsettled: clamping to the lowest non-zero speed and refusing the commit are both defensible, and neither is specified here.

## Options

All keys live under `item.config`, camelCase, and follow [common conventions](./common.md#conventions-for-per-card-options) — in particular convention 3: whether a control _can_ appear is derived from the entity's `supported_features` bit flags; these options only hide or tune capabilities the entity already has. The relevant fan feature bits are `SET_SPEED` (1), `OSCILLATE` (2), `DIRECTION` (4), and `PRESET_MODE` (8).

| Key               | Type                                  | Default  | Behavior                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `speedControl`    | select: `slider` \| `steps` \| `none` | `slider` | Style of the percentage control, shown when the entity supports `SET_SPEED`. Tiers: `row` (horizontal), `tall` (vertical), `full`; never in `glance` for inline placements — under `speedControl: slider`, `sliderPlacement: background` renders in every tier, `glance` included ([shared contract](./common.md#shared-slider-placement-sliderplacement)). |
| `sliderPlacement` | select                                | `auto`   | Placement/orientation of the speed slider, per the [shared slider-placement contract](./common.md#shared-slider-placement-sliderplacement). Applies only under `speedControl: slider`; inert for `steps`/`none`. `background` is _change [0034](../../../changes/0034-slider-placement.md)'s second task, not yet implemented_.                             |
| `showPresets`     | boolean                               | `true`   | Renders preset-mode pills when the entity supports `PRESET_MODE` and reports a non-empty `preset_modes` list. Tier: `full` only.                                                                                                                                                                                                                            |
| `showOscillate`   | boolean                               | `true`   | Renders an oscillation toggle when the entity supports `OSCILLATE`. Tier: `full` only.                                                                                                                                                                                                                                                                      |
| `showDirection`   | boolean                               | `false`  | Renders a forward/reverse direction control when the entity supports `DIRECTION`. Tier: `full` only.                                                                                                                                                                                                                                                        |
| `animateIcon`     | boolean                               | `true`   | Spins the fan glyph while the fan is `on`, at a rate proportional to the current speed. Affects all tiers (it animates existing content, adds none).                                                                                                                                                                                                        |
| `showPercentage`  | boolean                               | `true`   | Shows the current percentage in the state line (e.g. `On · 75%`). Affects all tiers with a state line.                                                                                                                                                                                                                                                      |

### Speed control (`speedControl`)

- Shown only when the entity supports `SET_SPEED`; on a fan without it the option is inert and no speed control renders regardless of the value.
- `slider` (the default) renders the embedded slider anatomy (`liebe-slider`, [design-system — card anatomy](../../design-system/index.md#card-anatomy)): horizontal in `row` and `full`, vertical in `tall`. Drag state MUST stay local until commit (optimistic drag, per [entity-cards](../index.md)); committing MUST call `fan.set_percentage` with `{ entity_id, percentage }`.
- `steps` renders discrete equal-width pills (`liebe-pill`) derived from the entity's `percentage_step` via its **speed count**, which is what that attribute actually encodes (Home Assistant defines `percentage_step` as `100 / speed_count`). One algorithm, total for every step value:
  1. `speedCount = max(1, round(100 / percentage_step))`
  2. Pill `i` of `1…speedCount` has value `round(i * 100 / speedCount)`

  This always yields integers, always ends exactly at `100`, and never needs a separate clamp or pin: `percentage_step: 25` → 25 / 50 / 75 / 100; `33.33` → 33 / 67 / 100; `30` → 33 / 67 / 100 (three speeds). Deriving pills as raw multiples instead would end a non-divisor fan below full speed (step `30` → 30 / 60 / 90, no way to reach 100) — the reason this contract is expressed as a count rather than a multiplication. Payloads are the pill values exactly as labelled, since `fan.set_percentage` coerces `percentage` to an integer in 0–100. The selected pill is the one nearest the current `percentage` within half a step. When `percentage_step` is absent, non-positive, or yields **more than 6 pills** (`speedCount > 6`), the card MUST fall back to four quartile pills (25/50/75/100). The limit is a fixed count, not a layout measurement: 'as many as fit' cannot be unit-tested and would let two implementations disagree on the same entity. Six is the most that stays touch-legible at `row` width; tiers narrower than `row` render no step control at all. Tapping a pill MUST call `fan.set_percentage` with that value.

- `none` hides the percentage control entirely; speed is then adjustable only through presets (if shown) or the entity detail dialog.
- Committing 0% — slider released at 0 — MUST call `fan.turn_off`, not `fan.set_percentage` with `0` (matching the shipped behavior). Step pills MUST NOT include a 0 pill; turning off is the tap action's job.
- Interacting with the speed control while the fan is `off` MUST turn it on at the committed percentage (`fan.set_percentage` implies turn-on in Home Assistant); the card MUST NOT require a separate toggle first.

### Preset modes (`showPresets`)

- Rendered in the `full` tier as a pill row built from the entity's `preset_modes` attribute; the pill matching `preset_mode` renders as selected.
- Tapping a pill MUST call `fan.set_preset_mode` with `{ entity_id, preset_mode }`.
- When the entity does not support `PRESET_MODE`, or `preset_modes` is empty, the row MUST NOT appear even with `showPresets: true`.
- Presets and the speed control are independent: a fan supporting both renders both in `full` (subject to fit — content that does not fit the tier is omitted, never clipped).

### Oscillation (`showOscillate`)

Rendered in the `full` tier as a toggle reflecting the `oscillating` attribute. Toggling MUST call `fan.oscillate` with `{ entity_id, oscillating: <bool> }`. When the entity does not support `OSCILLATE` the toggle MUST NOT appear even with `showOscillate: true`.

### Direction (`showDirection`)

Rendered in the `full` tier as a forward/reverse control reflecting the `direction` attribute (`forward` | `reverse`). Selecting a direction MUST call `fan.set_direction` with `{ entity_id, direction }`. Defaults to `false` because ceiling-fan direction is a seasonal, rarely-touched setting; users opt in per card. When the entity does not support `DIRECTION` the control MUST NOT appear even with `showDirection: true`.

### Icon animation (`animateIcon`)

- While the fan is `on` and `animateIcon` is `true`, the fan glyph MUST rotate continuously, with the rotation rate proportional to the current percentage (higher percentage → faster spin). A fan without `SET_SPEED` (no percentage) spins at a single fixed rate while on. While `off`, the glyph MUST be static.
- The animation MUST be disabled under `prefers-reduced-motion: reduce`, regardless of this option's value, per [design-system — motion](../../design-system/index.md#motion). With animation suppressed, the on/off state remains fully conveyed by the active tint pattern and state text — the spin is decorative, never the sole state signal.
- When `false`, the glyph never rotates in any state.

### State-line percentage (`showPercentage`)

When `true` (default), the fan supports `SET_SPEED`, and the fan is `on` with a nonzero `percentage`, the state line MUST include the current percentage (e.g. `On · 75%`; with an active preset, the preset name takes the primary slot: `Sleep · 30%`). When `false`, unsupported, or the fan is `off`, the state line shows the bare state/preset. This option composes with the universal `hideState` — hiding the state line hides the percentage with it.

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts):

| Tier     | Content                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Icon circle + name + state; whole tile toggles. No embedded controls.                                                                                            |
| `row`    | Icon + name/state row + horizontal speed control (slider or step pills, when supported and `speedControl` ≠ `none`).                                             |
| `tall`   | Icon on top, vertical speed slider filling the middle, name/state at the bottom. With `speedControl: steps`, a vertical stack of step pills replaces the slider. |
| `full`   | `row` content plus, in order: preset pills, then an oscillate toggle and direction control side by side — each only when supported and enabled.                  |

Content that does not fit MUST be omitted, never clipped or scrolled. The active icon circle uses the fan domain token (`--liebe-c-ok`, green — [design-system — domain color discipline](../../design-system/index.md#domain-color-discipline)) unless the universal `color` option overrides it.

## Scenarios

### Scenario: Step pills derive from percentage_step

- **GIVEN** an `on` fan advertising `SET_SPEED` with `percentage_step: 25` and `percentage: 50`, on a `row`-tier card with `speedControl: steps`
- **WHEN** the card renders
- **THEN** it shows four pills — 25, 50, 75, 100 — with the 50 pill selected; and **WHEN** the user taps the 75 pill, **THEN** the card calls `fan.set_percentage` with `{ percentage: 75 }`.

### Scenario: Reduced motion stops the spin

- **GIVEN** an `on` fan at 80% on a card with `animateIcon: true`
- **WHEN** the card renders in a browser reporting `prefers-reduced-motion: reduce`
- **THEN** the fan glyph does not rotate, while the active tint and state text still indicate the fan is on.

### Scenario: Options cannot enable an unsupported capability

- **GIVEN** a fan with `supported_features: 1` (`SET_SPEED` only) on a `full`-tier card with `showOscillate: true` and `showDirection: true`
- **WHEN** the card renders
- **THEN** it shows the speed control but neither the oscillate toggle nor the direction control — the options are inert because the entity lacks the capabilities.

### Scenario: A fan that cannot be switched opens its details

- **GIVEN** an `on` fan with `supported_features: 15` — speed, oscillation, direction and presets, but neither switching bit — on a `glance`-tier card with default options
- **WHEN** the user taps the tile
- **THEN** the card dispatches no service call and the entity detail dialog opens; and the same tap on the same fan configured with `tapAction: toggle` does the same.

### Scenario: Slider committed at zero turns the fan off

- **GIVEN** an `on` fan at 40% on a `row`-tier card with default options
- **WHEN** the user drags the speed slider to 0 and releases
- **THEN** the card calls `fan.turn_off` (not `fan.set_percentage` with `0`), and the tile transitions to the inactive pattern.

## Open Questions

- **Turn-on percentage.** The shipped card turns a speed-capable fan on at a hardcoded 50%. Whether tap-on should instead send a bare `fan.turn_on` (letting the device restore its last speed) — or expose a `turnOnPercentage` option — is undecided; the hardcoded 50% is a baseline behavior, not a contract.
- **Domain color migration.** The design system assigns fans the green `--liebe-c-ok` token, but the shipped card styles the on state cyan. The migration to the domain token lands with the design-system implementation; no compatibility shim is planned since no config key encodes the old color.
- **Preset/speed precedence in `row`.** The shipped card shows the preset select _instead of_ speed buttons whenever presets exist. This spec makes them independent (`full` shows both), but `row` has space for only one control — whether a preset-capable fan's `row` tier should prefer the slider or the preset pills may need a follow-up option (a select is anticipated per common convention 5).
- ~~**Non-divisor `percentage_step`.**~~ Resolved in the [speed control](#speed-control-speedcontrol) section and implemented by change [0019](../../../changes/0019-cover-fan-cards-to-spec.md) (explicitly not deferred): pills derive from the entity's speed count (`round(100 / percentage_step)`) and are evenly divided integers ending at 100 — `33.33` and `30` both give 33 / 67 / 100 — with the selected pill the one nearest the current `percentage` within half a step. Only the label ergonomics on real 3-speed hardware (whether users expect `33` or a `Low`/`Medium`/`High` naming) may warrant a follow-up option; the arithmetic contract is settled.

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards — Covers and fans](../index.md#covers-and-fans) — implementation baseline (toggle, `set_percentage`, `set_preset_mode`, feature bits)
- [Design system](../../design-system/index.md) — tiers, card anatomy, domain color tokens, motion rules
- `src/components/FanCard/` — the card (`index.tsx`), the step arithmetic (`speedSteps.ts`), the capability reads (`features.ts`) and its detail-dialog controls (`FanDetailControls.tsx`); the stored option contract and the pinning migration are `src/store/fanOptions.ts`
