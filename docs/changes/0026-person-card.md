# 0026 — Person Card

## Summary

Create the person card per the [person option contract](../specs/entity-cards/options/person.md): a read-only presence card built around a normative avatar (entity picture, or initials on a stable generated color, with a presence badge dot — green home / red away / neutral zone), the `showZone`, `showLastChanged`, `showBattery` + `batteryEntity` options (battery auto-derived from the person's `device_trackers` when possible, amber below 20%), and `more-info` as the default tap action. The option doc's header-chip form is deferred (no placement facility exists — see Out of Scope). The `person` domain moves out of the EntityBrowser's hidden `SYSTEM_DOMAINS` into `SUPPORTED_DOMAINS` so person entities become addable from the Entities tab and dispatch to the new card via the registry.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/person](../specs/entity-cards/options/person.md) · **Status:** complete · **Depends on:** 0011, 0014

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

The [person option doc](../specs/entity-cards/options/person.md) owns the option keys, defaults, the fixed avatar and presence-badge rules, zone display, battery derivation and thresholds, tier layouts, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Registration:** the card registers under `person` in `domainToCard`; `person` moves out of the EntityBrowser's hidden `SYSTEM_DOMAINS` into `SUPPORTED_DOMAINS` so person entities become addable from the Entities tab.
- **No legacy pinning** (common convention 7's bugfix exemption): the fallback's tap attempts `homeassistant.toggle` on a person entity, which fails. Replacing an erroring tap with `more-info` is a bugfix, not a control-surface replacement.
- The card is read-only — no built-in interaction may call a service.
- Battery resolution is sensor-first per the option doc (configured `batteryEntity` → device battery sensor → tracker attribute as legacy fallback); `showBattery` is hidden from the config form only when none of the three resolves. Fixtures MUST include a `device_class: battery` sensor path, not only the tracker attribute — Home Assistant is migrating tracker battery reporting off attributes.
- **The option doc's header-chip form is NOT implemented here** — it is deferred with its placement facility (see Out of Scope), and the chip section of the option doc stands as the specification for that future change.

## Design Decisions

- **Avatar rules are normative, not options** — identity rendering (picture > initials-on-stable-color, badge dot always present) is the card's anchor; making it configurable would fragment presence legibility across dashboards and exports.
- **Deterministic color as a pure function** — the initials background hashes the entity id into a fixed palette (which palette — Radix scales minus domain-reserved hues vs. a dedicated avatar set — settles with the design system during implementation); a pure function keeps it trivially unit-testable and stable across sessions, screens, and YAML round-trips.
- **Sensor-first battery derivation** — `batteryEntity: ''` resolves a `device_class: battery` sensor on the device backing one of the person's `device_trackers`, falling back to a `battery_level`-style tracker attribute only for integrations that have not migrated. Home Assistant is moving tracker battery reporting onto dedicated sensor entities, so an attribute-first pass would be built on the path being retired.
- **Presence ring replaces the dot at chip scale** (recorded for the deferred chip form, not built here) — an overlapping dot is illegible on a 34px chip; a 2px ring in the same presence color carries identical information within the chip anatomy's icon-dot slot. This design stands in the option doc for the future header-chip change.
- **`full` stays calm** — until zone history and distance data sources exist, `full` renders `row` content vertically centered rather than inventing content; the tier upgrades arrive with their data, not before.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [x] **PR 1 — Person card + discovery**: PersonCard component (avatar rules, badge dot, tier layouts, `showZone`/`showLastChanged` with live durations, `more-info` default tap); registry entry; `person` moved from `SYSTEM_DOMAINS` to `SUPPORTED_DOMAINS`; initials/color unit tests; tier + presence stories; entity-cards spec updated (person card section, EntityBrowser domain lists, changelog)
- [x] **PR 2 — Battery**: `showBattery`/`batteryEntity` with sensor-first auto-derivation (attribute fallback covered by tests), amber low-battery treatment, auto-hidden config control; derivation unit tests; battery stories

## Out of Scope

- Distance-to-home ("3.2 km away") and the `full`-tier map preview / `map` action target — open questions in the option doc; no zone geometry or map renderer exists in the panel.
- The **header-chip form**: the grid model and `GridView` have no header/chip placement facility, so a chip variant would be reachable only from stories. Deferred until such a facility exists (change 0027 defers scene chips for the same reason); the option doc's chip section stands as the specification for that future change.
- Zone history line ("Work → Home, arrived 17:42") — needs entity history the state pipeline does not fetch.
- Universal option mechanics (landed in 0014) and other new cards.
