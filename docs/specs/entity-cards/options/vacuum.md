# Card Options — Vacuum

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: specified, not yet implemented (new card).** No vacuum card exists; `vacuum` entities currently fall back to `ButtonCard` via the registry ([entity-cards — registry](../index.md#card-dispatch-and-registry)). The new `VacuumCard` MUST register under the `vacuum` domain in `domainToCard`, accept the shared `CardProps` contract, and render through the common shell like every other entity card. Its domain color is the vacuum token (`--liebe-c-vacuum`, teal — [design-system — domain color discipline](../../design-system/index.md#domain-color-discipline)).

## Primary action

`tapAction: default` MUST resolve to a state-dependent command — the action a user most plausibly wants next:

| Entity state              | Default tap action | Service        |
| ------------------------- | ------------------ | -------------- |
| `docked`                  | Start cleaning     | `vacuum.start` |
| `idle`                    | Start cleaning     | `vacuum.start` |
| `cleaning`                | Pause              | `vacuum.pause` |
| `paused`                  | Resume             | `vacuum.start` |
| `returning`               | Open details       | `more-info`    |
| `error`                   | Open details       | `more-info`    |
| `unavailable` / `unknown` | Inert              | —              |

- The whole tile is the tap target; embedded controls (command buttons, fan-speed select) consume their own events and MUST NOT trigger the tap action (per [common contract — Action type](./common.md#action-type)).
- The mapping MUST be feature-gated on `supported_features`: a state whose service the entity does not support falls through. **GIVEN** a `cleaning` vacuum without `PAUSE` (bit 4), **WHEN** the user taps, **THEN** the card MUST call `vacuum.stop` if `STOP` (bit 8) is supported, otherwise `more-info`. **GIVEN** a `docked`/`idle` vacuum without `START` (bit 8192), **WHEN** the user taps, **THEN** the card MUST open `more-info`.
- `returning` deliberately maps to `more-info`, not stop/dock: mid-return the least destructive default is inspection. During `returning` the dock button renders disabled (the vacuum is already heading home — see Commands below); pause, when `PAUSE` is supported, remains the explicit interruption control.

### Supported-feature flags

Controls and options in this document gate on these `supported_features` bits (Home Assistant `VacuumEntityFeature`):

| Flag          | Bit  | Gates                                                                      |
| ------------- | ---- | -------------------------------------------------------------------------- |
| `PAUSE`       | 4    | Pause command (button + default tap while `cleaning`)                      |
| `STOP`        | 8    | Stop command; `cleaning` tap fallback when `PAUSE` is absent               |
| `RETURN_HOME` | 16   | Dock button (`vacuum.return_to_base`)                                      |
| `FAN_SPEED`   | 32   | Fan-speed select (`vacuum.set_fan_speed`, options from `fan_speed_list`)   |
| `LOCATE`      | 512  | Locate button (`vacuum.locate`)                                            |
| `START`       | 8192 | Start/resume command (button + default tap while `docked`/`idle`/`paused`) |

Per [common convention 3](./common.md#conventions-for-per-card-options), options below only hide or tune capabilities the entity advertises — they MUST NOT surface a control whose flag is absent.

## Options

All keys live under `item.config`, camelCase, per [common conventions](./common.md#conventions-for-per-card-options).

| Key             | Type    | Default | Tiers         | Behavior                                                                                                                                                                                                                                                                           |
| --------------- | ------- | ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showCommands`  | boolean | `true`  | `row`, `full` | Renders the command button cluster. Which buttons appear is feature-gated (see below); the option only hides the cluster wholesale.                                                                                                                                                |
| `showBattery`   | boolean | `true`  | all           | Appends battery percentage to the state line when a battery source resolves (see Battery below). Under 20% the readout renders in amber (low-battery emphasis).                                                                                                                    |
| `showFanSpeed`  | boolean | `true`  | `full`        | Renders a select of `fan_speed_list` when `FAN_SPEED` is supported; selecting an option calls `vacuum.set_fan_speed` with `{ fan_speed }`.                                                                                                                                         |
| `showLocate`    | boolean | `false` | `full`        | Renders a locate button when `LOCATE` is supported; tapping calls `vacuum.locate`. Off by default — locating is occasional, not routine.                                                                                                                                           |
| `showStats`     | boolean | `false` | `full`        | Renders a stats line from `cleaned_area` and/or `cleaning_time` attributes when present. Off by default — not all integrations report them.                                                                                                                                        |
| `batteryEntity` | string  | `''`    | all           | The battery sensor to read, overriding the one derived from the vacuum's device (`utils/deviceSiblings` — `findBatterySibling`). Empty means derive it. Set it when a device reports more than one battery — a separate mop-pad cell, say — and the derived pick is the wrong one. |

### Commands (`showCommands`)

- The cluster MUST contain, in order and each only when its flag is supported: **start/pause** (a single button) and **dock** (`vacuum.return_to_base`, gated on `RETURN_HOME`).
- The start/pause button follows the primary-action state machine for command states (`docked`/`idle` → start, `cleaning` → pause, `paused` → resume) — **except `returning`**, where the state machine's `more-info` mapping applies only to the card tap: the button instead renders **Pause** and calls `vacuum.pause` when `PAUSE` is supported (the explicit interruption control), and renders disabled when it is not. This tap/button divergence in `returning` is deliberate: tap keeps the safe inspection default, the button offers the explicit command.
- The dock button MUST render disabled while the state is `docked` or `returning` (nothing to return); **all command controls** (start/pause, dock, locate, fan-speed select) MUST render disabled while the state is `unavailable`, `unknown`, or `error` — no physical command may dispatch from an indeterminate or failed state (in `error` the tap's `more-info` is the escalation path), matching the primary-action matrix.
- Buttons use the standard active/inactive tint pattern with the vacuum token and MUST meet the ≥44px touch-target minimum ([design-system — card anatomy](../../design-system/index.md#card-anatomy)).
- With `showCommands: false` the card body carries no buttons in any tier; the tap action remains the only control surface.

### Battery (`showBattery`)

- **The chain is `batteryEntity`, then the derived sibling, then the legacy attribute — and BOTH sensor sources MUST be exhausted before the attribute is considered.** A configured sensor that resolves to nothing (removed, renamed, not yet loaded) MUST fall to the derived sensor rather than past it to the deprecated path; ordering per source instead of sensors-then-attribute reads as equivalent and hands the answer to the legacy path whenever the preferred sensor is unreadable. The configured sensor comes **first**: `findBatterySibling` returns _a_ battery when a device exposes several, and correcting that pick is what `batteryEntity` is for, so an override that lost to the derivation could never do its job.
- **Battery comes from a battery sensor, not the vacuum entity.** Home Assistant deprecated `StateVacuumEntity.battery_level`/`battery_icon` in Core 2025.8 and they stop working in 2026.8; `VacuumEntityFeature.BATTERY` (bit 64) still exists in the enum — it is the attributes behind it that are going, not the flag — so the flag says nothing about whether a reading is available. The card MUST therefore read the percentage from a battery-sensor entity — the one on the vacuum's device (`device_class: battery`), or an explicitly configured `batteryEntity` — and MUST NOT gate on a `BATTERY` feature bit.
- `battery_level` on the vacuum entity MAY be consulted as a **legacy fallback** for integrations that have not migrated, and MUST NOT be the primary path. Once 2026.8 is the minimum supported Core version, the fallback is dead code and should be removed.
- When a percentage resolves, the state line MUST read state + battery (e.g. `Docked · 87%`) with the battery segment in the muted supporting-value style.
- **GIVEN** a battery percentage below 20, **WHEN** the state line renders, **THEN** the battery segment MUST render in the amber emphasis color instead of muted — a glanceable low-battery warning that does not repaint the whole card.
- When no battery source resolves, the option is inert and no battery segment renders regardless of its value. It composes with `hideState` (common contract): hiding the state line hides the battery with it.

### Fan speed (`showFanSpeed`)

- Rendered in the `full` tier only, as a select whose options are exactly the entity's `fan_speed_list`, with the current `fan_speed` attribute selected.
- Choosing an option MUST call `vacuum.set_fan_speed` with `{ fan_speed: <option> }`. An empty or missing `fan_speed_list` MUST hide the control even when the flag is set.
- A select (not pills) is deliberate: `fan_speed_list` length varies widely across integrations and MUST NOT overflow the tier ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)).

### Stats (`showStats`)

- The stats line renders whichever of `cleaned_area` (with unit, typically m²) and `cleaning_time` (formatted as a duration) the entity reports, separated by a middot; if neither attribute is present the line MUST NOT render.
- Values are read-only, muted, and use `tabular-nums` per the [design-system typography rules](../../design-system/index.md#typography).

### Error state (required behavior, not an option)

- **GIVEN** the entity state is `error`, **WHEN** the card renders in any tier, **THEN** the icon circle and state text MUST use the alert color token (`--liebe-c-alert`) instead of the vacuum token, and the state line MUST show the diagnostic message from the entity's `error` attribute when present, falling back to `Error`. (`VacuumEntityFeature.STATUS` and its `status` attribute are not part of the current vacuum feature set and MUST NOT be relied on.)
- The `error` attribute text MUST be ellipsized to one line per the state-line typography rules, with the full text available via `more-info` (the default tap in `error`).

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts). Active states (`cleaning`, `returning`) use the teal active tint pattern; `docked`/`idle`/`paused` render inactive; `error` renders alert.

| Tier     | Content                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Icon circle + name + state line (with battery segment when enabled); whole tile fires the primary action. No buttons.                                                   |
| `row`    | `glance` content in a row layout, plus the command cluster (start/pause + dock, feature-gated, when `showCommands`).                                                    |
| `full`   | `row` content plus, in order: fan-speed select (`showFanSpeed`), locate button (`showLocate`), stats line (`showStats`) — each only when supported/present and enabled. |

A `tall` tier is not specified for this card generation; at 1×N spans the card MUST render the `glance` layout. Content that does not fit its tier MUST be omitted, never clipped or scrolled.

## Scenarios

### Scenario: Tap follows the state machine

- **GIVEN** a vacuum card with defaults whose entity is `docked` and supports `START` and `PAUSE`
- **WHEN** the user taps the card body
- **THEN** the card calls `vacuum.start`; and **WHEN** the entity state becomes `cleaning` and the user taps again, **THEN** the card calls `vacuum.pause` — never a blind toggle.

### Scenario: Options cannot enable an unsupported capability

- **GIVEN** a vacuum advertising only `START | RETURN_HOME` on a `full`-tier card with `showFanSpeed: true` and `showLocate: true`
- **WHEN** the card renders
- **THEN** it shows start and dock buttons but no fan-speed select and no locate button — the options are inert because `FAN_SPEED` and `LOCATE` are absent.

### Scenario: Low battery renders amber

- **GIVEN** a `docked` vacuum whose battery sensor reports 14, with default options
- **WHEN** the state line renders
- **THEN** it reads `Docked · 14%` with the `14%` segment in the amber low-battery emphasis; and **WHEN** the percentage rises to 20 or above, **THEN** the segment reverts to the muted style.

### Scenario: Error state overrides the domain color

- **GIVEN** a vacuum whose state is `error` with `error: "Main brush stuck"` in its attributes
- **WHEN** the card renders in `glance` tier
- **THEN** the icon and state text use the alert color, the state line reads the error text, and tapping the tile opens the entity detail dialog.

## Open Questions

- **Room/zone map targeting is out of scope.** Interactive map rendering and per-room/zone cleaning commands are explicitly NOT part of this card generation — attribute shapes for maps and segment targeting are integration-specific and unstandardized. Noted as future work; a later `full`-tier extension or dedicated variant may add it without breaking this option surface.
- ~~**Battery source migration.**~~ Resolved against current Home Assistant: `battery_level`/`battery_icon` were deprecated in Core 2025.8 and stop working in 2026.8, so the Battery section above is sensor-first with the attribute as legacy fallback only. Resolved by change 0025 PR 2: the card derives the battery sensor from the vacuum's own device (`utils/deviceSiblings` — `findBatterySibling`), and `batteryEntity` overrides that derivation. Both ship; nothing is fetched, because the entity registry and states are already live on `hass`.
- **Stop as a visible button.** `STOP` currently serves only as the `cleaning`-tap fallback when `PAUSE` is absent. Whether a dedicated stop button belongs in the `row`+ command cluster (three buttons instead of two) is deferred until touch testing of the cluster width.

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards](../index.md) — registry pattern (`domainToCard`), `CardProps` contract the new card must implement
- [Design system](../../design-system/index.md) — tiers, card anatomy, `--liebe-c-vacuum` (teal) and `--liebe-c-alert` tokens
- Home Assistant vacuum integration — `VacuumEntityFeature` flags, `vacuum.start` / `pause` / `stop` / `return_to_base` / `set_fan_speed` / `locate` services, `fan_speed_list`, `cleaned_area`, `cleaning_time`, `error` attributes
