# 0013 — Built-in Themes: Liquid Glass & LCARS

## Summary

Ship the two non-default built-in themes specified in [theming](../specs/theming/index.md): **Liquid Glass** (token-only frosted translucency) and **LCARS** (dark-only okudagram console with bundled Antonio font and scoped rules on the stable selector contract). Includes the theme gallery stories that become the permanent visual acceptance surface for both themes.

**Spec:** [theming](../specs/theming/index.md) · **Status:** complete · **Depends on:** 0012

**Known exception:** LCARS ships **without a section title, without the concave inner fillet, and without the per-title code label** — three parts its own okudagram design calls for. The cause is not scheduling: `liebe-section-title` is stamped nowhere, and it was not stamped because no element in the markup means "the title of a section" (a screen renders no header, and the titled `separator` grid item is a widget the user places anywhere, including mid-section and vertically). Stamping the class on whatever is nearest would promise themes a bar at the head of a section that is not what renders. Settled by [0036](./0036-theming-contract-gaps.md) PR 4, which removes the hook from the contract rather than stamping it, and recorded as the **Removed — `liebe-section-title`** entry under the [stable selector contract](../specs/theming/index.md#stable-selector-contract); the acceptance scenario below is narrowed to the frame LCARS actually draws rather than restated as met. The other contract gap found here — a theme cannot recolour pill and chip labels — is [#214](https://github.com/fx/liebe/issues/214).

## Motivation

These themes are product features and the theming system's proof: Liquid Glass validates pure token routing, LCARS validates the stable selector contract under maximal stress. Shipping them keeps both contracts honest permanently.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100% (theme CSS assets carry no coverage; registry/loader code does); `codecov/project` no regress.
- Each theme MUST get a gallery story (mixed representative cards) plus per-anatomy stories via the theme toolbar; a11y checks MUST pass on both galleries (contrast matters especially for LCARS black-on-color labels).
- Unit tests MUST cover: registry entries (appearance declarations), LCARS forcing dark, and document-level font registration.
- An e2e smoke MUST activate each theme in the real panel (shadow DOM) and assert the root stamps plus one theme-distinctive computed style.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [theming spec](../specs/theming/index.md) owns both themes' token values, palettes, and the scoped-rule budget each is allowed — [Liquid Glass](../specs/theming/index.md#built-in-theme-liquid-glass) and [LCARS](../specs/theming/index.md#built-in-theme-lcars). This change ships them. What it owns:

- The theme file for Liquid Glass carries a comment header quoting its token-only constraint from the [spec](../specs/theming/index.md#built-in-theme-liquid-glass), and a diff adding any selector to that file fails review. If Liquid Glass turns out to need a rule, the token contract is incomplete — fix the contract, not the theme.
- **LCARS bundles Antonio** (woff2 + the OFL licence file, which MUST ship alongside the font) registered at document level via `__LIEBE_ASSET_BASE_URL__` — shadow roots do not load `@font-face` declared inside them, and registration MUST be idempotent across panel remounts.
- The theme picker surfaces the `backdrop-filter` performance note for low-end tablets.
- Both themes MUST work offline with no external fetches — Home Assistant installs are frequently LAN-only, so a webfont CDN reference would simply fail for a large share of users.

#### Scenario: Liquid Glass survives markup refactors

- **GIVEN** the Liquid Glass gallery story
- **WHEN** any card's internal DOM changes in a later PR
- **THEN** the gallery renders correctly unchanged, because the theme touches only tokens; a diff adding a selector to the theme file fails review.

#### Scenario: LCARS in the real panel

- **GIVEN** the e2e panel with LCARS activated
- **WHEN** the dashboard renders
- **THEN** the root carries `data-liebe-theme="lcars"` and `data-appearance="dark"`, body text computes to Antonio from a face registered in the owning document, the screen's rail and elbow compute the butterscotch background on `liebe-screen`, and each `liebe-section` computes its almond bar.

## Design Decisions

- **Font at document level** — shadow roots don't load `@font-face` declared inside them (spec mechanism); registration is idempotent across panel remounts (see [panel-lifecycle](../specs/panel-lifecycle/index.md)).
- **LCARS section frames** need the `liebe-section`/`liebe-section-title` structural hooks from the selector contract — verify they were stamped in 0010/0011; if missing, adding them is in-scope here (contract, not new design). They were not: a grep of `src/` and `app/` returned zero occurrences of any of the three, so the spec's claim that 0010 shipped them was false and has been corrected.
  - **Delivered:** `liebe-screen` and `liebe-section` are stamped and moved into the contract's stamped set, and LCARS draws its console frame on them — the screen's rail and elbow, plus an alternating bar per section with a counter-generated code label. Asserted by e2e on the real panel.
  - **Settled by [0036](./0036-theming-contract-gaps.md) PR 4:** `liebe-section-title` is removed from the contract rather than stamped, so the per-title bar, the concave inner fillet and the per-title code label stay unbuilt. Stamping it was never "adding a hook to existing markup": it needs a section heading that exists because a section genuinely has one, which is a screen/section structure question rather than a theming one — and inventing markup to satisfy a theme puts the contract ahead of the product. Recorded as the **Removed** entry in the [selector contract](../specs/theming/index.md#stable-selector-contract), with a migration note (the hook never rendered, so nothing migrates).
- **Reference values** come from the theming spec tables (validated in the mockup); no external fetches at build time.

## Tasks

- [x] **PR 1 — Liquid Glass**: theme asset + registry entry (`both` appearances incl. light variant), gallery + stories, a11y pass, picker perf note
- [x] **PR 2 — LCARS**: Antonio asset + OFL license + document-level registration; theme CSS (tokens + scoped rules within contract); gallery + stories; unit tests for dark-forcing and font registration
- [x] **PR 3 — E2E + cleanup**: per-theme e2e smoke (`tests/e2e/built-in-themes.spec.ts`); update design-system/theming spec statuses + changelogs

## Out of Scope

- Additional themes; theme marketplace/sharing; per-screen themes.
