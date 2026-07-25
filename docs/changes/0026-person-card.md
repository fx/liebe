# 0026 — Person Card

## Summary

Create the person card per the [person option contract](../specs/entity-cards/options/person.md): a read-only presence card built around a normative avatar (entity picture, or initials on a stable generated color, with a presence badge dot — green home / red away / neutral zone), the `showZone`, `showLastChanged`, `showBattery` + `batteryEntity` options (battery auto-derived from the person's `device_trackers` when possible, amber below 20%), and `more-info` as the default tap action. The option doc's header-chip form is deferred (no placement facility exists — see Out of Scope). The `person` domain moves out of the EntityBrowser's hidden `SYSTEM_DOMAINS` into `SUPPORTED_DOMAINS` so person entities become addable from the Entities tab and dispatch to the new card via the registry.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/person](../specs/entity-cards/options/person.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

There is no person card today: the domain has no registry entry and is hidden as a system domain, so household presence — one of the most-glanced signals on any dashboard — cannot be placed at all. The option doc supersedes that listing and specifies the full card; with tiers (0011) and the universal option surface (0014) landed, the card is a pure consumer of existing infrastructure.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Stories MUST cover the card's state matrix — picture vs. initials avatar × `home` / `not_home` / named-zone / `unknown`-`unavailable` (hollow-dot) presence × every tier ([storybook — story coverage](../specs/storybook/index.md#story-coverage)).
- Initials extraction and the deterministic color generation MUST be unit-tested (same entity id → same color across renders; distinct ids diverge), as MUST battery auto-derivation (tracker with battery → derived; none → option hidden, nothing renders).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Card component, registry entry, and options exactly per the [person option doc](../specs/entity-cards/options/person.md): `showZone` (default `true`), `showLastChanged` (default `true`, live-updating compact durations), `showBattery` (default `true`, automatic control — hidden from the config form when no battery is derivable), `batteryEntity` (default `''` = auto-derive from `device_trackers`, non-empty pins the source).
- Avatar rules are fixed, not options: `entity_picture` as a circular avatar when present; otherwise initials (up to two name words) on a stable color derived deterministically from the entity id; the presence badge dot (bottom-trailing: `--liebe-c-ok` home, `--liebe-c-alert` away, neutral for named zones, and a **hollow** neutral dot with "Unknown" state text for `unknown`/`unavailable` — indeterminate presence must never resemble a known zone, with rendering assertions for both states) rides on the avatar in every tier. The universal `icon` override replaces only the initials glyph and never suppresses the dot.
- Zone display uses friendly names (`home` → "Home", `not_home` → "Away", zone states via the matching `zone.*` entity, title-cased raw state as fallback); `hideState` wins over `showZone` per the common contract.
- Battery readout renders in `row` and `full` only, amber (`--liebe-c-light` text step) below 20%; derivability comes from the entity graph, never from config.
- Read-only card: `tapAction: default` resolves to `more-info` (the common contract's read-only rule; the stored default stays literal `default`); no built-in interaction may call a service. No legacy pinning for pre-existing person items (common convention 7's bugfix exemption): the fallback's tap attempts `homeassistant.toggle` on a person entity, which fails — replacing an erroring tap with more-info is a bugfix, not a control-surface replacement.
- Tier layouts per the option doc: avatar in the icon-circle slot for `glance`/`row`; `full` renders `row` content vertically centered until richer data sources exist. The header-chip form specified in the option doc is NOT implemented by this change (deferred with its placement facility — see Out of Scope).
- EntityBrowser: `person` removed from `SYSTEM_DOMAINS` and added to `SUPPORTED_DOMAINS`.

#### Scenario: Person with no photo gets stable initials

- **GIVEN** a `person.jane_doe` entity named "Jane Doe" with no `entity_picture`, state `home`, and zero per-card config
- **WHEN** the card renders in any tier
- **THEN** the avatar shows "JD" on a generated background color, a green (`--liebe-c-ok`) badge dot overlaps the avatar edge, and the state line reads "Home"; re-rendering after a reload produces the identical background color.

#### Scenario: Low battery renders amber

- **GIVEN** a `row`-tier person card with `showBattery: true`, `batteryEntity: ''`, whose `device_trackers` auto-derives a phone reporting `battery_level: 14`
- **WHEN** the card renders
- **THEN** "14%" appears as trailing secondary text in the amber text step; at `battery_level: 45` the same readout renders muted.

## Design Decisions

- **Avatar rules are normative, not options** — identity rendering (picture > initials-on-stable-color, badge dot always present) is the card's anchor; making it configurable would fragment presence legibility across dashboards and exports.
- **Deterministic color as a pure function** — the initials background hashes the entity id into a fixed palette (which palette — Radix scales minus domain-reserved hues vs. a dedicated avatar set — settles with the design system during implementation); a pure function keeps it trivially unit-testable and stable across sessions, screens, and YAML round-trips.
- **Attribute-only battery derivation first** — `batteryEntity: ''` inspects the person's `device_trackers` for a `battery_level`-style attribute and takes the first match; walking the device registry for sibling battery sensors is deferred (correctness and connection cost, per the option doc's open question). `batteryEntity` exists precisely so households where the minimal pass picks wrong can pin the source.
- **Presence ring replaces the dot at chip scale** (recorded for the deferred chip form, not built here) — an overlapping dot is illegible on a 34px chip; a 2px ring in the same presence color carries identical information within the chip anatomy's icon-dot slot. This design stands in the option doc for the future header-chip change.
- **`full` stays calm** — until zone history and distance data sources exist, `full` renders `row` content vertically centered rather than inventing content; the tier upgrades arrive with their data, not before.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Person card + discovery**: PersonCard component (avatar rules, badge dot, tier layouts, `showZone`/`showLastChanged` with live durations, `more-info` default tap); registry entry; `person` moved from `SYSTEM_DOMAINS` to `SUPPORTED_DOMAINS`; initials/color unit tests; tier + presence stories; entity-cards spec updated (person card section, EntityBrowser domain lists, changelog)
- [ ] **PR 2 — Battery**: `showBattery`/`batteryEntity` with attribute-only auto-derivation, amber low-battery treatment, auto-hidden config control; derivation unit tests; battery stories

## Out of Scope

- Distance-to-home ("3.2 km away") and the `full`-tier map preview / `map` action target — open questions in the option doc; no zone geometry or map renderer exists in the panel.
- The **header-chip form**: the grid model and `GridView` have no header/chip placement facility, so a chip variant would be reachable only from stories. Deferred until such a facility exists (change 0027 defers scene chips for the same reason); the option doc's chip section stands as the specification for that future change.
- Zone history line ("Work → Home, arrived 17:42") — needs entity history the state pipeline does not fetch.
- Device-registry-walking battery derivation beyond the attribute-only pass.
- Universal option mechanics (landed in 0014) and other new cards.
