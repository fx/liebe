# 0013 — Built-in Themes: Liquid Glass & LCARS

## Summary

Ship the two non-default built-in themes specified in [theming](../specs/theming/index.md): **Liquid Glass** (token-only frosted translucency) and **LCARS** (dark-only okudagram console with bundled Antonio font and scoped rules on the stable selector contract). Includes the theme gallery stories that become the permanent visual acceptance surface for both themes.

**Spec:** [theming](../specs/theming/index.md) · **Status:** draft · **Depends on:** 0012

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
- **THEN** the root carries `data-liebe-theme="lcars"` and `data-appearance="dark"`, body text computes to Antonio, and a section title bar computes the butterscotch background.

## Design Decisions

- **Font at document level** — shadow roots don't load `@font-face` declared inside them (spec mechanism); registration is idempotent across panel remounts (see [panel-lifecycle](../specs/panel-lifecycle/index.md)).
- **LCARS section frames** need the `liebe-section`/`liebe-section-title` structural hooks from the selector contract — verify they were stamped in 0010/0011; if missing, adding them is in-scope here (contract, not new design).
- **Reference values** come from the theming spec tables (validated in the mockup); no external fetches at build time.

## Tasks

- [x] **PR 1 — Liquid Glass**: theme asset + registry entry (`both` appearances incl. light variant), gallery + stories, a11y pass, picker perf note
- [x] **PR 2 — LCARS**: Antonio asset + OFL license + document-level registration; theme CSS (tokens + scoped rules within contract); gallery + stories; unit tests for dark-forcing and font registration
- [ ] **PR 3 — E2E + cleanup**: per-theme e2e smoke; update design-system/theming spec statuses + changelogs

## Out of Scope

- Additional themes; theme marketplace/sharing; per-screen themes.
