# Project Architecture

## Overview

Liebe is a Home Assistant custom-panel dashboard delivered as a single self-contained IIFE bundle (`panel.js`) that Home Assistant loads via `panel_custom`. The application MUST be built with React 19 and TanStack Start in SPA mode, styled with Radix UI Themes, and MUST compile to a browser-global library that registers a custom element (`liebe-panel` in production, `liebe-panel-dev` in development). This document is the living baseline for project-level architecture — tech stack, repository layout, build system, environment configuration, developer workflow, testing/linting conventions, and deployment. Feature behavior (panel lifecycle, entity state, cards, grid, navigation) is out of scope here and is covered by the linked feature specs.

## Background

Liebe (`package.json:2`, version `0.1.0`, private, MIT-licensed) exists to give Home Assistant a touch-first, in-panel-configurable dashboard that ships as one file users can drop into their instance or load from GitHub Pages. Two constraints shape the entire build architecture:

1. **Home Assistant loads panels as classic scripts, not ES modules by default.** The production artifact MUST therefore be an IIFE (`formats: ['iife']`) that self-registers a custom element and inlines all dynamic imports and CSS (`vite.config.ha.ts:19-38`).
2. **The panel and the standalone SPA share the same source.** `src/panel.ts` is the panel entry (custom-element wrapper) while TanStack Start drives a standalone SPA dev experience. The dev server therefore runs the Start SPA _and_ an in-process nested Vite build that produces a live `panel.js` for Home Assistant to load over HTTP (`vite.config.ts:8-160`).

The result is two Vite configurations: `vite.config.ts` for local development (Start SPA + nested panel build plugin) and `vite.config.ha.ts` for the shippable library build. A third build mode (`build:ha:prod`) minifies for GitHub Pages.

Related feature specs (project-level document links; these live as sibling directories):

- Panel lifecycle & custom-element wrapper — [`../panel-lifecycle/`](../panel-lifecycle/)
- Entity state & Home Assistant connection — [`../entity-state/`](../entity-state/)
- Dashboard configuration & YAML — [`../dashboard-config/`](../dashboard-config/)
- Grid layout — [`../grid-layout/`](../grid-layout/)
- Entity cards — [`../entity-cards/`](../entity-cards/)
- Camera streaming — [`../camera-streaming/`](../camera-streaming/)
- Navigation & screens — [`../navigation/`](../navigation/)

## Requirements

### Tech Stack

- The project MUST use React 19 (`react`/`react-dom` `^19.2.1`) with the automatic JSX runtime (`vite.config.ts:130`, `tsconfig.json` `"jsx": "react-jsx"`).
- Routing MUST use TanStack Router / TanStack Start in SPA mode (`@tanstack/react-start` `^1.160.0`, `tanstackStart({ spa: { enabled: true } })` at `vite.config.ts:138-142`).
- Global state MUST use TanStack Store (`@tanstack/react-store` `^0.9.3`).
- UI MUST use Radix UI Themes (`@radix-ui/themes` `^3.2.1`) as the primary component system, per project AGENTS.md styling rules.
- Grid layout MUST use `react-grid-layout` `^1.5.2`.
- Home Assistant connectivity MUST use `home-assistant-js-websocket` `^9.5.0`.
- YAML import/export MUST use `js-yaml` `^4.1.0`; runtime schema validation MAY use `zod` `^3.24.2`.
- All new source files MUST be TypeScript (`.ts`/`.tsx`) under `strict` mode (`tsconfig.json`).

#### Scenario: Adding a UI component

- **GIVEN** a developer needs a new interactive control
- **WHEN** they select a component library
- **THEN** they use Radix UI Themes components with default styling and props (no custom CSS unless unavoidable), rather than introducing a new UI dependency.

### Repository & Directory Structure

- Application source MUST live under `src/`, with the `~/*` path alias mapping to `./src/*` (`tsconfig.json` `paths`, mirrored in every Vite/Vitest config).
- Feature code MUST be organized by concern: `src/components/` (UI, incl. `WeatherCard/`, `configurations/`, `ui/`, `widgets/`), `src/hooks/`, `src/services/`, `src/store/`, `src/routes/`, `src/contexts/`, `src/utils/`, `src/types/`, `src/config/`, `src/styles/`.
- The custom-element entry MUST be `src/panel.ts`; the SPA router MUST be `src/router.tsx`; the generated route tree (`src/routeTree.gen.ts`) MUST NOT be hand-edited and is lint-ignored (`eslint.config.js` ignores `*.gen.ts`).
- Component-specific code SHOULD be colocated in the component's own folder (e.g. `WeatherCard/`) rather than dumped into `src/utils/`, per project AGENTS.md.

#### Scenario: Locating panel environment logic

- **GIVEN** a developer needs to know the element name or URL path for an environment
- **WHEN** they look for panel configuration
- **THEN** they find it centralized in `src/config/panel.ts`, which is the single source consumed by `src/panel.ts` and `src/router.tsx`.

### Build System

- `npm run dev` MUST start the Vite dev server on port `3000` with permissive CORS, running the TanStack Start SPA plus the `dev-panel-plugin` that builds and serves `panel.js`/`liebe.css` in-process (`vite.config.ts:144-162`, `package.json` scripts).
- `npm run build` MUST produce the standard Vite build and then run `tsc --noEmit` (`package.json`: `"build": "vite build && tsc --noEmit"`).
- `npm run build:ha` MUST build the Home Assistant panel library via `vite.config.ha.ts` in development mode (unminified, with sourcemaps).
- `npm run build:ha:prod` MUST build the same library with `--mode production` (minified, no sourcemaps) into `dist/` (`package.json`, `vite.config.ha.ts:8-16`).
- The Home Assistant build MUST emit an IIFE named `Liebe`, entry `src/panel.ts`, filename `panel.js`, with `inlineDynamicImports: true` and `cssCodeSplit: false` so the panel is a single JS file plus one CSS file (`vite.config.ha.ts:19-42`).
- The dev panel plugin MUST rebuild `panel.js` on changes to files under `src/` (excluding `.test.` files) and trigger a full reload (`vite.config.ts:99-107`).

#### Scenario: Dev server serves a live panel to Home Assistant

- **GIVEN** `npm run dev` is running
- **WHEN** Home Assistant requests `http://localhost:3000/panel.js`
- **THEN** the middleware returns the freshly built IIFE bundle with `Content-Type: application/javascript`, `Access-Control-Allow-Origin: *`, and `Cache-Control: no-cache` (`vite.config.ts:110-118`).

#### Scenario: Production library build

- **GIVEN** a release to GitHub Pages
- **WHEN** `npm run build:ha:prod` runs
- **THEN** `dist/panel.js` is a minified IIFE and `dist/liebe.css` contains the concatenated styles (`assetFileNames: '[name][extname]'`, `cssCodeSplit: false`).

### Environment Configuration

- Panel identity MUST be environment-derived in `src/config/panel.ts` from `process.env.NODE_ENV`: development yields element `liebe-panel-dev` / path `/liebe-dev`; production yields `liebe-panel` / `/liebe` (`src/config/panel.ts:11-30`).
- All known panel paths MUST be exposed via `getAllPanelPaths()` (`['/liebe', '/liebe-dev']`) and consumed by route base-path detection (`src/router.tsx` uses `getPanelBasePath`).
- The Home Assistant build MUST define `process.env.NODE_ENV`, `process.env`, and `process` at build time so the bundle runs standalone in the browser without a Node global (`vite.config.ha.ts:9-13`).
- Local secrets (Home Assistant URL/credentials used for MCP browser testing) MUST live in `.env.local`, which MUST NOT be committed (ignored via `.gitignore` `.env`, `.env.local`, `.env.*.local`). Note: no `.env.local` values are read by application source today — the file is a tooling/testing convention (see Open Questions).

#### Scenario: Both panels coexist in one Home Assistant instance

- **GIVEN** a developer wants dev and prod panels side by side
- **WHEN** they register `liebe-panel-dev` (dev build) and `liebe-panel` (prod build)
- **THEN** the two builds register distinct custom-element names and distinct URL paths, so neither collides.

### Development Workflow

- Toolchain versions MUST be managed with mise; Node MUST be v22 (`mise.toml`).
- Developers SHOULD run `mise install` then `npm install` after cloning (`README.md`, `CONTRIBUTING.md`).
- Home Assistant integration testing MUST point `panel_custom.module_url` at the dev server's `panel.js`; the dev element name is `liebe-panel-dev` (project AGENTS.md, README).

#### Scenario: Wiring the dev panel into Home Assistant

- **GIVEN** the dev server is running on port 3000
- **WHEN** the developer adds a `panel_custom` entry with `module_url: http://localhost:3000/panel.js` and name `liebe-panel-dev`
- **THEN** Home Assistant loads the live-rebuilding panel after a restart.

### Testing & Quality Conventions

This subsection is the project's standing testing and quality bar; other specs link here rather than restating it.

- Every pull request MUST have passing tests, lint, and type checks before merge; PRs with failing tests MUST NOT be merged (project AGENTS.md, "Where the workflow lives").
- Before creating any PR, a contributor MUST run `npm test`, `npm run lint`, and `npm run typecheck`, and all three MUST pass.
- Tests MUST run under Vitest with the `jsdom` environment, globals enabled, and the shared setup file `src/test/setup.ts` (`vitest.config.ts:6-11`).
- Component tests MUST use `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event`; the setup file MUST provide jsdom polyfills for `matchMedia`, `ResizeObserver`, `scrollIntoView`, and pointer-capture (required by Radix Slider) (`src/test/setup.ts:5-45`).
- Test files MUST be excluded from the dev panel rebuild and colocated as `*.test.ts(x)` (dev plugin skips `.test.`; tests live in `__tests__/` folders across `components`, `hooks`, `services`, `store`, `routes`, `utils`).
- `npm run lint` MUST be treated as the composite gate it is: it runs `tsc --noEmit`, then `eslint . --ext .ts,.tsx`, then `prettier --check .` (`package.json`).
- CI MUST enforce these gates: the `test` job runs `npm run test:coverage` and the `lint` job runs `npm run lint` on every push to `main` and every PR targeting `main` (`.github/workflows/ci.yml`).
- The `pre-push` git hook MUST run typecheck, lint, and `npm test -- --run` and MUST block the push on any failure (`.husky/pre-push`).
- Coverage MUST be measured on every CI test run (`npm run test:coverage`, Vitest `v8` provider, `lcov` report uploaded to Codecov) and enforced as two blocking PR statuses: `codecov/patch` MUST be 100% — every line added or changed by a PR MUST be covered by tests — and `codecov/project` MUST NOT regress (`codecov.yml`, change 0006). Weakening either gate to land a PR is a defect in the PR.
- Contributors SHOULD run `npm run test:coverage` before opening a PR to check the patch bar locally.
- The default per-test timeout (`vitest.config.ts`) MUST leave headroom over the slowest legitimate assertion in the suite as measured **under coverage instrumentation on a contended machine**, not on an idle one — a budget a correct test can exhaust reports slowness as failure, and a suite that fails a different set of tests on each run teaches contributors to re-run rather than to read the result. A spec that genuinely needs longer than the default MUST declare its own budget per test rather than raising the default for everything (change 0040).

#### Scenario: Opening a pull request

- **GIVEN** a contributor has finished a change
- **WHEN** they attempt to push and open a PR
- **THEN** the pre-push hook runs typecheck + lint + tests locally, and the GitHub `CI` workflow re-runs the `test` and `lint` jobs; the PR cannot merge unless all pass.

#### Scenario: Uncovered new code blocks merge

- **GIVEN** a PR whose diff contains a line no test executes
- **WHEN** CI uploads the lcov report and Codecov evaluates the diff
- **THEN** the `codecov/patch` status reports below 100% and fails, blocking merge until the new code is covered.

#### Scenario: Writing a card test

- **GIVEN** a Radix-based card that uses a slider or measures layout
- **WHEN** its test renders in jsdom
- **THEN** the polyfills in `src/test/setup.ts` provide `ResizeObserver`, `matchMedia`, and pointer-capture so the component mounts without throwing.

### End-to-End Harness

The Playwright suite drives the built panel inside a real, dockerized Home Assistant instance (`ha/docker-compose.yml`, change [0005](../../changes/0005-dockerized-ha-e2e.md)). CI is the gate for a merge decision; the requirements below are what makes a local run safe to take alongside other checkouts of the same repository.

- Two checkouts of the repository MUST be able to run the suite at the same time without either observing the other: no containers, volumes, bind mounts, published ports or entity state in common. Each checkout's stack MUST be identified by its own path, so the same checkout addresses the same stack on every invocation with nothing on disk to get out of sync.
- The suite MUST address the instance its own checkout started, not whichever instance is reachable at a conventional address.
- Where isolation depends on a bounded resource, exhausting it MUST fail loudly rather than fall back to sharing: startup MUST refuse to take a published port it does not already own, naming the port. An explicit override MUST be available as the resolution, and an override that cannot work MUST be rejected at startup rather than silently ignored or deferred to a later error — a rejected override leaves one instance, a fallback leaves two.
- Startup MUST NOT take over a stack it does not own, and MUST NOT add a second stack to a checkout that already has one running under another identity — two instances mounting one writable Home Assistant configuration directory share its database and storage, and the artifact check below cannot see that, since both serve the same build. Either case MUST exit naming what it found.
- Scripted startup MUST distinguish a docker daemon that is missing, unreachable, unpermitted, or lacking the compose v2 plugin, and exit naming which of those it is. A permission-denied socket reports both "permission denied" and "cannot connect to the daemon", so reachability MUST NOT be diagnosed ahead of permission.
- The suite MUST refuse to run against artifacts it did not build: global setup compares every artifact the instance serves under the `module_url` its configuration declares against the local build, skipping only the allowlisted dev-server endpoint and failing closed on anything else (change 0040). This holds independently of the isolation above — a contaminated run is indistinguishable from a clean one, so a mismatch MUST invalidate the run rather than be scored by it.

How this is met today (implementation, not contract): `scripts/e2eStack.mjs` derives the compose project name from a hash of the checkout's absolute path and both published ports from a bounded slot window over the same hash; before starting it reconciles `docker compose ls` against its own compose file, so a project of its name built from another checkout and a stack of its own under an older name are both caught; `playwright.config.ts` and `scripts/onboard.mjs` read that derivation instead of a literal port; `tests/e2e/bundleIdentity.ts` hashes served against built artifacts. Compose services carry no fixed `container_name` — a container name is global to the daemon and would collide across projects however the project is named.

#### Scenario: Two worktrees run the suite at the same time

- **GIVEN** two checkouts of the repository at different paths, each with its own built `dist/`, whose stacks were both able to claim their published ports
- **WHEN** both run `npm run e2e:ha:up` and then the suite
- **THEN** each addresses its own compose project on its own ports, serving its own bundle and its own Home Assistant configuration, and neither run observes the other's state.

#### Scenario: Two checkouts want the same port

- **GIVEN** one checkout's stack is already published on a port a second checkout would also publish on
- **WHEN** the second runs `npm run e2e:ha:up`
- **THEN** it exits non-zero naming the port rather than starting, and succeeds once given an explicit port override — at no point do the two share an instance.

#### Scenario: The docker daemon is not usable

- **GIVEN** a workspace whose docker daemon is stopped, or whose user is not in the `docker` group
- **WHEN** the developer runs `npm run e2e:ha:up`
- **THEN** startup exits non-zero with a message naming which of the two it is and the command that fixes it, rather than surfacing a raw socket error.

### Linting & Formatting

- ESLint MUST use the flat-config file `eslint.config.js` (ESLint 9), composing `@eslint/js` recommended, `@typescript-eslint` recommended (type-aware via `parserOptions.project`), `eslint-plugin-react` recommended, and `eslint-plugin-react-hooks` recommended, with `eslint-config-prettier` last to disable stylistic conflicts (`eslint.config.js:1-79`).
- Prettier MUST enforce: no semicolons, single quotes, 2-space tabs, `es5` trailing commas, 100-char print width, always-parenthesized arrow params (`.prettierrc`).
- The pre-commit hook MUST run `lint-staged`, which runs `eslint --fix` + `prettier --write` on staged `*.{ts,tsx}` and `prettier --write` on staged `*.{json,md,yml,yaml}` (`.husky/pre-commit`, `package.json` `lint-staged`).
- Generated and build output (`*.gen.ts`, `dist/`, `.output/`, `.tanstack/`, `.nitro/`, `.vite-temp/`, `node_modules/`) MUST be excluded from linting (`eslint.config.js` `ignores`).

#### Scenario: React Compiler rules are enforced

- **GIVEN** `eslint-plugin-react-hooks` v7 ships experimental React Compiler rules
- **WHEN** ESLint runs
- **THEN** all five rules — `react-hooks/refs`, `static-components`, `incompatible-library`, `set-state-in-effect`, and `preserve-manual-memoization` — are enabled at `error` (change 0003), so a hooks violation fails the lint gate (`eslint.config.js:36-41`).

### Deployment

- The panel MUST be published to GitHub Pages at `https://fx.github.io/liebe/` on every push to `main` (and via manual `workflow_dispatch`) (`.github/workflows/deploy.yml`, `package.json` `homepage`).
- The deploy workflow MUST build with `npm run build:ha:prod`, generate a `dist/index.html` landing page from `README.md` (rendered with `marked`), and publish `dist/` via `actions/upload-pages-artifact` + `actions/deploy-pages` (`.github/workflows/deploy.yml`).
- Deploys MUST use the `pages` concurrency group with `cancel-in-progress: false` so in-flight production deployments complete (`.github/workflows/deploy.yml`).

#### Scenario: Merge to main ships the panel

- **GIVEN** a PR is merged to `main`
- **WHEN** the Deploy workflow runs
- **THEN** `dist/panel.js`, `dist/liebe.css`, and a generated `index.html` are published to GitHub Pages, and consumers loading `module_url: https://fx.github.io/liebe/panel.js` receive the new build.

## Design

### Architecture

Two build targets, one source tree:

```
                 ┌────────────────────────────┐
   npm run dev → │ vite.config.ts             │
                 │  ├─ tanstackStart (SPA)     │→ localhost:3000  (standalone SPA)
                 │  └─ panelPlugin (nested     │→ /panel.js, /liebe.css  (for HA)
                 │      dev IIFE build)        │
                 └────────────────────────────┘
                 ┌────────────────────────────┐
 build:ha[:prod] │ vite.config.ha.ts (lib)    │→ dist/panel.js (IIFE "Liebe")
                 │  entry src/panel.ts         │   dist/liebe.css
                 └────────────────────────────┘
```

`src/panel.ts` is the shared entry: it registers the custom element, imports all CSS (`@radix-ui/themes/styles.css`, `react-grid-layout`, `react-resizable`, `~/styles/app.css`), and mounts the React tree via `HomeAssistantProvider` + `PanelApp`. Detailed lifecycle behavior is in [`../panel-lifecycle/`](../panel-lifecycle/).

The dev panel plugin (`vite.config.ts:8-127`) is the notable non-obvious piece: inside the running dev server it invokes the Vite JS `build()` API a second time (`configFile: false`, IIFE, `inlineDynamicImports`) to compile `src/panel.ts` into an in-memory string, then serves that string from `/panel.js` middleware and re-runs it on `src/` file changes. This lets a real Home Assistant instance load a hot-rebuilding panel from `localhost:3000` while the developer also has the standalone SPA.

### API Surface

Environment/config API from `src/config/panel.ts`:

```typescript
getPanelConfig(): { elementName, urlPath }   // env-derived (NODE_ENV)
getAllPanelPaths(): string[]                 // ['/liebe', '/liebe-dev']
isPanelPath(pathname: string): boolean
getPanelBasePath(pathname: string): string | undefined  // used by router basepath
```

`src/router.tsx` derives the TanStack Router `basepath` from `getPanelBasePath(window.location.pathname)` so the SPA routes correctly whether mounted at `/liebe` or `/liebe-dev`.

### Business Logic

Build-mode branching is entirely `NODE_ENV`/`--mode`-driven:

- `vite.config.ha.ts:8` — `const isProduction = mode === 'production'` gates `minify` and `sourcemap`, and `emptyOutDir`.
- `src/config/panel.ts:12` — `process.env.NODE_ENV !== 'production'` selects the dev element/path.
- The HA config statically defines `process`/`process.env`/`process.env.NODE_ENV` (`vite.config.ha.ts:9-13`) so the IIFE has no Node dependency at runtime.

## Constraints

- The Home Assistant artifact MUST remain a single IIFE with inlined dynamic imports and non-split CSS; ES-module or multi-chunk output would break `panel_custom` loading.
- Custom-element names are fixed contracts with users' `configuration.yaml`: `liebe-panel` (prod) and `liebe-panel-dev` (dev) MUST NOT change without a migration note, since they are referenced by `panel_custom.name`.
- Node 22 is the supported toolchain for both local dev (`mise.toml`) and CI (`.github/workflows/*` use `node-version: 22`).
- The dev server binds to port 3000; per project convention alternate ports MUST NOT be used.
- Radix UI Themes is a relatively closed system; custom CSS and arbitrary z-index values are discouraged (project AGENTS.md styling rules).

## Open Questions

- **`sharp` in runtime dependencies.** `sharp@^0.34.3` is listed under `dependencies` (not `devDependencies`) in `package.json`, but the shipped panel is a browser IIFE and cannot use a native Node image library. It appears to be dead/misplaced for the panel build; whether any tooling path needs it is unverified.
- **`.env.local` has no application consumer.** Project docs reference `.env.local` (HA URL/credentials) for MCP browser testing, but no application source reads `import.meta.env`/`process.env` for those values — the file is a testing convention only, so its documented `HASS_*` keys are not load-bearing for the build.
- **Two test-setup files.** `vitest.config.ts` references `./src/test/setup.ts`, but a second file `src/test-setup.ts` also exists at the source root; the latter is not wired into the Vitest config and its status (stale vs. intentional) is unverified.
- **CI uses `npm install`, not `npm ci`.** The CI workflow (`.github/workflows/ci.yml`) runs `npm install` while the deploy workflow uses `npm ci`; the inconsistency means CI does not strictly honor the lockfile.
- **No browser baseline is stated, and the two the build applies disagree.** [PRD](../../PRD.md) says "modern browsers only" with no version. That reads as "nothing is stated", and it is not: **Vite states one on the project's behalf.** `package.json` carries no `browserslist`, there is no `.browserslistrc`, and `vite.config.ts` sets no `build.target` — so Vite's default applies, `'baseline-widely-available'`, which on the pinned Vite 7 resolves to `chrome107, edge107, firefox104, safari16` — read from the installed package rather than from documentation, since the resolution is a constant in the release actually in the lockfile. Every production build down-levels JavaScript to that.

  **That target governs JavaScript only, and the CSS ships above it.** `css.transformer` is unset, so nothing lowers CSS _syntax_ — `vite/baselineCssPlugin.ts` rewrites layer structure and does not translate features — and the panel uses `@layer` (25 files), `color-mix()` (4), `@property` (1) and `:has()` (1) with no fallback. A browser at the stated floor therefore receives JavaScript compiled for it and a stylesheet it cannot fully parse. The inconsistency is a defect whichever number is eventually chosen.

  Measured against `caniuse-lite@1.0.30001806` (global usage share, and a snapshot that goes stale — re-read it rather than citing these figures): `@layer` 93.93% supported / 3.00% not; `:has()` 92.66% / 4.27%; relative colour syntax — used only behind `@supports`, so it bounds a fallback rather than the floor — 82.83% / 14.10%. `contrast-color()` is not among that release's 583 tracked features at all, which is itself the answer to how new it is.

  **Why this is worth deciding rather than leaving implicit.** A progressive-enhancement decision cannot be evaluated against an unstated baseline: [0035](../../changes/0035-light-appearance-contrast.md) PR 7 had to weigh a three-rung `@supports` ladder in `lcars.css` without being able to say who is on which rung. The options and what each costs:
  - **State the floor the CSS already requires**, as an explicit `browserslist` plus a matching `build.target`. Cheapest, and it turns today's accident into a decision. Cost: someone must establish the CSS floor precisely, which needs a support-data source for `color-mix()` and `@property` that `caniuse-lite` does not carry.
  - **Down-level the CSS to Vite's target** by switching `css.transformer` to `lightningcss` and setting `css.lightningcss.targets` explicitly rather than relying on Vite deriving them. Makes the stated target true. Cost: a build-pipeline change, and lightningcss cannot lower all of what is used — `@property` and `color-mix()` are not generally polyfillable — so the floor would still not be met.
  - **State a deliberately higher floor** (for example, the last two release years of each engine) in the PRD and enforce it in both places. Honest and cheap. Cost: it excludes some users by decision rather than by accident, which is a product call and not an implementation one.

  It is recorded here rather than resolved because choosing the number says which browsers Liebe supports, and that is not a decision an implementation task can take.

## References

- `package.json` — scripts, dependencies, `lint-staged` config
- `tsconfig.json` — strict TS, `~/*` alias, bundler resolution
- `vite.config.ts` — dev server + `dev-panel-plugin` nested build
- `vite.config.ha.ts` — Home Assistant IIFE library build
- `vitest.config.ts`, `src/test/setup.ts` — test runner + jsdom polyfills
- `eslint.config.js` — ESLint 9 flat config
- `.prettierrc` — formatting rules
- `.husky/pre-commit`, `.husky/pre-push` — git hooks
- `.github/workflows/ci.yml` — test + lint gates
- `.github/workflows/e2e.yml` — dockerized Home Assistant e2e job
- `.github/workflows/deploy.yml` — GitHub Pages deployment
- `scripts/e2eStack.mjs`, `ha/docker-compose.yml`, `playwright.config.ts` — per-checkout e2e stack derivation and startup
- `tests/e2e/bundleIdentity.ts`, `tests/e2e/global-setup.ts` — served-vs-built artifact identity gate
- `src/config/panel.ts`, `src/router.tsx`, `src/panel.ts` — panel/env wiring
- `mise.toml` — Node 22 toolchain
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md` — install, contribution, project rules

## Changelog

| Date       | Change                                                                                                                                     | Document                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 2026-07-18 | Initial spec created (baseline of existing implementation)                                                                                 | —                                                      |
| 2026-07-30 | End-to-end harness section added: per-checkout stack derivation, loud port collisions, docker-daemon fault reporting, bundle-identity gate | [0040](../../changes/0040-test-harness-reliability.md) |
