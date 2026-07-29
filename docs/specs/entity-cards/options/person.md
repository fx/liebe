# Card Options — Person

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) — universal options (`name`, `icon`, `hideName`, `hideState`, `color`, actions) are not repeated here.

**Status: implemented** by change [0026](../../../changes/0026-person-card.md) — the card, the avatar rules, `showZone` and `showLastChanged` in PR 1; `showBattery` and `batteryEntity` in PR 2. Every option in this document is shipped.

The `person` domain now has a `domainToCard` entry and is no longer in the EntityBrowser's hidden `SYSTEM_DOMAINS` list (which keeps `persistent_notification`, `sun` and `zone` — see [entity-cards — EntityBrowser](../index.md#entity-and-card-discovery-entitybrowser)). **This spec superseded that listing for `person`**: the domain was removed from `SYSTEM_DOMAINS` and added to `SUPPORTED_DOMAINS`, so person entities are addable from the Entities tab and dispatch to the card via the registry. Nothing needed migrating — the domain was not merely unmapped but unplaceable, so no stored dashboard can contain a person item.

The card is **read-only**: a person entity cannot be controlled, so the card MUST NOT call services from any built-in interaction; every option below tunes presentation only (per [common — conventions](./common.md#conventions-for-per-card-options)).

## Primary action

- As a read-only card, `person` resolves `tapAction: default` to `more-info` (the common contract's read-only rule); the stored default remains the literal `default`.
- A configured `tapAction: toggle` MUST also resolve to `more-info`, and the card MUST declare that rather than leaving the gesture to the shell. The shell's fallback for a family with no toggle of its own is `homeassistant.toggle` on the entity, which forwards to a `person.toggle` the platform does not register — so a card that stayed silent here would keep the erroring tap that registering this domain exists to fix, reachable through one stored option.
- `holdAction: more-info` and `doubleTapAction: none` keep their universal defaults.
- The entity detail dialog is Liebe's own (per the common action type). A future map/location-history action target MAY be added to the dialog later; it is not part of this option surface (see Open Questions).

## Avatar (not an option — fixed rules)

The avatar is the card's identity anchor and its rendering is normative, not configurable:

- The card MUST render the entity's `entity_picture` as a circular avatar (`--liebe-circle-radius`) when the attribute is present.
- The card MUST read `entity_picture` **by value, not by key**. Home Assistant's person component sets the attribute unconditionally from config, so a person who has never been given a photo publishes the key holding `null` — a card testing for the key renders a broken image on the common case.
- When `entity_picture` is absent, the card MUST render the person's initials (first letters of up to two name words) on a **generated, stable background color** — derived deterministically from the entity id so the same person always gets the same color across sessions, screens, and exports. The palette is eight Radix scales the [domain color discipline](../../design-system/index.md#domain-color-discipline) has **not** reserved: green and red are the badge dot's own home and away, and amber, sky, indigo, teal, cyan or blue would read as a domain state the person is not in. The hash MUST distribute over the whole palette rather than a corner of it — a hash whose palette index comes off its low bits gives ids that differ only in their tail the same color.
- The initials MUST be derived per code point rather than per UTF-16 unit, and MUST fall back to the entity id's object id (underscores read as word breaks) when there is no usable `friendly_name`.
- A **presence badge dot** MUST overlap the avatar's edge (bottom-trailing), colored by presence:
  - state `home` → `--liebe-c-ok` (green, per the [domain color discipline](../../design-system/index.md#domain-color-discipline): home = ok)
  - state `not_home` → `--liebe-c-alert` (red: away)
  - any named zone state → a **neutral** (gray-scale) dot; the zone's friendly name carries the information as the state text instead of hue.
  - `unknown` → a **hollow** (outlined, unfilled) neutral dot with state text "Unknown" — explicitly distinct from the named-zone treatment, so indeterminate presence never masquerades as a known location.
  - `unavailable` → the same hollow dot, but the card renders the common shell's unavailable treatment (dimmed, dotted border, `UNAVAILABLE` status per [entity-cards](../index.md#common-card-shell-sizing-and-lifecycle-states)) rather than "Unknown". A person whose entity is disconnected is a different fact from a person whose location is indeterminate, and the two MUST stay distinguishable.
- The universal `icon` override, when set, replaces the initials fallback glyph but MUST NOT suppress the badge dot; `entity_picture`, when present, always wins over both.
- A **presence indicator** MUST ride on the avatar in every rendering of it, so presence is legible even when the state line is hidden — the overlapping badge **dot** in all card tiers, and (per the chip section) the 2px presence **ring** at chip scale, where an overlapping dot would be illegible. Same colors, same information; the form adapts to the scale.

## Options

| Key               | Type    | Default | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showZone`        | boolean | `true`  | Renders the presence/zone name as the card's state line: "Home", "Away", or the zone's friendly name ("Work", "School", …). `false` leaves presence to the badge dot alone. All tiers with a state line; also the chip label.                                                                                                                                                                                                                                   |
| `showLastChanged` | boolean | `true`  | Relative duration in the current state as secondary text — "for 2 h", "for 15 min" — derived from `last_changed`. Renders in `row` and `full`; never in `glance` (no room) or the chip.                                                                                                                                                                                                                                                                         |
| `showBattery`     | boolean | `true`  | Battery percentage of the person's primary tracker. The control stays automatic (per [common — conventions](./common.md#conventions-for-per-card-options)): it renders only when a battery level is actually derivable (see `batteryEntity`); when none is, the option MUST be hidden from the config form and nothing renders. Below 20% the readout MUST render in amber (`--liebe-c-light` text step) as a low-battery warning. Renders in `row` and `full`. |
| `batteryEntity`   | string  | `''`    | Entity id of a battery sensor to read. `''` MUST auto-derive **sensor-first**: look for a `device_class: battery` sensor on the device backing one of the person's `device_trackers`, and only then fall back to a `battery_level`-style tracker attribute (see Battery below).                                                                                                                                                                                 |

- `showZone: true` with `hideState: true` resolves per the common contract: `hideState` wins and the state line is hidden (the badge dot still shows presence).
- Zone display MUST use friendly names: `home` → "Home", `not_home` → "Away", and zone states resolve through the corresponding `zone.*` entity's friendly name, falling back to the raw state title-cased. The two are connected by slugifying: a person's state is its source tracker's, and trackers publish a zone's **name**, not its entity id.
- A person's state is therefore arbitrary user text, and MUST NOT be used as a key into a plain object. Presence MUST be resolved by comparison, and a zone name MUST reach an entity lookup only with its `zone.` prefix attached, so a zone called `constructor` cannot resolve to a prototype property.
- `showLastChanged` durations MUST update live (relative-time re-render) and use compact units ("for 3 d", "for 2 h", "for 15 min", "just now").
- **Battery source resolution order (normative):** (1) a non-empty `batteryEntity`, if it resolves to an existing entity; (2) a `device_class: battery` sensor on the device backing one of the person's `device_trackers`; (3) a `battery_level`-style attribute on a tracker, as a **legacy fallback** — Home Assistant is migrating tracker battery reporting to dedicated battery-sensor entities, so the attribute path MUST NOT be the primary source. The `showBattery` control is hidden from the config form only when **none** of the three resolves. A configured `batteryEntity` therefore always makes the option available — gating it on auto-derivation alone would make the explicit override unreachable, since its whole purpose is supplying a source the graph does not yield.
- The device hop is the **entity registry**, read live off `hass.entities`; nothing is fetched and there is no cache. A person is not the entity that has a device — its `device_trackers` are — so the resolution is person → trackers → the battery sensor sharing a tracker's `device_id`.
- The sensor pass MUST run across **all** trackers before the attribute fallback is considered for any of them. A household part-way through Home Assistant's migration has one tracker on each, and a per-tracker order would hand the answer to whichever tracker sorts first — the deprecated path as often as not.
- A battery level MUST come from the `sensor` domain. `device_class: battery` on a `binary_sensor` means "on means low" rather than a percentage, and `binary_sensor.x_battery_low` sorts before `sensor.x_battery`, so a resolver without the domain check fails _preferentially_ rather than occasionally.
- A configured `batteryEntity` naming an entity that does not resolve MUST show nothing rather than falling through to derivation. Naming a sensor is an instruction about which battery to read; quietly reading a different one would make the card disagree with its own configuration exactly when somebody is trying to correct it.
- A person with no derivable battery MUST render **nothing** — no badge, no placeholder, no `0%`. `device_id` is absent for a fifth of entities on a small instance, so this is the ordinary case rather than an error.

## Tier layouts

Tiers per [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts). Content that does not fit MUST be omitted, never clipped. The avatar takes the icon-circle slot in the shared anatomy (a 40px `liebe-icon`-sized circle) in `glance`/`row`; `full` MAY enlarge it.

| Tier     | Layout                                                                                                                                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Avatar (with badge dot) + name + zone state line, stacked; whole tile is the primary action                                                                                                                                                                                                                    |
| `row`    | Avatar + name/zone meta in a row; adds the `showLastChanged` duration and the `showBattery` readout as trailing secondary text                                                                                                                                                                                 |
| `tall`   | Avatar on top, name/zone at the bottom; no secondary metadata — `showLastChanged` and `showBattery` render in `row`/`full` only, per the option table                                                                                                                                                          |
| `full`   | Row arrangement plus a secondary line: recent zone history ("Work → Home, arrived 17:42") and/or distance-to-home when available (both currently open — see Open Questions); until those data sources exist, `full` MUST render the `row` content vertically centered and stay calm rather than invent content |

### Chip form

A person renders naturally as a **header chip** — the compact presence row at the top of a screen. **Note:** no header/chip placement facility exists in the grid model yet, so this form is specified here but deferred beyond the initial card implementation (change 0026 excludes it; scene chips are deferred identically). When the facility lands, the chip form MUST follow the design-system chip anatomy ([`liebe-chip`](../../design-system/index.md#card-anatomy): 34px height, `--liebe-chip-radius` pill, icon-dot + label, active tint pattern):

- The chip's icon-dot slot holds a miniature avatar (picture or initials) wrapped in a **presence ring** — a 2px ring in the badge-dot color (green home / red away / neutral in-zone) replacing the overlapping dot at chip scale.
- The chip label is the person's first name; when `showZone` is `true` and the person is in a named zone, the label MAY append the zone ("Marian · Work").
- A `home` person's chip uses the active tint pattern in `--liebe-c-ok`; `not_home` uses the inactive neutral treatment with the red ring carrying the alert hue.
- `showLastChanged` and `showBattery` never render in the chip.

## Scenarios

#### Scenario: Person with no photo gets stable initials

- **GIVEN** a `person.jane_doe` entity named "Jane Doe" with no `entity_picture`, state `home`, and zero per-card config
- **WHEN** the card renders in any tier
- **THEN** the avatar shows "JD" on a generated background color, a green (`--liebe-c-ok`) badge dot overlaps the avatar edge, and the state line reads "Home"; re-rendering after a reload produces the identical background color.

#### Scenario: Arriving at a named zone

- **GIVEN** a person card with defaults whose entity state is `not_home` (red badge dot, state "Away")
- **WHEN** the entity state changes to `work` (a zone whose friendly name is "Work")
- **THEN** the badge dot animates (≤300ms) to the neutral treatment, the state line reads "Work", and in `row` tier the `showLastChanged` duration resets to "just now".

#### Scenario: Low battery renders amber

- **GIVEN** a `row`-tier person card with `showBattery: true`, `batteryEntity: ''`, whose `device_trackers` auto-derives a phone reporting `battery_level: 14`
- **WHEN** the card renders
- **THEN** "14%" appears as trailing secondary text in the amber text step; at `battery_level: 45` the same readout renders muted.

#### Scenario: No derivable battery hides the option

- **GIVEN** a person whose `device_trackers` expose no battery attribute or associated battery sensor, and `batteryEntity: ''`
- **WHEN** the card config modal opens
- **THEN** the `showBattery` control does not appear in the form and no battery readout renders in any tier.

## Open Questions

- **Distance to home.** Showing "3.2 km away" in `full` requires computing a distance from the person's `latitude`/`longitude` against the home zone's coordinates (`zone.home` lat/long) — the panel currently reads no zone geometry, and accuracy (`gps_accuracy`) handling is undefined. Open.
- **Map preview in `full`.** A small static map (or map action target for `tapAction`) is the natural `full`-tier upgrade and the natural future meaning of a `map` action, but requires a map data source/renderer the panel does not have. Open / future.
- **Zone history line.** The `full`-tier "Work → Home, arrived 17:42" line needs entity history, which the entity-state pipeline does not fetch — same dependency as the [design-system "Sparkline data source" open question](../../design-system/index.md#open-questions).
- ~~**Initials color algorithm.**~~ Resolved by change [0026](../../../changes/0026-person-card.md) PR 1 and recorded under Avatar above: the Radix scale set with every domain-reserved hue excluded, hashed per entity id with an avalanche step so the index depends on the whole id. A dedicated avatar palette was not needed — the reserved-hue exclusion is what makes the set safe, and deriving it from the color discipline means reserving a new domain hue cannot silently collide with an identity color.
- ~~**Battery auto-derivation depth.**~~ Resolved by the resolution order above: sensor-first via the tracker's device, attribute only as legacy fallback. Home Assistant's move to dedicated battery sensors makes the attribute-only pass the unsafe start.

## References

- [Common option contract](./common.md) · [entity-cards — registry pattern & EntityBrowser `SYSTEM_DOMAINS`](../index.md)
- [Design system — chip anatomy (`liebe-chip`), circle radius token, domain colors (ok = home, alert = away), tiers](../../design-system/)
- Home Assistant `person` entity: state `home` / `not_home` / zone name; attributes `entity_picture`, `device_trackers`, `latitude`, `longitude`, `gps_accuracy`
- EntityBrowser baseline (list this spec supersedes for `person`): `src/components/EntitiesBrowserTab.tsx` (`SYSTEM_DOMAINS`)
