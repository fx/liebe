# Design System

## Overview

The design system defines Liebe's default visual language: a token contract every component reads, a shared card anatomy, a domain color discipline, and size-adaptive card layouts. It is the foundation the [theming system](../theming/) overrides and the [component workshop](../storybook/) exercises.

**Status: partially implemented — token contract only.** The [token contract](#token-contract) ships as of [0010](../../changes/0010-design-tokens-and-anatomy.md) PR 1: the `--liebe-*` properties are declared for both appearances and exercised in the workshop. Nothing consumes them yet. The [card anatomy](#card-anatomy) and its stable classes, the slider primitive, and the card shell restyle are the remaining tasks of [0010](../../changes/0010-design-tokens-and-anatomy.md); the [size-adaptive layout tiers](#size-adaptive-layouts) are [0011](../../changes/0011-layout-tiers.md). Until those land, cards keep their stock Radix Themes styling (see [entity-cards](../entity-cards/)) and the rest of this document describes the target visual system. It was validated in a throwaway static mockup which this spec supersedes and replaces as the sole reference.

The design targets what the smart-home community demonstrably prefers: flat, shadowless cards one elevation step above the background in dark mode, large radii, a tinted icon-circle state pattern, strict domain-color discipline, and two-line typography. All hue on the dashboard carries state meaning; chrome stays neutral.

## Background

Research across card-ecosystem popularity data, community forums, and the most-shared dashboards converged on a consistent visual grammar for "polished" Home Assistant dashboards (dark-first, 20px radii, icon-in-tinted-circle, embedded sliders, chip rows). Liebe's defaults adopt that grammar so dashboards look considered without any user styling. Radix UI Themes remains the component substrate: the token contract aliases Radix tokens wherever a close match exists so appearance switching and Radix upgrades keep working.

## Requirements

### Token contract

- The system MUST define all visual attributes as CSS custom properties (the "token contract") on the panel's themed root — the element carrying Radix's theme scope, see [Design](#design) — under a `--liebe-*` namespace.
- Components MUST read visual attributes only through tokens (directly or via a class that reads tokens). Components MUST NOT hardcode colors, radii, blur, borders, or shadows that a theme could reasonably want to change.
- Where a Radix Themes token is a close match, the Liebe token MUST alias it (e.g. `--liebe-card-bg: var(--color-panel-solid)`) rather than duplicate a literal value, so Radix appearance switching flows through automatically.
- The token contract is the public theming API: token names, meanings, and value types MUST be documented in this spec and MUST NOT be renamed without a migration note in the [theming spec](../theming/).

Geometry tokens and defaults:

| Token                    | Default  | Purpose                                          |
| ------------------------ | -------- | ------------------------------------------------ |
| `--liebe-card-radius`    | `20px`   | Card corner radius (accepts 1–4 value shorthand) |
| `--liebe-chip-radius`    | `9999px` | Chips and pill buttons                           |
| `--liebe-control-radius` | `12px`   | Embedded controls (sliders, mode pills, artwork) |
| `--liebe-circle-radius`  | `50%`    | Icon circles, avatars, round buttons             |
| `--liebe-card-padding`   | `14px`   | Card inner padding                               |
| `--liebe-grid-gap`       | `12px`   | Gap between grid cells                           |
| `--liebe-icon-circle`    | `40px`   | Icon circle diameter (glyph ≈ 22px)              |
| `--liebe-control-height` | `42px`   | Embedded slider height                           |
| `--liebe-chip-height`    | `34px`   | Chip height                                      |

Surface tokens (dark defaults / light values):

| Token                 | Dark         | Light                        |
| --------------------- | ------------ | ---------------------------- |
| `--liebe-bg`          | `#111114`    | `#efeef2`                    |
| `--liebe-card-bg`     | `#1b1b1f`    | `#fcfcfd`                    |
| `--liebe-card-border` | `none`       | `none`                       |
| `--liebe-card-blur`   | `none`       | `none`                       |
| `--liebe-card-shadow` | `none`       | `0 2px 4px rgba(0,0,0,0.08)` |
| `--liebe-fg`          | `#f2f2f5`    | `#1a1a1e`                    |
| `--liebe-muted`       | 62% alpha fg | 60% alpha fg                 |
| `--liebe-faint`       | 38% alpha fg | 38% alpha fg                 |
| `--liebe-hairline`    | 7% alpha fg  | 8% alpha fg                  |
| `--liebe-track`       | 8% alpha fg  | 7% alpha fg                  |

These literal values are the design intent; the implementation SHOULD substitute the nearest Radix gray-scale tokens (`--color-background`, `--color-panel-solid`, `--gray-a*`) where the difference is imperceptible. **Resolved in [0010](../../changes/0010-design-tokens-and-anatomy.md) PR 1:** every surface token that carries a _color_ aliases a Radix token — no colour literal is pinned — but the alias is a **gray-scale step chosen per appearance**, not the semantic `--color-*` pair. (The structural values stay as the table specifies: `--liebe-card-border` and `--liebe-card-blur` are `none` in both appearances, as is `--liebe-card-shadow` in dark, since there is no Radix token for "no shadow".) In dark those coincide (`--color-background` → `--gray-1`, `--color-panel-solid` → `--gray-2`, both within ~2/255 of the reference); in light both semantic tokens resolve to plain white, which would erase the ground-to-card separation the design depends on, so light aliases `--gray-3` for the ground and `--gray-1` for the card. With the default gray (slate, paired with the default indigo accent) the steps match the reference hexes near-exactly in both appearances — `--gray-3` is `#f0f0f3` against a `#efeef2` reference, `--gray-1` is `#fcfcfd` exactly. The remaining surface tokens alias directly: `--liebe-fg: var(--gray-12)`, muted/faint/hairline/track the `--gray-a*` alpha steps, and the light card shadow `var(--black-a2)`.

Typography tokens:

| Token                    | Default                    | Purpose                                                |
| ------------------------ | -------------------------- | ------------------------------------------------------ |
| `--liebe-font-family`    | system stack (Radix)       | Typeface for all dashboard text                        |
| `--liebe-text-transform` | `none`                     | Casing applied to names, state text, labels, and chips |
| `--liebe-letter-spacing` | `normal`                   | Tracking companion to the casing token                 |
| `--liebe-font-numeric`   | `var(--liebe-font-family)` | Typeface for numeric readouts, so figures can differ   |

These MUST be declared on the themed root and inherited, not applied per component, so a theme that sets them restyles every text surface — including [portalled overlays](../theming/index.md#application-mechanism), whose mirrored root carries the same declarations. This is what makes a whole-dashboard typographic reskin (LCARS: bundled Antonio, uppercase, slight tracking) expressible as token values rather than as rules targeting selectors outside the [stable contract](../theming/index.md#stable-selector-contract). Casing MUST go through `--liebe-text-transform` rather than literal uppercase text or per-component `text-transform`, so the default theme's sentence case and a theme's uppercase are the same mechanism.

#### Scenario: A theme changes one token and every card follows

- **GIVEN** the default theme with `--liebe-card-radius: 20px`
- **WHEN** a theme sets `--liebe-card-radius: 0`
- **THEN** every card, in every state and size, renders square corners with no per-component override needed.

### Domain color discipline

- Each entity domain MUST have a semantic color token; these are the only hue carriers in **dashboard chrome and UI accents** — icon tints, state text, control fills, selection states. Neutral chrome MUST stay gray-scale. **Content is exempt**: media artwork, camera feeds, weather condition imagery, person avatars (including the generated initials backgrounds, which are identity colors, not state), and whatever decorative color a theme brings are content/theming, not chrome, and carry whatever color they carry.
- Default mapping (Radix scale in parentheses — implementations MUST use the Radix scale, shown hex is the design reference):

| Token               | Domain / meaning                                                                          | Reference | Radix scale |
| ------------------- | ----------------------------------------------------------------------------------------- | --------- | ----------- |
| `--liebe-c-light`   | Lights on                                                                                 | `#ffc107` | `amber`     |
| `--liebe-c-heat`    | Climate heating                                                                           | `#ff6f22` | `orange`    |
| `--liebe-c-cool`    | Climate cooling, covers                                                                   | `#29b6f6` | `sky`       |
| `--liebe-c-ok`      | Locked, home, secure, fan                                                                 | `#4caf50` | `green`     |
| `--liebe-c-alert`   | Alerts, unlocked, away                                                                    | `#f44336` | `red`       |
| `--liebe-c-media`   | Media playing, scenes                                                                     | `#7986cb` | `indigo`    |
| `--liebe-c-vacuum`  | Vacuum active                                                                             | `#26a69a` | `teal`      |
| `--liebe-c-water`   | Humidity, water                                                                           | `#4fc3f7` | `cyan`      |
| `--liebe-c-default` | Generic active — switches, outlets, input helpers, and any domain without a dedicated row | `#2196f3` | `blue`      |
| `--liebe-c-brand`   | Liebe brand mark only                                                                     | `#e9526f` | `crimson`   |

- Every **rendered semantic state** MUST resolve to exactly one token — resolution is state-aware, not a fixed per-domain assignment: a thermostat resolves heat/cool/ok by HVAC state, a lock resolves ok/alert by lock state, binary sensors resolve by `device_class`; domains with no state-specific rule use their table row, and domains without any row use `--liebe-c-default`. This state-aware resolution is what the universal `color: auto` option means ([entity-cards options — common](../entity-cards/options/common.md)), and it is total: every card, in every state, including the unmapped-domain fallback, resolves to a defined token. **One documented exception:** the light card's `useLightColor` option MAY tint the active treatment with the bulb's actual RGB color under `color: auto` ([options/light](../entity-cards/options/light.md)) — real light color is information no fixed token can carry; every other card resolves to tokens only, and an explicit named `color` overrides the bulb color too.

- **Each domain color is a token triplet**, so a theme remapping one hue remaps the entire active treatment: `--liebe-c-<name>` (the base — saturated glyph/solid role), `--liebe-c-<name>-tint` (the ~20%-alpha surface role), and `--liebe-c-<name>-text` (the text role at readable contrast). The **base layer** MUST define the companions only as derivations from the base token — tint as `color-mix(in srgb, var(--liebe-c-<name>) 20%, transparent)`, text as `var(--liebe-c-<name>)` — never as fixed color values, so a theme that remaps only the base automatically recolors glyph, tint, and text together (a fixed alias like `var(--amber-a4)` in the base layer would survive a base-only remap and break this promise). The **default theme** then explicitly sets the base tokens to their Radix step-9 colors and the `-text` companions to step 11 (raw step-9 hues lack text contrast). An explicit companion is an override like any other: wherever the active theme has set one, the automatic base-only-remap promise applies only to the tokens it left derived — so user CSS remapping a base **under the Default theme** SHOULD also set `-text` (the tint still follows automatically via derivation, since Default does not pin tints); themes whose remapped bases lack text contrast on their ground likewise SHOULD set `-text` explicitly (contract note in [theming](../theming/index.md#stable-selector-contract)).
- **Active-state pattern**: an active element MUST render its glyph in the base domain color on the domain's tint token; an inactive element MUST render a muted glyph on a ~5%-alpha neutral (`--gray-a3`). This single pattern MUST be used consistently by icon circles, chips, selected pills, and slider fills.
- State text ("On", "Heating", "Locked") SHOULD take the domain's text token; supporting values ("· 80%") stay muted.

#### Scenario: Light turns on

- **GIVEN** a light card whose entity is `off` (gray glyph on 5% neutral circle)
- **WHEN** the entity becomes `on`
- **THEN** the icon circle animates (≤300ms) to amber glyph on 20% amber tint, and the state text "On" renders in the amber text step.

### Typography

- Text MUST read its typeface, casing, and tracking from the typography tokens above rather than declaring them per component. The **default theme** sets `--liebe-font-family` to the system-native stack (Radix default) with `--liebe-text-transform: none`; no webfont ships in the default theme.
- Type ramp (all MUST be expressed via tokens or the Radix size scale):
  - Entity name: 14px / 500 / 20px line-height, single line, ellipsized.
  - State line: 12.5px / 400, muted color, single line, ellipsized.
  - Large numeric readout (sensor value, target temp): 27–34px / 300, `tabular-nums`.
  - Section/screen title: 24–26px / ~480, slight negative tracking.
  - Eyebrow labels: 11px / 650 / uppercase / 0.09em tracking, faint color.
- Numeric displays MUST use `font-variant-numeric: tabular-nums`.

### Card anatomy

Every entity card composes from a fixed set of anatomy parts, each with a stable, documented class name (`liebe-` prefix) so themes and tests can target them (see [theming — stable selectors](../theming/index.md#stable-selector-contract)):

- **Tile** (`liebe-card`): the card surface — `--liebe-card-bg`, `--liebe-card-radius`, `--liebe-card-border`, `--liebe-card-blur`, `--liebe-card-shadow`, padding `--liebe-card-padding`, `overflow: hidden`.
- **Icon circle** (`liebe-icon`): 40px circle implementing the active/inactive tint pattern.
- **Meta block** (`liebe-name`, `liebe-state`): the two-line name/state stack.
- **Embedded slider** (`liebe-slider`): 42px-tall track with a translucent domain-tint fill and a 3px saturated leading edge; supports horizontal and vertical orientation; value readout inside the track.
- **Pill controls** (`liebe-pill`): 38px equal-width mode buttons; selected pill uses the active tint pattern.
- **Chip** (`liebe-chip`): 34px pill for header rows — icon-dot + label, same tint pattern.
- **Big value** (`liebe-value`): the large numeric readout with unit in muted 14px.
- **Sparkline** (`liebe-spark`): inline history graph — 2px domain-color line, 14%-alpha area fill, emphasized endpoint dot; no axes or gridlines at card sizes.

- Cards MUST be flat in dark appearance (no border, no shadow) and MAY carry the small shadow token in light appearance.
- Whole-card touch targets: the primary action MUST be the full tile; discrete controls MUST be ≥44px in at least one dimension (40px circles get ≥44px hit areas via padding).
- Press feedback: cards SHOULD scale to 0.98 on active press (coarse pointers), except cards that open in-place overlays (see camera constraint in [entity-cards](../entity-cards/)).

### Size-adaptive layouts

Cards are freely resizable on the grid; content MUST adapt to the grid span rather than scale. Four layout tiers, derived from the item's **effective rendered span** — the responsive-scaled dimensions the grid actually lays out at the active breakpoint, not the stored dimensions (a stored 2×1 item collapsing to one effective cell on a narrow grid is `glance`, and the tier re-derives when the breakpoint changes):

| Tier     | Span            | Content                                                                         |
| -------- | --------------- | ------------------------------------------------------------------------------- |
| `glance` | 1×1             | Icon circle + name + state, stacked; whole tile is the primary action           |
| `row`    | ≥2 wide, 1 tall | Icon + meta in a row, plus the primary embedded control (slider, stepper, play) |
| `tall`   | 1 wide, ≥2 tall | Icon on top, vertical control (e.g. vertical dimmer), meta at bottom            |
| `full`   | ≥2×≥2           | Row layout plus secondary controls (mode pills, presets, graph, forecast)       |

- Every card MUST implement `glance` and `row`; `tall` and `full` are per-card (see per-card option docs under [entity-cards/options](../entity-cards/options/common.md)).
- A card MUST degrade gracefully: content that does not fit its tier MUST be omitted, never clipped or scrolled.
- The tier MUST be derived from grid dimensions; the legacy `size: small|medium|large` prop is superseded (migration is an implementation concern for the change documents, not this spec).

#### Scenario: Resizing a light card

- **GIVEN** a light card at 2×1 showing icon, name/state, and a brightness slider
- **WHEN** the user resizes it to 1×1 in edit mode
- **THEN** the card re-renders in `glance` tier — icon over name/state, no slider — with the whole tile toggling the light.

### Motion

- State-driven color/background changes MUST transition ~280ms ease-out.
- Press feedback ≤100ms. Overlay/sheet entrances ≤250ms.
- All non-essential animation MUST be disabled under `prefers-reduced-motion: reduce`.

## Design

Token layering (base → theme → user), application mechanism, and shadow-DOM constraints are owned by the [theming spec](../theming/). Radix integration approach:

- Chrome and edit-mode UI (dialogs, selects, config forms) remain stock Radix Themes components.
- Card anatomy parts are custom components styled by tokens; behavior-heavy controls (slider) build on unstyled Radix primitives (`@radix-ui/react-slider`) rather than bending `@radix-ui/themes` styled components.
- The card surface uses a plain token-styled element (not `Card variant="classic"`, whose inset borders fight the flat look).
- Tokens are declared on the **Radix theme root** (`.radix-themes`), not on the shadow host or the React container above it: Radix declares `--color-*`, `--gray-*` and `--default-font-family` there, and a `var()` inside a custom property substitutes at the element that declares it, so aliasing from any higher element resolves to nothing. It is also the element Radix marks `.dark`/`.light`, which is what makes the appearance-conditional tokens flip with Radix's own signal. **Consequence for the theme and user layers:** their token overrides MUST land on this same element — a derived companion (`-tint`) only re-derives where its base is overridden on the same element, so an override on a descendant would leave tint and text behind on the old hue.
- Per-domain coloring MUST be applied by consuming the `--liebe-c-*` triplets, never by passing Radix per-instance `color` props or referencing Radix scale variables at the point of use. Those bypass the token contract: a component coloured by a Radix prop keeps its original hue when LCARS or user CSS remaps the triplet, silently breaking the remapping promise the token contract makes. The Radix scales remain the _source_ of the default theme's token values — the indirection through `--liebe-c-*` is what makes them themeable. The single Theme `accentColor` is not used for domain state.

## Constraints

- Radix UI Themes stays the component library; customization order remains props → token adjustments → primitives + tokens → minimal overrides (project AGENTS.md).
- The panel renders inside Home Assistant's shadow DOM; token definitions and theme styles must be injected into the shadow root (see [panel-lifecycle](../panel-lifecycle/) and [theming](../theming/)).
- No custom z-index values beyond `auto`/`0`/`-1`; overlays use portals. **Standing exception:** the camera in-place fullscreen (`CAMERA_FULLSCREEN_Z_INDEX`, [camera-streaming](../camera-streaming/), change 0008) — the stream node cannot portal without reconnecting, so it lifts above Home Assistant's chrome by z-index by design; that contract is unaffected by this rule.
- Touch-first: 44px minimum targets, `-webkit-tap-highlight-color` managed centrally.
- All gates in [architecture — Testing & Quality Conventions](../architecture/index.md#testing--quality-conventions) apply to implementing changes.

## Open Questions

- ~~**Radix alias fidelity.**~~ Answered by change [0010](../../changes/0010-design-tokens-and-anatomy.md) PR 1, compared side by side in the workshop's `Design System/Tokens` → _Alias fidelity_ story: no literals are pinned. `--color-panel-solid` is close enough in both appearances, `--color-background` is not (white in light), so the surface tokens alias appearance-specific gray-scale **steps** instead of the semantic pair — see the note under the surface token table.
- ~~**Sparkline data source.**~~ Answered by change [0015](../../changes/0015-history-and-forecast-data.md) (pending implementation): `useEntityHistory` provides windowed, downsampled series with sample/delta modes; sparklines are a follow-up consuming that hook (0018/0020), not part of the design-system changes. The anatomy ships in 0010; graphs light up when 0015 lands.
- **Legacy `size` prop migration.** Existing configs persist card dimensions already; the mapping from stored `size` values (if any survive) to tiers needs an audit in the dashboard-config spec before implementation.

## References

- Related specs: [theming](../theming/), [entity-cards](../entity-cards/), [storybook](../storybook/), [grid-layout](../grid-layout/)
- Radix styling guidance: https://www.radix-ui.com/themes/docs/overview/styling

## Changelog

| Date       | Change                                                                                                                                                                                                 | Document                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 2026-07-25 | Initial spec created (target design system, not yet implemented)                                                                                                                                       | —                                                       |
| 2026-07-26 | Token contract implemented (dark + light, Radix-aliased); "Radix alias fidelity" answered — no literals pinned, surface tokens alias appearance-specific gray steps; token declaration root documented | [0010](../../changes/0010-design-tokens-and-anatomy.md) |
