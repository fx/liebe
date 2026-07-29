# Card Options — Light

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: implemented** by change [0016](../../../changes/0016-light-card-to-spec.md) — the `enableBrightness` → `showBrightnessSlider` migration and the slider's tier placement in PR 1, `useLightColor` and the dispatch migration in PR 2a, the colour-temperature and colour controls in PR 2b, and `brightnessPresets` in PR 3. Tier layouts come from change [0011](../../../changes/0011-layout-tiers.md) PR 3. Two behaviours below are narrower in practice than the table alone suggests, and both are stated in their own sections: the colour-temperature control needs a _reported_ Kelvin range as well as the capability, and the preset row is the only one of the three `full`-tier controls that renders while the light is off. See [entity-cards — Lights](../index.md#lights) for what holds however the card is configured.

## Primary action

`tapAction: default` MUST toggle the light — with `unavailable`/`unknown` resolved first as **inert** (no service dispatch against an unavailable device, regardless of the shell's unavailable styling): `light.turn_off` when the entity state is `on`, `light.turn_on` for any other real state. The whole tile is the tap target; embedded controls (slider, swatches, preset pills) consume their own events and MUST NOT trigger the tap action (per [common contract — Action type](./common.md#action-type)).

## Options

All keys live under `item.config`, camelCase, and follow [common conventions](./common.md#conventions-for-per-card-options) — in particular convention 3: whether a control _can_ appear is derived from the entity's `supported_color_modes` (with the legacy `supported_features` fallback); these options only hide or tune capabilities the entity already has.

| Key                    | Type     | Default | Behavior                                                                                                                                                                                                                  |
| ---------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showBrightnessSlider` | boolean  | `true`  | Renders the brightness slider when the entity supports brightness. Tiers: `row` (horizontal), `tall` (vertical), `full` (horizontal). Never in `glance`.                                                                  |
| `showColorTempControl` | boolean  | `true`  | Renders a warm→cool color-temperature control when the entity supports color temperature (`supported_color_modes` includes `color_temp`) **and reports a usable Kelvin range**, while the light is on. Tier: `full` only. |
| `showColorControl`     | boolean  | `true`  | Renders a color control when the entity supports color (`supported_color_modes` includes any of `hs` / `xy` / `rgb` / `rgbw` / `rgbww`), while the light is on. Tier: `full` only.                                        |
| `useLightColor`        | boolean  | `true`  | When `true`, the icon tint and slider fill follow the bulb's actual color; when `false`, they always use the light domain token. Affects all tiers (it recolors existing content, adds none).                             |
| `brightnessPresets`    | number[] | `[]`    | Whole percent values (1–100) rendered as preset pills; requires brightness support and renders **whether the light is on or off**. Empty array (the default) hides the row entirely. Tier: `full` only.                   |

### Brightness (`showBrightnessSlider`)

- Brightness MUST be presented on a 0–100 scale, converted to/from Home Assistant's 0–255 `brightness` attribute.
- Committing the slider at 0 MUST call `light.turn_off` (already implemented — this behavior is retained as a MUST). Committing any nonzero percentage MUST send `light.turn_on` with `brightness ≥ 1` — rounding MUST NOT collapse a nonzero slider position to a `brightness` of 0, since that would silently turn the light off at the minimum slider step.
- The slider MUST render only while the light is `on`; when `off`, the tile shows no slider and tap turns the light on. Drag state MUST stay local until commit (optimistic drag, per [entity-cards](../index.md#lights)).
- Brightness capability MUST be detected from `supported_color_modes` (any of `brightness` / `white` / `color_temp` / `hs` / `xy` / `rgb` / `rgbw` / `rgbww` — every mode Home Assistant treats as brightness-capable, including `white`, whose entities may carry no legacy flag) with a fallback to the legacy `SUPPORT_BRIGHTNESS` (bit 1) feature flag. An `onoff`-only light gets no slider regardless of this option. The capability matrix tests MUST include a `['white']`-only entity.

**Backward compatibility:** the shipped key is `enableBrightness`. The config loader MUST migrate `enableBrightness` → `showBrightnessSlider` (same semantics: absent or `true` shows the slider, explicit `false` hides it), following the weather `preset` → `variant` migration pattern ([common contract — convention 1](./common.md#conventions-for-per-card-options)). After migration, `enableBrightness` MUST NOT be written back on save; exported YAML contains only the new key.

### Color temperature (`showColorTempControl`)

Rendered in the `full` tier as a warm→cool slider spanning the entity-reported range `min_color_temp_kelvin`–`max_color_temp_kelvin` (never a hardcoded range), tinted with the colour each position means so the track reads warm→cool without a legend. Selecting a value MUST call `light.turn_on` with `color_temp_kelvin`. **Kelvin is the only color-temperature interface**: Home Assistant Core 2026.3 removed `LightEntity.color_temp`/`min_mireds`/`max_mireds`, the `ATTR_COLOR_TEMP`/`ATTR_MIN_MIREDS`/`ATTR_MAX_MIREDS` state attributes, and the `color_temp`/`kelvin` arguments to `light.turn_on`, so a mired fallback would target a deleted API.

**Two conditions beyond the capability**, both of which withhold the control entirely:

- **A reported range.** Declaring `color_temp` support is not enough — the entity must publish both bounds as finite positive numbers with `min < max`. An entity that declares the mode and reports no usable pair gets no control, because the alternative is a span Liebe invented: a warm end the bulb may not reach and a cool end it may exceed, with every value between wearing the device's authority. `NaN` is rejected explicitly; it survives a naive numeric check and then compares false against everything.
- **The light being on.** Setting a temperature on an `off` light would turn it on as a side effect of a control that does not look like a switch. Turning it on is the tile's own tap. This differs from `brightnessPresets` below, which deliberately does act on an off light — a preset states a level to turn _on_ at, while a temperature only re-colours light that is already being emitted.

Where the reported `color_temp_kelvin` falls outside the reported range — the two attributes can disagree — the control MUST clamp its position into the range rather than placing it off its own track. An entity reporting no temperature at all sits at the warm end.

### Color (`showColorControl`)

Rendered in the `full` tier for color-capable lights, and — like the color-temperature control and for the same reason — only while the light is on. Selecting a color MUST call `light.turn_on` with `rgb_color`.

The presentation is a **fixed single row of curated color swatches plus one recent-color slot** (the last color committed from this card) — decided in change 0016: one tap per selection suits touch-first, and a fixed row fits the `full` tier without scrolling by construction ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)). A hue/saturation wheel is deferred to a future `colorControlStyle` select.

- The palette is six hues and the count is a **layout** constraint rather than a colour-theory one: six plus the recent slot is what fits a `full` tile's width at the pill anatomy's minimum touch target. Whites are absent deliberately — a white is a colour _temperature_, which the control above sets across the range the bulb actually reports.
- The recent slot holds the last colour committed **from this card**, and is deliberately **not persisted**: it is the trace of an interaction, not a setting. Writing it to the dashboard document on every tap would make an ordinary interaction a persisted edit, and a shared YAML would carry one user's last pick as though somebody had configured it. It is therefore empty again after a reload, and the slot is absent until a colour is picked.
- A swatch reads as selected only when the entity reports that **exact** `rgb_color`. A colour derived from `hs_color`, `xy_color` or a temperature is enough to tint the card but not to claim a swatch is what the light is set to — that swatch's payload would not reproduce the current state, so lighting it up would assert something false about a control nobody touched.

### Light-color theming (`useLightColor`)

- When `true` and the light is `on` with a resolvable RGB color (`rgb_color`, or derivable from `hs_color` / `xy_color` / color temperature), the icon-circle tint and the slider fill MUST use that color instead of the domain token.
- When the actual color is unavailable (no color attributes, `onoff`/`brightness`-only lights) or the light is `off`, rendering MUST fall back to the standard active/inactive pattern with the light domain token (`--liebe-c-light`, amber — [design-system — domain color discipline](../../design-system/index.md#domain-color-discipline)).
- When `false`, the domain token is always used. The precedence is ordered and total: a **danger state** suppresses the bulb color outright — the bulb color is a data-driven override sitting on top of the card's own treatment, and a danger state admits none ([options/sensor — active hazard sensors](./sensor.md); a hue arriving from the entity at render time appears nowhere in the stored configuration, so it is the harder case to audit, not the easier one). Failing that, an explicit universal `color` (common contract) MUST win over the bulb-derived color — a named value pins the card's active treatment predictably. Only under `color: auto` does `useLightColor` govern: bulb color when available, domain token otherwise.
- Very dark or desaturated bulb colors SHOULD be lightness-clamped for the tint so the active state remains distinguishable from inactive.

### Brightness presets (`brightnessPresets`)

- Values are whole percentages, each MUST be within 1–100 (0 is not a valid preset — turning off is the tap action's job); out-of-range, fractional and non-numeric values MUST be ignored at render time, and an array left empty after filtering hides the row. Filtering is render-time resolution and never a rewrite: the stored document keeps every value its author wrote, so a config written by a newer build survives a round trip. A stored value that is not a list at all reads as empty for the same reason.
- The stored order is the rendered order. A row reading 100 / 50 / 20 is a descending row somebody chose, not a list to normalise.
- Tapping a preset pill MUST call `light.turn_on` with the converted `brightness`, **even when the light is `off`** (presets act as "turn on at N%"). This is the one `full`-tier control that acts on an off light, and it is the case the option exists for: reaching for 20% at night should be one tap, not a tap to full followed by a correction. The shared 0–100 ↔ 0–255 conversion floors at 1, so no preset can round into an off command.
- Pills render in the `full` tier only, using the standard pill anatomy (`liebe-pill`); the pill matching the current brightness (after 0–100 rounding) SHOULD render as selected — but **only while the light is on**. Home Assistant keeps the last `brightness` on an entity after it is switched off, so a selected pill on a dark lamp would report a level nothing is emitting.
- Presets require brightness support; on an `onoff`-only light the row MUST NOT render regardless of configuration, since the payload names a level the entity cannot honour.

## Tier layouts

Per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts):

| Tier     | Content                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Icon circle + name + state; whole tile toggles. No embedded controls.                                                                   |
| `row`    | Icon + name/state row + horizontal brightness slider (when on, supported, and `showBrightnessSlider`).                                  |
| `tall`   | Icon on top, vertical brightness slider filling the middle, name/state at the bottom.                                                   |
| `full`   | `row` content plus, in order: color-temperature control, color control, brightness-preset pills — each only when supported and enabled. |

Content that does not fit MUST be omitted, never clipped or scrolled. When brightness is shown, the state line SHOULD read the percentage (e.g. `72%`) in place of the bare `On`.

## Scenarios

### Scenario: Legacy config migrates to the new key

- **GIVEN** a stored grid item with `config: { enableBrightness: false }`
- **WHEN** the dashboard configuration is loaded
- **THEN** the card behaves as `showBrightnessSlider: false` (no slider in any tier), and a subsequent YAML export contains `showBrightnessSlider: false` and no `enableBrightness` key.

### Scenario: Options cannot enable an unsupported capability

- **GIVEN** a light with `supported_color_modes: ['brightness']` on a `full`-tier card with `showColorTempControl: true` and `showColorControl: true`
- **WHEN** the card renders
- **THEN** it shows the brightness slider but neither the color-temperature nor the color control — the options are inert because the entity lacks the capabilities.

### Scenario: Slider fill follows the bulb color

- **GIVEN** an `on` RGB light reporting `rgb_color: [64, 120, 255]` with default options (`useLightColor: true`)
- **WHEN** the card renders in `row` tier
- **THEN** the icon tint and slider fill derive from that blue, not the amber domain token; and **WHEN** `useLightColor` is set to `false`, **THEN** they revert to the amber domain token.

### Scenario: Preset pill turns an off light on at the preset level

- **GIVEN** an `off` dimmable light on a `full`-tier card with `brightnessPresets: [20, 50, 100]`
- **WHEN** the user taps the `50` pill
- **THEN** the card calls `light.turn_on` with `brightness ≈ 128` (`round(0.5 × 255)`) and the light does not merely toggle.

## Open Questions

- ~~**Color picker presentation.**~~ Resolved (change 0016): fixed swatch row + recent-color slot, specified in the color-control section above. A future `colorControlStyle` select remains anticipated (common convention 5) — the boolean gates visibility only, so adding styles later is non-breaking.
- ~~**Color-temperature units.**~~ Resolved: Kelvin only (`min_color_temp_kelvin`/`max_color_temp_kelvin` read, `color_temp_kelvin` written). The mired path was removed from Home Assistant Core in 2026.3, so there is no fallback to specify.
- **Slider while off.** The slider currently renders only when the light is on. An alternative — always render it, with commit implying turn-on — may test better for dimmer-first users; deferred until the tier layouts are implemented.

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [Entity cards — Lights](../index.md#lights) — implementation baseline (toggle, brightness detection, 0%-commit-off)
- [Design system](../../design-system/index.md) — tiers, card anatomy, domain color tokens
- `src/components/LightCard.tsx` — current implementation (brightness slider, `supported_color_modes` detection, `config.showBrightnessSlider`)
- `src/store/lightOptions.ts` — the option read and the `enableBrightness` migration; `src/utils/lightBrightness.ts` — the shared 0–100 ↔ 0–255 conversion
