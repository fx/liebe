# 0027 — Scene, Script & Button Cards

## Summary

Implement the [scene/script/button option doc](../specs/entity-cards/options/scene.md): one new **action card family** — a single component registered in `domainToCard` for the four domains `scene`, `script`, `button`, and `input_button` — replacing the generic `ButtonCard` fallback these domains resolve to today. The card fires the correct per-domain primary action (`scene.turn_on`; `script.turn_on`, becoming `script.turn_off` while running; `button.press`; `input_button.press`), confirms every tap with intrinsic spinner→check activation feedback, and adds two options: `confirm` and `showLastActivated`. Universal options from [0014](./0014-universal-card-options.md) apply unchanged, with `icon`/`color` as the family's primary personalization path.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/scene](../specs/entity-cards/options/scene.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

Scenes, scripts, and buttons are the canonical "quick action" tiles of a dashboard, yet none of the four domains has a dedicated card: all fall through the registry to the fallback `ButtonCard`, which attempts a meaningless `homeassistant.toggle` on them ([entity-cards — Button and fallback card](../specs/entity-cards/index.md#button-and-fallback-card)). These are fire-and-forget triggers with no continuous state, so a tap today gives the user no evidence anything happened — and destructive scripts fire on an accidental touch. One family card fixes the service calls, makes every activation visibly confirmed, and gates dangerous actions, while keeping the option surface, stories, and tests in one place instead of three near-identical components.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The story matrix MUST cover each of the four domains × their states — idle, never-activated (`unknown`, which MUST render "Never" and still activate), in-flight spinner, success check, error, `unavailable`, and the script running/tap-to-stop state — plus both values of `confirm` and `showLastActivated`, per [storybook — story coverage](../specs/storybook/index.md#story-coverage).
- Activation-feedback timing (spinner while in flight, ~1.5s check hold, revert, no queued calls during the window) and the per-domain service payloads (`scene.turn_on`, `script.turn_on`/`script.turn_off`, `button.press`, `input_button.press`) MUST be unit-tested with fake timers.
- The `prefers-reduced-motion` path (no spinner animation, instant glyph swaps, check still holds ~1.5s) MUST be unit-tested.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- One card component registered in `domainToCard` for `scene`, `script`, `button`, and `input_button` (four entries → one component, mirroring how `switch` and the fallback share `ButtonCard` today), implementing the shared `CardProps` contract; the four domains added to `SUPPORTED_DOMAINS` so the EntityBrowser offers them. Existing dashboards that already placed these entities get the new card automatically on dispatch — no grid-item migration, per common convention 7's **bugfix exemption**: the fallback's `homeassistant.toggle` on these domains is meaningless-to-broken (the very defect this change fixes), so replacing it is a bugfix, not a control-surface replacement requiring pinning; the new config keys are additive, so existing configs keep validating.
- Per-domain primary action exactly per the [option doc's action table](../specs/entity-cards/options/scene.md#primary-action): whole tile is the touch target; the dispatch guard holds from tap until the entity reflects the activation (script state change, scene/button timestamp update) or the acknowledgement timeout elapses — never merely while the promise is in flight, since HA acknowledges before the entity updates and these actions are non-idempotent (per the [common dispatch guarantees](../specs/entity-cards/options/common.md#action-type), with the early-acknowledgement boundary test); the ~1.5s feedback window and the guard are independent — a tap after the check but inside the guard window fires nothing; action inert when `unavailable`, but **`unknown` stays activatable for `scene`/`button`/`input_button`** (their state is the last-activation timestamp, so a never-activated entity reports `unknown` and only an activation can move it out — an inert-on-`unknown` card would be permanently unusable), while `script` (`on`/`off` state) treats `unknown` as inert; explicit `tapAction: toggle` behaves as the domain default, never `homeassistant.toggle`.
- **No automatic retries**: activation services (`scene.turn_on`, `script.turn_on`, `button.press`, `input_button.press`) are non-idempotent — a retried `button.press` presses twice, a retried queued/parallel `script.turn_on` runs the script again. These calls MUST use the non-retrying service path introduced by [0014](./0014-universal-card-options.md) (also used by 0023/0024), with a boundary-level unit test proving one tap yields exactly one service call even when the client observes a transient failure.
- Intrinsic [activation feedback](../specs/entity-cards/options/scene.md#activation-feedback-required-behavior): icon → spinner in flight → success check on the active tint held ~1.5s → revert; failure shows the standard entity-card error state instead; transitions ~280ms per design-system motion rules; under `prefers-reduced-motion: reduce` glyphs swap instantly but the check still appears and holds. Not configurable.
- [Script running state](../specs/entity-cards/options/scene.md#running-state-for-scripts-required-behavior): while state is `on`, active tint + "Running · tap to stop" with a stop glyph, tap calls `script.turn_off`; reverts to idle within one state update when the script finishes.
- Options `confirm` (Radix `AlertDialog` gating every invocation of the primary action **classified after full action resolution** — gesture-resolved defaults, `toggle`, and configured `call-service`/generic-alias routes targeting the same entity's activation or stop services all pass one gate, per the option contract, with a rerouted-service confirmation test; exactly one call of the configured service on confirm, nothing on cancel; unrelated-service actions ungated) and `showLastActivated` (muted relative time from state/`last_triggered`, "Never" when unset, minute-fresh, omitted in `glance`, hidden by `hideState`) — keys, types, defaults per the [options table](../specs/entity-cards/options/scene.md#options), exposed in the card's `ConfigDefinition` with `icon` surfaced prominently.
- [Tier layouts](../specs/entity-cards/options/scene.md#tier-layouts) for `glance`/`row`/`tall`/`full` per the option doc; static `defaultDimensions` of 1×1 (the first family to declare it); spinner/check/stop glyphs replace the icon in place with no layout shift.
- `color: auto` resolves to `--liebe-c-media` (indigo) for all four domains.

#### Scenario: Scene tap shows spinner then check

- **GIVEN** a `scene.movie_night` card with default options
- **WHEN** the user taps the card and `scene.turn_on` succeeds
- **THEN** the icon swaps to a spinner during the call, then to a success check on the active indigo tint for ~1.5s, then reverts — and taps during the feedback window fire no additional call.

#### Scenario: Running script's tap becomes stop

- **GIVEN** a `script.water_garden` card whose entity state is `on`
- **WHEN** the card renders and the user taps it
- **THEN** the card shows the active tint, a stop glyph, and "Running · tap to stop", the tap calls `script.turn_off`, and the card reverts to idle when the state returns to `off`.

#### Scenario: Confirm gates a destructive script

- **GIVEN** a `script.reset_all_devices` card with `confirm: true`
- **WHEN** the user taps and cancels the dialog, then taps again and confirms
- **THEN** the cancel fires nothing and leaves no pending state, and the confirm fires exactly one `script.turn_on` followed by the normal activation feedback.

## Design Decisions

- **One family card, not three** — the domains diverge only in service name and the script-only running state: a per-domain action map plus one conditional behavior. Four registry entries pointing at one component keeps options, stories, and tests in a single place ([option doc rationale](../specs/entity-cards/options/scene.md)); the registry-shape open question is resolved as four domain entries → one component, no per-domain registered variants.
- **Activation feedback is intrinsic, not an option** — these entities expose no observable state change, so the feedback is correctness, not decoration; options exist for divergence only ([common — conventions](../specs/entity-cards/options/common.md#conventions-for-per-card-options)). Reduced motion drops the animation but keeps the check, because the check is essential feedback.
- **Replace the fallback via dispatch, not migration** — registering the four domains changes what `getCardForEntity` resolves for already-placed grid items, so existing dashboards upgrade automatically the moment the change lands; additive config keys mean the portable-config contract needs no version bump or migration step.
- **`confirm` wraps action invocation in the shell layer** — the gate sits in front of whichever gesture resolved to the primary action (tap, hold, double-tap), so it composes with the 0014 action controller instead of duplicating gesture logic.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Action card family**: family card component with per-domain action map, activation feedback (fake-timer tested, reduced-motion path), script running/tap-to-stop state, `confirm` dialog, `showLastActivated`, tier layouts, 1×1 `defaultDimensions`; registry entries for the four domains + `SUPPORTED_DOMAINS`; `ConfigDefinition` with prominent `icon`; unit tests and the full story matrix
- [ ] **PR 2 — Spec update**: entity-cards spec gains a Scene/Script/Button section (registry entries, options, activation feedback, running state) with a note on the changed fallback behavior for pre-existing dashboards; option doc status flipped to implemented; changelog entries in the entity-cards spec

## Out of Scope

- Chip/header-row rendering of these cards — the chip anatomy is specified, but the placement mechanism belongs to the grid-layout spec and is not yet defined there ([open question](../specs/entity-cards/options/scene.md#open-questions))
- A distinct domain color token for script/button (they share `--liebe-c-media` for now) and surfacing parallel/queued run counts ("Running ×2") — both open questions in the option doc
- Universal option infrastructure (action controller, detail dialog, display options) — landed in [0014](./0014-universal-card-options.md); tier derivation — [0011](./0011-layout-tiers.md)
- Changes to `ButtonCard` itself, which remains the `switch` card and the fallback for still-unmapped domains
