# 0005: Dockerized Home Assistant E2E Environment

## Summary

Add a self-contained, dockerized Home Assistant instance that loads the real built Liebe panel as a `panel_custom` and a Playwright suite that logs in and verifies the panel end-to-end in a real browser. Runnable locally and in CI. Supports the [Architecture](../specs/architecture/) spec's testing conventions by giving the project true integration coverage against a real HA, not mocks.

**Spec:** [Architecture](../specs/architecture/)
**Status:** complete
**Depends On:** —

## Motivation

The existing suite is all `vitest` unit/component tests with a mocked `hass` object. Nothing exercises the panel as Home Assistant actually loads it: the `panel_custom` registration, the shadow-DOM mount, the websocket connection, live entity state, and real service calls. Regressions in the panel lifecycle, the auth/callback path, or the entity-state pipeline can pass every unit test and still break in a real HA. A reproducible, dockerized HA with deterministic fake devices closes that gap and lets both contributors and CI prove the panel works before merge.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before the PR is opened; the e2e `.ts` files are typechecked and linted like the rest of the repo.
- The e2e suite MUST NOT be picked up by the `vitest` unit runner; `vitest` MUST exclude `tests/e2e/**`.
- E2E assertions MUST be made against the live DOM / accessibility tree, REST/websocket state, and console output — never against screenshots.
- The e2e suite MUST pass against the dockerized HA stack both from a cold (freshly onboarded) instance and a persisted one, and MUST be deterministic across repeat runs.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Dockerized Home Assistant with the panel mounted

- The environment MUST run a pinned Home Assistant image serving on `:8123`, with the built `dist/` mounted read-only and served at `/local/dist/panel.js`.
- HA MUST register the panel via `panel_custom` using the production custom-element name (`liebe-panel`) and render it inline (not in an iframe).
- Runtime state (`.storage`, logs, DBs) MUST be gitignored; only `configuration.yaml` is committed.
- The instance MUST expose deterministic helper entities (`input_boolean`, `input_number`, `input_select`, `input_text`, `input_datetime`, template sensors) alongside the `demo` integration's devices.

#### Scenario: Panel loads inline against real HA

- **GIVEN** the compose stack is up and onboarded
- **WHEN** a browser opens `/liebe` with a valid auth callback
- **THEN** the `liebe-panel` custom element mounts inline, its websocket reports connected, and the demo entities are available with no fatal console errors.

### Deterministic onboarding + auth

- A zero-dependency Node script (`scripts/onboard.mjs`) MUST onboard a fresh instance and, on an already-onboarded instance, fall back to password login — producing both a REST access token and an unused auth code for the panel's `?auth_callback=1` URL.

#### Scenario: Idempotent onboarding

- **GIVEN** either a fresh or a persisted HA instance
- **WHEN** `scripts/onboard.mjs` runs
- **THEN** it returns a working access token and a fresh single-use panel auth code either way.

### End-to-end panel behavior

- Tests MUST cover: panel loads/connects; a seeded dashboard renders demo entity cards; a card reacts to an external REST state change without reload; and clicking a card issues a service call that changes HA state (verified via REST).
- The suite MUST seed the dashboard deterministically via the app's `liebe-config` localStorage key rather than driving edit-mode UI.

#### Scenario: State reactivity

- **GIVEN** the panel is showing a seeded `input_boolean` card
- **WHEN** the entity is toggled via the HA REST API
- **THEN** the card's switch updates from the websocket push without a page reload.

### Local and CI runnability

- npm scripts MUST provide `e2e:ha:up`, `e2e:ha:down`, `e2e`, and `e2e:full` without altering the existing `dev`/`test` scripts.
- A GitHub Actions workflow MUST, on pull requests, build the prod panel, bring up the stack, run the suite, and upload the Playwright report on failure.

## Design

### Approach

- `ha/docker-compose.yml` pins `ghcr.io/home-assistant/home-assistant:2026.7.2`, maps `:8123`, sets `TZ=UTC`, mounts `./config:/config` and `../dist:/config/www/dist:ro`, and healthchecks `/manifest.json` with a 60s `start_period` so `up -d --wait` blocks until ready.
- `ha/config/configuration.yaml` enables `default_config`, `demo`, the `panel_custom` entry (`name: liebe-panel`, `url_path: liebe`, `module_url: /local/dist/panel.js`, `embed_iframe: false`), and the deterministic helpers + template sensors. `ha/config/.gitignore` ignores everything but `configuration.yaml`.
- `scripts/onboard.mjs` is both a CLI and an importable module (guarded `main`). Playwright's `globalSetup` waits for HA and ensures onboarding; per-test helpers mint a fresh single-use auth code per navigation because HA does not persist tokens for externally-authed panels.
- Tests live in `tests/e2e/` and assert against the panel's open shadow root and REST/websocket state. `vitest.config.ts` excludes `tests/e2e/**`; `.prettierignore` excludes HA runtime state; the eslint JS block covers `.mjs`.
- `.github/workflows/e2e.yml` runs the whole flow on PRs with pinned actions and uploads the report artifact on failure.

### Decisions

- **Decision**: Use the production build (`build:ha:prod`) and `name: liebe-panel` so the mounted element name matches what the bundle defines; the dev bundle uses `liebe-panel-dev`.
- **Decision**: Seed the dashboard via the `liebe-config` localStorage key (read synchronously on panel load) rather than automating drag-and-drop — deterministic and fast.
- **Decision**: Click the card body, not the Radix switch, for the service-call test — clicking the switch bubbles to the card's `onClick` and double-toggles (a net no-op).
- **Decision**: Run e2e serially (`workers: 1`) since all tests share one HA instance and mutate shared entity state.

### Non-Goals

- Testing the edit-mode UI (drag/drop, card config modals) end-to-end.
- Multi-browser/device coverage; the suite runs Chromium only.
- Replacing any existing unit/component tests.

## Tasks

- [x] Dockerized HA compose + `configuration.yaml` with demo integration, `panel_custom`, deterministic helpers, and gitignored runtime state
- [x] `scripts/onboard.mjs` idempotent onboarding/login producing access token + panel auth code
- [x] Playwright config, global setup, helpers, and the four e2e specs against real HA
- [x] npm scripts (`e2e`, `e2e:ha:up`, `e2e:ha:down`, `e2e:full`), vitest/eslint/prettier config alignment
- [x] GitHub Actions `e2e.yml` workflow and contributor docs

## Open Questions

- None.

## References

- Spec: [Architecture](../specs/architecture/)
- HA onboarding + auth: `scripts/onboard.mjs`
- External: [Custom Panels](https://developers.home-assistant.io/docs/frontend/custom-ui/creating-custom-panels/), [HA demo integration](https://www.home-assistant.io/integrations/demo/)
