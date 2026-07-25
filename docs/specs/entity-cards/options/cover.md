# Card Options — Cover

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: specified, not yet implemented.** The current `CoverCard` implements open/stop/close buttons with position-based disabling, an optimistic-drag position slider, and tilt controls — all capability-gated — but exposes no configuration surface and no tier layouts. The option keys, tiers, `invertPosition`, `deviceClassIcon`, and `stateLabels` below are new; the existing controls are retained, with the button disable logic refined (position-only when a position is available — see below). See [entity-cards — Covers and fans](../index.md#covers-and-fans) for the implementation baseline.

Covers carry the cool/sky domain token (`--liebe-c-cool`, Radix `sky` — [design-system — domain color discipline](../../design-system/index.md#domain-color-discipline)): an open or moving cover renders the active tint pattern in sky; a fully closed cover renders the inactive neutral pattern.

## Primary action

`tapAction: default` MUST resolve state-aware, with `unavailable`/`unknown` resolved first as **inert** (an indeterminate RF cover must never be commanded by a tap that cannot know which way it will move): then tilt-only entities (only tilt bits advertised) resolve to `more-info` (no open/close semantics — see the resolved open question); then, while the cover is `opening` or `closing` **and** the stop feature (bit 8) is supported, tap MUST call `cover.stop_cover`; otherwise it MUST call `cover.toggle` (open a closed cover, close an open one). Home Assistant does **not** guarantee that `cover.toggle` stops a moving cover — the default entity implementation picks open/close from `is_closed` — so the stop-while-moving behavior MUST be resolved explicitly by the card, which is the safest single-tap semantic for motorized hardware. On stop-incapable movers, tap while moving falls through to `cover.toggle` (best available).

Toggle is the right default for **ordinary covers** (blinds, shades, curtains, awnings, windows) — control entities with one overwhelmingly common intent, "make it go the other way" — matching every other control domain (light, switch, fan) and reserving the detail dialog for `holdAction: more-info`. **Exception — security openings:** covers with `device_class` `garage`, `gate`, or `door` MUST default to `more-info` instead (the lock-card reasoning: an accidental tap must not open the house's perimeter), and additionally gain the `confirmOpen` option (see the options table; default `true`) gating **every opening-increasing route at action resolution** — Open button, opening `toggle`, position commits to a higher effective position (slider gestures included), and configured `call-service` targeting `cover.open_cover`/`cover.toggle`/`cover.set_cover_position` **or the generic `homeassistant.toggle`/`turn_on` aliases** on the same entity (classification is by effect, per the common dispatch guarantees) — through one confirmation dialog per gesture (the lock-card pattern, un-bypassable by re-routing); closing stays ungated (the safe direction). When the direction of a route **cannot be classified** — the entity's state is `unknown`/`unavailable`, or a `cover.toggle`/`cover.set_cover_position` route has no current position to compare against — the gate MUST resolve conservatively: the route requires confirmation (or is inert where the default action already is), never a silent bypass; tested for the unknown-state and missing-position cases. Users MAY still set `tapAction: toggle` and `confirmOpen: false` deliberately. Embedded controls (buttons, sliders) consume their own events and MUST NOT trigger the tap action (per [common contract — Action type](./common.md#action-type)).

## Options

All keys live under `item.config`, camelCase, and follow [common conventions](./common.md#conventions-for-per-card-options) — in particular convention 3: whether a control _can_ appear is derived from the entity's `supported_features` bit flags (open `1`, close `2`, set-position `4`, stop `8`, open-tilt `16`, close-tilt `32`, stop-tilt `64`, set-tilt-position `128`); these options only hide capabilities the entity already has or tune presentation.

| Key                  | Type                               | Default                                                         | Behavior                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showPositionSlider` | boolean                            | `true`                                                          | Renders the position slider when the entity supports set-position (bit 4). Tiers: `row` (horizontal), `tall` (vertical), `full` (horizontal). Never in `glance`.                                                                                                                                                                                                                        |
| `showButtons`        | boolean                            | `true`                                                          | Renders the open / stop / close button row (each button gated by its own feature bit). Tier: `full` only.                                                                                                                                                                                                                                                                               |
| `showTiltControls`   | boolean                            | `true`                                                          | Renders tilt controls (tilt slider and/or tilt open/close buttons, per tilt feature bits). Tier: `full` only.                                                                                                                                                                                                                                                                           |
| `invertPosition`     | boolean                            | `false`                                                         | Declares the entity's position scale reversed (`0` = open). The card converts once at the entity boundary (`effective = 100 − raw`) and operates on the effective position everywhere — display, slider, committed `{ position }` payloads (converted back into the entity's reversed scale), and position-derived button disabling. All tiers.                                         |
| `deviceClassIcon`    | boolean                            | `true`                                                          | Chooses the default icon from the entity's `device_class` (garage, gate, blind, shade, curtain, window, door, shutter, awning, …), with distinct open/closed variants. When `false`, a generic cover icon is used. All tiers.                                                                                                                                                           |
| `stateLabels`        | select: `percent` \| `open-closed` | `percent` for positional covers, `open-closed` for binary ones  | Position display style on the state line. All tiers.                                                                                                                                                                                                                                                                                                                                    |
| `confirmOpen`        | boolean                            | `true` (offered only for `device_class` `garage`/`gate`/`door`) | Security-opening confirmation gate, applied at action resolution to **every route that increases the effective opening**: the Open button, an opening `toggle`, a `set_cover_position` commit to a higher effective position (slider included — one dialog per gesture), and configured `call-service` equivalents. Closing stays ungated. Not offered for non-security device classes. |

### Position slider (`showPositionSlider`)

- The slider MUST read the current position from `current_position` with a `position` attribute fallback, presented on a 0–100 scale, and committing MUST call `cover.set_cover_position` with `{ position }`.
- Drag state MUST stay local until commit (optimistic drag, per [entity-cards](../index.md#covers-and-fans)), so mid-drag state updates from a moving cover do not fight the user's gesture.
- In the `tall` tier the slider MUST render vertically with **top = open** — the slider fill mirrors the physical amount of opening, which is the natural mapping for blinds, shades, and shutters.
- On an entity without set-position support (bit 4 absent) the slider MUST NOT render regardless of this option; the card degrades to buttons and state.

### Open / stop / close buttons (`showButtons`)

- The row renders (in order) open, stop, close — each button only when its feature bit is present (bits 1, 8, 2).
- Position-based disabling, refined from today's implementation: **when a position is available**, disabling MUST use position only — open disabled at effective position `100`, close disabled at effective position `0` — so a stationary partially open cover (e.g. position `30`, state `open`) keeps **both** open and close enabled. State-based disabling (`open` disables open, `closed` disables close) applies **only to non-positional covers**, where state is binary. **Stop MUST be disabled unless the cover is `opening` or `closing`.** "Effective" position means after `invertPosition` mapping (see below), so disabling always agrees with what the user sees; state strings are never remapped.
- Buttons MUST call `cover.open_cover`, `cover.stop_cover`, and `cover.close_cover` respectively, with no data payload.

### Tilt controls (`showTiltControls`)

- Tilt content is gated by the tilt feature bits: open-tilt / close-tilt buttons render when bits 16 / 32 are present (`cover.open_cover_tilt`, `cover.close_cover_tilt`), a tilt-stop button when bit 64 is present (`cover.stop_cover_tilt`); a tilt position slider renders when bit 128 (`SET_TILT_POSITION`) is present, reading `current_tilt_position` (with a `tilt_position` fallback) and committing `cover.set_cover_tilt_position` with `{ tilt_position }`.
- The tilt slider follows the same optimistic-drag rule as the position slider. Tilt renders in the `full` tier only; on an entity with no tilt bits, nothing tilt-related renders regardless of this option.
- `invertPosition` MUST NOT apply to tilt — tilt has no widely-agreed "open" direction, and coupling the two inversions would surprise users of venetian blinds.

### Inverted position display (`invertPosition`)

Home Assistant's convention is `100` = fully open, `0` = fully closed, but some integrations (certain shutter and blind bridges) use the opposite scale throughout — they report `0` for open **and** interpret `set_cover_position` payloads on that same reversed scale. `invertPosition: true` declares the entity's scale reversed and converts **once at the entity boundary**: `effectivePosition = 100 − rawPosition`.

- The card MUST operate on the effective position everywhere: the percent readout, the slider fill and thumb, the position-derived portion of the state line, and position-derived button disabling — the number the user reads, the slider they drag, and what is enabled always agree.
- Committing the slider MUST convert the effective target back into the entity's reversed scale (`position = 100 − effectiveTarget`) before calling `cover.set_cover_position`, so the device receives the value in its own convention and physically moves to what the user chose (effective `100` → payload `{ position: 0 }` → fully open on a reversed device).
- **Scope of the option:** it models a _consistently_ reversed integration — one whose reporting and position commands share the reversed scale. Named commands (`open_cover` / `close_cover`) are unaffected; their meaning is defined by the integration. State strings (`open`/`closed`/`opening`/`closing`) are never remapped. If an integration mixes conventions (reversed reporting but HA-convention position commands), no card-side option can be coherent — the config form's description MUST note that such integrations should be fixed at the integration level.

### Device-class icon (`deviceClassIcon`)

- When `true`, the default icon MUST be selected by the entity's `device_class` — at minimum distinct glyphs for `garage`, `gate`, `blind`, `shade`, `curtain`, `window`, and `door`, with a generic cover glyph for unknown/absent classes — and each mapping MUST provide open and closed variants that follow the cover's state (moving states use the open variant).
- When `false`, the generic cover glyph (with open/closed variants) is used for every device class.
- The universal `icon` override (common contract) wins over both: a non-empty `icon` replaces the derived icon entirely and does not vary by state.

### State labels (`stateLabels`)

- The default is capability-derived: `percent` when the entity is positional (set-position supported or a position attribute is present), `open-closed` when it is binary (e.g. many garage doors and gates that only report `open`/`closed`).
- `percent`: while partially open, the state line reads the display position (e.g. `72% open`); at the extremes it reads `Open` / `Closed`.
- `open-closed`: the state line reads `Open` / `Closed` only, never a percentage — appropriate where intermediate percentages are noise (a garage door at "43%" is not useful information).
- In either style, `opening` / `closing` MUST display as `Opening` / `Closing` while the cover is moving, and the percent style MUST use the inverted value when `invertPosition` is set.
- Selecting `percent` on a binary cover is inert-safe: with no position attribute the label falls back to `open-closed` behavior. `hideState` (common contract) suppresses the line entirely.

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts):

| Tier     | Content                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Icon circle + name + state line (position % per `stateLabels`); whole tile is the tap action. No embedded controls.                                               |
| `row`    | Icon + name/state row plus the horizontal position slider (when supported and `showPositionSlider`). Binary covers render as `glance` content in row arrangement. |
| `tall`   | Icon on top, **vertical position slider** filling the middle (top = open — the slider becomes a miniature of the blind itself), name/state at the bottom.         |
| `full`   | `row` content plus, in order: the open/stop/close button row (`showButtons`), then tilt controls (`showTiltControls`) when tilt is supported.                     |

Content that does not fit MUST be omitted, never clipped or scrolled. All embedded controls MUST hide in edit mode (selection semantics apply, per [common contract](./common.md)).

## Scenarios

### Scenario: Options cannot enable an unsupported capability

- **GIVEN** a garage door with `supported_features: 11` (open + close + stop, no set-position) and no position attribute, on a `full`-tier card with `showPositionSlider: true` and `showTiltControls: true`
- **WHEN** the card renders
- **THEN** it shows the open/stop/close buttons but no position slider and no tilt controls, and the state line defaults to `open-closed` style.

### Scenario: Inverted display, unchanged service semantics

- **GIVEN** a positional cover reporting `current_position: 30` on a `row`-tier card with `invertPosition: true`
- **WHEN** the card renders
- **THEN** the readout and slider show `70%`; and **WHEN** the user drags the slider to `100` and releases, **THEN** the card calls `cover.set_cover_position` with `{ position: 0 }` — the effective target converted back into the **entity's reversed scale** (deliberately not HA's standard `100 = open` convention; the boundary mapping applies on writes as well as reads).

### Scenario: Position-based button disabling

- **GIVEN** a fully open cover (`state: open`, `current_position: 100`) on a `full`-tier card with defaults
- **WHEN** the card renders
- **THEN** the open button is disabled, the close button is enabled, and the stop button is disabled; and **WHEN** the user taps close and the state becomes `closing`, **THEN** the stop button becomes enabled.

### Scenario: Device-class icon follows state

- **GIVEN** a cover with `device_class: garage` in state `closed` and default options
- **WHEN** the card renders
- **THEN** it shows the closed-garage glyph on the inactive neutral tint; and **WHEN** the door opens, **THEN** the glyph switches to the open-garage variant on the sky-tinted active circle; and **WHEN** the user sets the universal `icon` override, **THEN** that icon replaces the derived one in both states.

## Open Questions

- ~~**Toggle on stateless covers.**~~ Resolved in the primary-action contract: `unknown`/`unavailable` resolve first as inert — the tap never dispatches against a state it cannot know the direction of.
- **Tilt inversion.** `invertPosition` deliberately excludes tilt, but venetian-blind users may eventually want an independent `invertTilt`. Deferred until demand is demonstrated (common convention 5 keeps the door open).
- **Slider during movement.** While `opening`/`closing`, the position attribute updates continuously; whether the slider should animate toward the target, snap on each update, or freeze until movement stops needs interaction testing alongside the design-system slider anatomy.
- ~~**`glance` tap on tilt-only covers.**~~ Resolved: a cover exposing only tilt bits has no meaningful `cover.toggle`, so `tapAction: default` resolves to **`more-info`** for tilt-only entities in every tier — the tilt controls (`full`) and the dialog are the control surface; the primary-action matrix is total. A tilt-aware tap MAY be revisited later.

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards — Covers and fans](../index.md#covers-and-fans) — implementation baseline (open/stop/close, position-based disabling, position/tilt sliders)
- [Design system](../../design-system/index.md) — tiers, card anatomy, cool/sky domain token for covers
- `src/components/CoverCard.tsx` — current implementation (feature-bit gating, optimistic slider drag, disable logic)
