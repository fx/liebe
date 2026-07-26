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

- Style injection, cascade-layer wrapping, root stamping, appearance resolution, and the custom-CSS sanitizer contract are owned by the [theming spec](../specs/theming/index.md#application-mechanism); this change implements them. The spec's scenarios are the acceptance criteria.
- Theme registry as data (`id`, `label`, `appearance: both|dark-only|light-only`, css); adding a theme is additive (0013 proves it).
- HA-theme darkness detection stays the spec's open question: implement the `prefers-color-scheme` fallback now and leave a hook for it.
- Config schema gains `theme.id` (default `"default"`), `theme.appearance` (default `"auto"`), `theme.customCss` (default `""`) with validation, included in export/import and dirty-tracking per the portable-config contract ([0004](./0004-portable-config-contract.md)).
- **Legacy migration (required):** existing dashboards persist `theme` as the scalar `light | dark | auto`. The config loader MUST migrate a scalar `theme: X` (from localStorage or YAML import) to `{ id: 'default', appearance: X, customCss: '' }`; migration MUST have unit tests for all three legacy values plus the already-migrated shape, exports MUST write only the new object shape, and only the three declared legacy values (`light`, `dark`, `auto`) are migrated. An **imported** scalar outside that set (e.g. a typo like `theme: solarized`) MUST be rejected by schema validation with an error naming the field — silently swallowing it into the defaults would contradict the validation this same bullet promises and hide a broken shared config from its author. Recovering to defaults instead of failing MAY remain the policy for corrupt _localStorage_, which has no author to inform.
- Configuration menu: theme picker (live apply, no reload), appearance control, and a custom-CSS textarea wired to the **mandatory injection-time sanitizer** per the [spec's custom-CSS contract](../specs/theming/index.md#configuration--selection) — never an advisory warning, since imported YAML applies custom CSS immediately. The editor names everything stripped or rejected.
- Theme switching applies live; token transitions cover the swap.
- **Portalled overlays stay inside the theme scope** per the [spec's portal rule](../specs/theming/index.md#application-mechanism): existing Radix dialogs/dropdowns and the 0014 detail dialog portal to `document.body`, outside the shadow-root layers — this change MUST either provide a shadow-root portal host they mount into, or mirror all three synchronized layers into a scoped `.liebe-portal-root` document-level container (kept in sync on theme/appearance change), with a test asserting an open dialog renders active tokens.

## Design Decisions

- **Engine before themes** — 0013 must be pure payload; if it needs engine changes, the engine PR was wrong.
- **Documented root selector for user CSS** — decide `:host` vs a wrapper class during PR 1 and document it in the spec (it's part of the public contract).
- **Sanitizer test suite is the deliverable, not a restated rule** — the [theming spec](../specs/theming/index.md#configuration--selection) defines what must be stripped; this change owes the bypass-test matrix that proves it: scheme-full, protocol-relative, CSS-escaped, `image-set()`/`src()`, custom-property indirection, _delegated_ indirection through a second user-defined property, reference cycles, CSS-wide keywords (`inherit`/`unset`/`revert`/`revert-layer`) and `all` laundering an outer HA theme value — both on a custom property (`--x: inherit`) and directly on a fetch-capable property (`background-image: inherit`) — unclean `--liebe-*` token overrides consumed by base CSS, and a layer-escape payload. It owes the same for input that attacks the sanitizer rather than the invariant: a value nesting functions thousands deep, a sheet nesting blocks thousands deep, and a long `var()` chain written back to front — the first two overflowed the stack out of `sanitizeCustomCss` and into the render calling it, and the third blocked the thread for half a minute. Each was a real bypass found in review; a sanitizer that passes all of them is the acceptance bar.
- **Baseline CSS is layered at injection** per spec: the token sheet, component styles, and the vendored Radix stylesheet are wrapped into `liebe-base` when injected into the shadow root — unlayered author CSS would beat every theme/user layer — with a unit test asserting the wrapping. The same injection applies the spec's **selective importance rewrite**: `!important` is removed from the vendored stylesheet's themable-property declarations (important layer priority runs in reverse, so a base important rule would defeat even important user overrides) while Radix's behavioral importance (ScrollArea/Skeleton display/visibility/pointer rules) is preserved, with a test asserting no themable importance survives.

## Tasks

- [x] **PR 1 — Injection + registry + appearance**: style layers; adopt and extend the minimal theme-registry module from 0009 as the runtime registry (the storybook toolbar already enumerates it); appearance resolution + Radix wiring; root stamping; unit tests
- [x] **PR 2 — Config + UI**: schema fields + validation + export/import + dirty-tracking; legacy scalar-`theme` migration with unit tests; **dashboard-config spec synchronized in this same PR** (store shape, `setTheme`, initialization, export/import, migration — the schema change and its owning spec must never merge apart); picker, appearance control, custom-CSS editor; **the injection-time sanitizer ships in this same PR** (imports, off-origin references incl. escaped/protocol-relative/custom-property and inherited-variable indirection, with editor notices and the full bypass-test suite — imported YAML applies immediately, so warnings without the sanitizer would violate the offline/security boundary); component tests; user-override story
- [ ] **PR 3 — E2E + theming spec sync**: live-switch and round-trip e2e; update theming spec changelog and document the chosen user-CSS root selector (the dashboard-config spec was already synchronized in PR 2, atomically with the schema change)

## Out of Scope

- Liquid Glass and LCARS (0013); per-screen themes and shareable theme packages (spec open questions).
