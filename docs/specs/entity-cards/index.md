# Entity Card System

## Overview

The entity card system renders every Home Assistant entity and dashboard widget as a self-contained, touch-first card on a grid screen. A domain-to-component registry (`cardRegistry.ts`) MUST map each entity domain (`light`, `climate`, `sensor`, …) to a React card component, and MUST fall back to a generic `ButtonCard` for unmapped domains. Every entity card SHALL share a common presentation shell (`GridCard`), be wrapped in an error boundary, adapt its content to the [layout tier](../design-system/index.md#size-adaptive-layouts) the renderer derives from its effective grid span (`glance` / `row` / `tall` / `full`), and expose consistent edit-mode affordances (select, delete, and — where supported — a per-card configuration modal). Non-entity widgets (text, separator) render directly without the entity shell or error boundary (see [`../grid-layout/`](../grid-layout/)). Cards that control an entity MUST call the corresponding Home Assistant service; read-only cards (sensors, weather) SHALL display state without side effects.

This spec is the living baseline of the card system as implemented. It EXCLUDES the camera card and WebRTC streaming (see [`../camera-streaming/`](../camera-streaming/)), grid placement and drag/resize mechanics (see [`../grid-layout/`](../grid-layout/)), and the entity state pipeline / hooks (see [`../entity-state/`](../entity-state/)). Exhaustive per-card details — service payloads, dimension tables, and every derived test scenario — live in the companion [card reference](./card-reference.md).

## Background

`liebe` is a Home Assistant custom panel built with TanStack Start (React SPA) and Radix UI Themes. A dashboard is a tree of screens; each screen holds a grid of `GridItem`s. Most grid items are entity cards, but items can also be non-entity widgets (`text`, `separator`). When a screen renders, `GridView` resolves each item to a card component and wraps it in an `EntityErrorBoundary`.

The registry pattern lets new domains be supported by adding one map entry plus a component, without touching the renderer. Cards were built incrementally per domain; as a result they share a strong common shell (`GridCard` + its compound `Icon`/`Title`/`Controls`/`Status` sub-components) and a common data contract (`CardProps`), but differ in how much configuration and interactivity each exposes. Weather is the only family with registered visual variants (default / modern / detailed / minimal), added alongside condition-based background images (PR #140).

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
- **THEN** it shows a 2px red border, an `ERROR`/error status, and the error string as the card's `title` (e.g. `ClimateCard.test.tsx:434-457`, `CoverCard.test.tsx:430-452`).

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

- `ClimateCard` MUST toggle HVAC mode via `climate.set_hvac_mode` and adjust the target temperature via `climate.set_temperature`. It MUST render the arc-style thermostat **at the `full` tier only**; at `glance`, `row` and `tall` it MUST render the compact +/- stepper instead. The thermostat is the one card that KEEPS an embedded control at `glance`, because its replacement path — the detail dialog's domain controls — is registered by change [0017](../../changes/0017-climate-card-to-spec.md) ([options/climate.md — tier layouts](./options/climate.md#tier-layouts)).
- An `unavailable` **or `unknown`** climate entity MUST render the shell's neutral unavailable treatment with every control absent: neither state carries an HVAC mode, so a stepper built from its attributes would command a setpoint nobody knows.
- In single-setpoint modes the +/- controls MUST send `{ temperature }`, clamped to `[min_temp, max_temp]` and stepped by `target_temp_step`; the decrease/increase buttons MUST be disabled at the respective bound.
- When the entity supports `SUPPORT_TARGET_TEMPERATURE_RANGE` (bit 2) and is in `heat_cool`, the card MUST show a dual-setpoint range (`target_temp_low` / `target_temp_high`), send `{ target_temp_low, target_temp_high }`, and reject inverted ranges (`low >= high`).
- HVAC mode buttons MUST be built from the entity's `hvac_modes` and render in the `full` tier only, and all controls MUST be hidden in edit mode at every tier.

#### Scenario: Increase raises the setpoint by one step

- **GIVEN** a `heat`-mode thermostat at `temperature: 21` with `target_temp_step: 0.5`
- **WHEN** the user clicks the increase-temperature button
- **THEN** it calls `climate.set_temperature` with `{ temperature: 21.5 }` (`ClimateCard.test.tsx:127-156`).

See [card reference — Climate](./card-reference.md#climate) for range mode, min/max limits, and mode-switch scenarios.

### Covers and fans

- `CoverCard` MUST expose open / close / stop actions (`cover.open_cover`, `cover.close_cover`, `cover.stop_cover`), a position slider (`cover.set_cover_position` with `{ position }`), and — when tilt is supported — tilt controls (`set_cover_tilt_position`, `open_cover_tilt`, `close_cover_tilt`), each gated by its own `supported_features` bit **and by the tier**: the position slider renders at `row` (horizontal), `tall` (vertical) and `full`, the open/stop/close row and the tilt block at `full` only, and `glance` carries no embedded control at all ([options/cover.md — tier layouts](./options/cover.md#tier-layouts)).
- `CoverCard` MUST enable/disable open and close by **position alone whenever the entity reports one** — open disabled at `100`, close disabled at `0`, so a stationary partially open cover keeps both enabled — reading `current_position` with a `position` fallback; state-based disabling (`open` disables open, `closed` disables close) applies only to covers that report no position. Stop MUST be disabled unless the cover is `opening` or `closing`.
- `FanCard` MUST toggle the fan on card click, set speed via `fan.set_percentage` (`{ entity_id, percentage }`, with 0% turning the fan off), and set preset via `fan.set_preset_mode`; speed support is gated by `SUPPORT_SET_SPEED` (bit 1) and presets by `SUPPORT_PRESET_MODE` (bit 8). Its controls render only while the fan is on and never at `glance`: the speed pills at `row` (horizontal), `tall` (vertical) and `full`, and the preset select at `full` — or at any of those tiers as the primary control of a fan that supports presets but no percentage ([options/fan.md — tier layouts](./options/fan.md#tier-layouts)).
- Both cards MUST hide their controls in edit mode and MUST NOT expose a configuration modal.

#### Scenario: Open button opens the cover

- **GIVEN** a cover advertising `supported_features: 1` (open)
- **WHEN** the user clicks "Open cover"
- **THEN** it calls `cover.open_cover` for that entity with no data (`CoverCard.test.tsx:139-159`).

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

- The weather card MUST select a visual variant from `config.variant`, falling back to the legacy `config.preset`, then `default`; variants are `default`, `modern`, `detailed`, `minimal`.
- Each variant MUST read `temperature` + `temperature_unit` and MUST honor `config.temperatureUnit` (`auto` shows the entity's native unit; `celsius` / `fahrenheit` convert). Secondary readings are tier-gated: at `glance` every variant is reduced to the icon, the name, and the temperature in the state slot; `default`/`modern` add the condition and humidity from `row` up and the feels-like/wind detail line at `full`; `detailed` shows its data block from `row` up and holds pressure back until `full`; `minimal` shows only temperature, as a plain state line at `glance` and the big readout from `row` up.
- When `getWeatherBackground(entity.state)` resolves a condition image, variants (except `minimal`) MUST render it as a cover background and MUST switch text/icons to white with shadows for legibility; background image URLs MUST be prefixed by `window.__LIEBE_ASSET_BASE_URL__` (falling back to `/`).
- Saving the weather config MUST migrate a legacy `preset` key to `variant`.

#### Scenario: Config forces Fahrenheit

- **GIVEN** a weather entity reporting `22` with `temperature_unit: 'C'`
- **WHEN** rendered with `config.temperatureUnit = 'fahrenheit'`
- **THEN** it displays `72°F` (`WeatherCard.test.tsx:44-50`).

See [card reference — Weather](./card-reference.md#weather) for per-variant attributes, the condition→background map, and the backwards-compat preset scenarios.

### Input helper cards

- `InputBooleanCard` MUST toggle via `input_boolean.toggle` (card click or `Switch`), hide the switch in edit mode, and is the only input card that declares `defaultDimensions` (2×1).
- `InputNumberCard` MUST send `input_number.set_value` (`{ value }`) quantized to `step` and clamped to `[min, max]`, whichever control is rendering; a click-to-edit text field MUST validate and revert invalid input without calling the service.
- `InputSelectCard` MUST send `input_select.select_option` (`{ option }`) and MUST disable the control when the helper has no options.
- `input_boolean`, `input_number` and `input_select` MUST expose `controlStyle`, which selects between their two presentations; the values, defaults, tier and option-count gating are specified by [options/input-helpers.md](./options/input-helpers.md). Existing placed cards MUST keep the control they were built with, pinned by loader migration against a configuration version marker rather than key absence — an unset `controlStyle` is how a new card asks to follow the entity's own `mode`.
- `InputTextCard` MUST edit inline with min/max length and `pattern` validation, MUST send `input_text.set_value` (`{ value }`) only when valid, and MUST mask the value when `mode === 'password'`.
- `InputDateTimeCard` MUST render a native date/time/datetime input driven by `has_date`/`has_time` and display `(not set)` for empty/unknown values.

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

New card families introduced there (media player, lock/alarm, vacuum, person, scene/script/button) MUST register through the existing `domainToCard` registry and `CardProps` contract when implemented.

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

- **ClimateCard size (~962 lines).** `ClimateCard.tsx` is by far the largest card and mixes arc geometry, drag math, and service logic in one file. No decomposition is specified; whether it should be split (as WeatherCard was) is open. The camera card (`CameraCard.tsx`, ~852 lines) is comparably large but out of scope here.
- **LightCard color picker is unimplemented.** `showColorPicker` config and the color/color-temp feature checks are stubbed out as comments (`LightCard.tsx:104-111`, `171`); the card supports brightness only. The intended color-control behavior is undefined.
- ~~**InputDateTimeCard service mapping is missing.**~~ Fixed by change [0022](../../changes/0022-switch-input-helpers-to-spec.md): `useServiceCall.setValue` maps `input_datetime` to `input_datetime.set_datetime` with the payload shaped by `has_date`/`has_time`, and the state↔input format translation the save also needed lives beside it. The mapping is proven by a test that stubs only the connection boundary, so the tests-pass-because-`setValue`-is-mocked failure mode cannot come back — see [entity-state — consumer hooks](../entity-state/index.md#consumer-hooks).
- ~~**CoverCard size styling discrepancy.**~~ Moot since change [0011](../../changes/0011-layout-tiers.md): the card sets no `minHeight` of its own and the shell owns the floor, keyed on the tier and resolved from the geometry tokens.
- **Weather background feature is mostly untested.** `WeatherCard.test.tsx` covers only `getWeatherBackground`'s `__LIEBE_ASSET_BASE_URL__` resolution (PR #140) — two cases, prefixing with a published base URL and falling back to `/` when none is published, both for the `rain` condition. The rest of the condition-to-image mapping (the other nine PNGs, the partial-match fallbacks, and the `null` no-match result) and the text treatment from `getWeatherTextStyles`/`getWeatherTextColor` still have no coverage.
- **Two export idioms coexist.** Most cards use `Object.assign(memo(...), { defaultDimensions })`; `Separator` is a plain function with a static property and no memo. Whether to standardize is open.

## References

- Registry & dispatch: `src/components/cardRegistry.ts`, `src/components/GridView.tsx:22-67`, `src/utils/cardDimensions.ts`
- Shell & boundary: `src/components/GridCard.tsx`, `src/components/ErrorBoundary.tsx`
- Configuration: `src/components/CardConfig.tsx`, `src/components/configurations/cardConfigurations.ts`; non-scalar option controls in `ActionEditor.tsx`, `EntityPicker.tsx`, `NumberArrayEditor.tsx`, `OrderedMultiSelect.tsx`, with their value contracts in `src/store/configControls.ts`
- Discovery: `src/components/EntityBrowser.tsx`, `src/components/EntitiesBrowserTab.tsx`, `src/components/CardsBrowserTab.tsx`
- Cards: `LightCard.tsx`, `ClimateCard.tsx`, `CoverCard.tsx`, `FanCard.tsx`, `SensorCard.tsx`, `BinarySensorCard.tsx`, `ButtonCard/`, `TextCard.tsx`, `Separator.tsx`, `WeatherCard/`, `Input{Boolean,Number,Select,Text,DateTime}Card.tsx`
- Companion: [card-reference.md](./card-reference.md)
- Related specs: [../camera-streaming/](../camera-streaming/), [../grid-layout/](../grid-layout/), [../entity-state/](../entity-state/)

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                  | Document                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation)                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                       |
| 2026-07-25 | Added target per-card option surface under `options/` (common contract + 14 card-family docs, not yet implemented)                                                                                                                                                                                                                                                                                                                      | —                                                                                       |
| 2026-07-27 | Common option contract implemented: universal options, action system, detail dialog, shared non-scalar config controls                                                                                                                                                                                                                                                                                                                  | [0014-universal-card-options](../../changes/0014-universal-card-options.md)             |
| 2026-07-27 | Weather options: "forecast fetch in the entity-state pipeline" open question closed — `useWeatherForecast` shipped as the source, including the derived twice-daily daily view; forecast presentation remains 0020                                                                                                                                                                                                                      | [0015-history-and-forecast-data](../../changes/0015-history-and-forecast-data.md)       |
| 2026-07-27 | Layout tiers replace the legacy `size` variants across the card contract: cards take `tier` and `span` as props, never derive them, and each family's per-tier content follows its option doc (the camera is stamped but exempt)                                                                                                                                                                                                        | [0011-layout-tiers](../../changes/0011-layout-tiers.md)                                 |
| 2026-07-27 | `InputDateTimeCard`'s save reaches Home Assistant for the first time: the `input_datetime` → `set_datetime` mapping and the state↔input format translation land in the service layer; the missing-mapping open question is closed                                                                                                                                                                                                      | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Switch & fallback option surface implemented: `confirm` (gated in the shell, after action resolution), `deviceClassIcon`, `stateLabels`, `showLastChanged`; configuration now routes through the card that renders, so unmapped domains are configurable                                                                                                                                                                                | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Input helper `controlStyle` implemented for `input_boolean`, `input_number` and `input_select`, with the entity-`mode` default, the pills tier/count gating, and the version-marker loader pinning that keeps existing cards on their original control                                                                                                                                                                                  | [0022-switch-input-helpers-to-spec](../../changes/0022-switch-input-helpers-to-spec.md) |
| 2026-07-27 | Sensor option surface implemented: the `displayPrecision`/`valueScale`/`unitOverride` pipeline over the preserved `device_class` matrix, and `showGraph`/`graphHours`/`graphMode`/`showTrend` consuming the history pipeline with the aggregation mode chosen per rendering surface. Fixes two shipped formatting faults found while pinning the matrix: a `k` prefix applied with no unit to prefix, and a blank state rendering `NaN` | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Binary sensor option surface implemented: `onLabel`/`offLabel` over a local `device_class` table, `invert`, `device_class` active colours including `light`, and the `full`-tier recency line. The active-hazard rule is now enforced in the card as well as by the universal danger floor                                                                                                                                              | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Binary sensor labels and glyphs merged into one `device_class` table, correcting seven pairings whose glyph contradicted its label — `lock` and `safety` were inverted, and fourteen classes had no glyphs at all and fell through to a generic tick that landed on the active state of five alert classes. The generic pair no longer passes a verdict, and a vocabulary test now fails any row whose glyph disagrees with its word    | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
| 2026-07-27 | Sensors section marked implemented and reduced to its contract, with the option keys, tier layouts, formatting matrix and `device_class` tables left to [options/sensor](./options/sensor.md)                                                                                                                                                                                                                                           | [0018-sensor-cards-to-spec](../../changes/0018-sensor-cards-to-spec.md)                 |
