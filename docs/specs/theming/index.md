# Theming

## Overview

Theming makes the entire dashboard restyleable with plain CSS. A theme is a set of CSS custom-property overrides against the [design-system token contract](../design-system/), optionally extended with rules scoped to documented stable selectors. Liebe SHALL ship built-in themes — **Default** (dark + light), **Liquid Glass**, and **LCARS** — and SHALL accept user-supplied custom CSS stored in the dashboard configuration. Theme selection, appearance (dark/light/auto), and custom CSS are part of the portable YAML configuration and are chosen in-panel, never by editing files.

**Status: specified, not yet implemented.** Validated in a throwaway static mockup where all three built-in themes plus a geometry modifier ran as pure CSS override blocks over one shared markup; the token and rule values that mockup established are captured in the tables below, which supersede it as the sole reference.

## Background

The token contract exists so that theming is data, not code: the Liquid Glass theme is nothing but token values (translucent card fill, backdrop blur, gradient wallpaper), and even a radical reskin like LCARS needs only tokens plus a small number of rules targeting stable class names (section frames, solid control fills). Shipping two deliberately extreme built-in themes keeps the contract honest — if LCARS breaks, a component hardcoded something it shouldn't have.

## Requirements

### Theme model

- A theme MUST be expressible as: (1) a map of token overrides, and (2) OPTIONAL extra CSS rules that target only the [stable selector contract](#stable-selector-contract).
- Themes MUST be declarative data (CSS text or a token map serialized to CSS), never JavaScript.
- A theme MUST declare which appearances it supports: `both` (provides dark and light token sets), `dark-only`, or `light-only`. The appearance control MUST be disabled (with the theme's fixed appearance applied) when a theme is single-appearance.
- Themes MUST compose in a fixed cascade: base tokens → active theme → user custom CSS. Later layers win on conflicting tokens.
- A **modifier** is a theme that only touches geometry/typography tokens (e.g. square corners) and MAY be offered as a toggle alongside a full theme. Built-in modifiers are OPTIONAL for the first implementation.

#### Scenario: User CSS beats the built-in theme

- **GIVEN** the LCARS theme active, and user custom CSS containing `:host { --liebe-card-radius: 0; }` (token declarations need a rule — bare declarations are invalid inside the layer wrapper; the exact root selector is documented by the engine change)
- **WHEN** the dashboard renders
- **THEN** cards render square (user layer wins the token) while all other LCARS styling stands.

### Stable selector contract

- The design-system anatomy classes (`liebe-card`, `liebe-icon`, `liebe-name`, `liebe-state`, `liebe-slider`, `liebe-pill`, `liebe-chip`, `liebe-value`, `liebe-spark`) plus structural hooks `liebe-screen`, `liebe-section`, `liebe-section-title`, and per-domain/state data attributes (`data-domain="light"`, `data-active`, `data-tier="glance|row|tall|full"`) MUST be present in rendered markup and MUST be treated as a public API: renames are breaking changes requiring a migration note here.
- Themes MUST NOT rely on any selector outside this contract; internal class names MAY change freely.
- Domain color tokens are part of the contract as **triplets** (`--liebe-c-<name>`, `--liebe-c-<name>-tint`, `--liebe-c-<name>-text` — [design-system](../design-system/index.md#domain-color-discipline)): themes MAY remap them (LCARS does). Remapping only the base recolors the whole treatment through whichever companions the active theme left derived, and a theme SHOULD set `-text` explicitly when the remapped base lacks contrast on its ground. **Default-theme caveat:** an explicitly set companion is an override like any other, and the Default theme pins each `-text` companion to Radix step 11 (raw step-9 hues lack text contrast). So under Default, user CSS remapping only a base recolors glyph and tint but leaves state text on the old hue — it SHOULD set `-text` too. Tints still follow automatically, since Default does not pin them.

#### Scenario: Internal refactor does not break themes

- **GIVEN** a theme styling `.liebe-pill`
- **WHEN** the pill component's internal DOM is refactored
- **THEN** the `liebe-pill` class and its role are preserved and the theme renders unchanged.

### Application mechanism

- Tokens and theme CSS MUST be injected as `<style>` elements inside the panel's shadow root, ordered base → theme → user (see [panel-lifecycle](../panel-lifecycle/)).
- The three layers MUST be CSS **cascade layers**: a single `@layer liebe-base, liebe-theme, liebe-user;` declaration establishes the order, and each injected sheet wraps its rules in its named layer. Source order alone cannot deliver the promised precedence — selector specificity outranks it (a theme rule under `:host([data-appearance='light'])` would beat a later, less specific user override) — whereas a later layer wins regardless of specificity. Built-in themes MUST be authored inside their layer; user CSS is wrapped into `liebe-user` at injection time. **Wrapping MUST be structural, not textual**: concatenating `@layer liebe-user {` + raw user text + `}` lets deliberately unbalanced input escape the layer — `} :host { --liebe-card-radius: 0 } /*` closes the generated block and leaves a valid _unlayered_ rule, which outranks every layer and defeats the whole precedence contract. The engine MUST therefore parse user CSS into an AST and serialize it back inside the layer (or, failing that, reject input whose structural tokens do not balance), so no user rule can land outside `liebe-user`. A unit test MUST assert that a layer-escape payload stays layered or is rejected. **Importance strategy:** CSS reverses layer priority for `!important` declarations (an important rule in `liebe-base` would beat important rules in every later layer), so the baseline MUST be importance-free **for themable properties**: at injection the vendored Radix stylesheet is rewritten to remove `!important` only from declarations of properties the token contract governs (colors, backgrounds, borders, shadows, radii, typography), while Radix's **behavioral** importance is preserved (e.g. the ScrollArea viewport's `display: block !important`, Skeleton's visibility/pointer rules — stripping those breaks scroll layout and loading states, and no theme needs to override them). A unit test asserts no themable-property importance survives; built-in themes MUST NOT use `!important`. User CSS keeps its `!important` as-authored: with base and theme importance-free, user importance always wins, preserving the promised precedence.
- **No overridable author CSS may remain unlayered.** Unlayered author declarations beat _every_ cascade layer, so any baseline stylesheet left unlayered would silently defeat theme and user rules targeting the same properties. All baseline CSS the panel injects into the shadow root — the token sheet, anatomy/component styles, and the vendored Radix Themes stylesheet — MUST be wrapped into `liebe-base` (or an earlier layer) at injection time. A unit test MUST assert the injected sheets' layer wrapping, and the LCARS gallery (whose scoped rules restyle anatomy the base styles also touch) is the visual regression canary.
- **The same rule bans inline visual declarations**: inline `style` attributes outrank every cascade layer, so any themable visual property set inline (as today's cards do with `backgroundColor`/`borderColor`/`color` in e.g. `ButtonCard.tsx` and `LightCard.tsx`) is unoverridable by themes and user CSS. Overridable visual styling MUST live in layered classes/tokens; migrating the existing inline declarations is part of the anatomy migration ([design-system](../design-system/), change 0010). Inline styles remain legitimate only for values that are data, not design — e.g. a bulb's actual RGB, a slider's live percentage.
- The active theme id MUST be stamped as `data-liebe-theme="<id>"` and resolved appearance as `data-appearance="dark|light"` on the panel root, so scoped rules can key off them.
- `@font-face` MUST be registered at the document level (shadow roots do not load `@font-face` declared inside them); font files ship as bundled assets resolved via `window.__LIEBE_ASSET_BASE_URL__` — no runtime fetches from third-party hosts.
- **Portalled UI MUST stay inside the token scope.** Overlays portalled to `document.body` (dialogs, dropdowns — see [panel-lifecycle](../panel-lifecycle/)) land outside the shadow root and would render unthemed. Preferred: portal into a host element **inside** the shadow root. Where escaping the shadow root is genuinely required, the portal content MUST be wrapped in a `liebe-portal-root` container for which the engine mirrors all three layers at the document level (same CSS, selectors scoped to `.liebe-portal-root`, kept in sync on theme/appearance change). Either way, every Liebe overlay — including the detail dialog and its domain controls — renders with active tokens.
- Appearance `auto` MUST follow `prefers-color-scheme` and SHOULD honor Home Assistant's active theme darkness when detectable; explicit `dark`/`light` override it. Resolved appearance MUST drive the Radix `Theme` `appearance` prop so Radix-aliased tokens flip in sync.
- Theme switching MUST apply live without panel reload, and transitions on token-driven properties (~280ms) make the switch feel deliberate rather than flashing.

#### Scenario: LCARS declares dark-only

- **GIVEN** appearance is `auto` on a light-mode OS
- **WHEN** the user activates LCARS (declared `dark-only`)
- **THEN** the panel renders LCARS on its black ground, the appearance control shows dark as forced, and switching back to Default restores `auto` behavior.

### Configuration & selection

- The dashboard configuration MUST carry: `theme.id` (default `"default"`), `theme.appearance` (`auto | dark | light`, default `auto`), and `theme.customCss` (string, default empty). All three MUST round-trip through YAML export/import. **Baseline vs. target:** the [dashboard-config](../dashboard-config/) spec documents the _implemented_ scalar `theme: light | dark | auto` (store shape, `setTheme`, export). That remains the truth until change [0012](../../changes/0012-theming-engine.md) lands, whose scope includes the scalar→object loader migration and the dashboard-config spec sync — the two specs deliberately describe baseline and target of the same field during that window.
- The configuration menu MUST offer: theme picker (with live application), appearance control, and a custom-CSS editor (plain textarea is sufficient) with the token contract linked/documented.
- Custom CSS MUST be applied as-authored into the user layer, subject to one **invariant**: _no declaration may cause the panel to fetch a resource whose resolved source is anything other than same-origin or `data:`, and no declaration may import external CSS._ The invariant binds the **computed result**, not the authored text — a sanitizer is correct only if no reference can resolve off-origin, however it was expressed. `@import` is rejected outright (it fetches, and cannot legally appear inside the `@layer liebe-user { … }` wrapper anyway). Everything stripped or rejected MUST be named in an editor notice, never dropped silently.
- Three properties of CSS make a **syntactic** scan insufficient, and any implementation judged by pattern-matching rather than by resolution will be bypassed:
  - **Fetches happen through many constructs** — `url()`, `image-set()`, `src()`, and whatever a future CSS level adds — and accept scheme-less (`//host/…`) and CSS-escaped forms. The sanitizer MUST CSS-unescape each candidate reference and resolve it against the document base before judging it.
  - **Values launder through custom properties.** A definition _is_ a reference: base and theme CSS already consume `--liebe-*` tokens in fetch-capable positions, so `--liebe-card-bg: var(--ha-image)` needs no user-authored consumer to fetch. Cleanliness is therefore the **transitive closure** over `var()` chains — a property is clean only if its own value resolves cleanly and every property it references is clean — and unclean definitions are dropped at the definition site. Cycles and one-hop checks are unclean by definition.
  - **Values launder in from outside the panel.** Anything whose computed value is supplied by the surrounding Home Assistant document is outside the sanitizer's sight and MUST be treated as unclean **wherever it appears** — on a custom property or directly on a fetch-capable property. That covers inherited custom properties, the CSS-wide keywords (`inherit`, `unset`, `revert`, `revert-layer`), and `all`. `background-image: inherit` and `--x: inherit` are the same defect wearing different clothes: neither contains a URL, and both can resolve to one.
- **Enforcement is by outcome, not by rule text.** The bypass-test matrix in change [0012](../../changes/0012-theming-engine.md) is the acceptance bar; every vector above exists there as a test because each was a real bypass found in review. When a new vector is discovered, the fix is a new test — the invariant above already forbids it.
- Imported YAML applies custom CSS immediately, so an advisory warning is not an acceptable substitute for stripping: an untrusted shared config would initiate its remote requests (network metadata leak, visual spoofing) before the user ever opens the editor. Beyond this boundary, config is user-owned and needs no sanitization.
- Invalid custom CSS MUST NOT break the dashboard. Because the layer wrapping is structural, recovery happens at parse time rather than in the browser: the parser drops only the rules it cannot read and serializes the rest into `liebe-user`, or — if the input cannot be parsed at all — the engine rejects it wholesale and keeps the last good user CSS applied. Malformed text MUST NOT be injected raw in either case (that is the layer-escape vector above). The editor MUST surface what was dropped or rejected.

#### Scenario: Theme survives export/import

- **GIVEN** a dashboard with Liquid Glass active and custom CSS set
- **WHEN** the user exports the YAML and imports it into a fresh Liebe instance
- **THEN** the imported dashboard renders Liquid Glass with the same custom CSS applied.

### Built-in theme: Default

- Token values as specified in [design-system](../design-system/) (dark + light sets); supports `both` appearances. This is the only theme active-by-default and MUST require zero configuration.

### Built-in theme: Liquid Glass

- Appearance: `both` (dark-biased wallpaper by default; a light variant lightens the wallpaper and raises card alpha).
- Pure token override (no scoped rules) — reference values:
  - `--liebe-bg`: layered radial-gradient mesh wallpaper (indigo/rose/teal glows over `#0f1020`), fixed attachment.
  - `--liebe-card-bg: rgba(255,255,255,0.10)`, `--liebe-card-border: 1px solid rgba(255,255,255,0.18)`, `--liebe-card-blur: blur(22px) saturate(1.6)`, `--liebe-card-shadow: 0 8px 32px rgba(0,0,0,0.3)`, `--liebe-card-radius: 26px`.
  - Foreground white with 68%/45% muted/faint tiers; track 16% white.
- Because it is token-only, Liquid Glass MUST keep working without theme-specific code paths; it doubles as the regression canary for token routing (backdrop-filter, border, gradient backgrounds).

### Built-in theme: LCARS

- Appearance: `dark-only`. Reference palette is the classic okudagram set: black `#000` ground; butterscotch `#ea9c72`, almond `#d29b7f`, almond-creme `#fcc19f` (body text), barley `#edb378`, african-violet `#baa4e5`, lilac `#8a72a7`, bluey `#8899ff`, orange `#eb943a`, mars `#f20` (alerts), true-mauve `#c082a9`.
- Domain token remap: light→barley, heat→orange, cool→bluey, ok→african-violet, alert→mars, media→true-mauve, vacuum→lilac.
- Typeface: Antonio (SIL OFL), bundled and registered document-level per the application mechanism; all text uppercase with slight tracking.
- Scoped rules (the maximal allowed use of the stable-selector contract):
  - Screen sections framed as panels: full-width title bar with ~40px outer elbow radius and pill end cap, a concave inner fillet (radial-gradient), and a segmented left sidebar rail (color blocks with 4px black gaps, pill bottom cap); alternating bar colors; CSS-counter-generated code labels.
  - Cards: black surface with an 18px domain-colored left pill cap (`--liebe-card-radius: 24px 4px 4px 24px`).
  - Controls: solid color fills with black glyphs/labels (labels bottom-right on pills); sliders as tick-marked gauges (`repeating-linear-gradient` color/black segments); chips rotate through the palette.
- LCARS is the stress test of the selector contract: any LCARS breakage from an internal refactor indicates a contract violation, not a theme bug.

#### Scenario: Token-only theme cannot be broken by markup changes

- **GIVEN** Liquid Glass active
- **WHEN** any card's internal structure changes
- **THEN** the theme still renders correctly, because it touches only tokens.

## Design

```
panel shadow root
├─ @layer liebe-base, liebe-theme, liebe-user;   (order declaration)
├─ <style data-liebe="base">    @layer liebe-base  { tokens: defaults + dark/light sets }
├─ <style data-liebe="theme">   @layer liebe-theme { active theme CSS (built-in map or none) }
├─ <style data-liebe="user">    @layer liebe-user  { theme.customCss }
└─ <Theme appearance={resolved}> …dashboard, root stamped with
     data-liebe-theme / data-appearance…

document <head>
└─ @font-face registrations for bundled theme fonts (Antonio)
```

Built-in themes live in-repo as CSS assets keyed by id (`default`, `liquid-glass`, `lcars`); the registry is data (id, label, appearance support, css) so future themes are additive. User themes are not installable artifacts in this spec — custom CSS covers that need; a shareable theme format MAY layer on later since a theme is already just CSS.

## Constraints

- Shadow-DOM style injection and document-level fonts (see above); no external network fetches for theme assets — Home Assistant installs are often LAN-only.
- Antonio is licensed under the SIL Open Font License and MAY be redistributed with the bundle; the license file MUST ship alongside the font asset.
- `:has()`-based mechanisms from the mockup are prototype-only; the implementation toggles data attributes.
- backdrop-filter (Liquid Glass) is GPU-costly on low-end wall tablets; the theme picker SHOULD note this, and the theme MUST NOT be the default.
- All gates in [architecture — Testing & Quality Conventions](../architecture/index.md#testing--quality-conventions) apply to implementing changes.

## Open Questions

- **HA theme darkness detection.** Whether the panel can reliably read Home Assistant's current theme darkness (for `auto`) across HA versions, or should rely only on `prefers-color-scheme`.
- **Per-screen themes.** Config currently models one theme per dashboard; per-screen overrides are unspecified and deferred.
- **Custom CSS ergonomics.** Whether the editor grows token autocomplete/preview later; textarea is the specified baseline.

## References

- Token contract & anatomy: [design-system](../design-system/)
- Persistence: [dashboard-config](../dashboard-config/) · Injection host: [panel-lifecycle](../panel-lifecycle/)
- Stories per theme: [storybook](../storybook/)
- LCARS palette/geometry reference: thelcars.com (classic v26); Antonio: https://fonts.google.com/specimen/Antonio

## Changelog

| Date       | Change                                                    | Document |
| ---------- | --------------------------------------------------------- | -------- |
| 2026-07-25 | Initial spec created (theming model, not yet implemented) | —        |
