# Tasks

Catch-all task list for work not tracked in a specific [change document](changes/).

## Backlog

## Completed

- **Scope the local gates to this checkout.** `npm test`, `eslint .` and `prettier --check .` walked agent worktrees under `.claude/worktrees/`, running another branch's source against this checkout's `node_modules`; six stale worktrees produced 10837 test failures and 44282 lint errors on a clean `main` while CI, which clones fresh, stayed green. Agent scratch is now ignored in `.gitignore` (which prettier honours) with matching excludes in `vitest.config.ts`, `eslint.config.js` and `.prettierignore`, leaving trackable `.claude/` paths gated.
