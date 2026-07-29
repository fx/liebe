# 0016 — Light Card to Spec

## Summary

Implement the light-specific options from the [light option contract](../specs/entity-cards/options/light.md) on top of the tier layouts (0011) and universal option surface (0014): the `enableBrightness` → `showBrightnessSlider` migration, `showColorTempControl`, `showColorControl`, `useLightColor` (with RGB fallback and lightness clamp), and `brightnessPresets` — plus their config-form entries and tier placements. Universal options and the action system are already in place per 0014 and are not re-implemented here.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/light](../specs/entity-cards/options/light.md) · **Status:** complete · **Depends on:** 0011, 0014

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

The [light option doc](../specs/entity-cards/options/light.md) owns the option keys, defaults, tier placements, capability gating, control behavior (brightness, colour temperature, colour, presets, bulb-colour theming), and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- Options are stored under `item.config` and edited via the light card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- **Config migration:** the loader rewrites the legacy `enableBrightness` key to `showBrightnessSlider` (identical semantics), following the weather `preset` → `variant` pattern. The legacy key is never written back and exports contain only the new key.
- **No legacy pinning for the new controls** (common convention 7): the colour-temperature and colour controls are _additive_ surfaces, so they appear on existing full-tier light cards under their new `true` defaults without a migration. Existing interactions are unchanged.
- Brightness conversion between the 0–100 UI scale and HA's 0–255 lives in one place, shared by the slider and the preset pills.

## Design Decisions

- **Color picker presentation: swatch palette** — resolves the option doc's open question. `showColorControl` renders a fixed single row of curated color swatches plus one "recent color" slot (the last color committed from this card). Rationale: one tap per selection suits the touch-first mandate, a fixed row fits the `full` tier without scrolling by construction, and swatches need no drag precision on wall-mounted tablets. A hue/saturation wheel is deferred as a future `colorControlStyle` select (common convention 5) — the boolean gates visibility only, so adding styles later is non-breaking.
- **Migration at the loader, not the card** — `enableBrightness` is rewritten once at config load (weather `preset` → `variant` pattern), so the card and config form only ever see `showBrightnessSlider`; no dual-key reads scattered through render code.
- **Color resolution is a pure helper** — RGB derivation from `hs`/`xy`/color-temp, the lightness clamp, and the token fallback live in one unit-tested function inside the LightCard component folder, keeping tint logic out of JSX and identical between icon and slider fill.
- **Presets are data, not layout** — the pill row is a straightforward map over the filtered array using the existing `liebe-pill` anatomy from 0010; no new primitive.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

PR 2 was split into 2a and 2b once its scope was clear: two new controls plus the tinting plus a dispatch migration is two reviewable units, not one. The seam is the dispatch migration, and it only works in this order — 2a moves the card's existing dispatches onto the guarded path, so 2b's new controls are written onto it from the start. The reverse would have 2b migrating dispatches it also introduces. 2a is behavior change to existing operation; 2b is additive surface, and the two want different review attention.

- [x] **PR 1 — Brightness option + migration**: `enableBrightness` → `showBrightnessSlider` loader migration; config-form entry; slider placement per tier (row horizontal, tall vertical, full horizontal; never glance); nonzero-never-0 rounding guard; loader/payload/gating unit tests; stories
- [x] **PR 2a — Light-color theming + dispatch migration**: bulb-colour resolution and the colour precedence per [options/light — light-color theming](../specs/entity-cards/options/light.md#light-color-theming-uselightcolor); colour capability detection per [the option table](../specs/entity-cards/options/light.md#options); `useLightColor` config-form entry; **migration of the card's existing toggle and brightness dispatches onto the guarded path**, with the boundary-level single-call test including the early-acknowledgement case; unit tests; stories
- [x] **PR 2b — Color and color-temperature controls**: the [color-temperature control](../specs/entity-cards/options/light.md#color-temperature-showcolortempcontrol) and the [colour control](../specs/entity-cards/options/light.md#color-showcolorcontrol); their config-form entries; payload/gating unit tests; stories
- [x] **PR 3 — Brightness presets + spec sync**: `brightnessPresets` pill row (validation, selected state, turn-on-from-off); config-form entry; unit tests + stories; update [entity-cards — Lights](../specs/entity-cards/index.md#lights) and the light option doc's status line to reflect implemented behavior, and record the change in the spec changelog

## Out of Scope

- Universal options and the action system (0014); layout tiers themselves (0011); tokens/anatomy incl. the slider primitive (0010).
- `colorControlStyle` select and any hue/saturation wheel; effects (`effect_list`); light groups.
- Always-rendered slider while off (open question in the option doc; deferred).
- History data in the detail dialog (0015) and other domain cards (0017+).
