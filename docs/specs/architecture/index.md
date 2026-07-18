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
- UI MUST use Radix UI Themes (`@radix-ui/themes` `^3.2.1`) as the primary component system, per project CLAUDE.md styling rules.
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
- Component-specific code SHOULD be colocated in the component's own folder (e.g. `WeatherCard/`) rather than dumped into `src/utils/`, per project CLAUDE.md.

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
- Home Assistant integration testing MUST point `panel_custom.module_url` at the dev server's `panel.js`; the dev element name is `liebe-panel-dev` (project CLAUDE.md, README).

#### Scenario: Wiring the dev panel into Home Assistant

- **GIVEN** the dev server is running on port 3000
- **WHEN** the developer adds a `panel_custom` entry with `module_url: http://localhost:3000/panel.js` and name `liebe-panel-dev`
- **THEN** Home Assistant loads the live-rebuilding panel after a restart.

### Testing & Quality Conventions

This subsection is the project's standing testing and quality bar; other specs link here rather than restating it.

- Every pull request MUST have passing tests, lint, and type checks before merge; PRs with failing tests MUST NOT be merged (project CLAUDE.md, "CRITICAL: Pull Request Requirements").
- Before creating any PR, a contributor MUST run `npm test`, `npm run lint`, and `npm run typecheck`, and all three MUST pass.
- Tests MUST run under Vitest with the `jsdom` environment, globals enabled, and the shared setup file `src/test/setup.ts` (`vitest.config.ts:6-11`).
- Component tests MUST use `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event`; the setup file MUST provide jsdom polyfills for `matchMedia`, `ResizeObserver`, `scrollIntoView`, and pointer-capture (required by Radix Slider) (`src/test/setup.ts:5-45`).
- Test files MUST be excluded from the dev panel rebuild and colocated as `*.test.ts(x)` (dev plugin skips `.test.`; tests live in `__tests__/` folders across `components`, `hooks`, `services`, `store`, `routes`, `utils`).
- `npm run lint` MUST be treated as the composite gate it is: it runs `tsc --noEmit`, then `eslint . --ext .ts,.tsx`, then `prettier --check .` (`package.json`).
- CI MUST enforce these gates: the `test` job runs `npm test` and the `lint` job runs `npm run lint` on every push to `main` and every PR targeting `main` (`.github/workflows/ci.yml`).
- The `pre-push` git hook MUST run typecheck, lint, and `npm test -- --run` and MUST block the push on any failure (`.husky/pre-push`).

#### Scenario: Opening a pull request

- **GIVEN** a contributor has finished a change
- **WHEN** they attempt to push and open a PR
- **THEN** the pre-push hook runs typecheck + lint + tests locally, and the GitHub `CI` workflow re-runs the `test` and `lint` jobs; the PR cannot merge unless all pass.

#### Scenario: Writing a card test

- **GIVEN** a Radix-based card that uses a slider or measures layout
- **WHEN** its test renders in jsdom
- **THEN** the polyfills in `src/test/setup.ts` provide `ResizeObserver`, `matchMedia`, and pointer-capture so the component mounts without throwing.

### Linting & Formatting

- ESLint MUST use the flat-config file `eslint.config.js` (ESLint 9), composing `@eslint/js` recommended, `@typescript-eslint` recommended (type-aware via `parserOptions.project`), `eslint-plugin-react` recommended, and `eslint-plugin-react-hooks` recommended, with `eslint-config-prettier` last to disable stylistic conflicts (`eslint.config.js:1-80`).
- Prettier MUST enforce: no semicolons, single quotes, 2-space tabs, `es5` trailing commas, 100-char print width, always-parenthesized arrow params (`.prettierrc`).
- The pre-commit hook MUST run `lint-staged`, which runs `eslint --fix` + `prettier --write` on staged `*.{ts,tsx}` and `prettier --write` on staged `*.{json,md,yml,yaml}` (`.husky/pre-commit`, `package.json` `lint-staged`).
- Generated and build output (`*.gen.ts`, `dist/`, `.output/`, `.tanstack/`, `.nitro/`, `.vite-temp/`, `node_modules/`) MUST be excluded from linting (`eslint.config.js` `ignores`).

#### Scenario: React Compiler rules are enabled incrementally

- **GIVEN** `eslint-plugin-react-hooks` v7 ships experimental React Compiler rules
- **WHEN** ESLint runs
- **THEN** the structural rules `react-hooks/refs`, `react-hooks/static-components`, and `react-hooks/incompatible-library` are enabled at `error` (change 0003 Group A), while `react-hooks/set-state-in-effect` and `react-hooks/preserve-manual-memoization` remain disabled pending change 0003 Group B (`eslint.config.js:36-42`).

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
- Radix UI Themes is a relatively closed system; custom CSS and arbitrary z-index values are discouraged (project CLAUDE.md styling rules).

## Open Questions

- **`sharp` in runtime dependencies.** `sharp@^0.34.3` is listed under `dependencies` (not `devDependencies`) in `package.json`, but the shipped panel is a browser IIFE and cannot use a native Node image library. It appears to be dead/misplaced for the panel build; whether any tooling path needs it is unverified.
- **Partially enabled `react-hooks` rules.** Change 0003 tracks incremental enablement of the five experimental React Compiler rules. Group A (`react-hooks/refs`, `static-components`, `incompatible-library`) is enabled at `error`; the two stateful rules (`set-state-in-effect`, `preserve-manual-memoization`) remain disabled in `eslint.config.js:36-42` pending Group B.
- **`.env.local` has no application consumer.** Project docs reference `.env.local` (HA URL/credentials) for MCP browser testing, but no application source reads `import.meta.env`/`process.env` for those values — the file is a testing convention only, so its documented `HASS_*` keys are not load-bearing for the build.
- **Two test-setup files.** `vitest.config.ts` references `./src/test/setup.ts`, but a second file `src/test-setup.ts` also exists at the source root; the latter is not wired into the Vitest config and its status (stale vs. intentional) is unverified.
- **CI uses `npm install`, not `npm ci`.** The CI workflow (`.github/workflows/ci.yml`) runs `npm install` while the deploy workflow uses `npm ci`; the inconsistency means CI does not strictly honor the lockfile.

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
- `.github/workflows/deploy.yml` — GitHub Pages deployment
- `src/config/panel.ts`, `src/router.tsx`, `src/panel.ts` — panel/env wiring
- `mise.toml` — Node 22 toolchain
- `README.md`, `CONTRIBUTING.md`, `CLAUDE.md` — install, contribution, project rules

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
