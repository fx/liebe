# Card Options — Common Contract

Part of the [entity-cards spec](../index.md). **Status: specified, not yet implemented** — this defines the target per-card option surface; current per-card config is sparse (see [card-reference](../card-reference.md)).

Options are stored under `item.config`, are editable from the card's own configuration UI in edit mode, and MUST round-trip through YAML export/import ([dashboard-config](../../dashboard-config/)). Per-card docs in this folder specify domain-specific options; this file specifies what **every** entity card MUST support.

## Universal options

Every entity card MUST expose these options with these exact keys and defaults:

| Key               | Type    | Default     | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | string  | `''`        | Overrides the entity's friendly name when non-empty                                                                                                                                                                                                                                                                                                                                                                                                    |
| `icon`            | icon    | `''`        | Overrides the default/domain icon                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `hideName`        | boolean | `false`     | Hides the name line (icon/state remain)                                                                                                                                                                                                                                                                                                                                                                                                                |
| `hideState`       | boolean | `false`     | Hides the state line                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `color`           | select  | `auto`      | Canonical enum, persisted verbatim: `auto \| light \| heat \| cool \| ok \| alert \| media \| vacuum \| water \| default` — each non-`auto` value maps to the token `--liebe-c-<value>` ([design-system color table](../../design-system/index.md#domain-color-discipline)). `auto` uses the card's state-aware domain resolution; a named value pins that single token for the card's active treatment. No other values are valid (schema-validated). |
| `tapAction`       | action  | `default`   | Action on tap/click of the card body                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `holdAction`      | action  | `more-info` | Action on press-and-hold (≈500ms)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `doubleTapAction` | action  | `none`      | Action on double tap                                                                                                                                                                                                                                                                                                                                                                                                                                   |

- The **stored** `tapAction` default is always the literal `default` — for every card, including read-only ones; schema defaults, config controls, and YAML persistence use that literal. What varies per card is what `default` **resolves to**: read-only cards (sensor, weather, person) resolve it to `more-info` instead of a control action; per-card docs state each card's resolution.
- `hideName` and `hideState` MUST compose with the layout tiers ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)): hiding both in `glance` tier leaves an icon-only tile, which MUST remain a valid layout with a centered icon.

### Action type

An action value is one of:

- `default` — the card's domain-defined primary action (per-card docs define it)
- `toggle` — the card family's domain toggle semantics: the same operation the card defines for toggling its entity, including any confirmation gate the card's options impose (a light toggles, a lock locks/unlocks through its `confirm*` gate, an action card activates). Card families without defined toggle semantics fall back to `homeassistant.toggle`. `toggle` MUST NOT bypass a card's confirmation or safety gating.
- `more-info` — open the entity detail dialog (Liebe's own, not HA's)
- `navigate` — go to a dashboard screen (`target`: screen id/slug)
- `call-service` — arbitrary service (`service`, optional `data`, target defaults to the entity)
- `none` — inert

**Serialized form (normative — this is a portable-config contract).** Because these values round-trip through shared YAML, the persisted shape MUST be exactly the discriminated union below; a config written by one version MUST load in another, so no alternative spelling is permitted.

- The four parameterless actions persist as **bare strings**: `tapAction: default`, `toggle`, `more-info`, `none`.
- The two parameterized actions persist as **objects discriminated by an `action` key** whose value is the same identifier:
  - `{ action: 'navigate', target: '<screen id or slug>' }` — `target` is REQUIRED.
  - `{ action: 'call-service', service: '<domain.service>', data?: { … } }` — `service` is REQUIRED and MUST be `domain.service`; `data` is OPTIONAL and, when omitted, the entity is the target.
- The discriminator key is `action`, not `type`; parameterless actions MUST NOT be written in object form (`{ action: 'toggle' }` is invalid), so each action has exactly one representation.
- Schema validation MUST reject unknown action identifiers, unknown keys within an action object, and a parameterized action missing its required key — rather than silently falling back to `default`, which would turn a typo into a working-looking card that does the wrong thing.

Actions MUST NOT fire from taps on embedded controls (sliders, pills, buttons) — controls consume their own events. Hold MUST NOT also fire tap. In edit mode all actions are suppressed (selection semantics apply, per [entity-cards](../index.md)).

**Dispatch guarantees (normative for every action and every embedded control, on every card):** service dispatch is **non-retrying and at-most-once per gesture** — never routed through a retrying wrapper, since retried commands press buttons twice, skip tracks, re-run scripts, and repeat physical movement. Controls issuing consequential (state-changing) commands stay disabled from dispatch until the expected entity transition is observed or an acknowledgement timeout elapses — promise resolution alone is too early, because Home Assistant acknowledges before slow integrations update state. Every card change implementing dispatch MUST carry a boundary-level single-call test including the early-acknowledgement case. Per-card docs restate specifics only where a domain adds rules (inverse actions staying enabled, confirmation gates); the invariant itself lives here. **Confirmation gates classify routes by effect on the same entity, not by service name**: the generic `homeassistant.toggle`/`turn_on`/`turn_off` aliases are equivalent to the domain services they invoke and MUST pass the same gates — an enumeration that lists only `domain.*` services is a bypass, and gate tests MUST include the generic aliases.

#### Scenario: Hold opens details while tap toggles

- **GIVEN** a light card with defaults (`tapAction: default`, `holdAction: more-info`)
- **WHEN** the user press-holds the card for 600ms and releases
- **THEN** the entity detail dialog opens and the light does NOT toggle.

#### Scenario: Options survive export

- **GIVEN** a card configured with `name: "Reading lamp"`, `hideState: true`
- **WHEN** the dashboard YAML is exported and re-imported
- **THEN** the card renders "Reading lamp" with no state line.

## Conventions for per-card options

Per-card docs MUST follow these rules so the option surface stays coherent:

1. **Keys are camelCase**, stable once shipped; renames require a config migration in the loader (like the weather `preset`→`variant` migration).
2. **Defaults are the researched common case** — the card must look right with zero configuration; options exist for divergence, not setup.
3. **Feature-gated controls stay automatic.** Whether a control _can_ appear is derived from the entity (`supported_features`, attributes); options only let users _hide_ capabilities (`show*: false`) or tune presentation — never enable something the entity cannot do.
4. **Tier interaction is explicit.** Every option that adds visible content states which tiers render it (e.g. a forecast option renders only in `full`).
5. **Selects over booleans** when a third value is plausible later.
6. **Every option ships with a story** demonstrating both/all values ([storybook](../../storybook/)).
7. **New defaults never change how an existing card is operated.** The pinning boundary is the **removal or replacement of a control surface**, not appearance: when a new option's default would remove an existing control or replace the way an existing interaction operates on an already-placed card (climate's always-dial becoming `variant: compact`; input_boolean's discrete switch becoming `controlStyle: tile`; input_number's stepper becoming a slider; the fan's step buttons becoming `speedControl: slider`), the introducing change MUST ship a loader migration pinning the legacy value onto existing items — only newly created cards receive the new default. Pinning migrations MUST discriminate by a **configuration version cutoff or migration marker**, never by key absence: a newly created card legitimately leaves the key absent (to follow an entity-derived default), so an absence-triggered rewrite would wrongly pin new cards on their first reload. Each migration ships a save/reload test proving new cards stay unpinned. Everything that is **visual presentation within the same control surface** — icon choice (`deviceClassIcon`), state label text, active tint source (`useLightColor`), overlay placement, badges — and everything **additive** — new controls appearing alongside unchanged existing operation (a color-temperature picker, an oscillate toggle), sparklines, forecasts — deliberately follows the new defaults with **no** pinning: restyling existing dashboards is the design-system upgrade's explicit purpose, and freezing every card on its legacy look would defeat it. The pinned set is exactly the keys named here plus any a per-card change document adds under this rule; per-card docs MUST NOT extend pinning to presentation-only defaults. **Bugfix exemption:** replacing fallback behavior that is demonstrably broken or meaningless for the domain — a tap whose `homeassistant.toggle` errors (person) or performs a nonsensical operation the card exists to correct (scene/script/button activation) — is a bugfix, not a control-surface replacement, and needs no pinning; pinning applies only where the legacy operation genuinely worked (media/vacuum power toggle).

## Per-card documents

Domain docs in this folder (one per card family): [light](./light.md) · [switch](./switch.md) · [climate](./climate.md) · [sensor](./sensor.md) · [media-player](./media-player.md) · [camera](./camera.md) · [cover](./cover.md) · [fan](./fan.md) · [weather](./weather.md) · [security](./security.md) · [vacuum](./vacuum.md) · [person](./person.md) · [scene](./scene.md) · [input-helpers](./input-helpers.md)
