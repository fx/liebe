# 0010 — Design Tokens & Card Anatomy

## Summary

Implement the [design-system](../specs/design-system/index.md) foundation: the `--liebe-*` token contract (Radix-aliased, dark + light), the shared card anatomy components with stable class names (`liebe-card`, `liebe-icon`, `liebe-name`, `liebe-state`, `liebe-slider`, `liebe-pill`, `liebe-chip`, `liebe-value`, `liebe-spark`), the domain color discipline with the 20%-tint active pattern, and the restyled card shell replacing `GridCard`'s stock Radix look. Developed story-first in the workshop from [0009](./0009-storybook-setup.md).

**Spec:** [design-system](../specs/design-system/index.md) · **Status:** draft · **Depends on:** 0009

## Motivation

Every subsequent visual change (tiers, themes, options, new cards) builds on tokens and anatomy. Landing them first, behind the existing card behavior, lets each later change be small.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` MUST be 100%; `codecov/project` MUST NOT regress.
- Every anatomy component MUST ship with stories covering active/inactive and both appearances ([storybook spec](../specs/storybook/index.md#story-coverage)); the a11y addon MUST pass at serious/critical level.
- Existing card unit tests MUST keep passing — this change restyles, it MUST NOT alter card behavior or service calls.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- Token contract per the [spec tables](../specs/design-system/index.md#token-contract): geometry, surface (dark + light sets), and domain color tokens, defined at the panel root inside the shadow DOM, aliasing Radix tokens where specified.
- Anatomy components implement the [card anatomy](../specs/design-system/index.md#card-anatomy) with the stable class names and `data-domain`/`data-active` attributes from the [theming selector contract](../specs/theming/index.md#stable-selector-contract).
- The slider anatomy MUST be built on the unstyled Radix slider primitive (drag/keyboard/touch), supporting horizontal and vertical orientation, 42px track, tint fill + 3px leading edge, in-track readout.
- The card surface MUST render flat (no border/shadow) in dark and with the small shadow token in light; `Card variant="classic"` usage in the shell is replaced.
- The active icon-circle treatment MUST use the derived companion tokens (`--liebe-c-<name>-tint` via `color-mix` from the base, `-text` per the triplet contract) — never a pinned Radix alpha for the active tint, or a base-only remap would leave the old-colored tint behind; the Radix `--gray-a3` alpha is reserved for the **inactive** neutral treatment, per the [design-system triplet rules](../specs/design-system/index.md#domain-color-discipline).
- Motion: 280ms ease-out on state color transitions; press scale 0.98 on coarse pointers (camera exemption preserved per [entity-cards](../specs/entity-cards/index.md)); all honoring `prefers-reduced-motion`.
- Existing cards MUST migrate their shell usage (`GridCard` compound slots) to the new anatomy without behavior change; edit-mode affordances (select/delete/configure) keep working.
- The migration MUST eliminate inline visual declarations from cards (today's `backgroundColor`/`borderColor`/`color` style props in `ButtonCard.tsx`, `LightCard.tsx`, and the shell): inline styles outrank every cascade layer, making those properties untheme-able ([theming — layering rules](../specs/theming/index.md#application-mechanism)). Visual styling moves to layered classes/tokens; inline styles remain only for data-driven values (live percentages, actual bulb RGB).

#### Scenario: Existing light card, new skin

- **GIVEN** the light card after this change
- **WHEN** its entity turns on
- **THEN** the icon circle transitions to amber-on-amber-tint, the state line shows "On" in the amber text step — and every service-call test from before this change still passes unmodified.

#### Scenario: Tokens flip with appearance

- **GIVEN** a story rendered in dark appearance
- **WHEN** the appearance toolbar switches to light
- **THEN** surfaces, text tiers, and shadows all follow via tokens with no component-level conditionals.

## Design Decisions

- **Anatomy as components, tokens as the only styling channel** — no inline hex/px in components; violations are review-blocking since they break theming.
- **`GridCard` evolves in place** (keeps its API for this change) rather than a parallel shell — avoids a long-lived fork; the tier change (0011) then reworks its size handling.
- **Radix alias fidelity** — resolve the spec's open question during PR 1 by visual comparison in stories; record the outcome in the spec changelog.

## Tasks

- [ ] **PR 1 — Tokens**: token stylesheet (dark/light, Radix aliases), injected in the shadow root; token reference story; resolve alias-fidelity question in the spec
- [ ] **PR 2 — Anatomy components**: icon circle, meta block, pills, chips, value, spark placeholder; stable classes/attributes; stories + a11y
- [ ] **PR 3 — Slider primitive**: Radix-primitive slider (h/v), stories with play-function drag tests
- [ ] **PR 4 — Shell restyle**: `GridCard` on tokens/anatomy, flat dark/shadow light, motion rules; migrate all existing cards' shell usage; all card tests green; gallery story updated

## Out of Scope

- Layout tiers (0011), theming engine (0012), any option surface (0014+), behavior changes of any card.
