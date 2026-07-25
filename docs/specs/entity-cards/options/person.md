# Card Options — Person

Part of the [entity-cards spec](../index.md); builds on the [common contract](./common.md) — universal options (`name`, `icon`, `hideName`, `hideState`, `color`, actions) are not repeated here. **Status: specified, not yet implemented (new card).**

There is no person card today: the `person` domain has no `domainToCard` entry and sits in the EntityBrowser's hidden `SYSTEM_DOMAINS` list (alongside `persistent_notification`, `sun`, `zone` — see [entity-cards — EntityBrowser](../index.md#entity-and-card-discovery-entitybrowser)). **This spec supersedes that listing for `person`**: the domain MUST be removed from `SYSTEM_DOMAINS` and added to `SUPPORTED_DOMAINS`, so person entities become addable from the Entities tab and dispatch to the new card via the registry.

The card is **read-only**: a person entity cannot be controlled, so the card MUST NOT call services from any built-in interaction; every option below tunes presentation only (per [common — conventions](./common.md#conventions-for-per-card-options)).

## Primary action

- As a read-only card, `person` resolves `tapAction: default` to `more-info` (the common contract's read-only rule); the stored default remains the literal `default`.
- `holdAction: more-info` and `doubleTapAction: none` keep their universal defaults.
- The entity detail dialog is Liebe's own (per the common action type). A future map/location-history action target MAY be added to the dialog later; it is not part of this option surface (see Open Questions).

## Avatar (not an option — fixed rules)

The avatar is the card's identity anchor and its rendering is normative, not configurable:

- The card MUST render the entity's `entity_picture` as a circular avatar (`--liebe-circle-radius`) when the attribute is present.
- When `entity_picture` is absent, the card MUST render the person's initials (first letters of up to two name words) on a **generated, stable background color** — derived deterministically from the entity id so the same person always gets the same color across sessions, screens, and exports.
- A **presence badge dot** MUST overlap the avatar's edge (bottom-trailing), colored by presence:
  - state `home` → `--liebe-c-ok` (green, per the [domain color discipline](../../design-system/#domain-color-discipline): home = ok)
  - state `not_home` → `--liebe-c-alert` (red: away)
  - any named zone state → a **neutral** (gray-scale) dot; the zone's friendly name carries the information as the state text instead of hue.
  - `unknown` → a **hollow** (outlined, unfilled) neutral dot with state text "Unknown" — explicitly distinct from the named-zone treatment, so indeterminate presence never masquerades as a known location.
  - `unavailable` → the same hollow dot, but the card renders the common shell's unavailable treatment (dimmed, dotted border, `UNAVAILABLE` status per [entity-cards](../index.md#common-card-shell-sizing-and-lifecycle-states)) rather than "Unknown". A person whose entity is disconnected is a different fact from a person whose location is indeterminate, and the two MUST stay distinguishable.
- The universal `icon` override, when set, replaces the initials fallback glyph but MUST NOT suppress the badge dot; `entity_picture`, when present, always wins over both.
- A **presence indicator** MUST ride on the avatar in every rendering of it, so presence is legible even when the state line is hidden — the overlapping badge **dot** in all card tiers, and (per the chip section) the 2px presence **ring** at chip scale, where an overlapping dot would be illegible. Same colors, same information; the form adapts to the scale.

## Options

| Key               | Type    | Default | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showZone`        | boolean | `true`  | Renders the presence/zone name as the card's state line: "Home", "Away", or the zone's friendly name ("Work", "School", …). `false` leaves presence to the badge dot alone. All tiers with a state line; also the chip label.                                                                                                                                                                                                                                                                                                                                                    |
| `showLastChanged` | boolean | `true`  | Relative duration in the current state as secondary text — "for 2 h", "for 15 min" — derived from `last_changed`. Renders in `row` and `full`; never in `glance` (no room) or the chip.                                                                                                                                                                                                                                                                                                                                                                                          |
| `showBattery`     | boolean | `true`  | Battery percentage of the person's primary tracker. The control stays automatic (per [common — conventions](./common.md#conventions-for-per-card-options)): it renders only when a battery level is actually derivable (see `batteryEntity`); when none is, the option MUST be hidden from the config form and nothing renders. Below 20% the readout MUST render in amber (`--liebe-c-light` text step) as a low-battery warning. Renders in `row` and `full`.                                                                                                                  |
| `batteryEntity`   | string  | `''`    | Entity id of a battery sensor to read. `''` MUST auto-derive from tracker **attributes only**: inspect the person's `device_trackers` for a tracker exposing a `battery_level`-style attribute and use the first match. Discovering sibling battery **sensor entities** via the device registry is NOT part of auto-derivation (deferred — see Open Questions); when no attribute-level battery exists, battery is not derivable and `showBattery` hides. A non-empty value pins the source explicitly — including for households whose battery lives only in a separate sensor. |

- `showZone: true` with `hideState: true` resolves per the common contract: `hideState` wins and the state line is hidden (the badge dot still shows presence).
- Zone display MUST use friendly names: `home` → "Home", `not_home` → "Away", and zone states resolve through the corresponding `zone.*` entity's friendly name, falling back to the raw state title-cased.
- `showLastChanged` durations MUST update live (relative-time re-render) and use compact units ("for 3 d", "for 2 h", "for 15 min", "just now").
- Whether battery is derivable MUST come from the entity graph (`device_trackers` / `batteryEntity`), never from config — options never enable data the entity cannot provide.

## Tier layouts

Tiers per [design-system — size-adaptive layouts](../../design-system/#size-adaptive-layouts). Content that does not fit MUST be omitted, never clipped. The avatar takes the icon-circle slot in the shared anatomy (a 40px `liebe-icon`-sized circle) in `glance`/`row`; `full` MAY enlarge it.

| Tier     | Layout                                                                                                                                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` | Avatar (with badge dot) + name + zone state line, stacked; whole tile is the primary action                                                                                                                                                                                                                    |
| `row`    | Avatar + name/zone meta in a row; adds the `showLastChanged` duration and the `showBattery` readout as trailing secondary text                                                                                                                                                                                 |
| `tall`   | Avatar on top, name/zone at the bottom; no secondary metadata — `showLastChanged` and `showBattery` render in `row`/`full` only, per the option table                                                                                                                                                          |
| `full`   | Row arrangement plus a secondary line: recent zone history ("Work → Home, arrived 17:42") and/or distance-to-home when available (both currently open — see Open Questions); until those data sources exist, `full` MUST render the `row` content vertically centered and stay calm rather than invent content |

### Chip form

A person renders naturally as a **header chip** — the compact presence row at the top of a screen. **Note:** no header/chip placement facility exists in the grid model yet, so this form is specified here but deferred beyond the initial card implementation (change 0026 excludes it; scene chips are deferred identically). When the facility lands, the chip form MUST follow the design-system chip anatomy ([`liebe-chip`](../../design-system/#card-anatomy): 34px height, `--liebe-chip-radius` pill, icon-dot + label, active tint pattern):

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
- **Zone history line.** The `full`-tier "Work → Home, arrived 17:42" line needs entity history, which the entity-state pipeline does not fetch — same dependency as the [design-system "Sparkline data source" open question](../../design-system/#open-questions).
- **Initials color algorithm.** The stable color MUST be deterministic per entity id; whether it hashes into the Radix scale set (excluding domain-reserved hues per the color discipline) or a dedicated avatar palette is an implementation choice to settle with the design system.
- **Battery auto-derivation depth.** How far `batteryEntity: ''` should search (tracker attributes only, vs. walking the device registry for sibling battery sensors) affects both correctness and connection cost; the minimal attribute-only pass is the safe start.

## References

- [Common option contract](./common.md) · [entity-cards — registry pattern & EntityBrowser `SYSTEM_DOMAINS`](../index.md)
- [Design system — chip anatomy (`liebe-chip`), circle radius token, domain colors (ok = home, alert = away), tiers](../../design-system/)
- Home Assistant `person` entity: state `home` / `not_home` / zone name; attributes `entity_picture`, `device_trackers`, `latitude`, `longitude`, `gps_accuracy`
- EntityBrowser baseline (list this spec supersedes for `person`): `src/components/EntitiesBrowserTab.tsx` (`SYSTEM_DOMAINS`)
