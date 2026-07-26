# 0010 — Design Tokens & Card Anatomy

## Summary

Implement the [design-system](../specs/design-system/index.md) foundation: the `--liebe-*` token contract (Radix-aliased, dark + light), the shared card anatomy components with stable class names (`liebe-card`, `liebe-icon`, `liebe-name`, `liebe-state`, `liebe-slider`, `liebe-pill`, `liebe-chip`, `liebe-value`, `liebe-spark`), the domain color discipline with the 20%-tint active pattern, and the restyled card shell replacing `GridCard`'s stock Radix look. Developed story-first in the workshop from [0009](./0009-storybook-setup.md).

**Spec:** [design-system](../specs/design-system/index.md) · **Status:** complete · **Depends on:** 0009

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

The [design-system spec](../specs/design-system/index.md) owns the token tables, card anatomy and its stable class names, the domain-colour triplet rules, and motion timings; the [theming spec](../specs/theming/index.md#stable-selector-contract) owns the selector contract those classes must satisfy. This change implements them across the existing cards. What it owns:

- **Migration without behavior change:** existing cards move their `GridCard` compound-slot usage onto the new anatomy, and every edit-mode affordance (select, delete, configure) keeps working. Service-call behavior is untouched — the existing tests are the regression gate and MUST pass unmodified.
- **Inline visual declarations must be eliminated**, not merely avoided in new code: today's `backgroundColor`/`borderColor`/`color` style props in `ButtonCard.tsx`, `LightCard.tsx`, and the shell outrank every cascade layer, so leaving them makes those properties permanently untheme-able and would silently break [0012](./0012-theming-engine.md)'s precedence contract before it lands. Visual styling moves to layered classes reading tokens; inline styles survive only for data-driven values (live percentages, actual bulb RGB).
- `Card variant="classic"` usage in the shell is replaced — its inset borders fight the flat surface the token contract specifies.
- Because this is the first change to stamp the anatomy classes and `data-*` attributes, it establishes the selector contract in real markup; 0013's LCARS theme is the downstream consumer that proves it.

#### Scenario: Existing light card, new skin

- **GIVEN** the light card after this change
- **WHEN** its entity turns on
- **THEN** the icon circle transitions to the amber active treatment and the state line shows "On" in the amber text step — and every service-call test from before this change still passes unmodified.

## Design Decisions

- **Anatomy as components, tokens as the only styling channel** — no inline hex/px in components; violations are review-blocking since they break theming.
- **`GridCard` evolves in place** (keeps its API for this change) rather than a parallel shell — avoids a long-lived fork; the tier change (0011) then reworks its size handling.
- **Radix alias fidelity** — resolve the spec's open question during PR 1 by visual comparison in stories; record the outcome in the spec changelog.

## Tasks

- [x] **PR 1 — Tokens**: token stylesheet (dark/light, Radix aliases), injected in the shadow root; token reference story; resolve alias-fidelity question in the spec
- [x] **PR 2 — Anatomy components**: icon circle, meta block, pills, chips, value, spark placeholder; stable classes/attributes; stories + a11y
- [x] **PR 3 — Slider primitive**: Radix-primitive slider (h/v), stories with play-function drag tests. How the spec's accessible-name rule is met here: Radix puts `role="slider"` on `Slider.Thumb`, so the name is passed to the thumb and `label` is a required prop rather than a defaulted one — the primitive cannot be constructed unnamed. `CoverCard` and `LightCard` still label their own `Slider.Root`s, so [#192](https://github.com/fx/liebe/issues/192) stays open until PR 4 migrates them onto this component.
- [x] **PR 4 — Shell restyle**: `GridCard` on tokens/anatomy, flat dark/shadow light, motion rules; migrate all existing cards' shell usage; all card tests green; gallery story updated

## Out of Scope

- Layout tiers (0011), theming engine (0012), any option surface (0014+), behavior changes of any card.
