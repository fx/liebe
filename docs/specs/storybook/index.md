# Component Workshop (Storybook)

## Overview

Storybook is Liebe's component workshop: every card, anatomy part, and theme renders as isolated stories with mocked entity data, so components can be developed and reviewed without a Home Assistant instance. It complements — not replaces — the dockerized HA e2e suite ([architecture](../architecture/), change 0005). Storybook MUST land **before** the design-system, theming, and card-option implementations so that all of that work is developed and reviewed as stories first.

**Status: implemented** (change [0009](../../changes/0009-storybook-setup.md)).

## Background

Today the only ways to see a card are unit-test DOM assertions and a full HA round-trip (`npm run dev` + configured HA instance). That makes visual iteration slow and design review nearly impossible. With free card resizing, four layout tiers, three built-in themes, and a per-card option surface arriving (see [design-system](../design-system/), [theming](../theming/), [entity-cards options](../entity-cards/options/common.md)), the state space explodes — a workshop with a story per meaningful state is the only way to keep it reviewable.

## Requirements

### Setup

- Storybook MUST use the Vite builder (`@storybook/react-vite`) with its own Vite config, reusing the project's TS path aliases (`~/*`) and installing no changes to the panel build.
- `npm run storybook` MUST serve the workshop locally (host `0.0.0.0` per workspace conventions) and `npm run build-storybook` MUST produce a static build.
- Stories MUST be colocated with components as `*.stories.tsx` and excluded from the dev-panel rebuild watcher, Vitest coverage, and the production panel bundle.
- Storybook MUST run against mocked data only; it MUST NOT require network access or a Home Assistant instance.

### Global decorators & toolbar

- A global decorator MUST wrap every story in the panel's providers: Radix `Theme` plus the Liebe token layer, mirroring the [theming injection order](../theming/) (base → theme → user) so stories render exactly as the panel does. Because Storybook renders in a normal document (no shadow DOM), the decorator MUST inject the same style set at the preview-document level.
- Toolbar controls MUST include:
  - **Theme**: registry-driven — the toolbar MUST offer exactly the themes currently registered in the built-in registry, so it needs no workshop changes as themes land (only `default` exists until change 0013 registers `liquid-glass` and `lcars`).
  - **Appearance**: `dark | light` (disabled/forced for single-appearance themes).
- A **grid-cell decorator** MUST render card stories inside a fixed-size cell matching real grid metrics (cell height, `--liebe-grid-gap`), with story controls for `width`/`height` spans so every layout tier (`glance`/`row`/`tall`/`full`) is reachable interactively.
- **The decorator MUST derive the tier from the configured span** using the same derivation the grid renderer uses, and supply the tier/span pair to the card — the workshop shows what the grid would show for that cell, by construction. A story MUST NOT pin a tier that contradicts its cell span: resizing the cell controls MUST change the rendered tier exactly as resizing the item on the real grid would. (Until change [0029](../../changes/0029-workshop-tier-fidelity.md), the decorator sized the cell but never derived the tier, so every story rendered its hand-set `tier` arg regardless of the cell — which is how a whole class of tier-dependent rendering, the vertical slider included, went unrepresented in the workshop.) A story MAY still force an explicit tier for a deliberately artificial frame (a tier comparison grid), but then MUST size the cell to match it.

#### Scenario: Reviewing a card in LCARS

- **GIVEN** the light card "On" story
- **WHEN** the reviewer switches the theme toolbar to LCARS
- **THEN** the story re-renders with LCARS tokens and scoped rules applied, no story-side changes needed.

#### Scenario: Cell controls drive the tier

- **GIVEN** any card story rendered through the grid-cell decorator at a 2×2 span
- **WHEN** the viewer changes the cell controls to 1×3
- **THEN** the story re-renders in the `tall` tier — showing the vertical control where the card has one — without any story-side tier argument being touched.

### Entity data mocking

- A fixture module MUST provide `HassEntity` factories per supported domain (sensible attributes: brightness, hvac modes, positions, media metadata, device classes), each accepting overrides.
- A store decorator MUST seed the entity store(s) with a story's fixtures and mark the connection as established, so cards read state through their normal hooks (no card-side test props).
- Service calls MUST be intercepted and logged as Storybook actions; stories MUST NOT attempt real WebSocket traffic. Optimistic UI paths (slider drag) MUST behave normally against the mock.
- Fixtures are shared infrastructure: the unit-test suite SHOULD migrate toward the same factories to avoid divergent mock shapes.

### Story coverage

- Every card in the registry MUST have a stories file covering at minimum: **two representative domain states** (an inactive/resting one and an active/notable one), `unavailable`, error, skeleton/loading, and edit-mode — plus every registered variant and each layout tier the card implements. The two state stories are literal `off`/`on` only for on-off domains (light, switch, fan, input_boolean); other domains pick the equivalent pair for what they publish — a numeric sensor takes a typical and an extreme value, weather two distinct conditions, person home and away, climate idle and actively heating, media idle and playing. Forcing a literal `on`/`off` onto a domain that never reports them would mean fabricating invalid fixtures. The error story exercises whichever error state the card can actually reach through its normal hooks: a failed service call for control cards; disconnected / entity-not-found / render-error for read-only cards (sensor, weather, person), which have no service-call path.
- Anatomy parts (icon circle, slider, pills, chips, sparkline) MUST each have their own stories, including active/inactive and both orientations where applicable.
- Theme verification: one "gallery" story per built-in theme rendering a representative screen of mixed cards (the acceptance surface for theme changes).
- New cards and new per-card options MUST NOT merge without corresponding stories (review-gated; see change document).

#### Scenario: New option arrives with stories

- **GIVEN** a PR adding a `showColorTempControl` option to the light card
- **WHEN** it is reviewed
- **THEN** it includes a story (or story controls) demonstrating the option in both states, or the review requests changes.

### Accessibility & interaction checks

- The a11y addon MUST run on all stories; violations at the "serious"/"critical" level SHOULD be treated as defects.
- Stories SHOULD use `play` functions for key interactions (toggle, slider commit, mode select) with assertions via `storybook/test`. **Those assertions are gate-grade** — they run on every PR, and the rules that make them so are in [CI & publishing](#ci--publishing) below.

### CI & publishing

- CI MUST build Storybook (`build-storybook`) on every PR; a broken workshop build fails the pipeline.
- The static build MUST be published to GitHub Pages under `/storybook/` alongside the panel bundle by the existing deploy workflow (matching change 0009's mandatory publishing task), so every merge to `main` refreshes a browsable workshop.

#### Story assertions are gate-grade

**Stories are gate-grade, not documentation-grade** (change [0040](../../changes/0040-test-harness-reliability.md) PR 6). An assertion in a `play` function is a test, carries the weight of one, and is expected to fail when the behaviour it names changes.

- **Every `play` function MUST execute on every PR.** `src/__tests__/stories.test.tsx` composes every `*.stories.tsx` through Storybook's portable-stories API with the real `.storybook/preview` annotations, renders each story and runs its `play`. It is an ordinary member of the Vitest suite, so `npm test` is the gate and there is **no second CI job and no browser** — a `@storybook/test-runner` or browser-mode job would have added a Playwright install, a static Storybook build to serve, and minutes of its own. The measured price of doing it this way instead: the story file's 656 tests cost about 9 s of CPU, and because it is one worker among 253 the **suite's wall clock rises by under a second in steady state** (three paired full-suite runs, without → with: 25.1 s → 37.1 s on the first cold pair, then 22.3 s → 22.2 s and 22.2 s → 23.1 s). The cost is accepted at that price and would not have been at the other one.
- **A story MUST NOT be written to assert something the runner cannot evaluate**, and where one is, it MUST be named in the runner's `BROWSER_ONLY` map with its reason **and the message it throws**. jsdom lays nothing out, so an assertion on rendered geometry does not merely fail — its neighbour asserting "nothing overflows" _passes_, on `0 <= 1`. The entry list is **self-verifying** in both directions: a listed story is still executed and MUST throw, so an entry that stops earning its place is reported rather than skipped forever; and it must throw with the pinned message, so an unrelated regression in the same story is a gate failure rather than a satisfied exemption.
- **Keep the geometry assertion last in a browser-only story.** The exemption stops the story at its first unevaluable assertion, so anything after it is unenforced too — narrowing the exemption to the assertion that earns it is the story's own responsibility, and the message pin cannot do it for you.
- **A browser-only story's assertions are documentation until an e2e check picks them up**, and the stories keep their coverage regardless — what the map records is where the assertion is enforced, never whether the story renders.
- **The runner MUST reset process-wide state between stories.** The at-most-once dispatch guard (`src/services/guardedDispatch.ts`) is module-scoped by design, so a story whose service call never settles leaves that command in flight and the next identical command is admitted **as a success**. The workshop gets the reset for free by reloading its preview; the runner does it explicitly.
- **Where the workshop substitutes a module, the runner MUST substitute the same one, and MUST supply what the browser would.** `.storybook/vite.config.ts` swaps `CameraCard`'s stream-readiness hook for a fixture-driven stub, and the workshop serves the mock's frames over HTTP; jsdom neither fetches an `<img>` nor decodes one, so the runner resolves those frames against `.storybook/public` on disk — the real file, so the deliberately-missing one still produces `error` and the stream-error story stays honest. Removing the substitution is caught by a single story's assertions while the whole stream surface quietly stops being exercised, which is the reason this is a rule rather than a convenience: **a substitution the runner drops is mostly invisible to the assertions that depend on it.**

#### Scenario: Broken story blocks merge

- **GIVEN** a PR that renames a component export a story imports
- **WHEN** CI runs
- **THEN** `build-storybook` fails and the PR cannot merge until the story is fixed.

#### Scenario: A wrong assertion blocks merge

- **GIVEN** a PR that changes what a card's state line says
- **WHEN** CI runs
- **THEN** the story asserting the old text fails in `npm test`, and the PR either corrects the assertion or the change.

## Design

```
.storybook/
├─ main.ts        framework: @storybook/react-vite; stories: src/**/*.stories.tsx; addons: essentials, a11y
├─ preview.tsx    global decorators: ThemeProvider(tokens+theme layers) · StoreSeed · GridCell
│                 globalTypes: theme, appearance toolbars
src/test/fixtures/  entity factories per domain + screen-level fixture sets
                    (shared with Vitest — outside .storybook/ so the unit suite
                    imports the same factories; excluded from coverage scope)

src/components/LightCard.stories.tsx   (colocated, one file per card/part)
```

Sequencing (the point of this spec): Storybook + fixtures + stories for the **existing** cards land first, ahead of the design-system implementation. The design system, themes, and per-card options are then developed story-first, with the HA e2e suite validating integration at the end. See the change document for tasks.

## Constraints

- Stories/fixtures MUST be excluded from Codecov patch scope (they are development tooling, not product code) — the exclusion is part of the setup change, not a per-PR decision.
- Storybook's preview must not import panel bootstrap code with side effects (custom element registration, HA connection); providers must be importable in isolation — any refactor needed for that is part of the setup change.
- Dev server binding and URL reporting follow the workspace's Tailscale conventions.
- All gates in [architecture — Testing & Quality Conventions](../architecture/index.md#testing--quality-conventions) apply to implementing changes.

## Open Questions

- **Visual regression.** Chromatic or Playwright-based snapshot testing of stories would harden theme changes but adds cost/flake surface; deferred — the theme gallery stories keep review manual for now.
- ~~**Test-runner in CI.**~~ Settled by change [0040](../../changes/0040-test-harness-reliability.md) PR 6: neither. `play` functions run **in Vitest**, through portable stories, so they are a required gate without `@storybook/test-runner` and without a browser. See [CI & publishing](#ci--publishing).
- **Storybook major version.** Pin to the current stable major at implementation time; verify Vite version compatibility with the repo's toolchain in the setup PR.
- ~~**A browser home for the five geometry assertions.**~~ Settled by change [0045](../../changes/0045-browser-home-for-geometry-assertions.md): the five `BROWSER_ONLY` geometry assertions — forecast column widths, the sensor graph's share of its tile, a slider drag across a real track — are enforced in the e2e suite against the real panel in the dockerized HA instance, reading real layout (`getBoundingClientRect`, never declarations). The panel-layout alternative was rejected as the enforcement site: declaration locks pin what the stylesheet says, not what the engine does with it, and the capacity-omit and drag claims have no declaration to pin at all. The existing `anatomyStyles`/`cardBodyStyles` locks stay as unit-level companions; the browser is the measurement side.

## References

### Using the workshop

- **Published build:** <https://fx.github.io/liebe/storybook/> — refreshed by the Pages deploy on every merge to `main`, alongside the panel bundle at the site root.
- **Locally:** `npm run storybook` serves it on port 6006 bound to `0.0.0.0`; report the workspace's Tailscale hostname (not `localhost`) when sharing the URL. `npm run build-storybook` produces the same static build CI gates and the deploy publishes.
- **Toolbar:** the **Theme** control lists the themes in the built-in registry and **Appearance** switches `dark`/`light`. Card stories render inside the grid-cell decorator, whose `width`/`height` story controls resize the cell so every layout tier is reachable without editing the story.
- **Entity data:** stories seed the entity store from the factories in `src/test/fixtures/`; service calls are intercepted and logged to the Actions panel, so nothing reaches a real Home Assistant.
- **A11y:** the a11y addon audits every story as it opens — check its panel when adding or changing a story.
- **The assertions run:** `npm test` executes every `play` function through `src/__tests__/stories.test.tsx`. A story that fails there fails the PR, so write its assertions as you would a test's — and if one needs a real browser, add it to that file's `BROWSER_ONLY` map with a reason rather than leaving it to fail.

### Related documents

- Related specs: [design-system](../design-system/), [theming](../theming/), [entity-cards](../entity-cards/) (+ [options](../entity-cards/options/common.md)), [architecture](../architecture/)
- Change document: [0009-storybook-setup](../../changes/0009-storybook-setup.md)

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                         | Document                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 2026-07-25 | Initial spec created                                                                                                                                                                                                                                                           | [0009-storybook-setup](../../changes/0009-storybook-setup.md)                   |
| 2026-07-26 | Workshop implemented: CI `build-storybook` gate, Pages publishing under `/storybook/`, usage documented                                                                                                                                                                        | [0009-storybook-setup](../../changes/0009-storybook-setup.md)                   |
| 2026-07-29 | Grid-cell decorator rule strengthened: the decorator MUST derive the tier from the configured span exactly as the grid renderer does, and stories MUST NOT pin a tier contradicting their cell — recording the gap that let tier-dependent rendering go unrepresented          | [0029-workshop-tier-fidelity](../../changes/0029-workshop-tier-fidelity.md)     |
| 2026-07-30 | Derivation implemented: `withGridCell` supplies the tier and span from the cell through `deriveCardTier`, every card story's hand-set `tier` arg is gone and its cell reconciled, and a Vitest test pins the decorator's derivation                                            | [0029-workshop-tier-fidelity](../../changes/0029-workshop-tier-fidelity.md)     |
| 2026-07-30 | Stories settled as **gate-grade**: every `play` function runs in Vitest through portable stories, the CI section states the rules and the cost, the test-runner open question is closed, and the geometry assertions jsdom cannot evaluate are named rather than left to score | [0040-test-harness-reliability](../../changes/0040-test-harness-reliability.md) |
