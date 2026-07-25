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

The [sensor option doc](../specs/entity-cards/options/sensor.md) owns the option keys, defaults, the formatting pipeline (precision, scale, unit override), tier layouts, binary-sensor labels and `invert`, the `device_class` active-colour rules, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- Options are stored under `item.config` on the 0014 shared config surface and edited via the config form; graph and trend options are hidden in that form for non-numeric sensors, with numeric-ness derived from the entity (parseable state / `state_class`) and never from config.
- **History aggregation mode is selected by the card, not defaulted**: measurement graphs request `{hours: graphHours, mode: 'sample'}` from `useEntityHistory` ([0015](./0015-history-and-forecast-data.md)), but `total`/`total_increasing` sensors MUST request `mode: 'delta'` — `sample` downsampling destroys intra-bucket counter resets, producing false downward trends. The same delta-mode series backs the reset-aware trend arrow.
- Graph, loading, error, empty, and `unsupported` history results all degrade to the graph-less layout — never an error frame, since history is supplementary to a sensor's value.
- **Labels come from a local `device_class` table** shipped with Liebe rather than HA frontend internals; the universal `name`/`icon` overrides from 0014 still win over it.

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
