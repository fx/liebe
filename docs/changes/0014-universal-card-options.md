# 0014 — Universal Card Options

## Summary

Implement the [common option contract](../specs/entity-cards/options/common.md) across all existing entity cards: `name`, `icon`, `hideName`, `hideState`, `color`, and the `tapAction`/`holdAction`/`doubleTapAction` action system (default / toggle / more-info / navigate / call-service / none), including the entity detail dialog that `more-info` opens and the config-form controls for editing these options. Per-card domain options build on this in 0016+.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/common](../specs/entity-cards/options/common.md) · **Status:** complete · **Depends on:** 0010 (this change precedes 0011's card layouts — the action system must exist before glance tiers remove embedded controls; tier-composition rules like icon-only glance are stated here but verified by 0011, which lands after)

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

The [common option contract](../specs/entity-cards/options/common.md) owns the universal option keys, defaults, action semantics (gesture timings, `default` resolution, event consumption, edit-mode suppression), the dispatch guarantees, and `color: auto` resolution — this change's acceptance criteria, not restated here. What building them requires of this change:

- The universal options live under `item.config`, edited via a new shared `ConfigDefinition` fragment merged into every entity card's definition, round-tripping through YAML.
- **`ConfigDefinition`/form infrastructure MUST be extended for the option surface's non-scalar types.** The current union (boolean/string/number/select/textarea/icon) cannot represent what the per-card docs require, so this change adds an **action editor** (parameterized `navigate` targets and `call-service` service+data), an **entity picker** (`motionEntity`/`doorEntity`/`batteryEntity`), a **number array** (`brightnessPresets`), and an **ordered multi-select** (`armModes`) — each schema-validated and unit-tested, so later card changes consume controls that exist rather than each inventing one. See PR 4; this change is not complete without them.
- **The non-retrying service path is introduced here** and reused by every later change with non-idempotent commands ([0019](./0019-cover-fan-cards-to-spec.md), [0022](./0022-switch-input-helpers-to-spec.md), [0023](./0023-media-player-card.md), [0024](./0024-security-cards.md), [0025](./0025-vacuum-card.md), [0027](./0027-scene-cards.md)). The shared retry wrapper (`callServiceWithRetry`) MUST NOT be used for action dispatch: a user-configured `call-service` can target `button.press` or `script.turn_on`, where an ambiguous timeout plus retries executes the action twice. Boundary-level tests MUST prove one gesture yields at most one call, including the early-acknowledgement case.
- **The detail dialog and its pluggable domain control slot** — a registry keyed by domain where a card family mounts the same controls its `full` tier uses. This change ships the slot **empty** (read-only dialog: name, state, key attributes, and a history placeholder until [0015](./0015-history-and-forecast-data.md)); later card changes register controls where their specs route `glance` taps to the dialog as the control surface. The dialog carries no card-config link — configuration stays reachable only through the card's edit-mode settings button, and the dialog cannot open in edit mode.
- **Secret redaction ships with the dialog, not with the card change that needs it.** The dialog renders entity state and attributes generically, and an `input_text` helper in `mode: password` holds its secret _in the state_ — so the moment hold-to-more-info exists, every password helper is one gesture from being displayed in clear text, months before [0022](./0022-switch-input-helpers-to-spec.md) touches helpers at all. PR 2 MUST therefore mask or omit password-helper values in the dialog's state display and attribute list, with a regression test, per the [per-value masking guarantee](../specs/entity-cards/options/input-helpers.md). A surface that can expose a secret must land already redacting it.
- `navigate` targets a screen id or slug per the [navigation spec](../specs/navigation/index.md).

## Design Decisions

- **One action controller in the shell** — gesture recognition (tap/hold/double-tap) lives in the card shell, cards declare only their `default` action; per-card changes never touch gesture code.
- **Detail dialog is minimal on purpose** — it exists to make `more-info`/hold meaningful now; history graphs arrive with 0015 and richer domain sections can grow per-card later without contract changes.
- **Action config shape**: string for simple actions, object for parameterized (`navigate`/`call-service`) — mirrors the contract's action type; zod-validated with the rest of the portable config.

## Tasks

- [x] **PR 1 — Action system**: gesture controller in the shell; action resolution + per-card `default` declarations; edit-mode suppression; config schema + validation; the **action editor** form control (parameterized `navigate` targets and `call-service` service+data); unit tests
- [x] **PR 2 — Detail dialog**: entity detail dialog (portalled), `more-info` wiring, hold default across cards; **password-helper redaction in the state display and attribute list, with a regression test** (the dialog must not ship able to reveal a secret the card masks); component tests + story; e2e hold flow
- [x] **PR 3 — Display options**: `name`/`icon`/`hideName`/`hideState`/`color` in shell + shared ConfigDefinition fragment merged into all existing cards' config modals; icon-only glance layout; stories; YAML round-trip test
- [x] **PR 4 — Shared non-scalar form controls**: the remaining `ConfigDefinition` extensions this change's functional requirements mandate — **entity picker** (consumed later by `motionEntity`/`doorEntity`/`batteryEntity` in [0021](./0021-camera-presentation-options.md)/[0024](./0024-security-cards.md)/[0026](./0026-person-card.md)), **number array** (`brightnessPresets`, [0016](./0016-light-card-to-spec.md)), and **ordered multi-select** (`armModes`, [0024](./0024-security-cards.md)) — each schema-validated, unit-tested, and given a story. This change MUST NOT be marked complete without them: the later card changes assume these controls already exist rather than inventing one apiece.

## Out of Scope

- Domain-specific options (0016–0022), new cards (0023–0027), history data in the dialog (0015).
