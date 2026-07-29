# 0025 — Vacuum Card

## Summary

Create the new `VacuumCard` per the [vacuum option doc](../specs/entity-cards/options/vacuum.md): a state-machine primary action (docked/idle → start, cleaning → pause, paused → resume, returning/error → more-info), domain options `showCommands`, `showBattery` (amber under 20%, sourced from a battery sensor), `showFanSpeed`, `showLocate`, and `showStats`, feature-gated on the entity's `supported_features` bits where the current `VacuumEntityFeature` set provides one, an alert-colored error state that surfaces the standardized `status` attribute's message (falling back to `error`, then `Error`), and the teal vacuum domain token. Registers the `vacuum` domain in `domainToCard`, the shared `CardProps` contract, and `SUPPORTED_DOMAINS` per the [entity-cards registry](../specs/entity-cards/index.md#card-dispatch-and-registry).

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/vacuum](../specs/entity-cards/options/vacuum.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

`vacuum` entities currently fall back to `ButtonCard`, whose blind toggle is wrong for a domain where the useful next action depends on state (start vs. pause vs. inspect). With tiers (0011) and the universal option surface (0014) landed, the vacuum card can be built directly to its option doc — state-aware primary action, feature-gated controls, and glanceable battery/error signals — instead of retrofitting later.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The primary-action state machine MUST have exhaustive unit tests per state (`docked`, `idle`, `cleaning`, `paused`, `returning`, `error`, `unavailable`/`unknown`), including the feature-gated fallthroughs (`cleaning` without `PAUSE` → `vacuum.stop` when `STOP`, else `more-info`; `docked`/`idle` without `START` → `more-info`) and the `returning`-state button behavior (Pause calling `vacuum.pause` when `PAUSE` is supported, disabled otherwise, while tap stays `more-info`).
- Stories MUST cover the state × tier matrix (docked / cleaning / paused / returning / error / unavailable across `glance`/`row`/`full`), plus each option toggle, per [storybook — story coverage](../specs/storybook/index.md#story-coverage).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [vacuum option doc](../specs/entity-cards/options/vacuum.md) owns the option keys, defaults, the primary-action state machine and its feature gating, the command cluster (including the legacy on/off degradation), the required error state, tier layouts, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **Registration:** `VacuumCard` registers under `vacuum` in `domainToCard`, accepts the shared `CardProps` contract, renders through the common shell, and `vacuum` joins `SUPPORTED_DOMAINS`.
- **Legacy pinning** (common convention 7, mirroring 0023): `vacuum` items predating this change render the fallback card, whose tap is a power toggle. The loader writes `tapAction: 'toggle'` onto those items to preserve their operation; new cards get the state-machine `default`. Migration unit-tested.
- **Every command dispatch** — start/pause/resume/stop, `vacuum.return_to_base`, `vacuum.locate` — uses the non-retrying path from [0014](./0014-universal-card-options.md), since retries re-start runs or chirp the vacuum repeatedly. The guard covers **both the command buttons and the card body's default action**, which issues the same services: a `vacuum.start` acknowledged before the entity leaves `docked` must not be re-dispatchable by a second body tap. Boundary tests per button plus the body action's laggy-integration case.
- Fixtures MUST model a battery **sensor** entity as the vacuum's battery source, not the deprecated `battery_level` attribute — Core 2025.8 deprecated it and it stops working in 2026.8, so a fixture built on the attribute would encode an API that expires during this change's lifetime.

## Design Decisions

- **State machine, not toggle** — the default tap resolves per state and per supported feature; a blind toggle is wrong for half the states (`returning`, `error`) and destructive for others. The start/pause command button shares the same resolution logic for command states, with one deliberate divergence in `returning`: tap stays `more-info` (safe inspection default) while the button renders Pause when `PAUSE` is supported and disables otherwise, per the [option doc's Commands rules](../specs/entity-cards/options/vacuum.md#commands-showcommands).
- **`returning` maps to `more-info`** — mid-return the least destructive default is inspection; the dock button renders disabled (the vacuum is already returning) and Pause is the explicit interruption control (per the option doc).
- **Select for fan speed, not pills** — `fan_speed_list` length varies widely across integrations and must not overflow the tier.
- **Locate and stats default off** — locating is occasional and not all integrations report stats; defaults keep the `full` tier quiet.
- **Error text on the card, full text in the dialog** — the one-line ellipsized `error`-attribute message gives glanceability; `more-info` (the default tap in `error`) carries the full text, so the card never scrolls.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [x] **PR 1 — VacuumCard core**: card component, registry entry (`domainToCard`, `SUPPORTED_DOMAINS`), primary-action state machine with feature-gated fallthroughs, command cluster + battery segment, tier layouts, error state; the legacy-pinning loader migration (`tapAction: 'toggle'` onto pre-existing vacuum items) with legacy/new-item tests; exhaustive per-state unit tests + state × tier stories
- [ ] **PR 2 — Options + spec registration**: `showFanSpeed`/`showLocate`/`showStats` controls, `ConfigDefinition` for all five options with YAML round-trip test, option stories; add the vacuum card to the [entity-cards spec](../specs/entity-cards/index.md) (requirements section, registry listing, changelog entry)

## Out of Scope

- **Room/zone map targeting** — interactive maps and per-room/zone commands are explicitly future work (option doc open question); attribute shapes are integration-specific and unstandardized.
- **Companion battery sensor binding** — `showBattery` reads the entity's own battery capability only; binding a separate battery sensor entity is an open question deferred past this change.
- **Dedicated stop button** — `STOP` serves only as the `cleaning`-tap fallback; a third cluster button is deferred pending touch testing.
- Other new card families (media player, security, person, scene), history data in the detail dialog (0015).
