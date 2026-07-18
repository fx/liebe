# Entity Card System — Card Reference

Companion to [index.md](./index.md). This document is the exhaustive per-card catalog: declared dimensions, the Home Assistant services each card calls with exact payloads, feature-flag constants, size handling, edit-mode affordances, lifecycle states, and GIVEN/WHEN/THEN scenarios derived from the real test suites. Every claim is referenced to `path:line`. It is a living baseline of the implementation as it stands.

## Dimensions and capabilities matrix

| Card                | Domain(s)             | `defaultDimensions`               | Config modal               | Interactive                   | Test file(s)                                                                           |
| ------------------- | --------------------- | --------------------------------- | -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| LightCard           | `light`               | 2×2 (`LightCard.tsx:293`)         | Yes (light)                | toggle + brightness           | LightCard.test.tsx, LightCard.brightness.test.tsx, LightCard.slider-usability.test.tsx |
| ClimateCard         | `climate`             | 3×3 (`ClimateCard.tsx:960`)       | No                         | mode + setpoints              | ClimateCard.test.tsx                                                                   |
| CoverCard           | `cover`               | 2×3 (`CoverCard.tsx:420`)         | No                         | open/close/stop/position/tilt | CoverCard.test.tsx                                                                     |
| FanCard             | `fan`                 | 2×2 (`FanCard.tsx:384`)           | No                         | toggle + speed + preset       | —                                                                                      |
| SensorCard          | `sensor`              | 2×2 (`SensorCard.tsx:244`)        | No                         | read-only                     | SensorCard.test.tsx                                                                    |
| BinarySensorCard    | `binary_sensor`       | 2×2 (`BinarySensorCard.tsx:198`)  | Yes (icons)                | read-only                     | — (previewed in CardConfig)                                                            |
| ButtonCard          | `switch` + fallback   | 2×1 (`ButtonCard.tsx:155`)        | No                         | toggle                        | ButtonCard.test.tsx                                                                    |
| WeatherCard         | `weather`             | 4×3 (`WeatherCard/index.tsx:311`) | Yes (variant/unit)         | read-only                     | WeatherCard.test.tsx                                                                   |
| WeatherCardDefault  | variant               | 4×3                               | via parent                 | read-only                     | —                                                                                      |
| WeatherCardModern   | variant               | 3×3                               | via parent                 | read-only                     | —                                                                                      |
| WeatherCardDetailed | variant               | 4×4                               | via parent                 | read-only                     | —                                                                                      |
| WeatherCardMinimal  | variant               | 2×2                               | via parent                 | read-only                     | —                                                                                      |
| InputBooleanCard    | `input_boolean`       | 2×1 (`InputBooleanCard.tsx:128`)  | No                         | toggle                        | InputBooleanCard.test.tsx                                                              |
| InputNumberCard     | `input_number`        | none → 2×2                        | No                         | stepper + edit                | InputNumberCard.test.tsx                                                               |
| InputSelectCard     | `input_select`        | none → 2×2                        | No                         | select                        | InputSelectCard.test.tsx                                                               |
| InputTextCard       | `input_text`          | none → 2×2                        | No                         | inline edit                   | InputTextCard.test.tsx                                                                 |
| InputDateTimeCard   | `input_datetime`      | none → 2×2                        | No                         | native picker                 | InputDateTimeCard.test.tsx                                                             |
| TextCard            | grid type `text`      | 3×2 (`TextCard.tsx:343`)          | via CardConfig (text)      | inline edit                   | —                                                                                      |
| Separator           | grid type `separator` | 4×1 (`Separator.tsx:133`)         | via CardConfig (separator) | edit-select only              | —                                                                                      |

Cards without declared `defaultDimensions` fall back to `{ width: 2, height: 2 }` (`utils/cardDimensions.ts:8-17`). Most cards export as `Object.assign(memo(Component, comparator), { defaultDimensions })`; `Separator` is a plain function with a static `.defaultDimensions` and no memo. Every card except `SensorCard`/`ButtonCard`/`TextCard`/`Separator` reads the store `mode` either directly or through `GridCard`.

## Lights

**Services** (`LightCard.tsx`): `light.turn_on` / `light.turn_off` on toggle (`145-158`); brightness commit sends `light.turn_on` with `{ brightness }` on 0–255 scale, or `turn_off` when the committed value is 0 (`66-81`).

**Feature detection**: `SUPPORT_BRIGHTNESS = 1` (`22`). Brightness is supported when `supported_color_modes` includes any of `brightness`, `color_temp`, `hs`, `xy`, `rgb`, `rgbw`, `rgbww`, else the legacy `supported_features & 1` (`87-102`). Color and color-temp checks are stubbed as comments (`104-111`, `171`).

**Slider** (`226-244`): visible only when `!isEditMode && isOn && supportsBrightness && config.enableBrightness !== false`. Uses `localBrightness` + `isDragging` while dragging, `onValueCommit` to send. Display is `round(brightness/255*100)`; card click is suppressed while dragging (`185`).

**Config**: `enableBrightness` boolean, default true (`configurations/cardConfigurations.ts:13-24`), edited via `CardConfig.Modal` (`LightCard.tsx:267-274`).

**States**: skeleton `124-126`; ErrorDisplay `129-138`; `on` styling amber-3 bg / amber-6 border, 2px border when selected/error/on (`191-193`).

### Scenarios (from the three LightCard test files)

- **Toggle off→on**: GIVEN an off light, WHEN the card is clicked, THEN `light.turn_on` is called for the entity (`LightCard.test.tsx`, toggle test).
- **Brightness commit**: GIVEN an on light at 100%, WHEN the slider is dragged to 50% and released, THEN `turn_on` is called with `brightness ≈ 128` (`LightCard.tsx:66-81`; `LightCard.brightness.test.tsx`).
- **Commit 0 turns off**: GIVEN an on light, WHEN brightness is committed at 0, THEN `light.turn_off` is called instead of `turn_on` (`LightCard.tsx:72-76`).
- **Slider hidden in edit mode**: GIVEN edit mode, WHEN the on light renders, THEN no brightness slider appears (`LightCard.tsx:222`; `LightCard.slider-usability.test.tsx`).
- **No slider without brightness support**: GIVEN a light whose `supported_color_modes` is `['onoff']`, THEN the slider is not rendered (`87-102`).

## Climate

**Services** (all `climate`): `set_hvac_mode` `{ hvac_mode }` (`134-141`); `set_temperature` single `{ temperature }` clamped to `[min_temp, max_temp]` (`151-165`); `set_temperature` range `{ target_temp_low, target_temp_high }`, rejecting `low >= high` (`194-204`). `set_fan_mode` exists only as commented-out code (`219-233`).

**Feature flags**: `SUPPORT_TARGET_TEMPERATURE = 1`, `SUPPORT_TARGET_TEMPERATURE_RANGE = 2` (`18-19`), checked bitwise (`106-107`). Others (humidity/fan/preset/swing/aux) are commented out.

**Attributes read** (`102-125`): `current_temperature`, `temperature`, `target_temp_low/high`, `min_temp` (7), `max_temp` (35), `target_temp_step` (0.5), `temperature_unit` (`°C`), `hvac_modes`, `hvac_action`, `supported_features`. HVAC mode is `entity.state`.

**Sizing**: arc radius 50/70/90; container `minHeight` 220/280/320px (`282`, `482`). All controls hidden in edit mode. No config modal (`cardConfigurations` has a placeholder only, `25-29`).

### Scenarios (`ClimateCard.test.tsx`)

- **Increase setpoint**: GIVEN `heat` at 21, step 0.5, WHEN increase clicked, THEN `set_temperature { temperature: 21.5 }` (`127-156`).
- **Min limit disables decrease**: GIVEN temp 7 with `min_temp: 7`, THEN the decrease button is disabled (`189-210`).
- **Range mode**: GIVEN `heat_cool` with low 20 / high 24 and `supported_features: 3`, THEN shows `20.0 - 24.0°C` and the drag instruction instead of +/- buttons (`212-237`).
- **Mode switch**: GIVEN `hvac_modes ['off','heat','cool']` in `off`, WHEN the heat mode button clicked, THEN `set_hvac_mode { hvac_mode: 'heat' }` (`241-279`).
- **Error border**: GIVEN a service error, THEN `.climate-card` has `grid-card-error`, red 2px border, and the error as `title` (`434-457`).
- **Edit mode hides controls**: GIVEN edit mode, THEN increase/decrease buttons are absent (`367-392`); delete button calls `onDelete` (`351-365`).

## Covers and fans

### CoverCard

**Services** (all `cover`): `open_cover` (`111-115`), `close_cover` (`121-125`), `stop_cover` (`131-135`) — all no-data; `set_cover_position { position }` (`145-150`); `set_cover_tilt_position { tilt_position }` (`163-168`); `open_cover_tilt` (`177-181`); `close_cover_tilt` (`187-191`). Position/tilt sliders keep local drag state and send on commit.

**Feature flags** (`25-31`): OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8, OPEN_TILT 16, CLOSE_TILT 32, SET_TILT_POSITION 64; `supportsTilt = openTilt || closeTilt || setTiltPosition` (`71`). Reads `current_position ?? position ?? 0`, `current_tilt_position ?? tilt_position ?? 0` (`74-80`). Open disabled when fully open; close disabled when fully closed.

**Sizing**: button size 1/2/3; container `minHeight` 160/180/200px (`264`) — but the test asserts 60/80/100px (see index Open Questions). Controls hidden in edit mode; no config modal.

**Scenarios** (`CoverCard.test.tsx`):

- **Open**: GIVEN `supported_features: 1`, WHEN "Open cover" clicked, THEN `open_cover` no-data (`139-159`).
- **State-based disable**: GIVEN `closed` at position 0 with features 3, THEN open enabled and close disabled (`207-222`).
- **Position slider commit**: GIVEN position 50 with SET_POSITION, WHEN ArrowRight key on the slider, THEN `callService` fires on commit (`246-272`).
- **Tilt open**: GIVEN OPEN_TILT (16), WHEN the first Tilt button clicked, THEN `open_cover_tilt` no-data (`312-339`).
- **Error + clear**: GIVEN an error, THEN status shows `ERROR`; WHEN "Open cover" clicked THEN `clearError` runs (`430-452`).

### FanCard (no test file)

**Services** (`fan`): `set_percentage { entity_id, percentage }`, or `turnOff` when percentage is 0 (`58-68`), triggered by four wind-speed buttons (25/50/75/100); `set_preset_mode { entity_id, preset_mode }` from a `Select` (`80-87`). Card click toggles: `turnOff` when on, `turnOn(entity, supportsSpeed ? { percentage: 50 } : undefined)` when off (`192-202`).

**Feature flags**: `SUPPORT_SET_SPEED = 1`, `SUPPORT_PRESET_MODE = 8` (`18-19`). Reads `percentage`, `preset_mode`, `preset_modes`. Speed→button bucketing: 0→'0', ≤37→'25', ≤62→'50', ≤87→'75', else '100' (`165-172`); animation speed fast ≥66 / medium ≥33 / slow (`183-190`). `on` styling cyan-3/cyan-6. Controls hidden in edit mode; no config modal.

## Sensors and binary sensors

### SensorCard (read-only)

**Value formatting** (`formatSensorValue`, `68-118`): `unavailable`/`unknown` → uppercased state; non-numeric → uppercased state; temperature → `toFixed(1)`; humidity/battery → `Math.round`; energy/power → ÷1000 with `k`-prefixed unit at ≥1000 else `toFixed(0)`; default magnitude rules (integer as-is, `<10` → 2dp, `<100` → 1dp, else round). Unit appended when present.

**Icon by `device_class`** (`getSensorIcon`, `35-65`): temperature→Value, humidity→Circle, motion/occupancy/moving→ActivityLog, power/energy/current/voltage→LightningBolt, pressure→Mix, timestamp/duration→Clock, default→Home. Icon size 24/20/16; value font 2/3/4; container `minHeight` 120/100/80px. No config modal, no `onConfigure`.

**Scenarios** (`__tests__/SensorCard.test.tsx`):

- Temperature `21.5` °C → `21.5 °C` with friendly name.
- Power `1250` W → `1.3 kW`.
- Humidity `65.3` % → `65 %` (rounded).
- `unavailable` → `UNAVAILABLE`, friendly name still shown.
- Missing entity / disconnected → `Disconnected`.
- Edit-mode click → `onSelect(true)`; delete button → `onDelete`.
- Stale entity → no `title`/dashed-border stale indicator (removed).
- Parametrized device-class table: motion `on`→`ON`, energy `1500 Wh`→`1.5 kWh`, pressure `1013.25`→`1013 hPa`, timestamp string passed through.

### BinarySensorCard (read-only, configurable icons)

`on = entity.state === 'on'` (`74`). Icon resolution (`64-71`): `config.onIcon`/`config.offIcon` → `device_class` default pair (`getDefaultIcons`, `23-44`) → `getTablerIcon || getIcon || (isOn ? CircleCheck : Circle)`. Device-class defaults include occupancy, door/window, motion, moisture, lock, safety, smoke, sound, vibration, light. Status text is `entity.state.toUpperCase()`. `on` uses amber background/border (2px) and amber icon/text.

**Config**: `onIcon` (default `CircleCheck`) / `offIcon` (default `Circle`), both `icon`-type (`cardConfigurations.ts:59-76`); wires `onConfigure`, `hasConfiguration={!!item}`, and a `CardConfig.Modal` saving to `item.config`. States mirror SensorCard (skeleton / ErrorDisplay / unavailable). The icon `useMemo` runs before early returns to keep hook order stable.

## Weather

Variant selection: `config.variant || config.preset || 'default'` (`WeatherCard/index.tsx:248`); saving migrates `preset` → `variant` (`268-282`). Variants registered on first render via `registerCardVariant` (`15-22`).

**Per-variant attributes and display:**

| Variant                              | Reads                                                 | Displays                                                                 | Background                          |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Default (`WeatherCardDefault.tsx`)   | temperature, humidity, temperature_unit               | emoji icon, temp (Thermometer), humidity % (Droplets), capitalized state | Yes; `backdrop` off when bg present |
| Modern (`WeatherCardModern.tsx`)     | temperature, humidity, temperature_unit               | lucide icon, large temp, "{humidity}% humidity", state                   | Yes; emphasis text shadow           |
| Detailed (`WeatherCardDetailed.tsx`) | temperature, humidity, **pressure**, temperature_unit | labeled Temperature/Humidity/Pressure rows (`{round(pressure)} hPa`)     | Yes; header icon does not whiten    |
| Minimal (`WeatherCardMinimal.tsx`)   | temperature, temperature_unit only                    | name, large temp, state                                                  | No — `transparent`, no icon         |

**Temperature unit** (duplicated `convertTemperature` + `getTemperatureDisplay` in each variant): native unit inferred from whether `temperature_unit` contains `f`; `auto` shows native, `celsius`/`fahrenheit` convert (C→F `t*9/5+32`, F→C `(t-32)*5/9`); value is `Math.round(...)`.

**Condition→icon**: Default uses emoji (`☀️ 🌧️ ☁️ ❄️ ⛈️`, fallback `🌤️`); Modern/Detailed use lucide (`Sun`, `CloudRain`, `CloudDrizzle`, `CloudSnow`, `Zap`, fallback `Cloud`); Minimal none.

**Backgrounds (PR #140)**: `getWeatherBackground(condition)` (`index.tsx:136-232`) maps Pirate-Weather icon names and common HA conditions to one of 10 PNGs under `public/weather-backgrounds/` (`clear-day`, `clear-night`, `rain`, `snow`, `sleet`, `wind`, `fog`, `cloudy`, `partly-cloudy-day`, `partly-cloudy-night`), with partial-match fallbacks, returning `null` when nothing matches. URLs are prefixed by `getAssetBaseUrl()` → `window.__LIEBE_ASSET_BASE_URL__` or `/` (`123-133`). When a background exists, `getWeatherTextStyles`/`getWeatherTextColor` switch text to white with shadows and icons to white with drop-shadow.

**Scenarios** (`WeatherCard.test.tsx`):

- Unit conversion: 22°C default → `22°C`; with `temperatureUnit: 'fahrenheit'` → `72°F` (`44-50`).
- Preset backwards-compat: `preset: 'minimal' | 'detailed' | 'modern'` render the matching variant (`53-84`).
- New `variant` field + pressure: `variant: 'detailed'` at large shows `1013 hPa` (`98-101`).
- Detailed data points: Temperature/22°C, Humidity/65%, Pressure/1013 hPa (`68-76`).
- Edge cases: missing attributes hide `°C`/`%`; `unavailable` → `UNAVAILABLE`; loading → skeleton; disconnected → `Disconnected` (`104-166`).
- Default-variant emoji: sunny→`☀️`, rainy→`🌧️`, snowy→`❄️`; stale → `title="Weather data may be outdated"` (`178-215`).
- No tests cover background images, text shadows, or `__LIEBE_ASSET_BASE_URL__`.

## Input helper cards

Shared plumbing: `useEntity` + `useServiceCall`; title fallback `friendly_name || entity_id.split('.')[1]`; uniform skeleton / ErrorDisplay / unavailable states; error state = `grid-card-error`, red 2px border, error string as `title`. `useServiceCall.setValue` maps `input_number`/`input_text` → `set_value { value }` and `input_select` → `select_option { option }` (`hooks/useServiceCall.ts:150-179`); there is **no** `input_datetime` branch.

### InputBooleanCard

- Only input card with `defaultDimensions` (2×1, `128`) and the only one reading `useDashboardStore().mode` directly (`28`).
- `input_boolean.toggle` on card click (`32`) or `Switch` change (`39`) — never direct turn_on/off. In edit mode the Switch is hidden and a `ON`/`OFF` status shows (`111-122`).
- Scenarios: view-mode click → `toggle('input_boolean.test_toggle')` (`98-105`); edit-mode click → `onSelect(true)` and no toggle, switch absent (`120-142`); `loading` → `grid-card-loading` and disabled switch (`176-193`).

### InputNumberCard

- +/- stepper sends `input_number.set_value { value }` clamped to `[min, max]` by `step` (`57-108`); click-to-edit text field reverts NaN input without calling the service. Buttons disabled at bounds. `mode: 'slider'|'box'` is typed but no slider is rendered (always stepper).
- Scenarios: plus at 50 step 1 → `set_value 51` (`91-99`); typing `150` over max 100 → clamped `100` (`197-210`); `abc` → service not called, reverts to `50 %` (`214-227`).

### InputSelectCard

- Radix `Select` of `attributes.options ?? []`; change sends `input_select.select_option { option }` (`37-43`); disabled when no options. Status shows `{n} option(s)`.
- Scenarios: select "Option 2" → `select_option('input_select.test_select', 'Option 2')` (`97-111`); `options: []` → combobox disabled (`250-266`); edit-mode click → `onSelect(true)`, no setValue (`132-154`).

### InputTextCard

- Inline edit with min/max length + `pattern` validation; sends `input_text.set_value { value }` only when valid (`56-91`); masks value as `••••••••` when `mode === 'password'`. Field enforces `maxLength` and password type.
- Scenarios: submit "New Value" → `set_value('input_text.test_text', 'New Value')` (`101-116`); min 3 with "Hi" → not called (`141-155`); pattern `^[A-Z]+$` with "lowercase" → not called (`171-198`); password mode masks and uses `type='password'` (`203`).

### InputDateTimeCard

- Native `date`/`time`/`datetime-local` input chosen by `has_date`/`has_time` (default true); empty/`unknown` → `(not set)`; status `Date & Time` / `Date Only` / `Time Only`.
- **Runtime gap**: save calls `setValue` (`62`) which has no `input_datetime` mapping, so it returns `{ success: false, error: 'setValue not supported for domain: input_datetime' }` and never issues `input_datetime.set_datetime`. Tests pass only because `setValue` is mocked.
- Scenarios: click → prefilled `datetime-local` (`136-155`); change to `2024-02-20T16:45:00` and submit → `setValue('input_datetime.test_datetime', /^2024-02-20T16:45/)` (mocked) (`213-240`); state `unknown` → `(not set)` (`279-291`).

## Button and fallback card

`ButtonCard` (`switch` + fallback, 2×1). Toggles via `useServiceCall.toggle` on click, guarded against loading/unavailable (`63-72`). Icon by domain: light→Sun, switch→LightningBolt, input_boolean→Check, default→LightningBolt (`17-30`). `on` styling amber-3/amber-6, 2px border. Status shows `ERROR` on failure or the uppercased state. No config modal. Scenario (`ButtonCard.test.tsx`): clicking an on switch calls `toggle` for the entity.

## Text and separator widgets

### TextCard (grid type `text`, 3×2)

- Renders Markdown via `react-markdown` with Radix components for h1–h3/p/strong/em/ul/ol/li/code/blockquote. Props resolve `config?.X || propX || default`: `content`, `alignment` (left/center/right), `textSize` (small/medium/large → Radix 1/2/3), `textColor` (`default` → undefined, else Radix color).
- Edit mode renders an auto-focused `TextArea`; `handleContentChange` persists live via `dashboardActions.updateGridItem(currentScreenId, itemId, { content })` (`80-91`). `onDelete`/`onConfigure` are accepted but unused. No entity binding → no loading/error states. Config is edited through `CardConfig` as direct item properties.

### Separator (grid type `separator`, 4×1)

- Horizontal: two flex 2px gray lines flanking an optional centered title; Vertical: 2px vertical lines with title in `writing-mode: vertical-rl`. Title color is a Radix union (gray/blue/green/red/orange/purple); resolves `separatorOrientation || orientation`, `separatorTextColor || textColor`. `size` prop is unused. Edit-mode click selects; selected → blue-3 highlight. `onDelete`/`onConfigure` accepted but unused. Config edited via `CardConfig` (or the add dialog) as direct item properties.

## Configuration modal (CardConfig)

`CardConfig.Modal` (`CardConfig.tsx:407-533`) is a 900px two-pane dialog. Left pane: `Content` builds a form from `cardConfigurations[cardType].definition` via `Component`, rendering one control per `ConfigOption` type — boolean (`Switch`), string (`TextField`), textarea (`TextArea`), number (`TextField type=number` reverting empty to default), select (`Select`), icon (`IconSelect`) (`90-229`). Right pane: `Preview` renders the live card inside `ViewModeWrapper` (temporarily forces store mode `view`, restores on unmount) with `pointer-events: none` (`296-405`) — implemented for weather, light, binary_sensor, text, and separator; other types show a "Preview not available" note.

Local config initializes from the item (`text`/`separator` from direct properties, else `item.config`), updates on change, and persists only on "Save Changes" — `text`/`separator` are saved as direct properties, entity cards under `config` (`407-460`).

**Scenarios** (`__tests__/CardConfig.test.tsx`):

- Weather config renders a variant select and opens/selects it (`60-129`).
- Save persists the chosen config (`130-170`); temperature-unit select works (`171-207`).
- Cancel (`248-283`) and the X button (`284-307`) discard/close.
- Two select fields operate independently; keyboard navigation works (`308-395`).

## Entity discovery (EntityBrowser)

`EntityBrowser` (`EntityBrowser.tsx`) is a fullscreen modal with Entities and Cards tabs. `EntitiesBrowserTab` virtualizes the list (`@tanstack/react-virtual`, 64px rows), debounces search 300ms over id/friendly-name/domain, filters `SYSTEM_DOMAINS` (`persistent_notification`, `person`, `sun`, `zone`, `EntitiesBrowserTab.tsx:66`), and pre-excludes domains not in `SUPPORTED_DOMAINS` (`77-92`). `getFriendlyDomain` maps domains to display names (`41-63`). Adding creates one `GridItem` per selected entity, each sized by `getDefaultCardDimensions` and positioned via `findOptimalPositionsForBatch` (`278-337`). `CardsBrowserTab` adds Text and Separator widgets (Separator via a configuration dialog).

**Scenarios** (`__tests__/EntityBrowser.test.tsx`):

- Renders/omits the dialog by `open` (`111-123`); shows both tabs (`124`).
- Groups entities by domain (`131`); filters out system domains (`144`); search filters the list (`150-172`).
- Add selected → grid items created (`173-207`); Cards tab shows widgets (`209`) and can add a text card (`223-250`).
- Loading/empty states (`251-276`); cancel closes (`277`); null `screenId` adds nothing (`295`).

## References

See [index.md — References](./index.md#references) for the full file list and related specs.
