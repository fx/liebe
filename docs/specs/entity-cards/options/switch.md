# Card Options — Switch

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) (universal options are not repeated here). **Status: implemented** by change [0022](../../../changes/0022-switch-input-helpers-to-spec.md).

This document covers the switch card: the card registered for the `switch` domain and, unchanged, the **generic fallback card** rendered for any entity domain without a registry entry (see [entity-cards — Button and fallback card](../index.md#button-and-fallback-card), `src/components/ButtonCard/`). Because the same card serves arbitrary domains, every option below MUST be safe — no crash, no misleading UI — when the entity is not a `switch.*` entity.

## Primary action

- `tapAction: default` MUST mean **toggle** (`homeassistant.toggle` on the entity), for both the `switch` domain and fallback domains — with `unavailable`/`unknown` resolved first as **inert**: a critical load must never be actuated while its direction is indeterminate. Both states covered in the state-matrix tests.
- Every route that toggles the entity — the whole-tile action, an explicit `toggle` bound to any gesture, and a toggle-equivalent `call-service` alike — MUST pass through **one shared** transition-or-timeout guard rather than a guard per route, so a second identical command is refused whichever route it arrives on. The guard's timing and non-retrying semantics are the [common dispatch guarantees](./common.md#action-type) and are not restated here; `confirm` sits in front of every route.
- The whole tile is the touch target in every tier; the card embeds no discrete controls of its own.
- For fallback domains where `homeassistant.toggle` is not meaningful, the tap simply results in a failed/no-op service call surfaced through the standard error state; users SHOULD set `tapAction: more-info` for such entities. The card MUST NOT try to guess a better action per unknown domain.

## Options

| Key               | Type    | Default | Behavior                                                                        |
| ----------------- | ------- | ------- | ------------------------------------------------------------------------------- |
| `confirm`         | boolean | `false` | Require a confirmation dialog before any toggle fired by this card              |
| `deviceClassIcon` | boolean | `true`  | Derive the default icon from the entity's `device_class` (`switch` domain only) |
| `stateLabels`     | object  | `{}`    | Optional `onLabel` / `offLabel` strings overriding the state-line text          |
| `showLastChanged` | boolean | `false` | Append relative "since" time as the state line's secondary text                 |

### `confirm`

For critical loads (pumps, heaters, servers) an accidental tap must not flip the entity. When `confirm: true`:

- Any action on this card that would toggle the entity — `tapAction` of `default` **or** explicit `toggle`, a `toggle` bound to `holdAction` / `doubleTapAction`, **and a configured `call-service` targeting the same entity's toggle-equivalent services** — MUST first present a confirmation dialog naming the entity and the target state (e.g. "Turn off Well Pump?"). The gate applies after action resolution, so re-routing cannot bypass it; `call-service` targeting unrelated services stays ungated.
- **Toggle-equivalence is classified by effect against the entity's own domain, not a fixed service list.** A service targeting this entity is toggle-equivalent when its name is `toggle`, `turn_on`, or `turn_off` in **either** the entity's actual domain or the generic `homeassistant` domain. Enumerating `switch.*` only would leave the fallback role — which this card fills for every unmapped domain — bypassable: `siren.turn_on` on a `siren.alarm` card is exactly as consequential as `switch.turn_on`, and a fixed list silently exempts it. The rule is the invariant ("same entity, on/off-equivalent effect"), and any future domain is covered without amending a list.
- **The target is whatever the dispatch layer resolves, not whatever is easiest to read.** A payload's `entity_id` overrides the card's entity in every shape it can take — a string, a list, or the `all` wildcard — so an action reaching this entity as one member of a list MUST be gated exactly like one naming it outright. A classifier that recognises only the string form is a bypass of the same class as an enumeration that lists only `domain.*` services. Where the shape cannot be resolved, the gate MUST confirm: over-confirming is visible and harmless, while under-confirming is an option that silently does not do what it says.
- Confirming MUST fire exactly one toggle; cancelling MUST fire nothing and leave no pending state. Dismissal MUST require an explicit choice — a destructive confirm should not evaporate on a stray tap outside it.
- Non-toggling actions (`more-info`, `navigate`, `none`) MUST NOT be gated.
- Applies identically for fallback domains. Behavioral only — no tier interaction; the dialog is a portal overlay, never in-card content.

### `deviceClassIcon`

Default-icon precedence when no universal `icon` override is set:

1. If the entity's domain is `switch`, `deviceClassIcon !== false`, and `attributes.device_class` maps to a known glyph — use it: `outlet` → plug glyph, `switch` → power glyph.
2. Otherwise the domain default (power glyph for `switch`).
3. For fallback domains, a generic glyph (the bolt); `device_class` MUST NOT be consulted, since its meaning is domain-specific and the fallback cannot know the mapping.

The universal `icon` option always wins over all of the above. Visible in every tier (the icon circle renders in all four layouts).

### `stateLabels`

This key belongs to this card family alone. The cover card's position-display selector shared the name until change [0038](../../../changes/0038-option-key-collision.md) renamed it to [`stateLabelStyle`](./cover.md#state-label-style-statelabelstyle); while both declarations stood, the cover's string enum governed the merged item schema and a switch or fallback card carrying the object below was rejected by the import gate outright.

`stateLabels.onLabel` / `stateLabels.offLabel` replace the state line's text for the `on` / `off` states respectively ("Brewing" / "Idle" instead of "On" / "Off"). Empty or absent values fall back to the default capitalized state. States other than `on`/`off` (including any state a fallback-domain entity reports, and `unavailable`) MUST render the raw state unmodified — the overrides only ever remap `on` and `off`. Labels are plain text, single line, ellipsized per the [design-system typography](../../design-system/index.md#typography). Renders wherever the state line renders (all tiers, unless `hideState` is set); state-line coloring (domain color when active, muted otherwise) is unaffected by the label text.

### `showLastChanged`

When `true`, the state line gains muted secondary text derived from the entity's `last_changed`: a relative duration such as "· for 2 h" / "· 5 min ago". It MUST update at least once per minute while visible and MUST use the muted (`--liebe-muted`) color, never the domain color. Tier visibility: renders in `row`, `tall`, and `full`; in `glance` it MUST be omitted (the 1×1 stack has no room for a secondary line — degrade by omission, per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts)). Hidden entirely when `hideState` is set. Safe for fallback domains (`last_changed` exists on every entity).

## Tier layouts

Per the [design-system layout tiers](../../design-system/index.md#size-adaptive-layouts); the switch card has no embedded control, so its tiers differ only in arrangement and secondary content:

| Tier     | Content                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `glance` | Icon circle over name + state, centered; no `showLastChanged` text; whole tile toggles                                                           |
| `row`    | Icon circle + name/state meta in a row; `showLastChanged` text on the state line; whole tile toggles                                             |
| `tall`   | Icon circle top, meta at bottom; `showLastChanged` on the state line; whole tile toggles                                                         |
| `full`   | `row` arrangement with the extra area as breathing room; `showLastChanged` on the state line. The card declares no secondary controls for `full` |

The active/inactive icon-circle tint pattern and state-text coloring follow the [design-system domain color discipline](../../design-system/index.md#domain-color-discipline) in every tier.

## Scenarios

### Scenario: Confirm gates the toggle

- **GIVEN** a `switch.well_pump` card with `confirm: true` and default actions, entity `on`
- **WHEN** the user taps the card and dismisses the dialog with Cancel
- **THEN** no service is called and the entity remains `on`
- **WHEN** the user taps again and confirms
- **THEN** exactly one `homeassistant.toggle` is called for `switch.well_pump`.

### Scenario: Outlet gets a plug icon, override still wins

- **GIVEN** a `switch.coffee_maker` entity with `device_class: outlet` and default options
- **WHEN** the card renders
- **THEN** the icon circle shows the plug glyph
- **WHEN** the universal `icon` option is set to a custom glyph
- **THEN** the custom glyph renders instead, regardless of `deviceClassIcon`.

### Scenario: Custom state labels remap on/off only

- **GIVEN** a card with `stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' }`
- **WHEN** the entity state is `on`
- **THEN** the state line reads "Brewing" in the active state color
- **WHEN** the entity becomes `unavailable`
- **THEN** the state line shows the unavailable state, not either label.

### Scenario: Fallback domain stays safe

- **GIVEN** an entity from an unmapped domain (e.g. `siren.garage`) rendered by this card with `deviceClassIcon: true` and `confirm: true`
- **WHEN** the card renders and the user taps and confirms
- **THEN** the icon is the generic glyph (no `device_class` lookup), the state line shows the raw state, and one `homeassistant.toggle` is attempted — any service failure surfaces through the standard card error state.

## Open Questions

- ~~**Switch domain color token.**~~ Resolved and shipped: switches (and all fallback domains) use `--liebe-c-default` (blue) per the [design-system color table](../../design-system/index.md#domain-color-discipline), replacing the amber that collided with lights.
- ~~**Confirm scope for `call-service`.**~~ Resolved in the `confirm` section above: same-entity toggle-equivalent `call-service` routes (`switch.toggle`/`turn_on`/`turn_off`, `homeassistant.toggle`) ARE gated at action resolution; only unrelated services stay ungated — those may get a future per-action `confirm` flag in the [common action type](./common.md#action-type) rather than a card option.
- ~~**Nested option shape.**~~ Resolved by change [0022](../../../changes/0022-switch-input-helpers-to-spec.md): the config modal MUST render two plain `string` controls (`onLabel`, `offLabel`) that read and write into the nested `stateLabels` key — no `ConfigDefinition` schema extension. A generic object control is deferred until a second nested option exists to justify it.
- **Fallback tap default.** Whether the fallback card should default `tapAction` to `more-info` for domains known not to support `homeassistant.toggle` (e.g. read-mostly domains) instead of attempting a toggle that errors.

## References

- Current implementation: `src/components/ButtonCard/` (`index.tsx` + the pure `icon.ts` and `lastChanged.ts` helpers — `icon.ts` keeps the `device_class` lookup inside its `switch` branch, so a foreign domain's `device_class` is never in scope, and the generic bolt is its fallback glyph); options in `src/store/switchOptions.ts`, the gate's classification in `src/hooks/useCardActions.ts` and its dialog in `src/components/ConfirmToggleDialog.tsx`; both toggle routes share `dispatchGuarded` from `src/hooks/useServiceCall.ts`
- Baseline behavior: [entity-cards — Button and fallback card](../index.md#button-and-fallback-card)
- Shared contract and conventions: [common.md](./common.md)
- Layout tiers, anatomy, colors: [design-system](../../design-system/)
