# 0004: Portable Configuration Contract

## Summary

Define one canonical set of portable (shareable/exportable) dashboard-configuration fields and make `DashboardConfig`, the JSON export, the YAML export, and dirty-tracking all follow it. Closes the contract inconsistencies documented in the [Dashboard Config](../specs/dashboard-config/) spec's Open Questions.

**Spec:** [Dashboard Config](../specs/dashboard-config/)
**Status:** complete
**Depends On:** —

## Motivation

The current code disagrees with itself about what constitutes shareable configuration:

- `tabsExpanded` is part of `DashboardConfig` and the JSON export (`src/store/dashboardStore.ts:305`) but is omitted from `exportConfigurationAsYAML` (`src/store/persistence.ts`).
- `mode`, `gridResolution`, and `sidebarWidgets` all set `isDirty` (triggering a config auto-save) yet are absent from `DashboardConfig`, so the state that marked the config dirty is not actually persisted or shared.
- `gridResolution` is reset to the 12×8 default on every `loadConfiguration` while still marking the config dirty when changed; only per-screen `grid.resolution` round-trips. (Whether the reset itself is a defect depends on the canonical-set decision below — under the default proposal it is device-local and the reset is expected; only the dirty-marking is then wrong.)
- `setMode` marks the config dirty even though mode is persisted separately under `liebe-mode`.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before the PR is opened.
- The canonical contract MUST be locked in by round-trip tests: export (JSON and YAML) → import → deep-equal on every portable field.
- Dirty-tracking rules MUST be covered: every portable-field mutation sets `isDirty`; every non-portable mutation does not.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### One canonical portable set

- The project MUST define a single list of portable fields; `DashboardConfig`, JSON export, YAML export, and import MUST all serialize exactly that set.
- `isDirty` MUST be set by exactly the mutations that change a portable field, and by no others.
- Existing exported files (YAML and JSON, current version) MUST remain importable; if the portable set changes shape, `checkVersionCompatibility`/migration MUST cover it.
- Session/device-local state (e.g. `mode`, persisted separately under `liebe-mode`) MUST NOT be part of the portable document and MUST NOT mark it dirty.

#### Scenario: YAML/JSON parity

- **GIVEN** any dashboard state
- **WHEN** it is exported as YAML and as JSON
- **THEN** both documents contain the same portable fields, and importing either reproduces the same state.

#### Scenario: Mode switch does not rewrite config

- **GIVEN** a clean (non-dirty) dashboard
- **WHEN** the user toggles view/edit mode
- **THEN** `liebe-mode` is updated but `isDirty` stays `false` and `liebe-config` is not rewritten.

## Design

### Approach

Decide the canonical set first (see Open Questions), then align in one PR: `DashboardConfig` in `src/store/types.ts`, `exportConfiguration` in `src/store/dashboardStore.ts`, `exportConfigurationAsYAML`/import paths in `src/store/persistence.ts`, dirty-flag placement in `dashboardActions`, and the round-trip tests. Update the [Dashboard Config](../specs/dashboard-config/) spec (Requirements + removing the resolved Open Questions) in the same PR.

### Decisions

- **Decision**: Adopted the default proposal as the canonical portable set. Portable (in `DashboardConfig`, JSON export, YAML export, import, and dirty-tracking): `version`, `screens`, `theme`, `sidebarOpen`, `tabsExpanded`, `sidebarWidgets`. Device-local (never in the portable document, never marks dirty): `mode` (persisted under `liebe-mode`) and the top-level `gridResolution` (per-screen `grid.resolution` still round-trips).
- **Decision**: No version bump. The portable shape only gained optional fields, so existing current-version JSON/YAML exports remain importable unchanged; `checkVersionCompatibility` is untouched.
- **Decision**: `importConfigurationFromFile` persists the resolved exported config (not the raw import) so an imported file that omits an optional portable field keeps the store's fallback value across reloads.

### Non-Goals

- Schema validation of imports (tracked in [0002-repo-hygiene](./0002-repo-hygiene.md)).
- Any new configuration features.

## Tasks

- [x] Decide canonical portable set, align types/exports/imports/dirty-tracking, add round-trip and dirty-tracking tests, sync the dashboard-config spec

## Open Questions

- [x] Canonical set: are `sidebarWidgets` and `tabsExpanded` shareable dashboard content (include everywhere) or device-local preference (exclude everywhere, stop dirty-marking)? **Resolved — adopted the default proposal:** `version`, `screens`, `theme`, `sidebarOpen`, `tabsExpanded`, `sidebarWidgets` are portable (in `DashboardConfig`, JSON + YAML export, import, dirty-tracking); `mode` (persisted under `liebe-mode`) and the top-level `gridResolution` are device-local — excluded from the portable document and no longer mark it dirty. No version bump is needed: the portable shape only gained optional fields (`tabsExpanded` was already in `DashboardConfig`/JSON, `sidebarWidgets` is new and optional), so existing current-version JSON/YAML exports remain importable.

## References

- Spec: [Dashboard Config](../specs/dashboard-config/) (Open Questions document each inconsistency)
- Related changes: [0002-repo-hygiene](./0002-repo-hygiene.md)
