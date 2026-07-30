# Entity Card System — Card Reference

Companion to [index.md](./index.md). This document is the exhaustive per-card catalog: declared dimensions, the Home Assistant services each card calls with exact payloads, feature-flag constants, size handling, edit-mode affordances, lifecycle states, and GIVEN/WHEN/THEN scenarios derived from the real test suites. It is a living baseline of the implementation as it stands.

**Citation policy.** This document keeps its file and folder citations — the exhaustive per-card detail is its value, and that detail is only usable if a reader can find the code it describes. It cites **no line numbers**: a line reference is verifiable and wrong-in-spirit the moment a function moves within its file, and the precision it advertises is what makes it mislead. Because paths stay, something has to verify them — `src/__tests__/cardReferencePaths.test.ts` resolves every path this document cites and fails on one that no longer exists, and fails on a reintroduced line number too. Four citations rotted silently across one wave of card restructuring before that check existed (change [0041](../../changes/0041-card-conventions-and-reference.md)); the check is the half of the fix that survives the next one.

## Dimensions and capabilities matrix

| Card                | Domain(s)             | `defaultDimensions`                               | Config modal               | Interactive                   | Test file(s)                                                                                                                                                     |
| ------------------- | --------------------- | ------------------------------------------------- | -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LightCard           | `light`               | 2×2 (`src/components/LightCard/index.tsx`)        | Yes (light)                | toggle + brightness + colour  | `src/components/LightCard/__tests__/`, `src/components/__tests__/LightCard*.test.tsx`                                                                            |
| ClimateCard         | `climate`             | 3×3 (`src/components/ClimateCard/index.tsx`)      | Yes (climate)              | mode + setpoints              | `src/components/ClimateCard/__tests__/`                                                                                                                          |
| CoverCard           | `cover`               | 2×3 (`src/components/CoverCard/index.tsx`)        | No                         | open/close/stop/position/tilt | `src/components/CoverCard/__tests__/`                                                                                                                            |
| FanCard             | `fan`                 | 2×2 (`src/components/FanCard/index.tsx`)          | No                         | toggle + speed + preset       | `src/components/FanCard/__tests__/`                                                                                                                              |
| SensorCard          | `sensor`              | 2×2 (`src/components/SensorCard/index.tsx`)       | No                         | read-only                     | `src/components/SensorCard/__tests__/`, `src/components/__tests__/SensorCard.test.tsx`, `src/components/__tests__/sensorFormatting.test.tsx`                     |
| BinarySensorCard    | `binary_sensor`       | 2×2 (`src/components/BinarySensorCard/index.tsx`) | Yes (icons)                | read-only                     | `src/components/BinarySensorCard/__tests__/`, `src/components/__tests__/BinarySensorCard.test.tsx`, `src/components/__tests__/binarySensorPresentation.test.tsx` |
| ButtonCard          | `switch` + fallback   | 2×1 (`src/components/ButtonCard/index.tsx`)       | No                         | toggle                        | `src/components/ButtonCard/__tests__/`, `src/components/__tests__/ButtonCard.test.tsx`                                                                           |
| WeatherCard         | `weather`             | 4×3 (`src/components/WeatherCard/index.tsx`)      | Yes (variant/unit)         | read-only                     | `src/components/WeatherCard/__tests__/`, `src/components/WeatherCard.test.tsx`                                                                                   |
| WeatherCardDefault  | variant               | 4×3                                               | via parent                 | read-only                     | —                                                                                                                                                                |
| WeatherCardModern   | variant               | 3×3                                               | via parent                 | read-only                     | —                                                                                                                                                                |
| WeatherCardDetailed | variant               | 4×4                                               | via parent                 | read-only                     | —                                                                                                                                                                |
| WeatherCardMinimal  | variant               | 2×2                                               | via parent                 | read-only                     | —                                                                                                                                                                |
| InputBooleanCard    | `input_boolean`       | 2×1 (`src/components/InputBooleanCard.tsx`)       | No                         | toggle                        | `src/components/InputBooleanCard.test.tsx`                                                                                                                       |
| InputNumberCard     | `input_number`        | none → 2×2                                        | No                         | stepper + edit                | `src/components/InputNumberCard.test.tsx`                                                                                                                        |
| InputSelectCard     | `input_select`        | none → 2×2                                        | No                         | select                        | `src/components/InputSelectCard.test.tsx`                                                                                                                        |
| InputTextCard       | `input_text`          | none → 2×2                                        | No                         | inline edit                   | `src/components/InputTextCard.test.tsx`                                                                                                                          |
| InputDateTimeCard   | `input_datetime`      | none → 2×2                                        | No                         | native picker                 | `src/components/InputDateTimeCard.test.tsx`                                                                                                                      |
| TextCard            | grid type `text`      | 3×2 (`src/components/TextCard.tsx`)               | via CardConfig (text)      | inline edit                   | `src/components/TextCard.test.tsx`                                                                                                                               |
| Separator           | grid type `separator` | 4×1 (`src/components/Separator.tsx`)              | via CardConfig (separator) | edit-select only              | —                                                                                                                                                                |

Cards without declared `defaultDimensions` fall back to `{ width: 2, height: 2 }` (`src/utils/cardDimensions.ts`). Most cards export as `Object.assign(memo(Component, comparator), { defaultDimensions })`; `Separator` is a plain function with a static `.defaultDimensions` and no memo. Every card except `SensorCard`/`ButtonCard`/`TextCard`/`Separator` reads the store `mode` either directly or through `GridCard`.

## Lights

Implemented to the [light option contract](./options/light.md) by change [0016](../../changes/0016-light-card-to-spec.md); that document owns the keys, defaults and tier placements. The card lives in `src/components/LightCard/`, with the pure parts split out: `src/components/LightCard/lightColor.ts` (bulb colour resolution and the Kelvin→RGB fit), `src/components/LightCard/lightCapabilities.ts` (the capability matrix and the reported Kelvin range), `src/components/LightCard/lightPalette.ts` (the swatches and the reported-colour read).

**Services**: `light.turn_on` / `light.turn_off` on toggle; brightness commit sends `turn_on` with `{ brightness }` on the 0–255 scale, or `turn_off` when the committed value is 0; the temperature slider sends `{ color_temp_kelvin }`; a swatch sends `{ rgb_color }`; a preset sends `{ brightness }`. **Every one of them goes through `dispatchGuarded`** — at most once until the command is known to have landed, and never retried.

**Feature detection** (`src/components/LightCard/lightCapabilities.ts`): `supported_color_modes` is authoritative whenever it is a readable list, including when it answers no; the legacy bits (`SUPPORT_BRIGHTNESS = 1`, `SUPPORT_COLOR_TEMP = 2`, `SUPPORT_COLOR = 16`) are consulted only when it is absent or not a list. Brightness comes from `brightness` / `white` / `color_temp` / `hs` / `xy` / `rgb` / `rgbw` / `rgbww`, colour temperature from `color_temp`, colour from `hs` / `xy` / `rgb` / `rgbw` / `rgbww`. An unrecognised mode answers no to all three without throwing.

**Kelvin range** (`readColorTempRange`): both bounds must be finite, positive, and `min < max`; anything else — including a single bound and `NaN` — yields no range, and the control is withheld rather than given a substitute.

**Slider**: rendered when not in edit mode, the light is on, brightness is supported and `showBrightnessSlider !== false`, and the tier is not `glance`; horizontal at `row`/`full`, vertical at `tall`. Local drag state until commit; the card's own toggle declines while a drag is in flight. Both scale conversions go through `src/utils/lightBrightness.ts`, which rounds to the nearest `brightness` and then floors any nonzero percentage at 1 — the lowest step dims rather than turning the light off.

**Full-tier controls**: colour temperature and colour render only while the light is on; the preset row renders whether it is on or off, because a preset means "turn on at N%". All three are hidden in edit mode.

**Config**: `showBrightnessSlider`, `useLightColor`, `showColorTempControl`, `showColorControl` (booleans, all default `true`) and `brightnessPresets` (`number[]`, default `[]`), declared in `src/components/configurations/cardConfigurations.ts`, read through `src/store/lightOptions.ts`, validated at the import gate by `lightOptionsConfigSchema`, and edited via `CardConfig.Modal`. The shipped key was `enableBrightness`; `migrateLightCardConfig` rewrites it at the loader (`src/store/persistence.ts`), so nothing downstream reads two keys.

**States**: skeleton while the entity has not arrived; `ErrorDisplay` titled "Disconnected" with a reload retry when the connection is down. A missing entity on a live connection holds the skeleton indefinitely rather than reporting itself missing — `useEntity` cannot tell "not loaded yet" from "does not exist" (tracked by issue #265).

### Scenarios

- **Toggle off→on**: GIVEN an off light, WHEN the card is clicked, THEN `light.turn_on` is dispatched for the entity.
- **Early acknowledgement**: GIVEN a toggle whose service promise has resolved but whose `last_updated` has not moved, WHEN the card is clicked again, THEN the second command is refused rather than sent, and no error is shown.
- **Brightness commit**: GIVEN an on light at 100%, WHEN the slider is dragged to 50% and released, THEN `turn_on` is dispatched with `brightness ≈ 128`.
- **Commit 0 turns off**: GIVEN an on light, WHEN brightness is committed at 0, THEN `light.turn_off` is dispatched instead of `turn_on`.
- **No slider without brightness support**: GIVEN a light whose `supported_color_modes` is `['onoff']`, THEN no slider renders whatever the option says.
- **Colour temperature without a range**: GIVEN a `color_temp` light publishing no usable bounds, THEN no temperature control renders.
- **Preset from off**: GIVEN an off dimmable light with presets `[20, 50, 100]`, WHEN `50%` is tapped, THEN `turn_on` is dispatched with `brightness ≈ 128`.
- **Tint agreement**: GIVEN an on RGB light under `color: auto` and `useLightColor: true`, THEN the icon circle and the slider fill carry the same resolved colour; under a pinned `color`, neither does.

## Climate

The option contract — keys, defaults, tier layouts, colour precedence — is [options/climate](./options/climate.md)'s; this is the service and attribute detail behind it.

**Services** (all `climate`, dispatched from `src/components/ClimateCard/useClimateControl.ts`): `set_hvac_mode` `{ hvac_mode }`; `set_preset_mode` `{ preset_mode }`; `set_fan_mode` `{ fan_mode }`; `set_temperature` single `{ temperature }`, clamped to `[min_temp, max_temp]`; `set_temperature` range `{ target_temp_low, target_temp_high }`, sent together and refused when `low >= high` after clamping. Every one goes through the guarded, non-retrying path, and none of them sees a converted temperature — `displayUnit` is applied in the render path only.

**Feature flags** (`src/components/ClimateCard/climateModel.ts`): `SUPPORT_TARGET_TEMPERATURE = 1`, `SUPPORT_TARGET_TEMPERATURE_RANGE = 2`, `SUPPORT_FAN_MODE = 8`, `SUPPORT_PRESET_MODE = 16`, checked bitwise and resolved to booleans (a masked bit would render as a stray `0`). Preset and fan support additionally require a non-empty `preset_modes` / `fan_modes`. Target humidity (bit 4), swing (32) and aux heat (64) still have no surface — the humidity the card can show is the `current_humidity` reading, which no feature bit gates.

**Attributes read**: `current_temperature`, `current_humidity`, `temperature`, `target_temp_low/high`, `min_temp` (default 7), `max_temp` (35), `target_temp_step` (0.5, and a non-positive published step falls back to it), `hvac_modes`, `hvac_action`, `preset_mode(s)`, `fan_mode(s)`, `supported_features`. HVAC mode is `entity.state`. Every temperature passes `readTemperature`, which accepts a finite number or a numeric string and reads anything else — `null`, `NaN`, `"unknown"`, an object — as absent. The native unit is `hass.config.unit_system.temperature`, with the entity's `temperature_unit` as a fallback.

**Presentation**: `compact` (default) and `dial`, dispatched through the registry's variant mechanism; the dial renders at `full` only and falls back to the compact layout for its tier below that. Arc radius 70 at every tier. All controls are hidden in edit mode, and `glance` carries none in either variant — its stepper and mode row are registered in the detail dialog's domain slot instead. The card's options render in the shared configuration form, capability-gated from the entity.

### Scenarios (`src/components/ClimateCard/__tests__/`)

- **Increase setpoint**: GIVEN `heat` at 21, step 0.5, WHEN increase is pressed, THEN `set_temperature { temperature: 21.5 }`.
- **Min limit disables decrease**: GIVEN temp 7 with `min_temp: 7`, THEN the decrease button is disabled.
- **Range mode**: GIVEN `heat_cool` with low 20 / high 24 and `supported_features: 3`, THEN both setpoints render — independently at width ≥3, as one lockstep pair below that — and the dial draws two draggable handles.
- **Dial handles are sliders**: GIVEN a `dial` card in `heat_cool`, THEN each handle carries `role="slider"` with its name, `aria-valuenow`, `aria-valuemin`/`aria-valuemax`, and arrow keys move it under the same band-preserving rule as the drag (`src/components/ClimateCard/__tests__/ClimateDial.test.tsx`).
- **Mode switch**: GIVEN `hvac_modes ['off','heat','cool']` in `off`, WHEN the heat pill is pressed, THEN `set_hvac_mode { hvac_mode: 'heat' }`.
- **Error border**: GIVEN a service error, THEN `.climate-card` carries `data-error` and the error as `title`.
- **Edit mode hides controls**: GIVEN edit mode, THEN the steppers and every pill row are absent; the delete button calls `onDelete`.
- **Unknown is inert**: GIVEN state `unknown`, THEN the card renders the neutral unavailable treatment with no control that could dispatch (`src/components/ClimateCard/__tests__/ClimateCard.test.tsx`, both variants).

## Covers and fans

### CoverCard

**Services** (all `cover`): `open_cover`, `close_cover`, `stop_cover` — all no-data; `set_cover_position { position }`; `set_cover_tilt_position { tilt_position }`; `open_cover_tilt`, `close_cover_tilt` and `stop_cover_tilt`, likewise no-data. Position/tilt sliders keep local drag state and send on commit.

**Feature flags** (`src/components/CoverCard/presentation.ts`): OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8, OPEN_TILT 16, CLOSE_TILT 32, STOP_TILT 64, SET_TILT_POSITION 128; `supportsTilt` is any of the four tilt bits. Reads `current_position ?? position ?? 0`, `current_tilt_position ?? tilt_position ?? 0`. Open disabled when fully open; close disabled when fully closed.

**Sizing**: button size 1/2/3. The card sets no `minHeight` of its own — the shell owns the height floor, keyed on the tier ([index — Open Questions](./index.md#open-questions), where the old discrepancy is recorded as moot). Controls are hidden in edit mode; the card's options render in the shared configuration form.

**Scenarios** (`src/components/CoverCard/__tests__/`):

- **Open**: GIVEN `supported_features: 1`, WHEN "Open cover" clicked, THEN `open_cover` no-data.
- **State-based disable**: GIVEN `closed` at position 0 with features 3, THEN open enabled and close disabled.
- **Position slider commit**: GIVEN position 50 with SET_POSITION, WHEN ArrowRight key on the slider, THEN `callService` fires on commit.
- **Tilt open**: GIVEN OPEN_TILT (16), WHEN the first Tilt button clicked, THEN `open_cover_tilt` no-data.
- **Error + clear**: GIVEN an error, THEN status shows `ERROR`; WHEN "Open cover" clicked THEN `clearError` runs.

### FanCard

**Services** (all `fan`, every one through the guarded non-retrying dispatcher): `set_percentage { percentage }`, and `turn_off` rather than `set_percentage: 0` for a zero speed; `set_preset_mode { preset_mode }`; `oscillate { oscillating }`; `set_direction { direction }`. Toggle sends `turn_off` when on and `turn_on` when off, carrying `{ percentage: 50 }` only where the fan advertises speed — a payload a speedless fan cannot honour — and sends nothing at all where the fan advertises neither `TURN_ON` nor `TURN_OFF`, resolving to the detail dialog instead ([options/fan — primary action](./options/fan.md#primary-action) owns that contract).

**Feature flags** (`src/components/FanCard/features.ts`): `SET_SPEED = 1`, `OSCILLATE = 2`, `DIRECTION = 4`, `PRESET_MODE = 8`, `TURN_OFF = 16`, `TURN_ON = 32`, resolved to booleans off a strictly-numeric mask (a masked bit would render as a stray `0`, and a string `"9"` advertises nothing). `fan.set_preset_mode` accepts **either** `SET_SPEED` or `PRESET_MODE`, so one alone is enough for presets; a preset control additionally needs `preset_modes` to publish labels this card can render. Reads `percentage`, `percentage_step`, `preset_mode`, `preset_modes`, `oscillating`, `direction`.

**Speed steps** (`src/components/FanCard/speedSteps.ts`): pill values are derived from `percentage_step` read as a speed count, with the quartiles 25/50/75/100 as the fallback for every shape that yields no usable count; [options/fan — speed control](./options/fan.md#speed-control-speedcontrol) owns the contract. Controls are hidden in edit mode; the card's options render in the shared configuration form.

**Tests**: `src/components/FanCard/__tests__/`.

## Sensors and binary sensors

### SensorCard (read-only)

**Files**: `src/components/SensorCard/` — `src/components/SensorCard/index.tsx` (the card), `src/components/SensorCard/format.ts` (the value pipeline), `src/components/SensorCard/SensorGraph.tsx` (the graph region and the window's extremes), `src/components/SensorCard/SensorCard.css` (the graph's box per tier). Options are read by `src/store/sensorOptions.ts`.

**Value formatting** (`src/components/SensorCard/format.ts`): one function for the value, the trend delta and the min/max footer, applied in the order `valueScale` → `displayPrecision` → unit. The `displayPrecision: auto` matrix and the `valueScale: auto` k-scaling are owned by [options/sensor](./options/sensor.md#options) and pinned through the rendered card by `src/components/__tests__/sensorFormatting.test.tsx` — that file is the authority on what the matrix does, including two cases it deliberately changed (a `k` prefix is not applied when there is no unit to prefix, and a blank state no longer formats as `NaN`).

**History** (`useEntityHistory`): `sample` for the line graph and the `full` footer, `delta` for bars and the trend arrow, requested per surface. A surface the tier does not render is requested with an empty entity id, so `showGraph: false` costs no recorder request. `unsupported`, an error, and a window under two points all render the graph-less layout; only loading holds a reserved box.

**Icon by `device_class`** (`getSensorIcon`): temperature→Value, humidity→Circle, motion/occupancy/moving→ActivityLog, power/energy/current/voltage→LightningBolt, pressure→Mix, timestamp/duration→Clock, default→Home. One glyph size at every tier — the tiers differ by what they contain, not by scale. No config modal, no `onConfigure`; the card's options render in the shared configuration form.

**Tests**: `src/components/SensorCard/__tests__/` (card, formatting pipeline, graph region) and `src/components/__tests__/sensorFormatting.test.tsx` (the pinned matrix).

### BinarySensorCard (read-only, configurable)

**Files**: `src/components/BinarySensorCard/` — `src/components/BinarySensorCard/index.tsx` and `src/components/BinarySensorCard/presentation.ts`. Options are read by `src/store/binarySensorOptions.ts`.

**Presentation** (`resolveBinarySensorPresentation`): one derivation produces the presented state, the label, the glyph name and the colour triplet together, so `invert` cannot desynchronize them. `invert` swaps only a state that has an opposite — `unavailable`, `unknown` and anything else are read out raw. Label and glyph both come from `BINARY_SENSOR_FACES`, one row per `device_class` holding `{ on: { label, icon }, off: { label, icon } }`; a class with no row takes `DEFAULT_BINARY_SENSOR_FACES` (`Eye`/`EyeOff`, which passes no verdict on a state this build cannot interpret). Configured `onIcon`/`offIcon`/`onLabel`/`offLabel` override the row for the state they name.

**Active colour** (`activeColorForDeviceClass`): the alert set → `alert`, `moisture`/`water` → `water`, `light` → `light`, everything else → `default`.

**The hazard rule**: `ALERT_DEVICE_CLASSES` is one set serving both the colour above and the danger floor. A raw-active sensor of one of those classes resolves `danger`, which the card forwards to the shell — the card's half ignores every option of its own (the row's `on` label and glyph render whatever `onLabel`, `onIcon` and `invert` say), and `readCardDisplay`'s existing danger floor takes back the universal `icon`, `hideName`, `hideState` and `color` while keeping `name`.

**`full` tier**: adds a recency line from `last_changed` via `useRelativeSince`, the same helper and phrasing the switch card's `showLastChanged` uses. A missing or unparseable timestamp renders no line.

**Config**: `onIcon` / `offIcon` (`icon`-type, defaulting to `''` so an unset value means "use the device-class glyph"), `onLabel` / `offLabel`, and `invert`, in `src/components/configurations/cardConfigurations.ts`; the card wires `onConfigure`, `hasConfiguration={!!item}` and a `CardConfig.Modal` saving to `item.config`. States mirror SensorCard (skeleton / ErrorDisplay / unavailable).

**Tests**: `src/components/BinarySensorCard/__tests__/` — including the vocabulary audit, which declares what each glyph means independently of the table and fails any row whose glyph contradicts its label.

## Weather

Variant selection: `config.variant || config.preset || 'default'` (`src/components/WeatherCard/index.tsx`); saving migrates `preset` → `variant`. Variants registered on first render via `registerCardVariant`.

**Per-variant attributes and display:**

| Variant                                                         | Reads                                                 | Displays                                                                 | Background                          |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Default (`src/components/WeatherCard/WeatherCardDefault.tsx`)   | temperature, humidity, temperature_unit               | emoji icon, temp (Thermometer), humidity % (Droplets), capitalized state | Yes; `backdrop` off when bg present |
| Modern (`src/components/WeatherCard/WeatherCardModern.tsx`)     | temperature, humidity, temperature_unit               | lucide icon, large temp, "{humidity}% humidity", state                   | Yes; emphasis text shadow           |
| Detailed (`src/components/WeatherCard/WeatherCardDetailed.tsx`) | temperature, humidity, **pressure**, temperature_unit | labeled Temperature/Humidity/Pressure rows (`{round(pressure)} hPa`)     | Yes; header icon does not whiten    |
| Minimal (`src/components/WeatherCard/WeatherCardMinimal.tsx`)   | temperature, temperature_unit only                    | name, large temp, state                                                  | No — `transparent`, no icon         |

**Temperature unit** (duplicated `convertTemperature` + `getTemperatureDisplay` in each variant): native unit inferred from whether `temperature_unit` contains `f`; `auto` shows native, `celsius`/`fahrenheit` convert (C→F `t*9/5+32`, F→C `(t-32)*5/9`); value is `Math.round(...)`.

**Condition→icon**: Default uses emoji (`☀️ 🌧️ ☁️ ❄️ ⛈️`, fallback `🌤️`); Modern/Detailed use lucide (`Sun`, `CloudRain`, `CloudDrizzle`, `CloudSnow`, `Zap`, fallback `Cloud`); Minimal none.

**Backgrounds (PR #140)**: `getWeatherBackground(condition)` (`src/components/WeatherCard/index.tsx`) maps Pirate-Weather icon names and common HA conditions to one of 10 PNGs under `public/weather-backgrounds/` (`clear-day`, `clear-night`, `rain`, `snow`, `sleet`, `wind`, `fog`, `cloudy`, `partly-cloudy-day`, `partly-cloudy-night`), with partial-match fallbacks, returning `null` when nothing matches. URLs are prefixed by `getAssetBaseUrl()` → `window.__LIEBE_ASSET_BASE_URL__` or `/`. When a background exists, `getWeatherTextStyles`/`getWeatherTextColor` switch text to white with shadows and icons to white with drop-shadow.

**Scenarios** (`src/components/WeatherCard.test.tsx`):

- Unit conversion: 22°C default → `22°C`; with `temperatureUnit: 'fahrenheit'` → `72°F`.
- Preset backwards-compat: `preset: 'minimal' | 'detailed' | 'modern'` render the matching variant.
- New `variant` field + pressure: `variant: 'detailed'` at large shows `1013 hPa`.
- Detailed data points: Temperature/22°C, Humidity/65%, Pressure/1013 hPa.
- Edge cases: missing attributes hide `°C`/`%`; `unavailable` → `UNAVAILABLE`; loading → skeleton; disconnected → `Disconnected`.
- Default-variant emoji: sunny→`☀️`, rainy→`🌧️`, snowy→`❄️`; stale → `title="Weather data may be outdated"`.
- No tests cover background images, text shadows, or `__LIEBE_ASSET_BASE_URL__`.

## Input helper cards

Shared plumbing: `useEntity` + `useServiceCall`; title fallback `friendly_name || entity_id.split('.')[1]`; uniform skeleton / ErrorDisplay / unavailable states; error state = `grid-card-error`, red 2px border, error string as `title`. `useServiceCall.setValue` maps `input_number`/`input_text` → `set_value { value }`, `input_select` → `select_option { option }`, and `input_datetime` → `set_datetime` ([entity-state](../entity-state/index.md#consumer-hooks) owns the payload rules).

### InputBooleanCard

- Only input card with `defaultDimensions` (2×1) and the only one reading `useDashboardStore().mode` directly.
- `input_boolean.toggle` on card click or `Switch` change — never direct turn_on/off. In edit mode the Switch is hidden and a `ON`/`OFF` status shows.
- Scenarios: view-mode click → `toggle('input_boolean.test_toggle')`; edit-mode click → `onSelect(true)` and no toggle, switch absent; `loading` → `grid-card-loading` and disabled switch.

### InputNumberCard

- +/- stepper sends `input_number.set_value { value }` clamped to `[min, max]` by `step`; click-to-edit text field reverts NaN input without calling the service. Buttons disabled at bounds. `mode: 'slider'|'box'` is typed but no slider is rendered (always stepper).
- Scenarios: plus at 50 step 1 → `set_value 51`; typing `150` over max 100 → clamped `100`; `abc` → service not called, reverts to `50 %`.

### InputSelectCard

- Radix `Select` of `attributes.options ?? []`; change sends `input_select.select_option { option }`; disabled when no options. Status shows `{n} option(s)`.
- Scenarios: select "Option 2" → `select_option('input_select.test_select', 'Option 2')`; `options: []` → combobox disabled; edit-mode click → `onSelect(true)`, no setValue.

### InputTextCard

- Inline edit with min/max length + `pattern` validation; sends `input_text.set_value { value }` only when valid; masks value as `••••••••` when `mode === 'password'`. Field enforces `maxLength` and password type.
- Scenarios: submit "New Value" → `set_value('input_text.test_text', 'New Value')`; min 3 with "Hi" → not called; pattern `^[A-Z]+$` with "lowercase" → not called; password mode masks and uses `type='password'`.

### InputDateTimeCard

- Native `date`/`time`/`datetime-local` input chosen by `has_date`/`has_time` (default true); empty/`unknown` → `(not set)`; status `Date & Time` / `Date Only` / `Time Only`.
- Save calls `setValue`, which issues `input_datetime.set_datetime` since change [0022](../../changes/0022-switch-input-helpers-to-spec.md) — the runtime gap that made the card's primary action a no-op is closed. Payload rules, the format translation and the error the card surfaces are specified in [entity-state](../entity-state/index.md#consumer-hooks).
- Scenarios: click → prefilled `datetime-local`; change to `2024-02-20T16:45:00` and submit → `setValue('input_datetime.test_datetime', /^2024-02-20T16:45/)` (mocked); state `unknown` → `(not set)`; a space-separated state fills the picker and `06:30:00` fills a time input as `06:30` (`src/components/__tests__/InputDateTimeCard.test.tsx`); the mapping itself is proven unmocked in `src/hooks/__tests__/useServiceCall.inputDatetime.test.tsx`.

## Button and fallback card

`ButtonCard` (`switch` + fallback, 2×1). Toggles via `useServiceCall.toggle` on click, guarded against loading/unavailable. Icon by domain: light→Sun, switch→LightningBolt, input_boolean→Check, default→LightningBolt. `on` styling amber-3/amber-6, 2px border. Status shows `ERROR` on failure or the uppercased state. No config modal. Scenario (`src/components/__tests__/ButtonCard.test.tsx`): clicking an on switch calls `toggle` for the entity.

## Text and separator widgets

### TextCard (grid type `text`, 3×2)

- Renders Markdown via `react-markdown` with Radix components for h1–h3/p/strong/em/ul/ol/li/code/blockquote. Props resolve `config?.X || propX || default` (`src/components/TextCard.tsx`): `content`, `alignment` (left/center/right), `textSize` (small/medium/large → Radix 1/2/3), `textColor` (`default` → undefined, else Radix color). Note the `||` chains treat valid falsy values as absent — clearing `content` to an empty string falls back to the placeholder. Fixing this to nullish semantics is tracked in [0002-repo-hygiene](../../changes/0002-repo-hygiene.md).
- Edit mode renders an auto-focused `TextArea`; `handleContentChange` persists live via `dashboardActions.updateGridItem(currentScreenId, itemId, { content })`. `onDelete`/`onConfigure` are accepted but unused. No entity binding → no loading/error states. Config is edited through `CardConfig` as direct item properties.

### Separator (grid type `separator`, 4×1)

- Horizontal: two flex 2px gray lines flanking an optional centered title; Vertical: 2px vertical lines with title in `writing-mode: vertical-rl`. Title color is a Radix union (gray/blue/green/red/orange/purple); resolves `separatorOrientation || orientation`, `separatorTextColor || textColor`. `size` prop is unused. Edit-mode click selects; selected → blue-3 highlight. `onDelete`/`onConfigure` accepted but unused. Config edited via `CardConfig` (or the add dialog) as direct item properties.

## Configuration modal (CardConfig)

`CardConfig.Modal` (`src/components/CardConfig.tsx`) is a 900px two-pane dialog. Left pane: `Content` builds a form from `cardConfigurations[cardType].definition` via `Component`, rendering one control per `ConfigOption` type — boolean (`Switch`), string (`TextField`), textarea (`TextArea`), number (`TextField type=number` reverting empty to default), select (`Select`), icon (`IconSelect`). Right pane: `Preview` renders the live card inside `ViewModeWrapper` (temporarily forces store mode `view`, restores on unmount) with `pointer-events: none` — implemented for weather, light, binary_sensor, text, and separator; other types show a "Preview not available" note.

Local config initializes from the item (`text`/`separator` from direct properties, else `item.config`), updates on change, and persists only on "Save Changes" — `text`/`separator` are saved as direct properties, entity cards under `config`.

**Scenarios** (`src/components/__tests__/CardConfig.test.tsx`):

- Weather config renders a variant select and opens/selects it.
- Save persists the chosen config; temperature-unit select works.
- Cancel and the X button discard/close.
- Two select fields operate independently; keyboard navigation works.

## Entity discovery (EntityBrowser)

`EntityBrowser` (`src/components/EntityBrowser.tsx`) is a fullscreen modal with Entities and Cards tabs. `EntitiesBrowserTab` virtualizes the list (`@tanstack/react-virtual`, 64px rows), debounces search 300ms over id/friendly-name/domain, filters the `SYSTEM_DOMAINS` of `src/components/EntitiesBrowserTab.tsx` — `persistent_notification`, `sun` and `zone`, `person` having left the list when it gained a card of its own — and pre-excludes domains not in that file's `SUPPORTED_DOMAINS`. `getFriendlyDomain` maps domains to display names. Adding creates one `GridItem` per selected entity, each sized by `getDefaultCardDimensions` and positioned via `findOptimalPositionsForBatch`. `CardsBrowserTab` adds Text and Separator widgets (Separator via a configuration dialog).

**Scenarios** (`src/components/__tests__/EntityBrowser.test.tsx`):

- Renders/omits the dialog by `open`; shows both tabs.
- Groups entities by domain; filters out system domains; search filters the list.
- Add selected → grid items created; Cards tab shows widgets and can add a text card.
- Loading/empty states; cancel closes; null `screenId` adds nothing.

## References

See [index.md — References](./index.md#references) for the full file list and related specs.
