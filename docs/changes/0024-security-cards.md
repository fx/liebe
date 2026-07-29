# 0024 — Security Cards (Lock & Alarm)

## Summary

Create the two new security card families specified in [options/security](../specs/entity-cards/options/security.md): a **LockCard** for the `lock` domain (more-info default tap, explicit Lock/Unlock pills, `confirmUnlock: true` by default, `doorEntity` linkage, locked=green / unlocked=red, `locking`/`unlocking` in-progress states, loud `jammed` alert) and an **AlarmCard** for `alarm_control_panel` (arm-mode pills derived from `supported_features`, code-required keypad as dialog or inline per `showKeypad: auto | always | never`, state colors including the amber `pending` pulse and red `triggered` flash with reduced-motion fallback, `flashOnTriggered`). Both register in `domainToCard`, accept the shared `CardProps` contract, render through the common shell on the [0011 tier system](./0011-layout-tiers.md), and adopt the [0014 universal options](./0014-universal-card-options.md).

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/security](../specs/entity-cards/options/security.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

Neither `lock` nor `alarm_control_panel` has a card today — both fall back to the generic `ButtonCard` via the [registry](../specs/entity-cards/index.md#card-dispatch-and-registry), which is exactly wrong for safety-critical domains: the fallback's tap-to-toggle default puts unlock and (nonsensical) alarm toggling one accidental tap away. The security option doc specifies the safe surface — more-info tap defaults, explicit gated buttons, and the inverted color discipline where the _safe_ state is calm-green and the _unsafe_ state is loud-red. This change implements it. Because these cards fire physically consequential services (`lock.unlock`, `alarm_control_panel.alarm_disarm`), every service call MUST be guarded against double-fire: a control disables from **its own dispatch until the expected entity transition or an acknowledgement timeout** (not merely while the promise is in flight — HA acknowledges before slow panels update state), so a double-tap or a laggy panel can never issue the same service twice — but transitional entity states never blanket-disable controls (Disarm MUST stay enabled during `arming`/`pending`; only the lock's `locking`/`unlocking` buttons disable per their state table).

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Both cards MUST gain the full story matrix: every entity state × every tier, explicitly including `jammed` (lock) and `triggered` (alarm), per [storybook — story coverage](../specs/storybook/index.md#story-coverage); every option gets a story demo.
- The confirm flows (`confirmUnlock`, `confirmLock`, `confirmDisarm`, `confirmArm`) MUST be unit-tested: cancel fires no service; confirm fires exactly one; the gate applies to pills, `tapAction: toggle`, and `call-service` targeting `lock.unlock` alike.
- The keypad flow MUST be unit-tested including the code-required arming payloads: `alarm_control_panel.alarm_arm_*` / `alarm_disarm` called with the entered `code`, `code_format` driving digit pad vs. text field, masked input, and rejected-code service errors surfacing through the standard error state.
- Double-fire guards MUST be unit-tested: a second activation between dispatch and the expected entity transition (including after the promise resolves against stale state) calls no service, and Disarm stays enabled during `arming`/`pending`, per the functional requirements.
- **No automatic retries for security commands**: the shared service layer's retry wrapper (`callServiceWithRetry`, which retries failures) MUST NOT be used for `lock.lock`/`lock.unlock`/`lock.open` or `alarm_control_panel.alarm_arm_*`/`alarm_disarm` — a failed or rejected call (e.g. wrong alarm code) MUST surface immediately as the standard error state after exactly one service call. These commands MUST use the non-retrying service path introduced by [0014](./0014-universal-card-options.md), with a unit test proving a rejected code results in exactly one call.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [security option doc](../specs/entity-cards/options/security.md) owns both cards' option keys, defaults, confirmation gates, per-state rendering and button-enablement tables, keypad placement rules, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Registration:** `domainToCard` gains `lock` → `LockCard` and `alarm_control_panel` → `AlarmCard`; both accept `CardProps`, render through the common shell with standard loading/error/unavailable states, and both domains join `SUPPORTED_DOMAINS`.
- **No legacy pinning for either domain** (common convention 7's bugfix exemption): the fallback card's tap dispatches `useServiceCall.toggle` → the nonexistent `lock.toggle` service, so pre-existing lock items have an _erroring_ tap today rather than a working control surface. Pinning `tapAction: 'toggle'` would convert a broken tap into a real unlock path — strictly worse than the safe `more-info` default. The fallback's alarm toggle is equally nonsensical. Both replacements are bugfixes and both cards start on their safe defaults.
- **Detail-dialog controls:** both cards MUST register their primary controls in the detail dialog's domain control slot from [0014](./0014-universal-card-options.md) — the lock's gated Lock/Unlock pills, the alarm's arm-mode pills, Disarm, and keypad flow. `glance`-tier taps resolve to more-info, so a read-only dialog would leave 1×1 security cards inoperable. A glance-tier test MUST prove arming, disarming, locking, and unlocking are all reachable through the dialog.
- **Dispatch and guards:** every service-issuing control uses the non-retrying path from [0014](./0014-universal-card-options.md) and holds its guard from dispatch until the expected state transition or an acknowledgement timeout (SHOULD: 5s), not merely until the promise resolves — HA acknowledges before laggy integrations update state. Confirm and keypad dialogs submit at most once per open. The guard is **per-control and MUST NOT blanket-disable on transitional states**; the option doc's per-state enablement tables govern which control is disabled when. Unit tests MUST cover the laggy-integration case: promise resolved, state unchanged, control still disabled until transition or timeout.
- Codes are sent with the service call and never validated, stored, or written to YAML.

## Design Decisions

- **Confirmation dialogs are shared shell machinery, not per-card code.** The lock's `confirmUnlock`/`confirmLock` and the alarm's `confirmDisarm` use one shell-level confirm gate (Radix `AlertDialog`, entity-named prompt, default focus on Cancel) — the same mechanism the switch card's `confirm` option needs in 0022. Whichever change lands first builds it in the shell; the other consumes it. Coordinate with 0022 so the gate is built once, wraps any action about to fire a service, and is applied at the action-resolution layer — that is what makes it un-bypassable by re-routing (`tapAction: toggle`, `call-service` → `lock.unlock`) rather than a per-button prop.
- **Non-overridable danger states.** `jammed` and `triggered` rendering is enforced after the `color` override and hide options are applied — a physical-security failure must never be configurable into looking calm. This is a deliberate exception to the universal `color`/`hideState` contract and is called out in the spec.
- **Double-fire guard lives in the service-call path, and it is call-specific.** The shared guard disables a control from **its own** dispatch until the expected entity transition or the acknowledgement timeout (per the functional requirement — promise resolution alone is too early, since HA acknowledges before slow locks/alarms update state) and makes confirm/keypad submission idempotent per open — it MUST NOT fold transitional entity states into a global `busy` condition, or Disarm would be disabled during `arming`/`pending`, exactly when it must work (see the functional requirement above). Transitional-state disabling is applied only where a card explicitly specifies it (the lock's `locking`/`unlocking` buttons).
- **The keypad is a dumb code collector.** It honors `code_format`, masks input, and passes the code through to the service call; validation is the panel's job and a rejection surfaces as a standard service error. No code is ever persisted, logged, or exported to YAML.
- **`armModes` derives from capabilities.** The config editor offers only modes present in `supported_features`, and render-time filtering ignores stale stored modes — configuration can never create capability (common convention 3).
- **Deferred per the spec's open questions**: `lock.open` (unlatch), `armed_custom_bypass` in `armModes`, door-sensor auto-discovery, dashboard-level triggered attention, and an inline keypad in the `tall` tier.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [x] **PR 1 — LockCard**: component + registry entry + `SUPPORTED_DOMAINS`; states incl. `jammed`; Lock/Unlock pills with confirm gates (shared shell gate, coordinated with 0022); `doorEntity` fragment; config definition; tier layouts; unit tests + full story matrix
- [x] **PR 2 — AlarmCard**: component + registry entry + `SUPPORTED_DOMAINS`; states incl. `pending` pulse and `triggered` flash with reduced-motion fallback; `armModes` capability-derived pills; keypad (dialog + inline) with code payloads; `confirmDisarm` and `confirmArm` with their action-resolution gate tests (pills and same-entity call-service routes); config definition; tier layouts; unit tests + full story matrix
- [ ] **PR 3 — Spec sync**: update [entity-cards](../specs/entity-cards/index.md) — add both cards to the registry section and requirements as implemented baseline, note the new `SUPPORTED_DOMAINS` entries, and record this change in the spec changelog

## Out of Scope

- The **built-in** `lock.open` (unlatch) control only — a configured `call-service: lock.open` route IS in scope and MUST pass the `confirmUnlock` action-resolution gate with a confirmation test, per the spec; also custom-bypass arm mode, door-sensor auto-discovery, keypad in `tall`, and dashboard-level triggered attention (spec open questions).
- History/forecast data in the detail dialog (0015); other new card families (0023, 0025–0027).
- Any change to the universal option contract or action system itself (0014).
