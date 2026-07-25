# Card Options — Sensor & Binary Sensor

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) — universal options (`name`, `icon`, `hideName`, `hideState`, `color`, actions) are not repeated here. **Status: specified, not yet implemented** — except where a behavior is explicitly marked as existing (`device_class` value formatting, auto k-scaling, and the binary sensor's `onIcon`/`offIcon` keys, which ship today; see [card reference — Sensors](../card-reference.md#sensors-and-binary-sensors)).

Both cards are **read-only**: they MUST NOT call services from any built-in interaction, and every option below tunes presentation only (per [common — conventions](./common.md#conventions-for-per-card-options), options never enable something the entity cannot do).

## Primary action

- As read-only cards, both `sensor` and `binary_sensor` resolve `tapAction: default` to `more-info` (the common contract's read-only rule); the stored default remains the literal `default`.
- `holdAction: more-info` and `doubleTapAction: none` keep their universal defaults.
- The entity detail dialog is Liebe's own (per the common action type), and for numeric sensors it SHOULD surface the same history graph the `full` tier renders, so `glance`-sized sensors still reach their history in one tap.

## Options

### Sensor (`sensor.*`)

| Key                | Type                                | Default | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayPrecision` | select: `auto` \| `0` \| `1` \| `2` | `auto`  | Decimal places for numeric values. `auto` MUST apply the existing `device_class` formatting rules (see below). Fixed values force that many decimals. All tiers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `unitOverride`     | string                              | `''`    | When non-empty, replaces the displayed unit label; `''` uses the entity's `unit_of_measurement`. Display-only — no conversion is performed. All tiers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `showGraph`        | boolean                             | `true`  | History graph for numeric sensors: sparkline (`liebe-spark`) in `row`/`tall`, full-width graph in `full`. Never renders in `glance`. MUST be ignored (no graph, option hidden in the config form) for non-numeric sensors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `graphHours`       | number                              | `24`    | History window in hours for the graph, trend delta, and min/max footer. Min `1`, max `168`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `graphMode`        | select: `line` \| `bar`             | `line`  | Graph rendering style. `line` renders the sampled values directly (continuous measurements). `bar` is for `total`/`total_increasing` state-class sensors, whose history is cumulative: bars MUST render per-bucket **differences**, never the raw cumulative samples, computed on raw history before downsampling (see change 0015's delta mode). Reset handling applies **only to `total_increasing`** (a decrease means the counter reset; the delta restarts from the new value, never producing negative bars); `total` MAY legitimately decrease (e.g. net energy), so its bars are **signed** deltas and a drop from 10 to 8 renders −2, not a reset. Applies wherever the graph renders. |
| `showTrend`        | boolean                             | `true`  | `glance` tier only: a trend arrow (↑/↓/→) plus signed delta over `graphHours` next to the big value. Numeric sensors only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `valueScale`       | select: `auto` \| `none`            | `auto`  | `auto` MUST keep the existing k-scaling behavior: `power`/`energy` values ≥1000 divide by 1000 and prefix the unit with `k` (`1250 W` → `1.3 kW`). `none` shows the raw magnitude. All tiers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

- **`displayPrecision: auto` (existing behavior, stays MUST):** `temperature` → one decimal; `humidity`/`battery` → rounded integer; `energy`/`power` → integer (after `valueScale`, scaled values get one decimal); other numerics use magnitude-based defaults; timestamps and non-numeric states pass through. These rules are the implemented formatting matrix in [entity-cards — Sensors](../index.md#sensors-and-binary-sensors) and MUST NOT regress.
- A fixed `displayPrecision` applies after `valueScale`, so a `1250 W` reading with `displayPrecision: 2` renders `1.25 kW`.
- `unitOverride` composes with `valueScale: auto`: the `k` prefix attaches to the overridden unit.
- `showGraph`, `showTrend`, `graphHours`, and `graphMode` all depend on entity history, whose fetch contract is defined by change 0015's `useEntityHistory` hook (see the design-system answered question). Until 0015 lands, these options MAY be defined in config but MUST degrade to no graph/trend rather than an error or an empty frame.
- Whether a sensor is "numeric" MUST be derived from the entity (parseable numeric state / `state_class` present), never from config (feature-gated controls stay automatic).

### Binary sensor (`binary_sensor.*`)

| Key        | Type    | Default | Behavior                                                                                                                                                                                           |
| ---------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onIcon`   | icon    | `''`    | Icon while presented-on. **Existing key, unchanged.** `''` falls back to the `device_class` icon pair, then the generic check/circle pair. All tiers.                                              |
| `offIcon`  | icon    | `''`    | Icon while presented-off. **Existing key, unchanged.** Same fallback chain. All tiers.                                                                                                             |
| `onLabel`  | string  | `''`    | State text while presented-on. `''` uses the Home Assistant `device_class` naming (e.g. `door` → "Open", `moisture` → "Wet", `motion` → "Detected"). All tiers with a visible state line.          |
| `offLabel` | string  | `''`    | State text while presented-off. `''` uses the `device_class` naming ("Closed", "Dry", "Clear", …). Same tiers.                                                                                     |
| `invert`   | boolean | `false` | When `true`, swaps the on/off **presentation** (icon, label, active tint) for sensors wired backwards. Presentation-only: raw state, `more-info`, and any automation-facing surface are untouched. |

- `onIcon`/`offIcon` select against the raw state; `invert` then swaps which presentation renders, so `invert: true` with a raw `on` state renders `offIcon` + `offLabel` + inactive styling. The universal `icon` override, if set, wins over both (a single icon for both states).
- The current implementation renders the raw state uppercased (`ON`/`OFF`); the `device_class`-named default labels above are new target behavior and supersede that.

#### Active color

There is no separate `activeColor` option — the universal [`color`](./common.md#universal-options) option covers it. Reconciliation with the [domain color discipline](../../design-system/#domain-color-discipline):

- Today's implementation hardcodes amber emphasis for `on`. Under the design system, `color: auto` MUST resolve by `device_class`:
  - Alert-class device classes (`gas`, `smoke`, `carbon_monoxide`, `problem`, `safety`, `tamper`) SHOULD use `--liebe-c-alert` when active — an active smoke detector must read as an alarm, not a lit lamp.
  - `moisture` SHOULD use `--liebe-c-water`; `light` SHOULD use `--liebe-c-light`.
  - All other device classes (and none) default to `--liebe-c-default` per the [design-system color table](../../design-system/#domain-color-discipline) — replacing today's amber emphasis, which the contract reserves for lights.
- A non-`auto` `color` value overrides this mapping entirely, and MUST style the active tint pattern (glyph + ~20% tint circle + state text), matching the design system's active-state pattern. `invert: true` moves the active styling to the presented-on state.

## Tier layouts

Tiers per [design-system — size-adaptive layouts](../../design-system/#size-adaptive-layouts). Content that does not fit MUST be omitted, never clipped.

### Sensor

| Tier     | Layout                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Big value (`liebe-value`, tabular-nums) with muted unit, name below; trend arrow + delta beside the value when `showTrend`. The big value replaces the icon circle as the tile's anchor — no icon renders in the default glance. **Fallbacks:** `hideState` (the value **is** the state here) falls back to the standard icon + name tile; `hideState` + `hideName` falls back to the icon-only tile the common contract requires. |
| `row`    | Icon circle + name/state meta on the left, inline sparkline (`liebe-spark`) filling the right when `showGraph`                                                                                                                                                                                                                                                                                                                     |
| `tall`   | Icon on top, big value centered, vertical-space sparkline beneath when `showGraph`, name at bottom                                                                                                                                                                                                                                                                                                                                 |
| `full`   | Large graph (`graphMode`, `graphHours` window) with the current big value overlaid or above, and a footer line showing min/max over the window                                                                                                                                                                                                                                                                                     |

- The `full` footer MUST show the window's minimum and maximum formatted with the same `displayPrecision`/`valueScale`/`unitOverride` pipeline as the main value.
- With `showGraph: false`, `row`/`tall`/`full` fall back to the meta-plus-value arrangement without the graph region; non-numeric sensors always render this fallback.
- `hideState` hides the state/value line per the common contract; in `glance` the big value **is** the state line, so `hideState` there triggers the fallback defined in the tier table (icon + name; icon-only when `hideName` too).

### Binary sensor

| Tier            | Layout                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `glance`        | Icon circle (active tint pattern) + name + state label, stacked                                                         |
| `row`           | Icon + name/state meta in a row                                                                                         |
| `tall` / `full` | Row arrangement, vertically centered; `full` MAY additionally show a "since \<relative time\>" line from `last_changed` |

Binary sensors have no numeric history, so no graph options apply; the extra `full` real estate stays calm rather than inventing content.

## Scenarios

#### Scenario: Power sensor formatting survives with zero config

- **GIVEN** a `power` sensor reading `1250` with unit `W` and no per-card config
- **WHEN** the card renders in any tier
- **THEN** the value displays as `1.3 kW` (`valueScale: auto` k-scaling and `displayPrecision: auto` — the existing, MUST-preserved behavior).

#### Scenario: Glance trend over the graph window

- **GIVEN** a `temperature` sensor at `21.4 °C` on a 1×1 (`glance`) card with defaults, whose history shows `20.6` at the start of the 24h window
- **WHEN** the card renders (history data available)
- **THEN** the big value `21.4 °C` shows with an up arrow and `+0.8` delta; no sparkline renders in `glance`.

#### Scenario: Inverted door sensor wired backwards

- **GIVEN** a `binary_sensor` with `device_class: door` whose hardware reports `on` while the door is physically closed, configured with `invert: true`
- **WHEN** the raw state is `on`
- **THEN** the card renders the off presentation — `offIcon`, label "Closed", inactive muted styling — while `more-info` still shows the raw `on` state.

#### Scenario: Smoke detector goes active in alert color

- **GIVEN** a `binary_sensor` with `device_class: smoke`, `color: auto`, raw state `off`
- **WHEN** the state becomes `on`
- **THEN** the icon circle animates to the alert color's active tint pattern (red glyph on ~20% red tint) — not amber — and the state label renders "Detected" in the alert text step.

## Open Questions

- ~~**History data source.**~~ Answered by change 0015 (pending implementation): `useEntityHistory` with sample/delta modes is the data contract; `showGraph`/`showTrend` ship in change 0018 consuming it, which is when these defaults become visible.
- **Honoring HA-configured precision.** Home Assistant lets users set a per-entity display precision in its own settings (surfaced via `sensor` options / `display_precision`). Whether `displayPrecision: auto` should read that value (when exposed to the panel) before falling back to the `device_class` rules is open.
- **Device-class label source.** The `onLabel`/`offLabel` defaults reference HA's `device_class` naming; whether Liebe ships its own translation table or derives labels from HA frontend data at runtime is an implementation question.
- **Binary sensor `full` tier.** Whether the `full` tier should eventually show a state-change timeline (on/off bands over `graphHours`) once history data exists, or stay static as specified here.

## References

- [Common option contract](./common.md) · [entity-cards — Sensors and binary sensors](../index.md#sensors-and-binary-sensors) · [card reference — formatting matrix & device-class icon table](../card-reference.md#sensors-and-binary-sensors)
- [Design system — card anatomy (`liebe-value`, `liebe-spark`), tiers, domain colors](../../design-system/)
- Implementation baseline: `src/components/SensorCard.tsx` (formatting rules, k-scaling), `src/components/BinarySensorCard.tsx` (`onIcon`/`offIcon`, device-class icon pairs, amber emphasis)
