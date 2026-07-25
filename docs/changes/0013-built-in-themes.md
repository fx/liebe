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

- **Liquid Glass** per [spec](../specs/theming/index.md#built-in-theme-liquid-glass): token-only (wallpaper gradient, translucent card fill, `backdrop-filter` blur/saturate, hairline border, 26px radius, white text tiers); declares `both` appearances (light variant per spec); MUST contain zero rules beyond token assignments — enforced by review and a comment header stating the constraint.
- **LCARS** per [spec](../specs/theming/index.md#built-in-theme-lcars): `dark-only`; classic okudagram palette and domain remaps; Antonio bundled (woff2 + OFL license file) and registered at document level via `__LIEBE_ASSET_BASE_URL__`; scoped rules limited to the [stable selector contract](../specs/theming/index.md#stable-selector-contract) — section elbow frames with segmented rails and counter codes, pill-capped cards, solid controls with black labels, tick-marked gauges, uppercase type.
- The theme picker note about `backdrop-filter` cost on low-end tablets MUST appear (spec constraint).
- Both themes MUST work offline (no external fetches) and inside the HA shadow DOM.

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

- [ ] **PR 1 — Liquid Glass**: theme asset + registry entry (`both` appearances incl. light variant), gallery + stories, a11y pass, picker perf note
- [ ] **PR 2 — LCARS**: Antonio asset + OFL license + document-level registration; theme CSS (tokens + scoped rules within contract); gallery + stories; unit tests for dark-forcing and font registration
- [ ] **PR 3 — E2E + cleanup**: per-theme e2e smoke; update design-system/theming spec statuses + changelogs

## Out of Scope

- Additional themes; theme marketplace/sharing; per-screen themes.
