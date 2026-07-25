# 0018 — Sensor Cards to Spec

## Summary

Bring `SensorCard` and `BinarySensorCard` up to the [sensor & binary sensor option spec](../specs/entity-cards/options/sensor.md): sensor `displayPrecision`, `unitOverride`, `valueScale`, and the history-backed `showGraph`/`graphHours`/`graphMode`/`showTrend` options (sparkline and full-tier graph via the [0015](./0015-history-and-forecast-data.md) `useEntityHistory` hook and the [0010](./0010-design-tokens-and-anatomy.md) `liebe-spark` anatomy); binary sensor `onLabel`/`offLabel`/`invert` plus `device_class`-aware active coloring. Existing `device_class` value formatting and k-scaling are preserved as MUSTs.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/sensor](../specs/entity-cards/options/sensor.md) · **Status:** draft · **Depends on:** 0011, 0014, 0015

## Motivation

Sensors are the most numerous entities on a typical dashboard, and today's cards show a bare formatted value: no history graph, no trend, no way to fix a mis-labeled unit, and binary sensors that shout raw `ON`/`OFF` instead of "Open"/"Closed" — with an active smoke detector tinted the same amber as a lit lamp. The tiers (0011), universal options (0014), and history pipeline (0015) now provide everything the sensor option spec was waiting on; this change spends that groundwork.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The formatting pipeline (`displayPrecision` × `valueScale` × `unitOverride`, including the existing `device_class` matrix and k-scaling) and graph gating (numeric detection, tier gating, `unsupported`/error degradation) MUST have unit tests.
- Every option ships stories per [storybook — story coverage](../specs/storybook/index.md#story-coverage), including graph states: loading, empty history, and `unsupported` (non-numeric sensor), using the 0015 history fixture factories.
- Binary sensor stories MUST cover label defaults per `device_class`, `invert`, and alert-class active coloring.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Sensor options `displayPrecision`, `unitOverride`, `valueScale`, `showGraph`, `graphHours`, `graphMode`, `showTrend` with keys, types, defaults, and semantics exactly per the [sensor option table](../specs/entity-cards/options/sensor.md#sensor-sensor), stored under `item.config` on the 0014 shared config surface and edited via the config form.
- **Existing behavior preserved (MUST):** `displayPrecision: auto` keeps the implemented `device_class` formatting matrix, and `valueScale: auto` keeps power/energy k-scaling (`1250 W` → `1.3 kW`); a fixed precision applies after scaling; `unitOverride` composes with the `k` prefix.
- Graphs render from `useEntityHistory` ([0015](./0015-history-and-forecast-data.md)) with the **aggregation mode selected by the card**: `{hours: graphHours, mode: 'sample'}` for measurement graphs, `{hours: graphHours, mode: 'delta'}` whenever `graphMode: bar` renders a `total`/`total_increasing` sensor — the default `sample` downsampling destroys intra-bucket resets, so counters MUST request `delta` (see 0015's raw-samples-first rule): `liebe-spark` sparkline in `row`/`tall`, full-width graph (`graphMode` line/bar) in `full` with a min/max footer formatted through the same precision/scale/unit pipeline; never in `glance`. Loading, error, empty, and `unsupported` results degrade to the graph-less layout — never an error frame.
- `glance` renders the big-value layout (`liebe-value`, tabular-nums, muted unit) with a trend arrow (↑/↓/→) and delta over `graphHours` when `showTrend` and history is available — computed reset-aware for `total_increasing` state classes (the delta-mode aggregation, never a naive start-to-current difference that shows a false downward arrow across a counter reset) and as a signed delta for `total`.
- Numeric-ness is derived from the entity (parseable state / `state_class`), never from config; graph/trend options are hidden in the config form for non-numeric sensors.
- Binary sensor `onLabel`/`offLabel` default to `device_class` naming ("Open"/"Closed", "Wet"/"Dry", "Detected"/"Clear", …), replacing the uppercased raw state; `invert` swaps the on/off presentation (icon, label, active tint) only — raw state and `more-info` are untouched.
- Binary sensor `color: auto` resolves by `device_class` per the [active color rules](../specs/entity-cards/options/sensor.md#active-color): alert classes (`gas`, `smoke`, `carbon_monoxide`, `problem`, `safety`, `tamper`) use `--liebe-c-alert` when active, `moisture` → `--liebe-c-water`, `light` → `--liebe-c-light`, all others use `--liebe-c-default` per the [design-system color table](../specs/design-system/index.md#domain-color-discipline) (replacing today's amber emphasis, which the contract reserves for lights); an explicit `color` overrides the mapping.
- Both cards stay read-only (`tapAction: default` resolves to `more-info` per 0014; the stored default stays literal `default`); tier layouts per the [spec's tier tables](../specs/entity-cards/options/sensor.md#tier-layouts), omitting (never clipping) content that does not fit.

#### Scenario: Full-tier graph with formatted min/max footer

- **GIVEN** a `power` sensor on a `full`-tier card with defaults, whose 24h history spans `840`–`2310` W
- **WHEN** the card renders with history loaded
- **THEN** a line graph fills the card with the current value displayed big above it, and the footer shows min `840 W` / max `2.3 kW` — formatted through the same `displayPrecision`/`valueScale`/`unitOverride` pipeline as the main value.

#### Scenario: Inverted alert sensor stays calm

- **GIVEN** a `binary_sensor` with `device_class: problem`, `color: auto`, `invert: true`, raw state `on`
- **WHEN** the card renders
- **THEN** it shows the off presentation — `offIcon`, label "OK", inactive muted styling, no alert tint — while `more-info` still reports the raw `on` state.

## Design Decisions

- **One formatting pipeline, ordered** — raw value → `valueScale` → `displayPrecision` → `unitOverride`, used for the main value, trend delta, and min/max footer alike; a single tested function instead of per-surface formatting.
- **Graph availability is data-driven** — the 0015 hook's `unsupported`/error results gate rendering; the card never guesses from config whether history exists, so options can sit in YAML harmlessly on any entity.
- **Labels from a local `device_class` table** — Liebe ships its own on/off label map (resolving the spec's open question for now) rather than reaching into HA frontend internals; the universal `name`/`icon` overrides from 0014 still win.
- **`invert` flips presentation at one point** — a single presented-state derivation feeds icon, label, and tint selection, so inversion can never desynchronize the three.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Sensor card**: formatting pipeline (`displayPrecision`/`valueScale`/`unitOverride`) preserving the existing matrix; `showGraph`/`graphHours`/`graphMode` via `useEntityHistory` + `liebe-spark` across `row`/`tall`/`full` with min/max footer; `glance` big value + `showTrend`; numeric gating; config-form controls; unit tests + stories (incl. loading/empty/unsupported)
- [ ] **PR 2 — Binary sensor card**: `onLabel`/`offLabel` device-class defaults; `invert`; `color: auto` device-class active-tint mapping (alert/water/light/default); `full`-tier "since" line; config-form controls; unit tests + stories
- [ ] **PR 3 — Spec sync**: entity-cards spec sensors section updated to implemented status; sensor option doc's history-dependent caveats resolved; changelog entries

## Out of Scope

- History pipeline changes (0015 owns fetch/cache/downsampling); the sparkline component itself (0010 anatomy); the detail dialog's history graph (0014/0015); binary sensor state-change timeline in `full` (spec open question); honoring HA-configured per-entity display precision (spec open question); other domain cards (0016–0022).
