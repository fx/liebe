# 0037 — Card State, Capability & Primary-Action Correctness

## Summary

Six card-level defects that share one root: a card presents a state, a capability or an affordance that does not match what the entity actually is. Weather cards render an `unknown` entity as `UNAVAILABLE`; the climate card silently drops any HVAC mode outside its hardcoded seven; the fan card dispatches a toggle Home Assistant refuses on a fan that advertises neither `TURN_ON` nor `TURN_OFF`; `useEntity` cannot distinguish "not loaded yet" from "does not exist", so a deleted entity sits behind a loading skeleton forever; a date-only `input_datetime` renders a day early west of UTC; and tapping a non-`glance` number or select tile does nothing at all where the spec says it focuses or opens the control. A seventh item is a spec gap of the same family: the lock section never mentions `code_format` or the `code` service field, so a keypad deadbolt gets commands it will reject with no card-level explanation.

**Spec:** [entity-cards](../specs/entity-cards/index.md), with the loading/not-found half in [entity-state → consumer hooks](../specs/entity-state/index.md#consumer-hooks) · **Status:** draft · **Depends on:** —

Supersedes issues [#193](https://github.com/fx/liebe/issues/193), [#201](https://github.com/fx/liebe/issues/201), [#240](https://github.com/fx/liebe/issues/240), [#248](https://github.com/fx/liebe/issues/248), [#261](https://github.com/fx/liebe/issues/261), [#265](https://github.com/fx/liebe/issues/265).

## Motivation

`REVIEW.md` states the rule these break: _every entity state, including unavailable, unknown, transitional, and rare states, must map to defined, deterministic behavior._ Each defect breaks it the same way — a state or capability the user can actually reach is silently rendered as a different one.

**Weather.** `WeatherCardDefault` and `WeatherCardDetailed` both compute `isUnavailable` as `state === 'unavailable' || state === 'unknown'` and then render a hardcoded `UNAVAILABLE` literal. The two states mean different things — unreachable versus reachable-but-no-data — and the card makes them indistinguishable. The fan card had the identical defect and has since been fixed by rendering `entity.state.toUpperCase()`, with a comment explaining exactly why; the weather cards are the same fix in a different file.

**Climate.** `ClimateModePills` guards each pill with `if (!modeConfig) return null` against a `HVAC_MODES` map hardcoding seven modes. Any other value in the entity's `hvac_modes` — a heat pump reporting a vendor-specific mode, or a mode Home Assistant adds later — vanishes from the pill row: the user cannot select it and has no indication it exists. `HvacModeIcon` already contains a fallback arm rendering the first two characters of the label, clearly written for this case, and the guard above it makes that arm unreachable. It is currently covered by a direct unit test with an explanatory comment, _because the card cannot reach it_ — which is the clearest possible statement that the guard is the defect.

**Fan.** A fan publishing neither `FanEntityFeature.TURN_ON` (32) nor `TURN_OFF` (16) cannot be turned on, off, or toggled: Home Assistant raises `ServiceNotSupported`, and as of 2026.7.2 the compatibility shim that used to soften this is gone — there is no `supported_features_compat` in the fan module any more. This was verified against the running instance rather than inferred: the service is registered with `[TURN_OFF, TURN_ON]`, `helpers/service.py` evaluates `required_features` as _any set fully satisfied_, and a `SET_SPEED`-only entity evaluates `turn_on`, `turn_off` and `toggle` all as not callable. `FanCard.handleToggle` dispatches unconditionally, so every tap on such a fan is a call the backend refuses.

**`useEntity`.** It returns the same thing for an entity that has not arrived and one that does not exist, and cards therefore hold a missing entity behind the loading skeleton indefinitely on a live connection — there is no path by which "Entity Not Found" is ever reported. This surfaced when change [0016](./0016-light-card-to-spec.md) removed three ternaries in the light card that chose between "Disconnected" and "Entity Not Found": each could only ever take one side, because the skeleton above catches the not-loaded case and never falls through. Removing them made the code honest and did not fix the gap. For a user, a card configured against an entity later deleted or renamed in Home Assistant — the ordinary outcome of renaming a device or removing an integration — shows a loading skeleton forever. Indefinite loading reads as "still working on it", which is the least actionable failure a card can present.

**`input_datetime`.** Home Assistant publishes a date-only state as `YYYY-MM-DD`, and `formatDatetimeDisplayValue` passes that string to `new Date(...)`, which per ECMAScript parses a date-only ISO string as **UTC midnight**. Formatting the result in a timezone behind UTC rolls it back a day. `has_time: true` values are unaffected, since HA publishes those with a time component that parses as local.

**Input helper primary actions.** The input-helper option doc specifies what `tapAction: default` does per domain, and two of the five are unimplemented at non-`glance` tiers: `input_number` should focus the value control, `input_select` should open the dropdown or focus the pill group. Both cards' `handleClick` is a no-op at those tiers. This is not an operability regression — the control is right there and directly usable — but a user who taps expecting the specified behaviour gets nothing at all: no focus, no dialog, no feedback.

**Lock codes.** `lock.lock`, `lock.unlock` and `lock.open` all accept an optional `code`, and `LockEntity.state_attributes` publishes `code_format` whenever an integration requires one. The security option doc specifies a keypad for the alarm side only and never mentions either for locks, so the card dispatches without a code and the command fails — with no card-level explanation, because the failure arrives from the integration rather than from anything the card could see in advance. Keypad deadbolts are a common product category.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every state a card can reach MUST have a test, and the tests MUST distinguish the states the defects conflate — `unknown` and `unavailable` as separate cases, not one parametrised case asserting the same output.
- The `input_datetime` fix MUST be tested with an **explicitly non-UTC timezone**, west of UTC. A test that passes in the runner's default timezone proves nothing about the defect.
- The climate mode fallback's existing unit test carries a comment saying the card cannot reach it. When the guard is removed, that test MUST gain a **rendered-card** counterpart and the comment MUST be corrected — leaving it is a false statement about reachability.
- Capability gating MUST be tested against a feature mask that omits the bits, not against a mocked service-call rejection: the point is that the card never dispatches, and a test that asserts on the rejection would pass on a card that still dispatches.
- Stories MUST cover the added states and tiers ([storybook — story coverage](../specs/storybook/index.md#story-coverage)).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

[entity-cards](../specs/entity-cards/index.md) and its option docs own each card's state matrix, option keys and primary actions; [entity-state](../specs/entity-state/index.md) owns the hook contract — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Two of these edit a spec requirement rather than implementing one, and MUST say so in the same commit.** The [fan option doc](../specs/entity-cards/options/fan.md) states that `tapAction: default` MUST toggle with no capability condition attached; gating the toggle changes that requirement. The [security option doc](../specs/entity-cards/options/security.md) has no lock-code contract at all; specifying one adds requirements. Neither may be smuggled into an implementation PR without its doc moving with it.
- **The fan fix gates the toggle, not the tap.** Suppressing the tap would leave the tile inert at `glance`, where the tap is the only affordance — the operability regression the design system forbids. The precedent already exists in this codebase: a card with no usable embedded control falls back to `more-info`, so the tile still opens the detail dialog. Gating the toggle and falling back keeps three things true at once — the card never dispatches a refused call, the tile stays operable at every tier, and the affordance matches the capability instead of advertising one the fan does not have.
- **`useEntity` gains a third state; cards do not each invent one.** The fix belongs in the hook: "the connection is up, the state machine has been received, and this entity is not in it" is distinguishable from "waiting", and every card then gets an accurate not-found treatment from one place. The light card's removed ternaries come back only once the arm is genuinely reachable.
- **The third state and the card treatment are new contracts, and land in their specs in the same PR** — the hook's third state in [entity-state — consumer hooks](../specs/entity-state/index.md#consumer-hooks), the card-visible not-found treatment in [entity-cards — common card shell, sizing, and lifecycle states](../specs/entity-cards/index.md#common-card-shell-sizing-and-lifecycle-states), which already owns the other lifecycle states. Neither exists in a spec today, and a behaviour whose only definition is a change document has no owner once the change is closed. What the treatment has to achieve — telling the user the entity is missing and the card needs reconfiguring, rather than presenting a message that reads as progress — is the requirement those sections gain.
- **`input_select`'s pill presentation resolves at render**, not from stored config (`full` tier, one to five options), so "focus the pill group" MUST consult the resolved presentation rather than the `controlStyle` value.
- **Focus refs thread into shared surfaces.** The number and select primary actions need refs into the anatomy `Slider` and the select trigger. Those are shared parts; the change MUST NOT fork them per card.
- **Lock code handling reuses the alarm keypad's contract.** The alarm half already collects and forwards a code and already specifies the non-obvious rule that `code_arm_required` MUST NOT be read on its own. Whatever the lock section specifies MUST be consistent with it rather than a second mechanism, or state explicitly that locks requiring a code are out of scope and why.
- **Repoint the issue references.** `docs/specs/entity-cards/options/input-helpers.md` cites #240 in three places and `options/security.md` cites #261; both MUST become references to this change or be deleted as resolved, in the PR that resolves them.

## Design Decisions

- **Uppercased raw state is the fallback for an unrecognised state, not a friendly label.** It is what the fan card already does after its fix, it is honest about the fact that the card does not know the state, and inventing prose for a state Home Assistant has not documented would be a guess rendered as fact.
- **Unknown HVAC modes render rather than being dropped.** The alternative — keep the guard and accept that vendor modes are invisible — makes the card quietly less capable than the entity, and the fallback glyph written for exactly this case is already sitting unreachable behind the guard. Letting modes through with a derived label removes the guard's silent `return null` and makes the existing arm reachable, which is a net reduction in code paths.
- **A third hook state, not a per-card timeout.** "Show not-found after N seconds of loading" would be reachable in one card at a time, would fire spuriously on a slow connection, and would make the treatment a timing artefact rather than a fact. The state machine either contains the entity or it does not, and the hook is where that is known.
- **Parse the date-only form explicitly rather than appending a time.** Splitting on `-` and constructing with Y/M/D components states the intent — this is a local calendar date — where `new Date(value + 'T00:00:00')` gets the same answer by relying on a second parsing rule that is no more obvious than the first.
- **Lock codes are specified, not declared out of scope.** Declaring them out of scope is a defensible answer for a card that has no keypad; it is not defensible when the sibling card in the same option doc already has one. Reusing that contract is cheaper than documenting an asymmetry.

## Tasks

Spec restatements update **in the same PR** as each behaviour change they describe (repo consistency rule — the living spec must never lag a merged PR).

- [ ] **PR 1 — Weather and climate state honesty**: weather cards render the raw state for `unknown` instead of the `UNAVAILABLE` literal; the climate pill row lets unrecognised `hvac_modes` through with a derived label and the existing fallback glyph, removing the `return null` guard; rendered-card test for the fallback arm and correction of the comment claiming it is unreachable; per-state stories; entity-cards weather and climate sections updated
- [ ] **PR 2 — Fan toggle capability gate**: `tapAction: default` resolves to `more-info` on a fan advertising neither `TURN_ON` nor `TURN_OFF`, and the toggle is never dispatched; feature-mask tests covering gated and ungated fans at every tier; the fan option doc's primary-action row amended in the same commit
- [ ] **PR 3 — `useEntity` not-found state**: third state distinguishing missing from pending; entity-state spec's consumer-hooks section updated; the shared not-found card treatment; the light card's removed "Entity Not Found" arm restored now that it is reachable; tests covering pending → present, pending → missing, and connection-down
- [ ] **PR 4 — Date-only `input_datetime`**: parse the date-only form as a local calendar date; tests pinned to an explicit timezone west of UTC; the story docstring that documents the defect inline updated to describe the fix
- [ ] **PR 5 — Number and select primary actions**: `tapAction: default` focuses the value control on `input_number` and opens the control on `input_select` at non-`glance` tiers, consulting the resolved pill presentation rather than stored `controlStyle`; focus refs threaded into the shared slider and select trigger; per-tier interaction tests
- [ ] **PR 6 — Lock code support**: specify `code_format` and the `code` service field for locks in the security option doc, consistent with the alarm keypad's contract; implement code collection and forwarding on `lock.lock` / `lock.unlock` / `lock.open`; tests covering a lock publishing a `code_format` and one publishing none

## Out of Scope

- **The `glance`-tier halves of the input-helper primary actions** — already implemented; both fall back to `more-info`, and change [0022](./0022-switch-input-helpers-to-spec.md)'s final PR made that path load-bearing by removing the embedded controls there.
- **The fan card's 50% start on tap-on.** Whether tap-on should send a bare `fan.turn_on` and let the device restore its own last speed is an open question in the fan option doc and is not this change's to settle.
- **A general audit of every card's state matrix.** These six are the known instances with evidence; a speculative sweep would produce a diff nobody can review against a defect nobody has seen.
- **The missing `input_datetime.set_datetime` service mapping** — a different `input_datetime` defect, already covered by [0022](./0022-switch-input-helpers-to-spec.md).
