# Card Options — Scene, Script & Button

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) (universal options are not repeated here). **Status: specified, not yet implemented (new cards).**

This document specifies one **action card family** covering four domains: `scene`, `script`, `button`, and `input_button`. None of these has a dedicated card today — all four currently resolve through the registry fallback and render the generic fallback card, which attempts a meaningless `homeassistant.toggle` on them (see [entity-cards — Button and fallback card](../index.md#button-and-fallback-card), `src/components/ButtonCard.tsx`).

**One family card, not three.** These domains share everything that defines a card: they are fire-and-forget triggers with no continuous state to display, their primary action is a single service call, they are natural 1×1 tiles, and they need identical activation feedback, confirmation, and last-activated presentation. The only divergences are the service name per domain and the script-only running state — a per-domain action map plus one conditional behavior, not three components. A single card registered for all four domains (four registry entries → one component, mirroring how `switch` and the fallback share a component today) keeps the option surface, stories, and tests in one place. Scripts MUST NOT be split out for the running state alone; that state is specified below as a mode of this card.

## Primary action

`tapAction: default` maps per domain:

| Domain         | Default tap                     | Service call                                                    |
| -------------- | ------------------------------- | --------------------------------------------------------------- |
| `scene`        | Activate                        | `scene.turn_on` on the entity                                   |
| `script`       | Run — or **stop** while running | `script.turn_on`; `script.turn_off` while the script is running |
| `button`       | Press                           | `button.press` on the entity                                    |
| `input_button` | Press                           | `input_button.press` on the entity                              |

- The whole tile is the touch target in every tier; the card embeds no discrete controls of its own.
- The primary action's dispatch guard MUST hold from tap until the entity reflects the activation (script state change; scene/button timestamp update) or the acknowledgement timeout elapses — never merely while the promise is in flight (HA acknowledges before the entity updates; these actions are non-idempotent), per the [common dispatch guarantees](./common.md#action-type). The activation-feedback window does not queue extra calls, and the guard and the ~1.5s check are independent.
- The action is inert when the entity is `unavailable`. **`unknown` is not an inert state for `scene`, `button`, and `input_button`**: their state _is_ the last-activation timestamp, so a never-activated entity reports `unknown` (rendered "Never" — see [`showLastActivated`](#showlastactivated)) and MUST stay activatable. Treating it as inert would make a freshly created scene or button permanently unusable, since only an activation can move it out of `unknown`. `script` is different — its state is `on`/`off`, so `unknown` there is genuinely indeterminate and IS inert.
- `toggle` as an explicit action value is meaningless for these domains; when configured, it MUST behave as the domain default action rather than calling `homeassistant.toggle`.

### Activation feedback (required behavior)

Because these entities have no state change to observe on the card, the card itself MUST confirm that the tap did something:

- On tap, the icon inside the icon circle MUST swap to a spinner while the service call is in flight.
- On success, the spinner MUST swap to a success check glyph, hold for ~1.5s, then revert to the configured icon. During the check hold, the icon circle SHOULD use the active tint pattern ([design-system — domain color discipline](../../design-system/#domain-color-discipline)) even though the entity reports no active state.
- On failure, the card MUST show the standard entity-card error state (2px red border, `ERROR` status, error text as the card `title` — [entity-cards baseline](../index.md#common-card-shell-sizing-and-lifecycle-states)); no success check is shown.
- Transitions between icon → spinner → check → icon follow the [design-system motion rules](../../design-system/#motion) (~280ms ease-out). Under `prefers-reduced-motion: reduce`, the spinner animation and swap transitions MUST be disabled — the glyph changes instantly and the success check still appears and holds ~1.5s, because the check is essential feedback, not decoration.
- This behavior is intrinsic, not an option key: there is no way to disable activation feedback, per the convention that options exist for divergence, not correctness ([common — conventions](./common.md#conventions-for-per-card-options)).

### Running state for scripts (required behavior)

While a `script.*` entity is running (state `on`):

- The card MUST show the running state: active tint pattern on the icon circle and a state line reading "Running" in the domain color text step. This supersedes any pending activation-feedback check.
- If the script is stoppable, tap MUST mean **stop** (`script.turn_off`) and the card MUST communicate that: the state line (or, in `glance`, the name line's place) reads "Running · tap to stop", and the icon SHOULD swap to a stop glyph for the duration. Scripts are stoppable via `script.turn_off` in all script modes; if a future mode disallows stopping, the card MUST fall back to an inert tap while running.
- When the script finishes (state returns to `off`), the card MUST revert to its idle presentation within one state update, with the standard ~280ms transition.

## Options

| Key                 | Type    | Default | Behavior                                                                      |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------------- |
| `confirm`           | boolean | `false` | Require a confirmation dialog before the primary action fires                 |
| `showLastActivated` | boolean | `false` | Show relative "last activated" time derived from the entity's state timestamp |

The universal options from the [common contract](./common.md#universal-options) apply unchanged — and for this family, **`icon` and `color` are the primary customization**, not an afterthought. Scenes are personal ("Movie night", "Good morning"); the domain default glyph is generic, so users are expected to set a distinct `icon` per scene card as the normal configuration path, with `color` as a deliberate accent override. The config modal SHOULD surface `icon` prominently for this card family. `color: auto` resolves to `--liebe-c-media` (indigo) for `scene`, which the [design-system table](../../design-system/#domain-color-discipline) assigns to scenes explicitly. `script`, `button`, and `input_button` are not in that table, so they resolve to the documented fallback `--liebe-c-default` (blue) rather than borrowing the scene token — the table's fallback rule is the contract, and a card doc cannot quietly extend another domain's row. Whether the action family should get a token of its own remains an Open Question.

### `confirm`

For destructive or expensive scripts ("Reset all devices", "Water the garden") an accidental tap must not fire. When `confirm: true`:

- Any invocation of the primary action — default tap, the domain action bound to `holdAction` / `doubleTapAction`, or a configured `call-service` action targeting **the same entity's own activation or stop services by any route** (`scene.turn_on`, `script.turn_on`, `script.turn_off` while running, the press services, and the generic `homeassistant.toggle`/`turn_on`/`turn_off` aliases — classification is by effect, per the common dispatch guarantees) — MUST first present a confirmation dialog naming the entity and the action ("Run Reset All Devices?", "Activate Movie Night?", and "Stop …?" when tap means stop on a running script). The gate applies after action resolution so re-routing cannot bypass it (the lock-card pattern); `call-service` actions targeting unrelated services stay ungated.
- Confirming MUST fire exactly one service call, followed by the normal activation feedback; cancelling MUST fire nothing and leave no pending state. Dismissal MUST require an explicit choice, per the [switch card's confirm gate](./switch.md#confirm).
- Non-primary actions (`more-info`, `navigate`, `none`, and `call-service` targeting **unrelated** services) MUST NOT be gated — but a `call-service` targeting the entity's own activation service is the primary action by another route and IS gated, per the rule above.
- Behavioral only — no tier interaction; the dialog is a portal overlay, never in-card content.

### `showLastActivated`

All four domains encode "last activated" as a timestamp: `scene`, `button`, and `input_button` carry it as the entity state itself; `script` carries it as the `last_triggered` attribute. When `true`:

- The card renders a muted secondary line with a relative time ("2 h ago", "just now"), updating at least once per minute while visible, in the `--liebe-muted` color — never the domain color.
- A never-activated entity (state/attribute unset or `unknown`) MUST render "Never" rather than a broken time.
- Tier visibility: renders in `row`, `tall`, and `full`; in `glance` it MUST be omitted — the 1×1 stack has no room for a secondary line (degrade by omission, per [design-system — size-adaptive layouts](../../design-system/#size-adaptive-layouts)). Hidden when `hideState` is set (this line is the card's state line — see tier layouts below).

## Tier layouts

These are stateless trigger tiles: with no state line by default, they are **natural 1×1 cards** and SHOULD declare `defaultDimensions` of 1×1 — the first family to do so. Per the [design-system layout tiers](../../design-system/#size-adaptive-layouts):

| Tier     | Content                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Icon circle over name, centered; no state line (nothing continuous to show); whole tile fires the action. With `hideName`, an icon-only tile — still valid, centered icon |
| `row`    | Icon circle + name in a row; the `showLastActivated` relative time renders as the state line when enabled; whole tile fires the action                                    |
| `tall`   | Icon circle top, name (and `showLastActivated` line) at bottom; whole tile fires the action                                                                               |
| `full`   | `row` arrangement with the extra area as breathing room; the family declares no secondary controls for `full`                                                             |

In every tier, the script running state and the activation-feedback spinner/check replace the icon glyph in place; layout MUST NOT shift when they appear.

### Scenes as header-row chips

Scenes are the canonical content of a header row of quick actions. When a scene (or any card of this family) participates in a chip/header row, it MUST render as the design-system **chip** anatomy (`liebe-chip`, [design-system — card anatomy](../../design-system/#card-anatomy)): a 34px pill (`--liebe-chip-height`, `--liebe-chip-radius`) with icon-dot + label, using the same inactive-neutral tint at rest and the active tint pattern during the activation-feedback check hold. The chip is the whole touch target (≥44px hit area via padding), tap fires the same primary action with the same feedback sequence, and `confirm` applies unchanged. Chips never show the `showLastActivated` line.

## Scenarios

### Scenario: Scene tap shows spinner then check

- **GIVEN** a `scene.movie_night` card with default options
- **WHEN** the user taps the card and `scene.turn_on` succeeds
- **THEN** the icon swaps to a spinner during the call, then to a success check on the active indigo tint for ~1.5s, then reverts to the scene's icon — and no additional call fires from taps during the feedback window.

### Scenario: Running script's tap becomes stop

- **GIVEN** a `script.water_garden` card whose entity state is `on`
- **WHEN** the card renders
- **THEN** it shows the active tint, a stop glyph, and "Running · tap to stop"
- **WHEN** the user taps the card
- **THEN** it calls `script.turn_off` for `script.water_garden`, and on the state returning to `off` the card reverts to idle.

### Scenario: Confirm gates a destructive script

- **GIVEN** a `script.reset_all_devices` card with `confirm: true`
- **WHEN** the user taps and dismisses the dialog with Cancel
- **THEN** no service is called and no feedback plays
- **WHEN** the user taps again and confirms
- **THEN** exactly one `script.turn_on` fires, followed by the normal activation feedback.

### Scenario: Reduced motion keeps the check, drops the animation

- **GIVEN** `prefers-reduced-motion: reduce` and an `input_button.doorbell_test` card
- **WHEN** the user taps and `input_button.press` succeeds
- **THEN** no spinner animates and no transition plays; the success check appears instantly, holds ~1.5s, and the icon reverts instantly.

## Open Questions

- **Domain color for script/button.** Settled for now by the [design-system table](../../design-system/#domain-color-discipline)'s fallback rule: `scene` takes `--liebe-c-media` (indigo), while `script`, `button`, and `input_button` are unlisted and therefore take `--liebe-c-default` (blue) — as the normative option text above states. Open only in the sense that the action family may eventually warrant a token of its own; until that is added to the design-system table, the fallback is the contract.
- **What "success" means for the check.** `scene.turn_on` and `*.press` resolve when Home Assistant accepts the call, not when target devices actually change. The check therefore confirms dispatch, not outcome. Whether the card should attempt anything stronger (it likely cannot, generically) is open.
- **Parallel/queued script runs.** Scripts in `queued`/`parallel` mode expose a `current` run count > 1. Whether the running state should surface the count ("Running ×2") or stay binary is open.
- **Chip-row placement mechanism.** This spec defines the chip presentation; how a card is placed into a header/chip row (a grid-item flag, a dedicated row widget, or tier derivation) belongs to the [grid-layout spec](../../grid-layout/) and is not yet specified there.
- ~~**Registry shape.**~~ Resolved (change 0027): four domain entries → one component; no per-domain registered variants. Previously treated as an implementation choice, provided the option surface stays exactly as specified here.

## References

- Current (fallback) behavior these cards replace: `src/components/ButtonCard.tsx`, [entity-cards — Button and fallback card](../index.md#button-and-fallback-card)
- Registry and dispatch: `src/components/cardRegistry.ts`, [entity-cards](../index.md#card-dispatch-and-registry)
- Shared contract and conventions: [common.md](./common.md)
- Layout tiers, chip anatomy, colors, motion: [design-system](../../design-system/)
