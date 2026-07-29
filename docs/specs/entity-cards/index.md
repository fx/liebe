# Entity Card System

## Overview

The entity card system renders every Home Assistant entity and dashboard widget as a self-contained, touch-first card on a grid screen. A domain-to-component registry (`cardRegistry.ts`) MUST map each entity domain (`light`, `climate`, `sensor`, …) to a React card component, and MUST fall back to a generic `ButtonCard` for unmapped domains. Every entity card SHALL share a common presentation shell (`GridCard`), be wrapped in an error boundary, adapt its content to the [layout tier](../design-system/index.md#size-adaptive-layouts) the renderer derives from its effective grid span (`glance` / `row` / `tall` / `full`), and expose consistent edit-mode affordances (select, delete, and — where supported — a per-card configuration modal). Non-entity widgets (text, separator) render directly without the entity shell or error boundary (see [`../grid-layout/`](../grid-layout/)). Cards that control an entity MUST call the corresponding Home Assistant service; read-only cards (sensors, weather) SHALL display state without side effects.

This spec is the living baseline of the card system as implemented. It EXCLUDES the camera card and WebRTC streaming (see [`../camera-streaming/`](../camera-streaming/)), grid placement and drag/resize mechanics (see [`../grid-layout/`](../grid-layout/)), and the entity state pipeline / hooks (see [`../entity-state/`](../entity-state/)). Exhaustive per-card details — service payloads, dimension tables, and every derived test scenario — live in the companion [card reference](./card-reference.md).

## Background

`liebe` is a Home Assistant custom panel built with TanStack Start (React SPA) and Radix UI Themes. A dashboard is a tree of screens; each screen holds a grid of `GridItem`s. Most grid items are entity cards, but items can also be non-entity widgets (`text`, `separator`). When a screen renders, `GridView` resolves each item to a card component and wraps it in an `EntityErrorBoundary`.

The registry pattern lets new domains be supported by adding one map entry plus a component, without touching the renderer. Cards were built incrementally per domain; as a result they share a strong common shell (`GridCard` + its compound `Icon`/`Title`/`Controls`/`Status` sub-components) and a common data contract (`CardProps`), but differ in how much configuration and interactivity each exposes. Weather was the first family with registered visual variants (default / modern / detailed / minimal), added alongside condition-based background images (PR #140); climate is the second (compact / dial).

## Requirements

### Card dispatch and registry

- The registry `domainToCard` MUST map entity domains to card components, and `getCardForEntity(entityId)` MUST resolve a component by splitting the domain off the entity id.
- The renderer MUST prefer a registered variant (`getCardVariant(domain, variant)`) when the grid item's `config.variant` is set, THEN fall back to the domain's default card, THEN fall back to `ButtonCard`.
- Each card component MAY declare static `defaultDimensions`; `getDefaultCardDimensions(entityId)` MUST return them, or `{ width: 2, height: 2 }` when none are declared.
- Cards MUST all accept the shared `CardProps` contract (`entityId`, `tier`, `span`, `onDelete`, `isSelected`, `onSelect`, `config`, `item`, `onConfigure`). A card MUST NOT derive its own tier or measure the DOM to infer its size — both arrive as props from the renderer ([design-system — size-adaptive layouts](../design-system/index.md#size-adaptive-layouts)).

#### Scenario: Unmapped domain falls back to ButtonCard

- **GIVEN** a grid item whose entity domain has no entry in `domainToCard`
- **WHEN** `GridView` resolves the card component for it
- **THEN** it renders `ButtonCard` with the shared card props (`GridView.tsx:56-66`).

#### Scenario: Configured variant overrides the default card

- **GIVEN** a `weather.*` item with `config.variant = 'minimal'`
- **WHEN** the card is dispatched
- **THEN** `getCardVariant('weather', 'minimal')` supplies `WeatherCardMinimal` instead of the default weather card (`GridView.tsx:49-58`, `WeatherCard/index.tsx:15-22`).

### Common card shell, sizing, and lifecycle states

- Every entity card MUST render through `GridCard`, which SHALL stamp the tier as `data-tier`, apply the tier's height floor from the geometry tokens (`--liebe-card-min-height-row` for `glance`/`row`, `--liebe-card-min-height-tall` for `tall`/`full`), and expose compound `Icon`, `Meta`, `Title`, `Controls`, and `Status` slots.
- While initial entity data is loading (`isLoading || (!entity && isConnected)`), an entity card MUST render a `SkeletonCard` at the card's own tier — a placeholder is a tile like any other.
- When disconnected or the entity is missing (`!entity || !isConnected`), an entity card MUST render an `ErrorDisplay` card titled "Disconnected" (with a reload retry) or "Entity Not Found".
- When a service call is in flight, the card MUST reflect loading (dimmed icon, `grid-card-loading` pulse) and, on failure, MUST show an error border (`var(--red-6)`, 2px), a status of `ERROR`, and the error text as the card `title` tooltip.
- An `unavailable` entity MUST render a dotted-gray, dimmed card that still shows the friendly name and an `UNAVAILABLE` status.
- Stale state (`isStale`) MUST be threaded to `GridCard` but MUST NOT produce a distinct visual (stale styling was intentionally removed).
- In edit mode, `GridCard` MUST show a fixed-position action cluster with a delete button (`onDelete`) and, when `hasConfiguration && onConfigure`, a settings button; clicking the card SHALL toggle selection instead of invoking the entity action.

#### Scenario: Initial load shows a skeleton

- **GIVEN** an entity card whose entity has not yet arrived but the connection is up
- **WHEN** it renders
- **THEN** it shows a `SkeletonCard` at the card's tier and no controls (e.g. `SensorCard.tsx:130-132`, `LightCard.tsx:124-126`).

#### Scenario: Service failure surfaces an error border

- **GIVEN** the service-call hook reports an error
- **WHEN** the card renders
- **THEN** it shows a 2px red border, an `ERROR`/error status, and the error string as the card's `title` (e.g. `ClimateCard/__tests__/ClimateCard.test.tsx`, `CoverCard.test.tsx:430-452`).

### Lights

- `LightCard` MUST toggle the light on card click via `light.turn_on` / `light.turn_off`, and MUST show a brightness slider only in view mode when the light is on, supports brightness, `config.showBrightnessSlider !== false`, **and the tier is not `glance`** — a 1×1 tile carries no embedded control, and its operability comes from the whole-tile toggle and the hold action ([options/light.md — tier layouts](./options/light.md#tier-layouts)). The slider is horizontal at `row` and `full`, vertical at `tall`.
- Brightness MUST be presented on a 0–100 scale, converted to/from Home Assistant's 0–255 `brightness` attribute; committing 0 MUST turn the light off, and no nonzero percentage may round down to a `brightness` of 0 (which would be an off command in disguise).
- Brightness support MUST be detected from modern `supported_color_modes` (brightness / white / color_temp / hs / xy / rgb / rgbw / rgbww) with a fallback to the legacy `SUPPORT_BRIGHTNESS` (bit 1) feature flag.
- `LightCard` MUST expose a per-card configuration modal (`CardConfig.Modal`) via `onConfigure`.

#### Scenario: Dragging the brightness slider sets brightness

- **GIVEN** an `on` light supporting brightness at 100%
- **WHEN** the user drags the slider to 50% and releases
- **THEN** the card calls `light.turn_on` with `brightness ≈ 128` (`round(0.5 * 255)`), using local drag state until commit (`LightCard.tsx:62-81`, `226-244`).

See [card reference — Lights](./card-reference.md#lights) for the three brightness/slider test files and exact behavior.

### Climate

**Status: implemented** by change [0017](../../changes/0017-climate-card-to-spec.md). The option keys, their defaults, the tier layouts and the colour precedence live in [options/climate.md](./options/climate.md), which owns them; this section states only what holds of the card whatever it is configured to.

- `ClimateCard` MUST command the thermostat through `climate.set_temperature`, `climate.set_hvac_mode`, `climate.set_preset_mode` and `climate.set_fan_mode`, each control gated by the entity's own `supported_features` — target temperature (bit 1), range (bit 2), fan mode (bit 8), preset mode (bit 16) — and by a non-empty mode list where the service takes one. A `show*` option MUST NOT conjure a control the entity does not advertise.
- It MUST offer two presentations, resolved through the card registry's variant mechanism rather than a switch inside the card: `compact` (the stepper, and the default) and `dial` (the arc thermostat). `dial` MUST render only at `full` and MUST fall back to the compact layout for its tier below that, with identical service behaviour ([options/climate.md — variant](./options/climate.md#options)).
- Changing `variant` MUST NOT change behaviour: both presentations MUST step by `target_temp_step`, clamp to `[min_temp, max_temp]`, disable each stepper at the bound it would cross, send `{ target_temp_low, target_temp_high }` together in `heat_cool`, and refuse an inverted band (`low >= high`) rather than repairing it.
- Every embedded control MUST dispatch through the guarded, non-retrying path (common contract — dispatch guarantees): a retried `set_temperature` re-sends a setpoint the user may have moved on from, and a repeated `set_hvac_mode` is a compressor cycled twice.
- An `unavailable` **or `unknown`** climate entity MUST render the shell's neutral unavailable treatment with every control absent: neither state carries an HVAC mode, so a control built from its attributes would command a setpoint nobody knows.
- `glance` MUST carry no embedded control — the tile is the primary action, which for a thermostat is more-info — and the card MUST register its setpoint stepper and mode row in the detail dialog's domain slot, which is what keeps a 1×1 thermostat operable. All controls MUST be hidden in edit mode at every tier.
- Every draggable setpoint MUST also be operable without a pointer: the dial's heat and cool handles carry `role="slider"`, their accessible name and value on the element with that role, and arrow-key adjustment under the same band-preserving rule as the drag.
- `displayUnit` MUST convert only what is displayed. Service calls MUST always carry the entity's native unit — `hass.config.unit_system.temperature`, which is what Home Assistant core normalises climate values to and publishes them in, with a `temperature_unit` attribute honoured as a fallback for integrations that publish one — so a Fahrenheit display over a Celsius thermostat still sends `{ temperature: 21.5 }`.

#### Scenario: Increase raises the setpoint by one step

- **GIVEN** a `heat`-mode thermostat at `temperature: 21` with `target_temp_step: 0.5`
- **WHEN** the user presses the increase-temperature button
- **THEN** it calls `climate.set_temperature` with `{ temperature: 21.5 }` (`ClimateCard/__tests__/ClimateCard.test.tsx`).

See [card reference — Climate](./card-reference.md#climate) for range mode, min/max limits, and mode-switch scenarios.

### Covers and fans

**Status: implemented** by change [0019](../../changes/0019-cover-fan-cards-to-spec.md) — the cover in PR 1, the fan in PR 2.

- `CoverCard` MUST expose open / close / stop actions (`cover.open_cover`, `cover.close_cover`, `cover.stop_cover`), a position slider (`cover.set_cover_position` with `{ position }`), and — when tilt is supported — tilt controls (`set_cover_tilt_position`, `open_cover_tilt`, `close_cover_tilt`, `stop_cover_tilt`), each gated by its own `supported_features` bit **and by the tier**: the position slider renders at `row` (horizontal), `tall` (vertical) and `full`, the open/stop/close row and the tilt block at `full` only, and `glance` carries no embedded control at all ([options/cover.md — tier layouts](./options/cover.md#tier-layouts)). The tilt bits are `16`/`32`/`64`/`128` — stop-tilt is `64` and set-tilt-position is `128`, not the other way round.
- `CoverCard` MUST enable/disable open and close by **position alone whenever the entity reports one** — open disabled at `100`, close disabled at `0`, so a stationary partially open cover keeps both enabled — reading `current_position` with a `position` fallback; state-based disabling (`open` disables open, `closed` disables close) applies only to covers that report no position. Stop MUST be disabled unless the cover is `opening` or `closing`.
- `CoverCard` MUST resolve its glyph, its state text, its active tint and its button disabling from a **single** reading of the entity, so `invertPosition` cannot move one of the four without the others; and it MUST apply that inversion once at the entity boundary, on committed `{ position }` payloads as well as on what it displays.
- `CoverCard` MUST resolve `tapAction: default` state-aware — inert while `unknown`/`unavailable`, `more-info` for a tilt-only entity and for the `garage`/`gate`/`door` device classes, `cover.stop_cover` while moving where stop is supported, `cover.toggle` otherwise — and MUST gate **every** route that increases a security opening behind one confirmation per gesture, classifying by effect so a re-routed `call-service` cannot bypass it.
- `CoverCard` MUST register its open / stop / close controls in the detail dialog's domain slot, so a cover stays operable at the tiers where the button row does not render.
- `FanCard` MUST toggle the fan on card click, set speed via `fan.set_percentage` (`{ entity_id, percentage }`, with 0% turning the fan off), and set preset via `fan.set_preset_mode`; oscillation via `fan.oscillate` and direction via `fan.set_direction`, each gated by its own bit — `SET_SPEED` (1), `OSCILLATE` (2), `DIRECTION` (4), `PRESET_MODE` (8). Its speed control renders only while the fan is on and never at `glance`: at `row` (horizontal), `tall` (vertical) and `full`; presets, oscillation and direction are `full` only ([options/fan.md — tier layouts](./options/fan.md#tier-layouts)).
- `FanCard`'s step pills MUST derive from the entity's **speed count** (`round(100 / percentage_step)`), evenly divided so every value is an integer ending at `100` — never as raw multiples of the step, which strands a non-divisor fan below full speed — with a four-quartile fallback when no usable count is published or more than six pills would result.
- `FanCard`'s icon spin MUST be decorative: proportional to the speed, suppressed under `prefers-reduced-motion: reduce` **by the stylesheet** rather than by component logic, and never the sole signal that the fan is on.
- `FanCard` MUST register its speed and preset controls in the detail dialog's domain slot, so a fan stays adjustable at `glance`, under `speedControl: none`, and below the tier its preset row renders at.
- Introducing `speedControl` MUST NOT change how an already-placed fan card is operated: the loader pins existing items to `steps` behind a configuration-version marker, and only newly created cards take the slider default ([options/common.md](./options/common.md#conventions-for-per-card-options), convention 7).
- Both cards MUST hide their controls in edit mode, and both render their options in the shared configuration form, capability-gated from the entity — neither exposes a configuration modal of its own.

#### Scenario: Open button opens the cover

- **GIVEN** a cover advertising `supported_features: 1` (open)
- **WHEN** the user clicks "Open cover"
- **THEN** it calls `cover.open_cover` for that entity with no data (`src/components/CoverCard/__tests__/CoverCard.test.tsx`).

See [card reference — Covers and fans](./card-reference.md#covers-and-fans) for tilt, position-slider commit, and speed-bucketing details.

### Sensors and binary sensors

**Status: implemented** by change [0018](../../changes/0018-sensor-cards-to-spec.md). Both cards are read-only and MUST NOT call services from any built-in interaction.

- `SensorCard` MUST format its value through one ordered pipeline — raw value → `valueScale` → `displayPrecision` → unit — used by the big value, the trend delta and the `full` tier's min/max footer alike, so no two surfaces of one card can disagree about the same number.
- `SensorCard` MUST take its history graph, trend arrow and footer from the [entity-history pipeline](../entity-state/index.md#entity-history), and MUST let that pipeline decide whether a graph is possible rather than judging graphability itself.
- `BinarySensorCard` MUST resolve its glyph, its state text and its active tint from a **single** presented-state derivation, so `invert` cannot move one of the three without the others.
- A `device_class` MUST name both of a binary sensor's states and pick both of its glyphs from one table, and an active hazard sensor MUST NOT be configurable into a calm presentation by any option or combination of them.
- `BinarySensorCard` MUST expose a per-card configuration modal; `SensorCard` MUST NOT (its options render in the shared form).

#### Scenario: Power sensor auto-scales to kilowatts

- **GIVEN** a `power` sensor reading `1250` with unit `W` and no per-card config
- **WHEN** the card renders
- **THEN** it displays `1.3 kW` (`src/components/__tests__/sensorFormatting.test.tsx`, which pins the whole formatting matrix).

The option keys, defaults, tier layouts, formatting matrix, `device_class` tables and the hazard rule are owned by [options/sensor](./options/sensor.md); [card reference — Sensors](./card-reference.md#sensors-and-binary-sensors) records what the two cards are built from.

### Weather

**Status: implemented** by change [0020](../../changes/0020-weather-card-to-spec.md) — the tier-adaptive variants, `secondaryInfo` and `showConditionBackground` in PR 1, the forecast strips in PR 2. The option keys, their defaults, the tier layouts, the `secondaryInfo` fallback order and the condition-background rules live in [options/weather.md](./options/weather.md), which owns them; this section states only what holds of the card whatever it is configured to.

- The weather card is read-only: it MUST NOT call a service from any built-in interaction, `tapAction: default` MUST resolve to `more-info`, and it MUST embed no control at any tier. That is also why it ships **no** pinning migration — convention 7's boundary is the replacement of a control surface, and this card has none ([options/common.md](./options/common.md#conventions-for-per-card-options)).
- It MUST select a presentation from `config.variant`, falling back to the legacy `config.preset`, then `default`; variants are `default`, `modern`, `detailed`, `minimal`. Saving MUST rewrite `preset` to `variant`, and the render path MUST read the legacy key as a fallback for configs that never passed the loader — a story, the configuration preview, a card handed a literal — so no stored weather config needs a new key to render.
- `variant` and the layout tier MUST compose rather than compete: the variant chooses density and style, the tier chooses arrangement from the effective grid span. All four variants MUST implement all four tiers, and a variant MAY render **less** than its tier allows — `minimal` renders no secondary line, no forecast and no background at any tier — but never more.
- The four variants MUST derive the same value from the same input: the temperature conversion, the `secondaryInfo` fallback chain, the condition glyph and the artwork lookup MUST all agree, whichever variant is rendering. Variants differ in density and style, never in what a value MEANS.
- An attribute MUST be judged available by its **value**, not by its key. `Math.round(null)` is `0`, so a card reading attributes without that rule would report a `null` humidity as "0%" — and a numeric string MUST be read, because a template-backed weather entity publishes whatever its template rendered.
- Condition resolution MUST be forward compatible in both directions, since the condition vocabulary belongs to the integration: the glyph matches by substring and falls back to a neutral cloud, so a condition this build has never met still renders rather than blanking; the artwork map resolves `null` for anything it does not declare, leaving the card on its themed surface. `exceptional` MUST be matched first and by name — it is Home Assistant's "severe weather, or I cannot report" condition rather than a kind of weather, and a generic cloud tells the viewer the opposite of what the entity is saying.
- The artwork lookup MUST be an **own-property** check. The key is the entity's state, so any string reaches the table, and a plain object literal answers for its prototype: `CONDITION_BACKGROUNDS['constructor']` is a truthy function that would be interpolated into a URL. This is the second instance of that shape on the project — the climate card's `hvacModeConfig` is the first.
- When artwork resolves, background image URLs MUST be prefixed by `window.__LIEBE_ASSET_BASE_URL__` (falling back to `/`) and text/icons MUST go white with shadows for legibility. The big readout MUST take that treatment through the `--liebe-fg` / `--liebe-muted` tokens rather than an inline `color`, which the anatomy parts colour themselves in a cascade layer and would never see.
- Forecast content MUST come exclusively from `useWeatherForecast` ([entity-state — Weather Forecast](../entity-state/index.md#weather-forecast)); the card MUST NOT call `weather.get_forecasts` itself. A section its tier has no room for, or whose option is off, MUST subscribe to nothing rather than fetch a forecast nothing will draw; a section with no data MUST be absent entirely — no empty strip, no placeholder, no error state. `forecastHours` / `forecastDays` are upper bounds: the card renders what arrived and MUST NOT pad.
- A forecast column with no high MUST render no high. The twice-daily derivation emits a day built from a nighttime half alone, carrying that half's low and no temperature on purpose; substituting the low for the high here would reintroduce exactly the misreport that derivation exists to avoid.

#### Scenario: Config forces Fahrenheit

- **GIVEN** a weather entity reporting `22` with `temperature_unit: 'C'`
- **WHEN** rendered with `config.temperatureUnit = 'fahrenheit'`
- **THEN** it displays `72°F` (`WeatherCard.test.tsx` — "should convert temperature units correctly").

See [card reference — Weather](./card-reference.md#weather) for per-variant attributes, the condition→background map, and the backwards-compat preset scenarios.

### Input helper cards

- `InputBooleanCard` MUST toggle via `input_boolean.toggle` (card click or `Switch`), hide the switch in edit mode, and is the only input card that declares `defaultDimensions` (2×1).
- `InputNumberCard` MUST send `input_number.set_value` (`{ value }`) quantized to `step` and clamped to `[min, max]`, whichever control is rendering; a click-to-edit text field MUST validate and revert invalid input without calling the service.
- `InputSelectCard` MUST send `input_select.select_option` (`{ option }`) and MUST disable the control when the helper has no options.
- `input_boolean`, `input_number` and `input_select` MUST expose `controlStyle`, which selects between their two presentations; the values, defaults, tier and option-count gating are specified by [options/input-helpers.md](./options/input-helpers.md). Existing placed cards MUST keep the control they were built with, pinned by loader migration against a configuration version marker rather than key absence — an unset `controlStyle` is how a new card asks to follow the entity's own `mode`.
- `InputTextCard` MUST edit inline with min/max length and `pattern` validation, MUST send `input_text.set_value` (`{ value }`) only when valid, and MUST mask the value when `mode === 'password'`.
- `InputDateTimeCard` MUST render a native date/time/datetime input driven by `has_date`/`has_time` and display `(not set)` for empty/unknown values.
- All five helpers MUST register their control into the detail dialog's domain control slot, and the four non-boolean ones MUST render **no** embedded control at `glance`, where `default` resolves to `more-info` instead — the dialog is where a 1×1 helper is operated. Which control each registers, and what the `glance` tile shows in its place, is specified by [options/input-helpers.md](./options/input-helpers.md#tier-layouts).

#### Scenario: Number input clamps to max

- **GIVEN** an `input_number` with `max: 100`
- **WHEN** the user types `150` and submits
- **THEN** it calls `input_number.set_value` with `100` (`InputNumberCard.test.tsx` "validates input within min/max range").

See [card reference — Input helpers](./card-reference.md#input-helper-cards), including the `InputDateTimeCard` service gap called out in Open Questions.

### Button and fallback card

- `ButtonCard` MUST serve both as the `switch` domain card and as the fallback for any unmapped domain, toggling via the service-call hook and rendering a domain-appropriate icon.
- `ButtonCard` MUST show `ERROR` / `UNAVAILABLE` states and MUST expose the configuration modal.
- Configuration MUST resolve through the card that renders, not the raw entity domain, so an unmapped domain reaches the fallback card's options rather than being told it has none.
- Its option surface, the icon precedence, the confirmation gate's scope and the fallback-safety rules every option obeys are specified by [options/switch.md](./options/switch.md).

#### Scenario: Fallback toggles an unmapped entity

- **GIVEN** an unmapped-domain entity in the `on` state
- **WHEN** the user clicks the card
- **THEN** `ButtonCard` calls `toggle` for the entity (unless loading/unavailable) (`src/components/ButtonCard/index.tsx`).

`scene`, `script`, `button` and `input_button` used to arrive here and no longer do — see the next section.

### Scene, script and button

**Status: implemented** by change [0027](../../changes/0027-scene-cards.md) PR 1. One **action card family** serves four domains: `scene`, `script`, `button` and `input_button`. How it behaves and presents — the per-domain action table, the `unknown` rule, activation feedback, the script running state, the option keys, the tier layouts, the confirm gate's scope, and the scenarios for all of them — is owned by [options/scene.md](./options/scene.md). What belongs here is what the registry and the card contract say about it.

- One `ActionCard` component MUST be registered under all four domains — four `domainToCard` entries pointing at one component, as `switch` and the fallback already share `ButtonCard`. Per-domain registered variants are explicitly ruled out.
- The card MUST dispatch the per-domain service [options/scene.md](./options/scene.md#primary-action) specifies, and MUST NOT dispatch a toggle on any of these domains — including when a stored action resolves to `toggle`. That is what separates them from the fallback above, whose whole contract is a toggle.
- These services are non-idempotent, so every dispatch MUST take the non-retrying guarded path ([options/common.md — dispatch guarantees](./options/common.md#action-type)).
- The family MUST declare `defaultDimensions` of 1×1 — the first to do so — and MUST NOT expose a configuration modal of its own; its options render in the shared form, routed through the card that renders rather than the raw entity domain.
- Registering these four domains changes what `getCardForEntity` resolves for **already-placed** grid items, so existing dashboards upgrade on load with no migration. Convention 7's bugfix exemption is what permits that: `<domain>.toggle` is not a registered service on three of the four, so the fallback was not a working control surface to preserve ([options/common.md](./options/common.md#conventions-for-per-card-options), convention 7). The new keys are additive, so existing configurations keep validating.

### Text and separator widgets

- `TextCard` (grid item type `text`) MUST render Markdown via `react-markdown` with Radix-themed elements, MUST support `alignment`, `textSize`, `textColor`, and `hideBackground`, and MUST allow inline editing (a focused `TextArea`) in edit mode, persisting to the grid item's direct properties.
- `Separator` (grid item type `separator`) MUST render a horizontal or vertical divider with an optional colored label, and MUST store its settings as direct item properties.
- Neither widget binds to an entity, so neither SHALL render loading/error/unavailable states.

#### Scenario: Text card edits inline in edit mode

- **GIVEN** a `text` grid item in edit mode
- **WHEN** the user focuses it and types
- **THEN** the content persists via `dashboardActions.updateGridItem` under the item id (`TextCard.tsx:80-116`).

### Card options

The per-card option surface is specified in [options/](./options/common.md): a universal contract every entity card MUST adopt (name/icon overrides, hide toggles, accent color, tap/hold/double-tap actions) plus one document per card family defining domain options, defaults, and how content maps to the [design-system layout tiers](../design-system/index.md#size-adaptive-layouts). Each of those documents carries its own status line — the universal contract is implemented, the per-card surfaces are not — and for a family whose options have not landed, the requirements elsewhere in this spec remain the implemented baseline. Per-card docs: [light](./options/light.md) · [switch](./options/switch.md) · [climate](./options/climate.md) · [sensor](./options/sensor.md) · [media-player](./options/media-player.md) · [camera](./options/camera.md) · [cover](./options/cover.md) · [fan](./options/fan.md) · [weather](./options/weather.md) · [security](./options/security.md) · [vacuum](./options/vacuum.md) · [person](./options/person.md) · [scene](./options/scene.md) · [input-helpers](./options/input-helpers.md)

New card families introduced there (media player, lock/alarm, vacuum, person) MUST register through the existing `domainToCard` registry and `CardProps` contract when implemented. The scene/script/button family did so in change [0027](../../changes/0027-scene-cards.md) — four domain entries onto one component — and is the worked example.

### Per-card configuration (CardConfig)

- `CardConfig.Modal` MUST render a two-pane dialog: a form built from the card type's `ConfigDefinition` (boolean / string / number / select / textarea / icon controls) on the left, and a live, non-interactive preview forced into view mode on the right.
- The modal MUST initialize local config from the item (entity cards from `item.config`; `text`/`separator` from direct properties), MUST update local state on change, and MUST persist only on "Save Changes" — closing or cancelling MUST discard edits.
- Config for `text`/`separator` MUST be saved back as direct item properties; entity-card config MUST be saved under `item.config`.

#### Scenario: Cancel discards edits

- **GIVEN** the config modal open with an unsaved change
- **WHEN** the user clicks Cancel (or the X)
- **THEN** the modal closes and the item retains its previous config (`CardConfig.test.tsx:248-307`).

### Entity and card discovery (EntityBrowser)

- The `EntityBrowser` MUST present two tabs — Entities and Cards — inside a fullscreen modal.
- The Entities tab MUST list entities virtualized, filterable by search (debounced 300ms over id/friendly name/domain) and by domain, MUST hide `SYSTEM_DOMAINS` (`persistent_notification`, `person`, `sun`, `zone`), and MUST pre-exclude domains not in `SUPPORTED_DOMAINS`.
- Selecting entities and confirming MUST create one `GridItem` per entity, each sized by `getDefaultCardDimensions` and placed via batch grid positioning.
- The Cards tab MUST allow adding non-entity widgets (Text, Separator), the Separator via a configuration dialog.

#### Scenario: Adding selected entities creates grid items

- **GIVEN** entities selected in the Entities tab
- **WHEN** the user clicks Add
- **THEN** one grid item per entity is added to the screen at computed positions (`EntitiesBrowserTab.tsx:278-337`, `EntityBrowser.test.tsx:173-207`).

## Design

### Architecture

```
GridView (screen renderer)
  └─ per GridItem:
       type 'text'      → TextCard
       type 'separator' → Separator
       type 'entity'    → EntityCard (local dispatcher, GridView.tsx:22-67)
                            1. config.variant → getCardVariant(domain, variant)
                            2. else            → getCardForEntity(entityId)   [domainToCard]
                            3. else            → ButtonCard  (fallback)
  (each wrapped in EntityErrorBoundary)

cardRegistry.ts   domainToCard: Record<domain, CardComponent>
                  getCardForEntity / getCardForDomain / getCardVariant / registerCardVariant
GridCard.tsx      shared shell + compound Icon/Title/Controls/Status + fullscreen portal
CardConfig.tsx    Modal (form + live preview), Section, Component
configurations/cardConfigurations.ts  per-type ConfigDefinition
EntityBrowser.tsx → EntitiesBrowserTab.tsx + CardsBrowserTab.tsx (add flow)
ErrorBoundary.tsx EntityErrorBoundary wraps every card
```

The registry map is the single source of domain support:

```ts
// cardRegistry.ts:42-57
export const domainToCard: CardRegistry = {
  camera: CameraCard,
  light: LightCard,
  weather: WeatherCard,
  climate: ClimateCard,
  switch: ButtonCard,
  cover: CoverCard,
  fan: FanCard,
  sensor: SensorCard,
  binary_sensor: BinarySensorCard,
  input_boolean: InputBooleanCard,
  input_number: InputNumberCard,
  input_select: InputSelectCard,
  input_text: InputTextCard,
  input_datetime: InputDateTimeCard,
}
```

(The `camera` entry resolves to `CameraCard`, specified separately in [`../camera-streaming/`](../camera-streaming/).)

### Data Models

The shared props contract every card implements (`cardRegistry.ts:21-36`):

```ts
export interface CardProps {
  entityId: string
  tier?: CardTier
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  config?: Record<string, unknown>
  item?: GridItem
  onConfigure?: () => void
}

export type CardComponent = ComponentType<CardProps> & {
  defaultDimensions?: { width: number; height: number }
  variants?: Record<string, ComponentType<CardProps>>
}
```

A `ConfigOption` (`CardConfig.tsx:43-53`) declares one form field: a `type` of `boolean | string | number | select | textarea | icon`, a `default`, `label`, optional `description`/`placeholder`, `options` (select), and `min`/`max`/`step` (number). `cardConfigurations` (`configurations/cardConfigurations.ts`) maps a card type to `{ title, description?, definition?, placeholder? }`.

Declared default dimensions and configurability by family are tabulated in the [card reference](./card-reference.md#dimensions-and-capabilities-matrix).

### API Surface

Registry functions (`cardRegistry.ts:60-98`): `getCardForDomain`, `getCardForEntity`, `registerCardVariant(domain, name, component)`, `getCardVariant(domain, name)`, `getCardVariants(domain)`. Dimension helper: `getDefaultCardDimensions(entityId)` (`utils/cardDimensions.ts`). Home Assistant service calls are issued through `useServiceCall` and `useEntity`/`useEntities` — owned by the [entity-state spec](../entity-state/); the abstract `toggle` / `turnOn` / `turnOff` / `setValue` mappings to real services are documented there and summarized per card in the [card reference](./card-reference.md).

### UI Components

`GridCard` (`GridCard.tsx`) is the shell for all cards. The tier is stamped as `data-tier` and maps to a height floor through the geometry tokens; padding, radius and typography come from the token contract rather than from the card's size. The compound `GridCard.Icon` renders the anatomy's icon circle and swaps in a `Spinner` while loading; `GridCard.Title`/`GridCard.Status` render the name and state lines. Edit-mode action buttons (settings + delete) render in a fixed cluster and stop propagation. A fullscreen portal (used by the camera card) escapes the shadow DOM and closes on click or ESC. Transparent mode strips card chrome for `hideBackground` widgets.

`EntityErrorBoundary` (`ErrorBoundary.tsx:183-201`) wraps each card, rendering an `ErrorDisplay` card with a retry that resets the boundary; the base `ErrorBoundary` supports a custom fallback and collapsible stack details.

### Business Logic

- **Optimistic slider drag**: brightness (light), position/tilt (cover), and range setpoints (climate) hold local drag state and commit the service call only on release, so mid-drag state changes don't fight the user's gesture.
- **Feature detection**: cards gate controls on Home Assistant `supported_features` bit flags (or, for lights, `supported_color_modes`) — see per-card flag constants in the [card reference](./card-reference.md).
- **Config precedence**: values resolve as `item.config[key] ?? definition.default`; `text`/`separator` read/write direct item properties rather than `config`.
- **Preview isolation**: `CardConfig` renders the preview inside a `ViewModeWrapper` that temporarily sets the store mode to `view` and restores it on unmount, so previews never show edit chrome.

## Constraints

- Radix UI Themes only; styling via component props and theme tokens (`var(--...)`), avoiding custom z-index per project conventions. Portalled overlays (fullscreen, dropdowns) manage their own stacking.
- Cards run inside a Home Assistant custom panel (shadow DOM); overlays that must escape it use `createPortal` to `document.body`.
- Asset URLs (weather backgrounds) MUST be resolved through `window.__LIEBE_ASSET_BASE_URL__` because the panel is served from a base path that differs between dev and the deployed panel.
- The testing and quality bar is owned by [architecture — Testing & Quality Conventions](../architecture/index.md#testing--quality-conventions).
- Card components memoize with custom prop comparators; new props must be added to the comparator or they will not trigger re-render.

## Open Questions

- ~~**ClimateCard size (~962 lines).**~~ Resolved by change [0017](../../changes/0017-climate-card-to-spec.md) PR 1: the card is a `ClimateCard/` folder — the entity reading in `climateModel.ts`, the commands in `useClimateControl.ts`, the compact layout, the arc dial in a file of its own, and the setpoint stepper and pill rows as pieces both presentations share. The split was **forced by the variant mechanism rather than chosen for size**, which is why it happened here and not as a standalone refactor: `compact` and `dial` must call the same services with the same step and clamp rules, and the only way to guarantee that structurally is to share the reading and the dispatch rather than duplicate them. Sharing them also gave the detail dialog the card's own controls to mount instead of a second copy. `CameraCard` is likewise a folder now, decomposed by [0021](../../changes/0021-camera-presentation-options.md).
- **LightCard color picker is unimplemented.** `showColorPicker` config and the color/color-temp feature checks are stubbed out as comments (`LightCard.tsx:104-111`, `171`); the card supports brightness only. The intended color-control behavior is undefined.
- ~~**InputDateTimeCard service mapping is missing.**~~ Fixed by change [0022](../../changes/0022-switch-input-helpers-to-spec.md): `useServiceCall.setValue` maps `input_datetime` to `input_datetime.set_datetime` with the payload shaped by `has_date`/`has_time`, and the state↔input format translation the save also needed lives beside it. The mapping is proven by a test that stubs only the connection boundary, so the tests-pass-because-`setValue`-is-mocked failure mode cannot come back — see [entity-state — consumer hooks](../entity-state/index.md#consumer-hooks).
- ~~**CoverCard size styling discrepancy.**~~ Moot since change [0011](../../changes/0011-layout-tiers.md): the card sets no `minHeight` of its own and the shell owns the floor, keyed on the tier and resolved from the geometry tokens.
- ~~**Weather background feature is mostly untested.**~~ Closed by change [0020](../../changes/0020-weather-card-to-spec.md) PR 1. What had coverage was two `__LIEBE_ASSET_BASE_URL__` cases for the `rain` condition; what has it now is the whole feature, split by kind. `WeatherCard/__tests__/presentation.test.ts` pins the map against both vocabularies, the partial-match rules, the `null` no-match, case and whitespace normalisation, the own-property guard (a condition named `constructor` or `__proto__` resolves nothing), both base-URL paths through the direct map _and_ the substring rules, and the `getWeatherTextStyles` / `getWeatherTextColor` / `getWeatherValueStyles` treatment. `WeatherCard/__tests__/WeatherCard.options.test.tsx` pins the same claims where they are actually visible — artwork painted and text turned white across the three painting variants, `showConditionBackground: false` restoring the flat surface with neither, a real unmapped condition painting nothing, and `minimal` painting nothing whatever the option says. Two of those fixtures are deliberately synthetic (`zorptastic`) because `exceptional`, `hail`, `lightning` and `pouring` read like placeholders and are real Home Assistant conditions — a test pinning one of them as "unknown" asserts a true thing about a false premise.
- **Two export idioms coexist.** Most cards use `Object.assign(memo(...), { defaultDimensions })`; `Separator` is a plain function with a static property and no memo. Whether to standardize is open.

## References

- Registry & dispatch: `src/components/cardRegistry.ts`, `src/components/GridView.tsx:22-67`, `src/utils/cardDimensions.ts`
- Shell & boundary: `src/components/GridCard.tsx`, `src/components/ErrorBoundary.tsx`
- Configuration: `src/components/CardConfig.tsx`, `src/components/configurations/cardConfigurations.ts`; non-scalar option controls in `ActionEditor.tsx`, `EntityPicker.tsx`, `NumberArrayEditor.tsx`, `OrderedMultiSelect.tsx`, with their value contracts in `src/store/configControls.ts`
- Discovery: `src/components/EntityBrowser.tsx`, `src/components/EntitiesBrowserTab.tsx`, `src/components/CardsBrowserTab.tsx`
- Cards: `LightCard.tsx`, `ClimateCard/`, `CoverCard/`, `FanCard/`, `SensorCard.tsx`, `BinarySensorCard.tsx`, `ButtonCard/`, `ActionCard/`, `TextCard.tsx`, `Separator.tsx`, `WeatherCard/`, `Input{Boolean,Number,Select,Text,DateTime}Card.tsx`
- Companion: [card-reference.md](./card-reference.md)
- Related specs: [../camera-streaming/](../camera-streaming/), [../grid-layout/](../grid-layout/), [../entity-state/](../entity-state/)

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Document                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                       |
| 2026-07-25 | Added target per-card option surface under `options/` (common contract + 14 card-family docs, not yet implemented)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                       |
| 2026-07-27 | Common option contract implemented: universal options, action system, detail dialog, shared non-scalar config controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [0014-universal-card-options](../../changes/0014-universal-card-options.md)             |
| 2026-07-27 | Weather options: "forecast fetch in the entity-state pipeline" open question closed — `useWeatherForecast` shipped as the source, including the derived twice-daily daily view; forecast presentation remains 0020                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [0015-history-and-forecast-data](../../changes/0015-history-and-forecast-data.md)       |
| 2026-07-27 | Layout tiers replace the legacy `size` variants across the card contract: cards take `tier` and `span` as props, never derive them, and each family's per-tier content follows its option doc (the camera was stamped but exempt until 0021)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [0011-layout-tiers](../../changes/0011-layout-tiers.md)                                 |
| 2026-07-27 | `InputDateTimeCard`'s save reaches Home Assistant for the first time: the `input_datetime` → `set_datetime` mapping and the state↔input format translation land in the service layer; the missing-mapping open question is closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Switch & fallback option surface implemented: `confirm` (gated in the shell, after action resolution), `deviceClassIcon`, `stateLabels`, `showLastChanged`; configuration now routes through the card that renders, so unmapped domains are configurable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Input helper `controlStyle` implemented for `input_boolean`, `input_number` and `input_select`, with the entity-`mode` default, the pills tier/count gating, and the version-marker loader pinning that keeps existing cards on their original control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Sensor option surface implemented: the `displayPrecision`/`valueScale`/`unitOverride` pipeline over the preserved `device_class` matrix, and `showGraph`/`graphHours`/`graphMode`/`showTrend` consuming the history pipeline with the aggregation mode chosen per rendering surface. Fixes two shipped formatting faults found while pinning the matrix: a `k` prefix applied with no unit to prefix, and a blank state rendering `NaN`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Binary sensor option surface implemented: `onLabel`/`offLabel` over a local `device_class` table, `invert`, `device_class` active colours including `light`, and the `full`-tier recency line. The active-hazard rule is now enforced in the card as well as by the universal danger floor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Binary sensor labels and glyphs merged into one `device_class` table, correcting seven pairings whose glyph contradicted its label — `lock` and `safety` were inverted, and fourteen classes had no glyphs at all and fell through to a generic tick that landed on the active state of five alert classes. The generic pair no longer passes a verdict, and a vocabulary test now fails any row whose glyph disagrees with its word                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Sensors section marked implemented and reduced to its contract, with the option keys, tier layouts, formatting matrix and `device_class` tables left to [options/sensor](./options/sensor.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | The detail dialog's domain control slot gains its first consumers: all five input helpers register the control their `full` tier renders, and the four non-boolean ones drop their `glance` control for the `more-info` fallback the tier table always specified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Camera presentation options implemented: `showNameOverlay` (gradient band carrying the name and state, composed with `hideName`/`hideState` including the full-collapse rule) and `showLiveBadge`, which SUBSUMES the status pill's live states rather than joining them — the badge is gated on a mounted stream, so a still snapshot is never labelled live                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [0021-camera-presentation-options](../../changes/0021-camera-presentation-options.md)   |
| 2026-07-27 | Camera `showLastMotion`/`motionEntity` implemented over the shared minute-refreshing recency helper — "Clear for X" from `last_changed` rather than a fabricated "motion X ago" — and the camera stops being the tier exemption: below 2×2 it mounts NO stream element, degrades to the still thumbnail with the presentation layers omitted, and mounts the stream lazily for fullscreen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [0021-camera-presentation-options](../../changes/0021-camera-presentation-options.md)   |
| 2026-07-27 | Cover option surface implemented: `showPositionSlider` / `showButtons` / `showTiltControls` / `invertPosition` / `deviceClassIcon` / `stateLabels`, plus the `confirmOpen` gate on every opening-increasing route (classified by effect, applied after action resolution, conservative where a route cannot be classified). Fixes two transposed feature bits — stop-tilt is `64`, set-tilt-position `128` — which had both offered a tilt slider to covers that cannot take one and withheld it from covers that can                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [0019-cover-fan-cards-to-spec](../../changes/0019-cover-fan-cards-to-spec.md)           |
| 2026-07-27 | Fan option surface implemented: `speedControl` (slider / steps / none) over pills derived from the entity's speed count, `showPresets` / `showOscillate` / `showDirection` / `animateIcon` / `showPercentage`, all commands on the guarded non-retrying path, and the version-marker loader pinning that keeps existing fan cards on their step buttons. The reduced-motion gate lives in the stylesheet, so no option or logic regression can switch the spin back on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [0019-cover-fan-cards-to-spec](../../changes/0019-cover-fan-cards-to-spec.md)           |
| 2026-07-27 | Climate card decomposed into a `ClimateCard/` folder and split into two registered presentations: `compact` (a stepper, the new default) and `dial` (the arc thermostat, `full` tier only, falling back to the compact layout below it). Both read one entity model and dispatch through one guarded, non-retrying command path, so the option contract's "changing `variant` MUST NOT change behavior" holds structurally rather than by review. The loader pins every climate card placed before this change to `variant: 'dial'`, keyed on a version marker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [0017-climate-card-to-spec](../../changes/0017-climate-card-to-spec.md)                 |
| 2026-07-27 | The dial's heat and cool setpoint handles became operable without a pointer — `role="slider"`, the accessible name and value on the element carrying that role, and arrow keys sharing the drag's band-preserving rule. They had been bare SVG circles with mouse and touch handlers, so on the presentation every pre-0017 dashboard is pinned to, a `heat_cool` band could not be set by keyboard or switch access at all (closes #225)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [0017-climate-card-to-spec](../../changes/0017-climate-card-to-spec.md)                 |
| 2026-07-27 | Climate options implemented — `showModePills`, `showPresets`, `showFanModes`, `showCurrentTemp`, `showHumidity` and display-only `displayUnit` — with capability deciding whether a row can exist and the option deciding whether it shows. The thermostat also stopped being the last card keeping a `glance` control: its setpoint stepper and mode row are registered in the detail dialog's domain slot, and `glance` went control-free in the same PR, because either alone leaves a 1×1 thermostat nobody can turn up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [0017-climate-card-to-spec](../../changes/0017-climate-card-to-spec.md)                 |
| 2026-07-27 | Climate section marked implemented and reduced to its contract, with the option keys, defaults, tier layouts and colour precedence left to [options/climate](./options/climate.md); the ClimateCard-size open question closed by the decomposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [0017-climate-card-to-spec](../../changes/0017-climate-card-to-spec.md)                 |
| 2026-07-28 | Scene/script/button action family implemented as ONE card under four registry entries, **fixing a live defect**: these domains fell through to the fallback, which dispatches `<domain>.toggle` — a service that does not exist on `scene`, `button` or `input_button`, so Home Assistant answered HTTP 400 and every tap on those cards did nothing (only `script.toggle` exists, making it 3 of the 4). The map that replaces it — `scene.turn_on`, `script.turn_on`/`turn_off`, `button.press`, `input_button.press` — was established by reading a running instance's own service registry rather than the change document, and is pinned end-to-end by a test that presses a real `button.push` and asserts its state advances. Also lands the intrinsic spinner→check activation feedback (reduced-motion gate in the stylesheet, check preserved), the script running/tap-to-stop state, `confirm` and `showLastActivated`, and the first 1×1 `defaultDimensions`. Already-placed cards upgrade on load with no migration, because replacing a broken control surface is a bugfix rather than a replacement needing pinning | [0027-scene-cards](../../changes/0027-scene-cards.md)                                   |
| 2026-07-28 | `confirm` given a single definition in `store/confirmOption.ts` that both the switch and action fragments merge. It had been declared separately by each, and `configSchema.ts` merges every family fragment into one item schema where `zod.merge()` is last-one-wins — so the switch fragment silently governed what action cards accepted, and tightening one family's gate would have changed the other's validation with no diff touching it. Not folded into the universal fragment: `confirm` is a per-card option in both option docs, and the universal set is closed. Chasing this surfaced the same collision already shipped for `stateLabels`, filed as #254                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [0027-scene-cards](../../changes/0027-scene-cards.md)                                   |
| 2026-07-29 | Weather option surface implemented: the four variants made tier-adaptive over one shared presentation module, `secondaryInfo` with the full `humidity` → `wind` → `feels-like` → `uv` → `pressure` fallback chain, and `showConditionBackground`. The condition background stops being shipped-but-untested — the map, the partial-match rules, the base-URL prefix and the white-text treatment are pinned as units and again where they are visible. Two forward-compatibility rules landed with it: the condition glyph matches by substring with a neutral fallback, so a condition this build has never met renders rather than blanking, and the artwork map answers only for keys it declared, because a condition named `constructor` otherwise resolves to a function and is interpolated into a URL                                                                                                                                                                                                                                                                                                                      | [0020-weather-card-to-spec](../../changes/0020-weather-card-to-spec.md)                 |
| 2026-07-29 | Weather forecast presentation implemented: the hourly strip and the multi-day row wired to `useWeatherForecast` with per-type subscriptions, tier gating (never at `glance`, vertical at `tall` and only where the span leaves cells for it, daily at `full` only), `forecastHours`/`forecastDays` as upper bounds that never pad, and `temperatureUnit` conversion applied to forecast values with the rest of the card. A section whose tier or option rules it out subscribes to nothing, and a column with no high renders no high — the twice-daily derivation's night-only day carries a low and no temperature, and printing one as the other would undo the derivation                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [0020-weather-card-to-spec](../../changes/0020-weather-card-to-spec.md)                 |
| 2026-07-29 | Weather section marked implemented and reduced to its contract, with the option keys, defaults, tier layouts and the `secondaryInfo` fallback order left to [options/weather](./options/weather.md); the "weather background feature is mostly untested" open question closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [0020-weather-card-to-spec](../../changes/0020-weather-card-to-spec.md)                 |
