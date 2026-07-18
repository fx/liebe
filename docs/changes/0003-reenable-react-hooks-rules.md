# 0003: Re-enable react-hooks v7 Lint Rules

## Summary

Gradually re-enable the five `eslint-plugin-react-hooks` v7 rules that were disabled wholesale during the December 2025 ESLint upgrade, fixing each rule's violations as it is turned on. Anchored to the [Architecture](../specs/architecture/) spec's linting conventions.

**Spec:** [Architecture](../specs/architecture/)
**Status:** draft
**Depends On:** —

## Motivation

- `eslint.config.js:36-42` disables five rules introduced by react-hooks v7 with the comment "Disable new experimental React Compiler rules from react-hooks v7": `react-hooks/refs`, `react-hooks/static-components`, `react-hooks/set-state-in-effect`, `react-hooks/incompatible-library`, `react-hooks/preserve-manual-memoization`.
- These rules catch real defect classes (stale refs, components recreated per render, render loops from effect-setState, memoization broken by dependency mistakes) that matter in a dashboard dominated by subscriptions and live updates.
- The disable was explicit deferred debt ("enable gradually") from PR #153; seven months later nothing has been re-enabled.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before each PR is opened.
- Any behavioral fix made to satisfy a rule (not a pure annotation/refactor) MUST be covered by a test demonstrating the corrected behavior.
- The full Vitest suite MUST pass after every rule enablement — rule fixes MUST NOT change observable component behavior except where a genuine bug is fixed (and then the test proves the fix).

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Rules enabled with zero violations

Each of the five rules MUST end enabled (at least at `warn`, target `error`) in `eslint.config.js` with zero remaining violations in `src/` and `app/`.

- Rules MUST be enabled incrementally (per-rule or small groups), each enablement accompanied by the fixes it requires, so review stays tractable.
- Fixes MUST address the underlying issue; per-line `eslint-disable` suppressions MAY be used only with a justification comment naming the rule and reason, and SHOULD be rare.
- The audit MUST also revisit existing `react-hooks/exhaustive-deps` suppressions (e.g. `src/hooks/useEntity.ts:37`) and remove any made obsolete by concurrent work.

#### Scenario: Rule enablement is clean

- **GIVEN** a rule flipped from `'off'` to `'error'` with its violations fixed
- **WHEN** `npm run lint` runs
- **THEN** it exits 0 with no errors or warnings.

#### Scenario: Behavior preserved

- **GIVEN** the fixes for one rule group
- **WHEN** `npm test` runs
- **THEN** the full suite passes without test modifications, except tests added to cover genuine bug fixes.

#### Scenario: Justified suppression

- **GIVEN** a violation that cannot be fixed without disproportionate refactoring
- **WHEN** a reviewer inspects the suppression
- **THEN** they find a same-line/adjacent comment naming the rule and the concrete reason it is safe.

## Design

### Approach

1. Audit first: enable all five rules locally, capture the violation inventory per rule/file, and size each fix.
2. Land in two groups, each its own PR:
   - **Group A (structural):** `react-hooks/refs`, `react-hooks/static-components`, `react-hooks/incompatible-library` — typically mechanical fixes (hoist components, correct ref usage, annotate library interop).
   - **Group B (stateful):** `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization` — these can force real restructuring of effects/memoization and deserve isolated review.
3. Group B SHOULD land after change [0001](./0001-per-entity-store-selectors.md) if both are in flight, since 0001 rewrites the memoization in `src/hooks/useEntity.ts` that this audit would otherwise touch.

### Decisions

- **Decision**: Fix-and-enable per group rather than enabling at `warn` repo-wide first.
  - **Why**: Standing warnings rot (the current 5-warning baseline proves it); the conventions target is zero warnings.
  - **Alternatives considered**: Enable all at `warn` and burn down over time (normalizes a yellow lint run); enable all at once (one unreviewable PR).

### Non-Goals

- Adopting the React Compiler itself.
- Any rule changes beyond these five react-hooks rules.

## Tasks

- [x] Group A: enable `react-hooks/refs`, `react-hooks/static-components`, `react-hooks/incompatible-library`; fix all violations
  - [x] Violation inventory committed to the PR description
  - [x] Fixes + any justified suppressions
- [ ] Group B: enable `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization`; fix all violations; revisit stale `exhaustive-deps` suppressions

## Open Questions

- [ ] Final severity: `error` for all five, or keep compiler-preview rules at `warn`? — Default: `error`, matching the zero-warning bar.

## References

- Spec: [Architecture](../specs/architecture/)
- Related changes: [0001-per-entity-store-selectors](./0001-per-entity-store-selectors.md), [0002-repo-hygiene](./0002-repo-hygiene.md)
- External: react-hooks v7 release notes — https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks
