# 0027 — Scene, Script & Button Cards

## Summary

Implement the [scene/script/button option doc](../specs/entity-cards/options/scene.md): one new **action card family** — a single component registered in `domainToCard` for the four domains `scene`, `script`, `button`, and `input_button` — replacing the generic `ButtonCard` fallback these domains resolve to today. The card fires the correct per-domain primary action (`scene.turn_on`; `script.turn_on`, becoming `script.turn_off` while running; `button.press`; `input_button.press`), confirms every tap with intrinsic spinner→check activation feedback, and adds two options: `confirm` and `showLastActivated`. Universal options from [0014](./0014-universal-card-options.md) apply unchanged, with `icon`/`color` as the family's primary personalization path.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/scene](../specs/entity-cards/options/scene.md) · **Status:** complete · **Depends on:** 0011, 0014

## Motivation

Scenes, scripts, and buttons are the canonical "quick action" tiles of a dashboard, yet none of the four domains has a dedicated card: all fall through the registry to the fallback `ButtonCard` ([entity-cards — Button and fallback card](../specs/entity-cards/index.md#button-and-fallback-card)), which dispatches `<domain>.toggle` — **corrected during implementation**: this document originally said `homeassistant.toggle`, and the difference matters. `scene.toggle`, `button.toggle` and `input_button.toggle` are not registered services, so Home Assistant answers HTTP 400 and the tap fails outright rather than merely doing something meaningless; only `script.toggle` exists, making it three of the four. (The generic `homeassistant.toggle` would not have errored — it returns 200 with a warning and no state change.) These are fire-and-forget triggers with no continuous state, so a tap today gives the user no evidence anything happened — and destructive scripts fire on an accidental touch. One family card fixes the service calls, makes every activation visibly confirmed, and gates dangerous actions, while keeping the option surface, stories, and tests in one place instead of three near-identical components.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The story matrix MUST cover each of the four domains × their states — idle, never-activated (`unknown`, which MUST render "Never" and still activate), in-flight spinner, success check, error, `unavailable`, and the script running/tap-to-stop state — plus both values of `confirm` and `showLastActivated`, per [storybook — story coverage](../specs/storybook/index.md#story-coverage).
- Activation-feedback timing (spinner while in flight, ~1.5s check hold, revert, no queued calls during the window) and the per-domain service payloads (`scene.turn_on`, `script.turn_on`/`script.turn_off`, `button.press`, `input_button.press`) MUST be unit-tested with fake timers.
- The `prefers-reduced-motion` path (no spinner animation, instant glyph swaps, check still holds ~1.5s) MUST be unit-tested.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [scene option doc](../specs/entity-cards/options/scene.md) owns the per-domain action table, the `unknown`-vs-`unavailable` rule, activation feedback, the script running state, the `confirm` gate's resolution-layer scope, `showLastActivated`, tier layouts, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Registration:** one card component registered in `domainToCard` under all four of `scene`, `script`, `button`, and `input_button` (four entries → one component, mirroring how `switch` and the fallback share `ButtonCard` today), implementing the shared `CardProps` contract; the four domains join `SUPPORTED_DOMAINS`.
- **No grid-item migration** (common convention 7's bugfix exemption): the fallback's `<domain>.toggle` on these domains is broken — three of the four answer HTTP 400, which is the very defect this change fixes — so replacing it is a bugfix, not a control-surface replacement requiring pinning. The new config keys are additive, so existing configs keep validating.
- **No automatic retries:** `scene.turn_on`, `script.turn_on`, `button.press`, and `input_button.press` are non-idempotent — a retried press presses twice, a retried queued/parallel script runs again. All four use the non-retrying path from [0014](./0014-universal-card-options.md), with a boundary-level test proving one tap yields exactly one call even when the client observes a transient failure.
- This family is the first to declare a static `defaultDimensions` of 1×1; the glyph swaps (spinner, check, stop) replace the icon in place with no layout shift.

## Design Decisions

- **One family card, not three** — the domains diverge only in service name and the script-only running state: a per-domain action map plus one conditional behavior. Four registry entries pointing at one component keeps options, stories, and tests in a single place ([option doc rationale](../specs/entity-cards/options/scene.md)); the registry-shape open question is resolved as four domain entries → one component, no per-domain registered variants.
- **Activation feedback is intrinsic, not an option** — these entities expose no observable state change, so the feedback is correctness, not decoration; options exist for divergence only ([common — conventions](../specs/entity-cards/options/common.md#conventions-for-per-card-options)). Reduced motion drops the animation but keeps the check, because the check is essential feedback.
- **Replace the fallback via dispatch, not migration** — registering the four domains changes what `getCardForEntity` resolves for already-placed grid items, so existing dashboards upgrade automatically the moment the change lands; additive config keys mean the portable-config contract needs no version bump or migration step.
- **`confirm` wraps action invocation in the shell layer** — the gate sits in front of whichever gesture resolved to the primary action (tap, hold, double-tap), so it composes with the 0014 action controller instead of duplicating gesture logic.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [x] **PR 1 — Action card family**: family card component with per-domain action map, activation feedback (fake-timer tested, reduced-motion path), script running/tap-to-stop state, `confirm` dialog, `showLastActivated`, tier layouts, 1×1 `defaultDimensions`; registry entries for the four domains + `SUPPORTED_DOMAINS`; `ConfigDefinition` with prominent `icon`; unit tests and the full story matrix
- [x] **PR 2 — Spec update**: entity-cards spec gains a Scene/Script/Button section (registry entries, options, activation feedback, running state) with a note on the changed fallback behavior for pre-existing dashboards; option doc status flipped to implemented; changelog entries in the entity-cards spec

## Out of Scope

- Chip/header-row rendering of these cards — the chip anatomy is specified, but the placement mechanism belongs to the grid-layout spec and is not yet defined there ([open question](../specs/entity-cards/options/scene.md#open-questions))
- A distinct domain color token for the action family (scene takes `--liebe-c-media`; script/button/input_button take the `--liebe-c-default` fallback per the design-system table) and surfacing parallel/queued run counts ("Running ×2") — both open questions in the option doc
- Universal option infrastructure (action controller, detail dialog, display options) — landed in [0014](./0014-universal-card-options.md); tier derivation — [0011](./0011-layout-tiers.md)
- Changes to `ButtonCard` itself, which remains the `switch` card and the fallback for still-unmapped domains
