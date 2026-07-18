# 0006: Codecov Integration & 100% Patch Coverage

## Summary

Wire test-coverage reporting into CI via Codecov and enforce a 100% patch-coverage bar: every line changed or added by a PR MUST be covered by tests, and project-wide coverage MUST NOT decrease. Extends the [Architecture](../specs/architecture/) spec's Testing & Quality Conventions.

**Spec:** [Architecture](../specs/architecture/)
**Status:** complete
**Depends On:** —

## Motivation

- The project has a hard "passing tests" merge gate but no coverage measurement at all: no coverage provider is installed, no coverage script exists, and CI never reports what the suite actually exercises.
- Measured baseline (2026-07-18): 62.14% statements, 50.52% branches, 59.11% functions, 63.63% lines — including large fully-untested surfaces (e.g. `CameraCard.tsx`, `useWebRTC.ts`, documented as untested in the camera-streaming spec).
- The team decision is "going forward, we require 100% coverage": new and changed code must be fully covered, without blocking on a retroactive backfill of the existing gap.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before the PR is opened.
- The coverage configuration itself MUST be exercised: `npm run test:coverage` MUST produce an `lcov` report locally and in CI.
- The full Vitest suite MUST pass unchanged — adding coverage instrumentation MUST NOT alter test behavior.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Coverage measurement

- Vitest MUST produce coverage via the `v8` provider with `text` and `lcov` reporters (`@vitest/coverage-v8` as a devDependency, versioned in lockstep with `vitest`).
- Coverage MUST measure `src/` and `app/` only; test files, `tests/e2e/` (not run under Vitest), `dist/`, generated files (`*.gen.ts`), and config files MUST be excluded from the denominator.
- A `test:coverage` npm script MUST run the suite once with coverage (`vitest run --coverage`).

#### Scenario: Local coverage run

- **GIVEN** a contributor wants to check coverage before pushing
- **WHEN** they run `npm run test:coverage`
- **THEN** the suite runs once and prints a text summary, and `coverage/lcov.info` is produced.

### CI upload

- The CI `Test` job MUST run `npm run test:coverage` (replacing the bare `npm test` run — the suite still runs exactly once) and upload `coverage/lcov.info` to Codecov via the official `codecov/codecov-action`, authenticated with the `CODECOV_TOKEN` repository secret.
- The upload step MUST fail the job on upload error (`fail_ci_if_error: true`) for same-repo runs (pushes and non-fork PRs) so a silent token/config problem cannot masquerade as a passing gate; for fork PRs it MUST be best-effort (`fail_ci_if_error: false`), because forks run without the `CODECOV_TOKEN` secret and rely on codecov-action's public-repo tokenless upload — which can be rate-limited and MUST NOT brick fork CI.
- The action MUST be pinned to an immutable commit SHA with a version comment, matching the e2e workflow's pinning convention.

#### Scenario: Coverage reported on every PR

- **GIVEN** a PR targeting `main`
- **WHEN** the CI `Test` job completes
- **THEN** Codecov receives the lcov report for the head SHA and posts `codecov/patch` and `codecov/project` statuses on the PR.

### Coverage gates

- `codecov.yml` MUST configure the `patch` status with `target: 100%` — any changed/added line not executed by the suite fails the `codecov/patch` status. This is the "going forward, 100%" bar.
- `codecov.yml` MUST configure the `project` status as no-regress (`target: auto, threshold: 0%`) — total coverage may only stay equal or rise; the existing ~62% baseline is grandfathered but MUST NOT drop.
- Both statuses MUST be treated as blocking merge gates alongside tests/lint (documented in the architecture spec and the project merge-gate conventions; `informational` MUST NOT be enabled).
- Docs-only and non-code changes MUST NOT be failed by the gates (codecov only evaluates coverable lines; no special-casing required).

#### Scenario: Uncovered new line blocks merge

- **GIVEN** a PR that adds a function with an untested branch
- **WHEN** Codecov evaluates the diff
- **THEN** `codecov/patch` reports < 100% and fails, and the PR MUST NOT be merged until the gap is covered.

#### Scenario: Coverage regression blocks merge

- **GIVEN** a PR that deletes tests for otherwise-unchanged code
- **WHEN** Codecov compares project coverage against the base
- **THEN** `codecov/project` fails on the drop.

### Documentation

- The [Architecture](../specs/architecture/) spec's Testing & Quality Conventions MUST document the coverage bar (100% patch, no-regress project) and the `test:coverage` script in the same PR.
- The project `CLAUDE.md` pre-commit checklist MUST mention the patch-coverage requirement so contributors run coverage before opening PRs.

## Design

### Approach

- `package.json`: add `@vitest/coverage-v8`, add `test:coverage` script.
- `vitest.config.ts`: `coverage` block — provider `v8`, reporters `['text', 'lcov']`, include `src/**` + `app/**`, exclude tests/e2e/config/generated files.
- `.github/workflows/ci.yml`: Test job runs `npm run test:coverage`; new SHA-pinned `codecov/codecov-action` upload step with `token: ${{ secrets.CODECOV_TOKEN }}`, `files: coverage/lcov.info`, `fail_ci_if_error: true`.
- `codecov.yml` (repo root): patch target 100%, project auto/0% threshold; comment layout default.
- Spec + CLAUDE.md updates per Documentation requirements.

### Decisions

- **Decision**: Enforce 100% on **patch** coverage, not project-wide.
  - **Why**: Baseline is ~62%; a project-wide 100% gate would fail every PR until a massive backfill (including the ~1400-line camera surface) lands. "Going forward" semantics are exactly what codecov's patch status implements. The no-regress project status prevents backsliding meanwhile.
  - **Alternatives considered**: Project-wide 100% (blocks all work behind a backfill); vitest-level `thresholds` (all-or-nothing on totals, cannot express diff-scoped enforcement).
- **Decision**: Upload only from the `Test` job (unit suite), not the e2e job.
  - **Why**: e2e runs in a real browser against a container; its coverage is not collectable via v8 instrumentation without substantial extra machinery, and the patch bar is defined against the unit suite.

### Non-Goals

- No backfill of the existing coverage gap (a future change may schedule it).
- No coverage collection from Playwright e2e runs.
- No branch-protection/required-check configuration changes (repository settings, not code).

## Tasks

- [x] Add coverage tooling, Codecov upload, gates, and doc updates (single PR)
  - [x] `@vitest/coverage-v8` + `test:coverage` script + `vitest.config.ts` coverage block
  - [x] CI Test job coverage run + SHA-pinned codecov-action upload with `CODECOV_TOKEN`
  - [x] `codecov.yml`: patch 100%, project no-regress
  - [x] Architecture spec Testing & Quality Conventions + CLAUDE.md checklist updates

## Open Questions

None. (The patch-vs-project decision was made explicitly: patch 100%, project no-regress, no backfill obligation.)

## References

- Spec: [Architecture](../specs/architecture/) (Testing & Quality Conventions)
- External: Codecov status checks — https://docs.codecov.com/docs/commit-status
- External: Vitest coverage — https://vitest.dev/guide/coverage
