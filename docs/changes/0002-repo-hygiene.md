# 0002: Repository Hygiene Bundle

## Summary

One focused clean-up pass over mechanical debt: gate the ~80 unguarded `console.*` calls behind a debug flag, fix the 5 outstanding ESLint warnings, remove the unused `sharp` production dependency, and validate dashboard-configuration imports with a zod schema. Cross-cutting; anchored to the [Architecture](../specs/architecture/) spec's quality conventions, with the import-validation piece closing an Open Question in [Dashboard Config](../specs/dashboard-config/).

**Spec:** [Architecture](../specs/architecture/)
**Status:** draft
**Depends On:** —

## Motivation

- Production consoles are noisy: 22 `console.*` calls in `src/panel.ts`, 19 in `src/hooks/useWebRTC.ts`, 13 each in `src/store/persistence.ts` and `src/services/hassConnection.ts`, plus smaller pockets — none gated by environment or flag.
- `npm run lint` reports 5 `@typescript-eslint/no-unused-vars` warnings (`CameraCard.tsx:44`, `CameraCard.tsx:54`, `CardConfig.tsx:13`, `ConnectionStatus.tsx:1`, `GridCard.tsx:53`).
- `sharp` (`package.json:53`) is a native image-processing library listed as a production dependency but referenced nowhere in `src/`, `app/`, `scripts/`, or any Vite config — dead weight in installs and dependency audits.
- Configuration import (`src/store/persistence.ts:216`) validates untrusted YAML/JSON only shallowly (`version` present + `screens` is an array) before casting to `DashboardConfig`; `zod` is already a dependency and currently unused.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before the PR is opened.
- The new import-validation behavior MUST be covered by Vitest tests (valid config accepted; malformed configs rejected with actionable errors); existing `src/store/__tests__/persistence*` suites MUST keep passing.
- Logger gating MUST be verified by at least one test asserting suppressed output when the flag is off.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Debug-gated logging

Diagnostic logging MUST be off by default in production and switchable on without a rebuild.

- The codebase MUST route diagnostic output through a small logger utility instead of bare `console.log`/`console.warn`/`console.debug`.
- The logger MUST be enabled when Vite dev mode is active, and MUST be togglable at runtime (e.g. a `localStorage` flag such as `liebe:debug`) for production debugging.
- `console.error` for genuine failures MAY remain ungated.
- All existing call sites in `src/panel.ts`, `src/hooks/useWebRTC.ts`, `src/store/persistence.ts`, `src/services/hassConnection.ts`, `src/components/ConfigurationMenu.tsx`, `src/hooks/useEntityConnection.ts`, `src/services/hass.ts`, and `src/services/staleEntityMonitor.ts` MUST be migrated or deliberately left as `console.error`.

#### Scenario: Quiet production console

- **GIVEN** a production build with no debug flag set
- **WHEN** the panel initializes, reconnects, and processes state updates
- **THEN** no diagnostic messages appear on the console (errors excepted).

#### Scenario: Runtime opt-in

- **GIVEN** a production build
- **WHEN** the user sets the debug flag in `localStorage` and reloads
- **THEN** diagnostic logging appears without rebuilding.

### Zero lint warnings

`npm run lint` MUST report 0 errors and 0 warnings.

- The 5 unused-variable warnings MUST be resolved by deletion of dead code (preferred) or `_`-prefixing where the value is intentionally unused.

#### Scenario: Clean lint run

- **GIVEN** the change is complete
- **WHEN** `npm run lint` runs
- **THEN** it exits 0 with no warnings.

### Dependency correctness

- `sharp` MUST be removed from `dependencies` after re-confirming zero references (including transitive build usage) at implementation time.
- `package-lock.json` MUST be regenerated accordingly.

#### Scenario: Build without sharp

- **GIVEN** `sharp` is removed
- **WHEN** `npm install && npm run build:ha:prod && npm test` run
- **THEN** all succeed.

### Validated configuration import

Imported dashboard configuration MUST be schema-validated before being applied.

- A zod schema mirroring `DashboardConfig`/`ScreenConfig`/`GridItem` (`src/store/types.ts`) MUST replace the shallow check in `importConfigurationFromFile` and `parseConfigurationFromFile` (`src/store/persistence.ts:216`).
- Validation failures MUST produce a user-actionable error (what field, why) surfaced through the existing import-error path; the import MUST NOT partially apply.
- Unknown extra fields SHOULD be tolerated (forward compatibility) — validate strictly on required shape, not on absence of extras.
- Version compatibility checking (`checkVersionCompatibility`, `persistence.ts:337`) MUST remain and run after shape validation.

#### Scenario: Malformed item rejected

- **GIVEN** a YAML file where a grid item lacks `x`/`y` coordinates
- **WHEN** the user imports it
- **THEN** the import is rejected with an error naming the invalid path, and the current dashboard is untouched.

#### Scenario: Valid config with extra fields

- **GIVEN** a valid config containing an unrecognized extra field
- **WHEN** the user imports it
- **THEN** the import succeeds (extras ignored or preserved, per existing round-trip behavior).

### Small correctness fixes

Two review-surfaced defects that fit this bundle:

- `TextCard` prop resolution (`src/components/TextCard.tsx:35-38`) MUST use nullish (`??`) fallback semantics per field so intentional empty/falsy values are preserved — clearing `content` MUST NOT restore the placeholder.
- The service-call failure message (`src/services/hassService.ts:73`) MUST report the true total attempt count (`retryDelays.length + 1`), matching the documented four total attempts.

#### Scenario: Cleared text stays empty

- **GIVEN** a text card whose `content` is set to an empty string
- **WHEN** the card renders in view mode
- **THEN** it renders empty content, not the "Double-click to edit" placeholder.

#### Scenario: Accurate failure message

- **GIVEN** a service call that fails on all four attempts
- **WHEN** the `ServiceCallError` is thrown
- **THEN** its message reports 4 attempts.

## Design

### Approach

- New `src/utils/logger.ts` (~30 lines): `debug`/`warn`/`error` methods; enabled = `import.meta.env.DEV || localStorage['liebe:debug']`; mechanical find-replace at call sites.
- New `src/store/configSchema.ts`: zod schemas derived from the interfaces in `src/store/types.ts`; `persistence.ts` calls `schema.safeParse` and maps `ZodError` issues to the existing error-message path.
- `package.json`: drop `sharp`.
- Lint warnings: delete dead code in the five flagged locations (each is an unused import/variable; `GridCard.tsx:53` `isStale` relates to the deliberately removed stale display — delete with a pointer to the entity-state spec).

### Decisions

- **Decision**: Remove `sharp` rather than demote to `devDependencies`.
  - **Why**: Zero references anywhere in the repo; demoting keeps dead weight.
  - **Alternatives considered**: `devDependencies` (unjustified — nothing imports it).
- **Decision**: Tolerant (non-strict) zod schemas.
  - **Why**: Configs are shared between versions; rejecting unknown fields would break forward compatibility with newer exports.
  - **Alternatives considered**: `.strict()` schemas (safer but hostile to sharing).

### Non-Goals

- No log-content rewrites or telemetry — gating only.
- No store-selector performance work ([0001](./0001-per-entity-store-selectors.md)).
- No lint-rule changes ([0003](./0003-reenable-react-hooks-rules.md)).

## Tasks

- [ ] Hygiene pass: logger utility + call-site migration, 5 lint warnings fixed, `sharp` removed, zod import validation with tests
  - [ ] `src/utils/logger.ts` with dev/localStorage gating + suppression test
  - [ ] Migrate `console.*` call sites (panel, useWebRTC, persistence, hassConnection, remaining pockets)
  - [ ] Resolve 5 `no-unused-vars` warnings
  - [ ] Remove `sharp`; regenerate lockfile; verify `build:ha:prod` + tests
  - [ ] `src/store/configSchema.ts` + `safeParse` wiring in both import paths + accept/reject tests
  - [ ] `TextCard` nullish fallbacks (`??`) with cleared-content test
  - [ ] Retry failure message reports `retryDelays.length + 1` attempts (update message + existing test expectation, and the quoted scenario in `docs/specs/entity-state/index.md`)

## Open Questions

- [ ] Should the existing in-app connection log (`ConnectionLogDialog`) consume the logger's output so gated messages remain inspectable in-app? — Default: out of scope; note as follow-up if desired.

## References

- Spec: [Architecture](../specs/architecture/)
- Spec: [Dashboard Config](../specs/dashboard-config/) (import-validation Open Question)
- Related changes: [0001-per-entity-store-selectors](./0001-per-entity-store-selectors.md), [0003-reenable-react-hooks-rules](./0003-reenable-react-hooks-rules.md)
