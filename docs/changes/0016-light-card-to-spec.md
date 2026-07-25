# 0016 — Light Card to Spec

## Summary

Implement the light-specific options from the [light option contract](../specs/entity-cards/options/light.md) on top of the tier layouts (0011) and universal option surface (0014): the `enableBrightness` → `showBrightnessSlider` migration, `showColorTempControl`, `showColorControl`, `useLightColor` (with RGB fallback and lightness clamp), and `brightnessPresets` — plus their config-form entries and tier placements. Universal options and the action system are already in place per 0014 and are not re-implemented here.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/light](../specs/entity-cards/options/light.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

`LightCard` currently ships only toggle + brightness: capability detection via `supported_color_modes` (with the `SUPPORT_BRIGHTNESS` bit-flag fallback), an optimistic-drag slider gated by the legacy `enableBrightness` key, and 0%-commit-off. Color temperature and color support are dead code (commented-out detection in `src/components/LightCard.tsx`), the icon/slider are hardcoded amber, and there is no preset row. The option doc specifies all of this; landing it makes the light card the first fully to-spec domain card and retires the last legacy config key.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every option MUST ship stories demonstrating its values ([storybook — story coverage](../specs/storybook/index.md#story-coverage)): slider on/off per tier, color-temp and color controls, `useLightColor` both values (including the RGB-fallback and clamp cases), preset rows.
- New controls MUST have unit tests for their service payloads (`light.turn_on` brightness/color-temp/color payloads, 0%-commit → `light.turn_off`, nonzero-never-rounds-to-0, preset → `brightness` conversion) and for capability gating (`supported_color_modes` matrix incl. `onoff`-only and the legacy `supported_features` fallback).
- The `enableBrightness` migration MUST have loader tests (migrate, no write-back, YAML export contains only the new key).
- Light dispatches (toggle, brightness/color-temp/color/preset commits) MUST migrate to the 0014 non-retrying path with the transition-or-timeout guard, verified by a boundary-level single-call test including the early-acknowledgement case ([common dispatch guarantees](../specs/entity-cards/options/common.md#action-type)).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Option keys, types, defaults, and tier placements exactly per the [light options table](../specs/entity-cards/options/light.md#options): `showBrightnessSlider` (row/tall/full, never glance), `showColorTempControl` (full), `showColorControl` (full), `useLightColor` (all tiers), `brightnessPresets` (full) — each editable via the light card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- Config loader migrates `enableBrightness` → `showBrightnessSlider` (same semantics; never written back; exports contain only the new key), following the weather `preset` → `variant` migration pattern.
- Options only hide or tune capabilities the entity has (common convention 3): controls derive availability from `supported_color_modes` with the legacy `supported_features` fallback; an unsupported capability renders nothing regardless of config.
- Brightness stays 0–100 in the UI, converted to/from HA's 0–255; commit at 0 calls `light.turn_off` (retained); any nonzero position sends `brightness ≥ 1`; slider renders only while `on`; drag state stays local until commit.
- The color-temperature and color controls are **additive** control surfaces (common convention 7): they appear on existing full-tier light cards with the new `true` defaults and require no legacy pinning — existing interactions (toggle, brightness) operate unchanged. Color-temperature control spans the entity-reported range with the payload key bound to the unit of the range it read: entities exposing `min_color_temp_kelvin`/`max_color_temp_kelvin` get `light.turn_on` with `color_temp_kelvin` (Kelvin value); legacy entities exposing only `min_mireds`/`max_mireds` get `color_temp` (mired value). Never mix (a Kelvin value under `color_temp`, or mireds under `color_temp_kelvin`, is an invalid target); both pairings unit-tested.
- Color control renders the swatch palette decided below; selecting a swatch calls `light.turn_on` with the corresponding color payload; the control fits the `full` tier without scrolling.
- `useLightColor: true` tints the icon circle and slider fill from the bulb's resolvable RGB (`rgb_color`, or derived from `hs_color`/`xy_color`/color temperature), lightness-clamped so dark/desaturated colors stay distinguishable from inactive; falls back to the `--liebe-c-light` domain token when off or when no color is resolvable; `false` always uses the domain token; an explicit named universal `color` wins over everything including bulb color (it pins the active treatment per the common contract), so `useLightColor` only governs behavior under `color: auto`.
- `brightnessPresets` renders `liebe-pill` pills in `full` for values 1–100 (invalid entries filtered at render; empty-after-filter hides the row); tapping calls `light.turn_on` with the converted brightness even from `off`; the pill matching current brightness renders selected; requires brightness support.
- Embedded controls (slider, temp control, swatches, pills) consume their own events and never trigger the card's tap action; when brightness is shown, the state line reads the percentage.

#### Scenario: Legacy key migrates and stays gone

- **GIVEN** a stored grid item with `config: { enableBrightness: false }`
- **WHEN** the dashboard configuration loads and the user later exports YAML
- **THEN** the card renders no brightness slider in any tier, and the export contains `showBrightnessSlider: false` with no `enableBrightness` key.

#### Scenario: Preset pill turns an off light on at the preset level

- **GIVEN** an `off` dimmable light on a `full`-tier card with `brightnessPresets: [20, 50, 100]`
- **WHEN** the user taps the `50` pill
- **THEN** the card calls `light.turn_on` with `brightness ≈ 128` (`round(0.5 × 255)`) — it does not merely toggle, and the tap does not bubble into the card's tap action.

## Design Decisions

- **Color picker presentation: swatch palette** — resolves the option doc's open question. `showColorControl` renders a fixed single row of curated color swatches plus one "recent color" slot (the last color committed from this card). Rationale: one tap per selection suits the touch-first mandate, a fixed row fits the `full` tier without scrolling by construction, and swatches need no drag precision on wall-mounted tablets. A hue/saturation wheel is deferred as a future `colorControlStyle` select (common convention 5) — the boolean gates visibility only, so adding styles later is non-breaking.
- **Migration at the loader, not the card** — `enableBrightness` is rewritten once at config load (weather `preset` → `variant` pattern), so the card and config form only ever see `showBrightnessSlider`; no dual-key reads scattered through render code.
- **Color resolution is a pure helper** — RGB derivation from `hs`/`xy`/color-temp, the lightness clamp, and the token fallback live in one unit-tested function inside the LightCard component folder, keeping tint logic out of JSX and identical between icon and slider fill.
- **Presets are data, not layout** — the pill row is a straightforward map over the filtered array using the existing `liebe-pill` anatomy from 0010; no new primitive.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Brightness option + migration**: `enableBrightness` → `showBrightnessSlider` loader migration; config-form entry; slider placement per tier (row horizontal, tall vertical, full horizontal; never glance); nonzero-never-0 rounding guard; loader/payload/gating unit tests; stories
- [ ] **PR 2 — Color, color temp, and light-color theming**: capability detection for color/color-temp; warm→cool temperature control (entity-reported range, Kelvin-preferred); swatch-palette color control with recent-color slot; `useLightColor` tinting with RGB fallback + lightness clamp; config-form entries; payload/gating/clamp unit tests; stories
- [ ] **PR 3 — Brightness presets + spec sync**: `brightnessPresets` pill row (validation, selected state, turn-on-from-off); config-form entry; unit tests + stories; update [entity-cards — Lights](../specs/entity-cards/index.md#lights) and the light option doc's status line to reflect implemented behavior, and record the change in the spec changelog

## Out of Scope

- Universal options and the action system (0014); layout tiers themselves (0011); tokens/anatomy incl. the slider primitive (0010).
- `colorControlStyle` select and any hue/saturation wheel; effects (`effect_list`); light groups.
- Always-rendered slider while off (open question in the option doc; deferred).
- History data in the detail dialog (0015) and other domain cards (0017+).
