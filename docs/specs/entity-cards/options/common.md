# Card Options — Common Contract

Part of the [entity-cards spec](../index.md). **Status: implemented** by change [0014](../../../changes/0014-universal-card-options.md) — the universal option keys, the action system, the entity detail dialog `more-info` opens, and the shared configuration controls the per-card docs build on (action editor, entity picker, number array, ordered multi-select). The per-card documents in this folder remain **specified, not yet implemented**: each domain's own options land with its own change (0016–0027), so current per-card config is still sparse (see [card-reference](../card-reference.md)). The tier-composition rule below is stated here and verified by [0011](../../../changes/0011-layout-tiers.md). The alignment pair (`alignHorizontal`/`alignVertical`) is **implemented** by change [0032](../../../changes/0032-card-content-alignment.md). `iconOnly` is **implemented** by change [0033](../../../changes/0033-icon-only-cards.md). The shared `sliderPlacement` contract for slider-bearing cards is **implemented for its inline placements** by change [0034](../../../changes/0034-slider-placement.md) PR 1 — `auto`, `horizontal` and `vertical` are live on the light, cover and fan cards, with one resolver behind all three — while its `background` placement remains specified and not yet implemented.

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
| `iconOnly`        | boolean | `false`     | Reduces the card to its icon and its tile: every other content — name, state, controls, graphs, forecasts, artwork chrome — is suppressed, the icon centres in the tile, and the tile itself carries the active/inactive state tint ([design-system — card anatomy](../../design-system/index.md#card-anatomy)). All tiers. _**Implemented** by change [0033](../../../changes/0033-icon-only-cards.md)._                                              |
| `alignHorizontal` | select  | `auto`      | `auto \| start \| center \| end` — where the card's content block sits on the tile's horizontal axis. `auto` keeps each tier's own arrangement; a named value overrides it. All tiers. _Implemented by change [0032](../../../changes/0032-card-content-alignment.md)._                                                                                                                                                                                |
| `alignVertical`   | select  | `auto`      | `auto \| start \| center \| end` — where the card's content block sits on the tile's vertical axis. Same value rules as `alignHorizontal`. All tiers. _Implemented by change [0032](../../../changes/0032-card-content-alignment.md)._                                                                                                                                                                                                                 |
| `tapAction`       | action  | `default`   | Action on tap/click of the card body                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `holdAction`      | action  | `more-info` | Action on press-and-hold (≈500ms)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `doubleTapAction` | action  | `none`      | Action on double tap                                                                                                                                                                                                                                                                                                                                                                                                                                   |

- The **stored** `tapAction` default is always the literal `default` — for every card, including read-only ones; schema defaults, config controls, and YAML persistence use that literal. What varies per card is what `default` **resolves to**: read-only cards (sensor, weather, person) resolve it to `more-info` instead of a control action; per-card docs state each card's resolution.
- `hideName` and `hideState` MUST compose with the layout tiers ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)): hiding both in `glance` tier leaves an icon-only tile, which MUST remain a valid layout with a centered icon.

### Content alignment (`alignHorizontal` / `alignVertical`)

_Implemented by change [0032](../../../changes/0032-card-content-alignment.md)._

- The pair positions the card's **content block as a whole** within the tile; it MUST NOT change what a tier renders, reorder content, or resize anything. It is the tier's arrangement, slid along one or both axes.
- `auto` (the default for both) preserves each tier's own arrangement exactly as it renders today — the pair being absent from a config MUST be indistinguishable from both being `auto`, so no existing dashboard shifts.
- A named value overrides only its own axis; the other axis keeps its `auto` behavior.
- Alignment is universal by construction: every entity card MUST honour it, on every tier and variant, without per-card opt-in — a card on which a non-`auto` value is visibly inert (where free space exists on that axis) is a defect. Content that **fills** its axis (a `fill`-sized control, a full-width graph, an edge-to-edge background) has no free space on that axis and visibly ignores the override there; that is correct behavior, not an error. How universality is delivered is the implementing change's design decision ([0032](../../../changes/0032-card-content-alignment.md)).
- Alignment MUST compose with `hideName`/`hideState`/`iconOnly`: what survives those options is what gets aligned (an icon-only tile with `alignVertical: start` shows its icon at the top of the tile).
- What is aligned is the tile's content **block**, not a card's interior. The pair moves the boxes the card shell itself owns — the tile's content, the shared body and its line, the control slot — and MUST NOT re-distribute what a card arranges inside its own rows: a `full`-tier card's secondary content that spans the tile has no free space on that axis, and the buttons centred within it are the tier's arrangement, which the first rule above already forbids changing. Content the card positions absolutely (a status pill, a badge, an overlay) is anchored to the tile rather than laid out in it, and stays where it is anchored.
- Alignment positions the card's own content, so a **replacement state surface** — the loading skeleton, and the unavailable or error tile a card renders in place of itself — keeps its own presentation and need not follow the pair. Those surfaces report a state rather than show the entity, which is the same precedence the danger floor and `iconOnly` set. Where a card reports its state **inline on its normal layout**, that layout is the content block and is aligned like any other.
- Values outside the closed set MUST fall back to `auto` at render time without rewriting the stored document (untrusted-config rule, matching the text widget's alignment handling).
- Alignment is layout, not signalling: the danger floor ([0014](../../../changes/0014-universal-card-options.md)) leaves it in effect — a hazard tile may be top-aligned, it just cannot hide what it says.

#### Scenario: Vertical alignment moves the glance stack

- **GIVEN** a 1×1 (`glance`) light card with `alignVertical: start` and defaults otherwise
- **WHEN** the card renders
- **THEN** the icon/name/state stack sits at the top of the tile instead of centred, horizontally unchanged; and **WHEN** `alignVertical` is removed, **THEN** the stack returns to the tier's centred default.

### Icon-only presentation (`iconOnly`)

_**Implemented** by change [0033](../../../changes/0033-icon-only-cards.md)._

`hideName` + `hideState` already leave simple cards icon-only, but any card with an interior beyond the meta lines — forecasts, graphs, transport controls, a thermostat dial — still renders that interior. `iconOnly` is the total version, for every card:

- When `true`, in the card's **ordinary states**, the card MUST render exactly two things: its tile and its icon, centred (subject to the alignment pair). Every other ordinary content is suppressed — meta lines, embedded controls, secondary content, badges and overlays — regardless of tier, variant, or other options. The tier still governs the tile's floor sizing; it no longer governs content. This default is refined by the rules below: identity anchors substitute for the icon where a card's anchor is not a glyph, and danger and card states outrank suppression entirely.
- The icon is the card's resolved icon (universal `icon` override, else the domain/state icon the card would show anyway). Cards whose identity anchor is not a glyph keep their anchor instead of inventing one: the camera's icon-only tile is its image-only thumbnail (its existing `hideName` form), the person card's is its avatar.
- **Every card and every registered variant MUST resolve an icon-only form** — the option is universal, so "this presentation has no icon to fall back on" is not an available answer. A variant that renders its own layout instead of the shared card body, or that shows no icon at all today, MUST still resolve one from its domain and state (the climate `dial` variant renders neither the shared body nor an icon circle; the weather `minimal` variant renders no icon). A blank icon-only tile, or one that keeps rendering the interior the option suppresses, is a defect of that card rather than an exemption from this rule.
- The tile MUST carry the active/inactive state tint per [design-system — card anatomy](../../design-system/index.md#card-anatomy) (icon-only tile exception), which owns the whole visual treatment — colour resolution (including the light card's bulb colour under `useLightColor`) and level modulation alike; none of it is respecified here.
- The whole tile remains the tap target and all three universal actions keep working; with no embedded controls rendered, tap/hold/double-tap are the card's entire interaction surface. Read-only cards keep resolving `default` to `more-info`.
- **Visual suppression never removes accessible semantics.** The tile MUST keep an accessible name carrying the entity's resolved name and, where the card has one, its state ("Reading lamp, on"): the interactive surface stays fully identified to assistive technology while the glyph alone identifies it visually. Hiding the name from a screen reader too would make an actionable tile anonymous — the same trap the error-tile rule guards against.
- `iconOnly` MUST compose with the slider placement contract (below): `sliderPlacement: background` under `iconOnly` yields a tile that is simultaneously the slider and the icon-only surface — the fill is the state tint.
- **Danger floor:** `iconOnly` is a presentation option and MUST revert under a danger state exactly as `hideName`/`hideState` do — a sounding smoke detector renders its full danger presentation, label included, whatever this option says.
- **Card states outrank suppression.** Loading, unavailable/disconnected and error presentations are **not** uniformly replacement surfaces — several cards render them inline on their normal layout (a light keeps rendering with its unavailable/error marks; binary sensor and person likewise) — so the exemption cannot be "replacement states render first". The rule binds the rendered output: where a state presentation replaces the card (the skeleton, the error surface), `iconOnly` does not reduce it; where it renders inline, `iconOnly` MUST NOT be what hides it — the shell's tile-level state marks (unavailable and error outlines, the loading pulse) are unaffected by suppression, and where suppression removes the text that identifies the state or the control that resolves it (Retry), the icon-only tile MUST satisfy the omitted-not-omitted rule ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)) exactly as a `glance` error tile does: the message becomes the tile's accessible name and pressing the tile reaches the full message and the recovery actions. This is the same precedence the danger floor sets; presentation options never suppress a card's ability to report or recover from its own state.
- Schema, config form, YAML round-trip, and per-key tolerance follow the same rules as every other display option.

#### Scenario: Icon-only weather tile

- **GIVEN** a 1×1 weather card with `iconOnly: true` whose entity reports `rainy`
- **WHEN** the card renders
- **THEN** the tile shows only the centred condition icon on the card surface — no temperature, no forecast, no condition text — and tapping it opens the entity detail dialog (`default` → `more-info` for read-only cards).

#### Scenario: Danger overrides icon-only

- **GIVEN** a `binary_sensor` card with `device_class: smoke` and `iconOnly: true`
- **WHEN** the raw state becomes `on`
- **THEN** the card renders the full danger presentation — alert colour, active hazard glyph, visible hazard label — as if `iconOnly` were `false`.

#### Scenario: Existing hideName+hideState tiles are unaffected

- **GIVEN** a card stored with `hideName: true, hideState: true` and no `iconOnly` key
- **WHEN** the dashboard loads after `iconOnly` ships
- **THEN** the card renders exactly as before — centred icon, neutral tile, interior content still rendered where the card has any — because `iconOnly` defaults to `false` and the legacy both-hidden combination keeps its existing meaning (centring only, no tile tint).

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

**An `unavailable` or `unknown` entity redirects a `toggle` route to `more-info` — every route, not only `default`.** A card must not actuate a device whose state is indeterminate, and "why has this gone quiet?" is precisely what the gesture is for at that moment. Two things follow, and the second is the one that is easy to lose. The redirect MUST happen at **resolution**, so a route stored on a gesture — which never consults what `default` resolves to — is redirected as well: suppressing the dispatch instead leaves such a tile dispatching nothing **and opening nothing**, inert at `glance` where the tap is its only affordance, which the omitted-not-omitted rule forbids ([design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)). And the card's own toggle handler MUST NOT be consulted on the way, so no card can actuate an indeterminate device by answering wrongly — this is a property of the shell rather than a rule each card is trusted to keep. The redirect is scoped to `toggle`: `navigate`, `call-service` and `none` are unaffected, since unavailability is a statement about commanding the device and not about everything a tile can be configured to do.

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

## Shared slider placement (`sliderPlacement`)

_`auto`, `horizontal` and `vertical` are **implemented** by change [0034](../../../changes/0034-slider-placement.md) PR 1 — the key, its schema and its configuration row on all three cards, resolved once for every consumer. `background` is specified there and not yet implemented; until it is, a card storing it renders the tier's own placement rather than a surface, so no stored configuration changes meaning when the surface lands._

Not universal — this contract is defined once here so the per-card docs that adopt it cannot drift. Each participating card's doc lists the key in its own table and links here; the semantics below are identical everywhere.

The cards that carry it today are the three whose **primary embedded control is the slider anatomy and is domain-derived**: light brightness, cover position, and fan speed under `speedControl: slider`. The `input_number` card's slider (under `controlStyle: slider`, [options/input-helpers](./input-helpers.md#input_number)) is the same anatomy but is deliberately **not** a consumer yet: which control that card renders already follows the helper's own `mode` attribute, so layering placement over an entity-derived control style is a decision belonging to the input-helpers contract, and change [0034](../../../changes/0034-slider-placement.md) records it as an open question rather than assuming it. A card adopting `sliderPlacement` later adopts these semantics unchanged — the list of consumers grows, the contract does not fork.

| Key               | Type   | Default | Behavior                                                                                                                                      |
| ----------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `sliderPlacement` | select | `auto`  | `auto \| horizontal \| vertical \| background` — where and how the card's primary slider renders. Values outside the set fall back to `auto`. |

- **`auto`** keeps the tier layouts' own placement — horizontal on the row line in `row`/`full`, vertical filling the middle in `tall`, none in `glance` — exactly as each card's tier table specifies today. An absent key MUST be indistinguishable from `auto`.
- **`horizontal` / `vertical`** force the slider's orientation in every tier that shows a slider at all; the tier keeps deciding _whether_ the slider renders (still never in `glance` under these two values) and what else renders around it. A forced orientation the surrounding arrangement cannot host sensibly still renders — forced means forced — but content that then does not fit is omitted, never clipped, per the tier rules.
- **`background`** renders the slider as the card surface itself, per [design-system — background slider placement](../../design-system/index.md#background-slider-placement): track edge to edge, tint fill as the state surface, card content overlaid. Background placement renders in **every** tier including `glance` — it consumes no layout space, which is exactly what makes a 1×1 dimmable tile possible.
- **Gestures in `background` placement (the one exception to "controls consume their own events"):** the tile is simultaneously the control and the action surface, so the two are split by gesture kind — a **drag** adjusts the slider (optimistic drag, commit on release, per the card's own slider rules) and MUST NOT fire any action; a **tap** (press and release without meaningful travel) falls through to `tapAction`; hold and double-tap keep their universal meanings. A drag that ends outside the tile commits like any other slider drag.
- The value the slider adjusts, its commit semantics (0% turn-off rules, turn-on-implied rules), its colour, and its capability gating are the card's own and do not change with placement. A card whose slider is capability-gated off (or hidden by its `show*` option) renders no slider in any placement — `background` then falls back to the plain tile.
- In edit mode the slider is inert like every embedded control; selection semantics apply to the tile.
- The key follows convention 7's pinning boundary: `auto` reproduces today's operation exactly, so introducing the option requires no migration.

### Scenario: Background placement on a glance light

- **GIVEN** an `on` dimmable light at 40% on a 1×1 card with `sliderPlacement: background`
- **WHEN** the card renders
- **THEN** the tile's lower 40% carries the tint fill with the saturated leading edge, the icon (and any surviving meta) overlays it; **WHEN** the user drags upward across the tile and releases at ~70%, **THEN** the card commits brightness ≈70% and no tap action fires; and **WHEN** the user taps the tile without travel, **THEN** the light toggles.

## Conventions for per-card options

Per-card docs MUST follow these rules so the option surface stays coherent:

1. **Keys are camelCase**, stable once shipped; renames require a config migration in the loader (like the weather `preset`→`variant` migration).
2. **Defaults are the researched common case** — the card must look right with zero configuration; options exist for divergence, not setup.
3. **Feature-gated controls stay automatic.** Whether a control _can_ appear is derived from the entity (`supported_features`, attributes); options only let users _hide_ capabilities (`show*: false`) or tune presentation — never enable something the entity cannot do.
4. **Tier interaction is explicit.** Every option that adds visible content states which tiers render it (e.g. a forecast option renders only in `full`).
5. **Selects over booleans** when a third value is plausible later.
6. **Every option ships with a story** demonstrating both/all values ([storybook](../../storybook/)).
7. **New defaults never change how an existing card is operated.** The pinning boundary is the **removal or replacement of a control surface**, not appearance: when a new option's default would remove an existing control or replace the way an existing interaction operates on an already-placed card (climate's always-dial becoming `variant: compact`; input_boolean's discrete switch becoming `controlStyle: tile`; input_number's stepper becoming a slider; the fan's step buttons becoming `speedControl: slider`), the introducing change MUST ship a loader migration pinning the legacy value onto existing items — only newly created cards receive the new default. Pinning migrations MUST discriminate by a **configuration version cutoff or migration marker**, never by key absence: a newly created card legitimately leaves the key absent (to follow an entity-derived default), so an absence-triggered rewrite would wrongly pin new cards on their first reload. Each migration ships a save/reload test proving new cards stay unpinned. Everything that is **visual presentation within the same control surface** — icon choice (`deviceClassIcon`), state label text, active tint source (`useLightColor`), overlay placement, badges — and everything **additive** — new controls appearing alongside unchanged existing operation (a color-temperature picker, an oscillate toggle), sparklines, forecasts — deliberately follows the new defaults with **no** pinning: restyling existing dashboards is the design-system upgrade's explicit purpose, and freezing every card on its legacy look would defeat it. The pinned set is exactly the keys named here plus any a per-card change document adds under this rule; per-card docs MUST NOT extend pinning to presentation-only defaults. **Bugfix exemption:** replacing fallback behavior that is demonstrably broken or meaningless for the domain — a tap whose `homeassistant.toggle` errors (person), or one whose `<domain>.toggle` is not a registered service at all, so Home Assistant rejects it outright (`scene`, `button` and `input_button`, verified against a running instance in change 0027) — is a bugfix, not a control-surface replacement, and needs no pinning; pinning applies only where the legacy operation genuinely worked (media/vacuum power toggle).

## Per-card documents

Domain docs in this folder (one per card family): [light](./light.md) · [switch](./switch.md) · [climate](./climate.md) · [sensor](./sensor.md) · [media-player](./media-player.md) · [camera](./camera.md) · [cover](./cover.md) · [fan](./fan.md) · [weather](./weather.md) · [security](./security.md) · [vacuum](./vacuum.md) · [person](./person.md) · [scene](./scene.md) · [input-helpers](./input-helpers.md)
