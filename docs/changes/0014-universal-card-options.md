# 0014 — Universal Card Options

## Summary

Implement the [common option contract](../specs/entity-cards/options/common.md) across all existing entity cards: `name`, `icon`, `hideName`, `hideState`, `color`, and the `tapAction`/`holdAction`/`doubleTapAction` action system (default / toggle / more-info / navigate / call-service / none), including the entity detail dialog that `more-info` opens and the config-form controls for editing these options. Per-card domain options build on this in 0016+.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/common](../specs/entity-cards/options/common.md) · **Status:** draft · **Depends on:** 0010 (this change precedes 0011's card layouts — the action system must exist before glance tiers remove embedded controls; tier-composition rules like icon-only glance are stated here but verified by 0011, which lands after)

## Motivation

Every per-card option doc assumes the universal surface exists; implementing it once in the shared shell/config layer keeps 12 later changes from re-implementing action handling and hide/override logic.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The action system MUST have exhaustive unit tests (each action type; hold-not-firing-tap; controls not triggering card actions; edit-mode suppression).
- Universal options MUST gain stories on at least one representative card (both values of each toggle; the action controls); every option demo per [storybook coverage rules](../specs/storybook/index.md#story-coverage).
- The e2e suite MUST cover one hold→detail-dialog flow in the real panel (touch semantics differ in shadow DOM/HA chrome).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Universal option keys, types, and defaults exactly per the [common contract table](../specs/entity-cards/options/common.md#universal-options), stored under `item.config`, edited via `CardConfig` (new shared `ConfigDefinition` fragment merged into every entity card's definition), round-tripping through YAML.
- **`ConfigDefinition`/form infrastructure MUST be extended for the option surface's non-scalar types** — the current union (boolean/string/number/select/textarea/icon) cannot represent what this contract and the per-card docs require. This change adds: an **action editor** (the parameterized action objects for tap/hold/double-tap, including `navigate` targets and `call-service` service+data), an **entity picker** (used later by `motionEntity`/`doorEntity`/`batteryEntity`), a **number array** (`brightnessPresets`), and an **ordered multi-select** (`armModes`) — each schema-validated and unit-tested, so later card changes consume form controls that exist rather than each inventing one.
- Action semantics per the contract: `default` resolves per card (each card declares its default action); hold ≈500ms and MUST NOT also fire tap; double-tap delays single-tap only when `doubleTapAction ≠ none`; embedded controls consume their events; edit mode suppresses all actions in favor of selection.
- `more-info` opens Liebe's own entity detail dialog: name, state, key attributes, a history placeholder (until [0015](./0015-history-and-forecast-data.md)), and a **pluggable domain control slot** — a registry keyed by domain where a card family can mount its primary controls (the same components its `full` tier uses). This change ships the slot empty (read-only dialog); later card changes register controls where their specs route `glance` taps to the dialog as the control surface (e.g. input helpers in [0022](./0022-switch-input-helpers-to-spec.md)). No card-config link in the dialog: card configuration stays reachable exclusively through the card's edit-mode settings button (the dialog cannot open in edit mode, where actions are suppressed). Portalled per project overlay conventions.
- `navigate` targets a screen id/slug ([navigation spec](../specs/navigation/index.md)); `call-service` takes `service` + optional `data` with the entity as default target.
- **The action system dispatches through a non-retrying service path, introduced by this change.** The shared retry wrapper (`callServiceWithRetry`) MUST NOT be used for action dispatch: a user-configured `call-service` can target non-idempotent services (`button.press`, `script.turn_on`, `media_player.media_next_track`), where an ambiguous timeout plus retries executes the action multiple times. One user gesture MUST yield at most one service call (boundary-level unit test), and the action controller MUST keep each control's guard active from dispatch until the expected entity transition is observed or an acknowledgement timeout elapses — not merely until the promise resolves, per the [common dispatch guarantees](../specs/entity-cards/options/common.md#action-type) (HA acknowledges before laggy lights/fans/switches update state; a promise-scoped guard would dispatch a second command against stale state). Early-acknowledgement boundary test required. Later changes reuse this path for their non-idempotent commands ([0023](./0023-media-player-card.md) transport/volume steps, [0024](./0024-security-cards.md) security commands, [0027](./0027-scene-cards.md) activations).
- `color: auto` uses the card's domain token; named values remap to other domain tokens via the token system (no literal colors in config).
- `hideName`/`hideState` compose with tiers; icon-only glance renders centered (contract MUST).
- Read-only cards (sensor, weather) resolve `tapAction: default` to `more-info` per contract — the stored/schema default stays the literal `default` for every card.

#### Scenario: Hold never toggles

- **GIVEN** a switch card with defaults
- **WHEN** the user presses and holds 600ms then releases
- **THEN** the detail dialog opens and no `switch.toggle` call is made (unit-tested with fake timers; e2e-verified once).

#### Scenario: Navigate action

- **GIVEN** a card with `tapAction: {action: navigate, target: "living-room"}`
- **WHEN** tapped in view mode
- **THEN** the router navigates to that screen per navigation spec URL rules.

## Design Decisions

- **One action controller in the shell** — gesture recognition (tap/hold/double-tap) lives in the card shell, cards declare only their `default` action; per-card changes never touch gesture code.
- **Detail dialog is minimal on purpose** — it exists to make `more-info`/hold meaningful now; history graphs arrive with 0015 and richer domain sections can grow per-card later without contract changes.
- **Action config shape**: string for simple actions, object for parameterized (`navigate`/`call-service`) — mirrors the contract's action type; zod-validated with the rest of the portable config.

## Tasks

- [ ] **PR 1 — Action system**: gesture controller in the shell; action resolution + per-card `default` declarations; edit-mode suppression; config schema + validation; the **action editor** form control (parameterized `navigate` targets and `call-service` service+data); unit tests
- [ ] **PR 2 — Detail dialog**: entity detail dialog (portalled), `more-info` wiring, hold default across cards; component tests + story; e2e hold flow
- [ ] **PR 3 — Display options**: `name`/`icon`/`hideName`/`hideState`/`color` in shell + shared ConfigDefinition fragment merged into all existing cards' config modals; icon-only glance layout; stories; YAML round-trip test
- [ ] **PR 4 — Shared non-scalar form controls**: the remaining `ConfigDefinition` extensions this change's functional requirements mandate — **entity picker** (consumed later by `motionEntity`/`doorEntity`/`batteryEntity` in [0021](./0021-camera-presentation-options.md)/[0024](./0024-security-cards.md)/[0026](./0026-person-card.md)), **number array** (`brightnessPresets`, [0016](./0016-light-card-to-spec.md)), and **ordered multi-select** (`armModes`, [0024](./0024-security-cards.md)) — each schema-validated, unit-tested, and given a story. This change MUST NOT be marked complete without them: the later card changes assume these controls already exist rather than inventing one apiece.

## Out of Scope

- Domain-specific options (0016–0022), new cards (0023–0027), history data in the dialog (0015).
