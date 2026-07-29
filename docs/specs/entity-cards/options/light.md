# Card Options — Light

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here.

**Status: specified, not yet implemented.** The current `LightCard` implements toggle, brightness detection, and the brightness slider — gated by `showBrightnessSlider`, which [0016](../../../changes/0016-light-card-to-spec.md) PR 1 migrated the legacy `enableBrightness` key onto; color temperature and color controls, `useLightColor`, and presets are new. **Tier layouts below are implemented** by change [0011](../../../changes/0011-layout-tiers.md) PR 3, with the controls that do not exist yet simply absent from their slots. See [entity-cards — Lights](../index.md#lights) for the implementation baseline.

## Primary action

`tapAction: default` MUST toggle the light — with `unavailable`/`unknown` resolved first as **inert** (no service dispatch against an unavailable device, regardless of the shell's unavailable styling): `light.turn_off` when the entity state is `on`, `light.turn_on` for any other real state. The whole tile is the tap target; embedded controls (slider, swatches, preset pills) consume their own events and MUST NOT trigger the tap action (per [common contract — Action type](./common.md#action-type)).

## Options

All keys live under `item.config`, camelCase, and follow [common conventions](./common.md#conventions-for-per-card-options) — in particular convention 3: whether a control _can_ appear is derived from the entity's `supported_color_modes` (with the legacy `supported_features` fallback); these options only hide or tune capabilities the entity already has.

| Key                    | Type     | Default | Behavior                                                                                                                                                                                      |
| ---------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showBrightnessSlider` | boolean  | `true`  | Renders the brightness slider when the entity supports brightness. Tiers: `row` (horizontal), `tall` (vertical), `full` (horizontal). Never in `glance`.                                      |
| `showColorTempControl` | boolean  | `true`  | Renders a warm→cool color-temperature control when the entity supports color temperature (`supported_color_modes` includes `color_temp`). Tier: `full` only.                                  |
| `showColorControl`     | boolean  | `true`  | Renders a color control when the entity supports color (`supported_color_modes` includes any of `hs` / `xy` / `rgb` / `rgbw` / `rgbww`). Tier: `full` only.                                   |
| `useLightColor`        | boolean  | `true`  | When `true`, the icon tint and slider fill follow the bulb's actual color; when `false`, they always use the light domain token. Affects all tiers (it recolors existing content, adds none). |
| `brightnessPresets`    | number[] | `[]`    | Percent values (1–100) rendered as preset pills. Empty array (the default) hides the row entirely. Tier: `full` only.                                                                         |

### Brightness (`showBrightnessSlider`)

- Brightness MUST be presented on a 0–100 scale, converted to/from Home Assistant's 0–255 `brightness` attribute.
- Committing the slider at 0 MUST call `light.turn_off` (already implemented — this behavior is retained as a MUST). Committing any nonzero percentage MUST send `light.turn_on` with `brightness ≥ 1` — rounding MUST NOT collapse a nonzero slider position to a `brightness` of 0, since that would silently turn the light off at the minimum slider step.
- The slider MUST render only while the light is `on`; when `off`, the tile shows no slider and tap turns the light on. Drag state MUST stay local until commit (optimistic drag, per [entity-cards](../index.md#lights)).
- Brightness capability MUST be detected from `supported_color_modes` (any of `brightness` / `white` / `color_temp` / `hs` / `xy` / `rgb` / `rgbw` / `rgbww` — every mode Home Assistant treats as brightness-capable, including `white`, whose entities may carry no legacy flag) with a fallback to the legacy `SUPPORT_BRIGHTNESS` (bit 1) feature flag. An `onoff`-only light gets no slider regardless of this option. The capability matrix tests MUST include a `['white']`-only entity.

**Backward compatibility:** the shipped key is `enableBrightness`. The config loader MUST migrate `enableBrightness` → `showBrightnessSlider` (same semantics: absent or `true` shows the slider, explicit `false` hides it), following the weather `preset` → `variant` migration pattern ([common contract — convention 1](./common.md#conventions-for-per-card-options)). After migration, `enableBrightness` MUST NOT be written back on save; exported YAML contains only the new key.

### Color temperature (`showColorTempControl`)

Rendered in the `full` tier as a warm→cool control: a row of temperature swatches or a gradient slider spanning the entity-reported range `min_color_temp_kelvin`–`max_color_temp_kelvin` (never a hardcoded range). Selecting a value MUST call `light.turn_on` with `color_temp_kelvin`. **Kelvin is the only color-temperature interface**: Home Assistant Core 2026.3 removed `LightEntity.color_temp`/`min_mireds`/`max_mireds`, the `ATTR_COLOR_TEMP`/`ATTR_MIN_MIREDS`/`ATTR_MAX_MIREDS` state attributes, and the `color_temp`/`kelvin` arguments to `light.turn_on`, so a mired fallback would target a deleted API. When the entity does not support color temperature the control MUST NOT appear even with `showColorTempControl: true`.

### Color (`showColorControl`)

Rendered in the `full` tier for color-capable lights. Selecting a color MUST call `light.turn_on` with the corresponding color payload. The presentation is a **fixed single row of curated color swatches plus one recent-color slot** (the last color committed from this card) — decided in change 0016: one tap per selection suits touch-first, and a fixed row fits the `full` tier without scrolling by construction ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)). A hue/saturation wheel is deferred to a future `colorControlStyle` select.

### Light-color theming (`useLightColor`)

- When `true` and the light is `on` with a resolvable RGB color (`rgb_color`, or derivable from `hs_color` / `xy_color` / color temperature), the icon-circle tint and the slider fill MUST use that color instead of the domain token.
- When the actual color is unavailable (no color attributes, `onoff`/`brightness`-only lights) or the light is `off`, rendering MUST fall back to the standard active/inactive pattern with the light domain token (`--liebe-c-light`, amber — [design-system — domain color discipline](../../design-system/index.md#domain-color-discipline)).
- When `false`, the domain token is always used. The precedence is ordered and total: a **danger state** suppresses the bulb color outright — the bulb color is a data-driven override sitting on top of the card's own treatment, and a danger state admits none ([options/sensor — active hazard sensors](./sensor.md); a hue arriving from the entity at render time appears nowhere in the stored configuration, so it is the harder case to audit, not the easier one). Failing that, an explicit universal `color` (common contract) MUST win over the bulb-derived color — a named value pins the card's active treatment predictably. Only under `color: auto` does `useLightColor` govern: bulb color when available, domain token otherwise.
- Very dark or desaturated bulb colors SHOULD be lightness-clamped for the tint so the active state remains distinguishable from inactive.

### Brightness presets (`brightnessPresets`)

- Values are percentages, each MUST be within 1–100 (0 is not a valid preset — turning off is the tap action's job); out-of-range or non-numeric values MUST be ignored at render time, and an array left empty after filtering hides the row.
- Tapping a preset pill MUST call `light.turn_on` with the converted `brightness`, even when the light is `off` (presets act as "turn on at N%").
- Pills render in the `full` tier only, using the standard pill anatomy (`liebe-pill`); the pill matching the current brightness (after 0–100 rounding) SHOULD render as selected.
- Presets require brightness support; on an `onoff`-only light the row MUST NOT render regardless of configuration.

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
