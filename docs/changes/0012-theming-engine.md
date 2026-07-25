# 0012 — Theming Engine

## Summary

Implement the [theming](../specs/theming/index.md) machinery: layered style injection in the shadow root (base → theme → user), the built-in theme registry (shipping only `default` in this change), appearance resolution (`auto | dark | light`) wired to the Radix `Theme`, YAML-persisted `theme.{id, appearance, customCss}`, and the in-panel picker + custom CSS editor. Liquid Glass and LCARS land separately in [0013](./0013-built-in-themes.md).

**Spec:** [theming](../specs/theming/index.md) · **Status:** draft · **Depends on:** 0010

## Motivation

Easy CSS customization is a headline goal; the engine (cascade, persistence, selection UI) is independent of any particular theme and should be reviewable on its own with the default theme as its only payload.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Injection order, appearance resolution, and config round-trip MUST have unit tests; the picker/editor UI MUST have component tests.
- Storybook's theme toolbar MUST consume the same registry (no parallel theme list); a story MUST demonstrate a user-CSS token override winning over the theme layer.
- The e2e suite MUST cover: switching appearance live, and YAML export → import preserving theme config ([dashboard-config](../specs/dashboard-config/index.md) portability rules).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Three ordered `<style data-liebe="base|theme|user">` elements in the panel shadow root, each wrapping its rules in its named CSS cascade layer under a single `@layer liebe-base, liebe-theme, liebe-user;` order declaration, per the [application mechanism](../specs/theming/index.md#application-mechanism) — layer order, not source order, guarantees user CSS beats theme CSS regardless of selector specificity; `data-liebe-theme` and `data-appearance` stamped on the panel root.
- Theme registry as data (`id`, `label`, `appearance: both|dark-only|light-only`, css); adding a theme is additive (0013 proves it).
- Appearance `auto` follows `prefers-color-scheme` (HA-theme darkness detection is the spec's open question — implement the fallback now, leave a hook); explicit values override; resolved appearance drives the Radix `Theme` `appearance` prop; single-appearance themes force and disable the control.
- Config schema gains `theme.id` (default `"default"`), `theme.appearance` (default `"auto"`), `theme.customCss` (default `""`) with validation, included in export/import and dirty-tracking per the portable-config contract ([0004](./0004-portable-config-contract.md)).
- **Legacy migration (required):** existing dashboards persist `theme` as the scalar `light | dark | auto`. The config loader MUST migrate a scalar `theme: X` (from localStorage or YAML import) to `{ id: 'default', appearance: X, customCss: '' }`; migration MUST have unit tests for all three legacy values plus the already-migrated shape, exports MUST write only the new object shape, and an unrecognized scalar falls back to the defaults rather than failing validation.
- Configuration menu: theme picker (live apply, no reload), appearance control, and a custom-CSS textarea wired to the **mandatory injection-time sanitizer** per the [spec's custom-CSS contract](../specs/theming/index.md#configuration--selection) — not an advisory warning. `@import` rules and off-origin-resolving references are stripped before injection (resolution-based, recursive through `var()` indirection, dropping unclean custom-property definitions themselves), user CSS is wrapped into `liebe-user` by parsing and re-serializing rather than textual concatenation, and unparseable input is rejected with the last good CSS retained. The editor names everything stripped or rejected. Imported YAML applies custom CSS immediately, so none of this may be deferred to a warning the user sees afterwards.
- Theme switching applies live; token transitions cover the swap.
- **Portalled overlays stay inside the theme scope** per the [spec's portal rule](../specs/theming/index.md#application-mechanism): existing Radix dialogs/dropdowns and the 0014 detail dialog portal to `document.body`, outside the shadow-root layers — this change MUST either provide a shadow-root portal host they mount into, or mirror all three synchronized layers into a scoped `.liebe-portal-root` document-level container (kept in sync on theme/appearance change), with a test asserting an open dialog renders active tokens.

#### Scenario: Custom CSS layer wins

- **GIVEN** the default theme and `theme.customCss` = `:host { --liebe-card-radius: 0; }` (or the documented root selector)
- **WHEN** the dashboard renders
- **THEN** cards are square while everything else stays default, and removing the CSS in the editor restores 20px live.

#### Scenario: Theme config round-trips

- **GIVEN** appearance `dark` and custom CSS set
- **WHEN** YAML is exported and imported into a fresh instance
- **THEN** the imported dashboard applies both without user action.

## Design Decisions

- **Engine before themes** — 0013 must be pure payload; if it needs engine changes, the engine PR was wrong.
- **Documented root selector for user CSS** — decide `:host` vs a wrapper class during PR 1 and document it in the spec (it's part of the public contract).
- **Sanitization strips exactly two classes of construct** per spec: `@import` rules (illegal inside the `@layer liebe-user` wrapper, and they fetch external resources) and any declaration whose resource reference does not **resolve** same-origin (or `data:`) — the check CSS-unescapes and resolves each candidate against the document base rather than pattern-matching `url()` or schemes, so `image-set()`/`src()`, protocol-relative `//host/…`, and escaped forms are all covered (imported YAML applies immediately; advisory warnings can't prevent an untrusted config's remote requests). Sanitizer unit tests MUST include scheme-full, protocol-relative, CSS-escaped, custom-property-indirection (`--x: "https://…"` + `var(--x)` consumption), and **inherited-variable** bypass attempts — the scan covers custom-property definitions, not just consumption sites, and a fetch-capable declaration whose `var()` references a property neither defined in the user CSS nor part of the `--liebe-*` contract is stripped with an editor notice (inherited HA-theme variables could resolve to off-origin URLs the static scan never saw), per the theming spec. Both are stripped at injection with explicit editor notices naming what was removed; relative/`data:` URLs and everything else apply as-authored.
- **Baseline CSS is layered at injection** per spec: the token sheet, component styles, and the vendored Radix stylesheet are wrapped into `liebe-base` when injected into the shadow root — unlayered author CSS would beat every theme/user layer — with a unit test asserting the wrapping. The same injection applies the spec's **selective importance rewrite**: `!important` is removed from the vendored stylesheet's themable-property declarations (important layer priority runs in reverse, so a base important rule would defeat even important user overrides) while Radix's behavioral importance (ScrollArea/Skeleton display/visibility/pointer rules) is preserved, with a test asserting no themable importance survives.

## Tasks

- [ ] **PR 1 — Injection + registry + appearance**: style layers; adopt and extend the minimal theme-registry module from 0009 as the runtime registry (the storybook toolbar already enumerates it); appearance resolution + Radix wiring; root stamping; unit tests
- [ ] **PR 2 — Config + UI**: schema fields + validation + export/import + dirty-tracking; legacy scalar-`theme` migration with unit tests; **dashboard-config spec synchronized in this same PR** (store shape, `setTheme`, initialization, export/import, migration — the schema change and its owning spec must never merge apart); picker, appearance control, custom-CSS editor; **the injection-time sanitizer ships in this same PR** (imports, off-origin references incl. escaped/protocol-relative/custom-property and inherited-variable indirection, with editor notices and the full bypass-test suite — imported YAML applies immediately, so warnings without the sanitizer would violate the offline/security boundary); component tests; user-override story
- [ ] **PR 3 — E2E + theming spec sync**: live-switch and round-trip e2e; update theming spec changelog and document the chosen user-CSS root selector (the dashboard-config spec was already synchronized in PR 2, atomically with the schema change)

## Out of Scope

- Liquid Glass and LCARS (0013); per-screen themes and shareable theme packages (spec open questions).
