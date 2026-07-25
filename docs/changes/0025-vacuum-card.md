# 0025 — Vacuum Card

## Summary

Create the new `VacuumCard` per the [vacuum option doc](../specs/entity-cards/options/vacuum.md): a state-machine primary action (docked/idle → start, cleaning → pause, paused → resume, returning/error → more-info), domain options `showCommands`, `showBattery` (amber under 20%), `showFanSpeed`, `showLocate`, and `showStats`, all feature-gated on the entity's `supported_features` bits, an alert-colored error state that surfaces the standardized `status` attribute's message (falling back to `error`, then `Error`), and the teal vacuum domain token. Registers the `vacuum` domain in `domainToCard`, the shared `CardProps` contract, and `SUPPORTED_DOMAINS` per the [entity-cards registry](../specs/entity-cards/index.md#card-dispatch-and-registry).

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/vacuum](../specs/entity-cards/options/vacuum.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

`vacuum` entities currently fall back to `ButtonCard`, whose blind toggle is wrong for a domain where the useful next action depends on state (start vs. pause vs. inspect). With tiers (0011) and the universal option surface (0014) landed, the vacuum card can be built directly to its option doc — state-aware primary action, feature-gated controls, and glanceable battery/error signals — instead of retrofitting later.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The primary-action state machine MUST have exhaustive unit tests per state (`docked`, `idle`, `cleaning`, `paused`, `returning`, `error`, `unavailable`/`unknown`, and the legacy toggle-vacuum `on`/`off` states with their `TURN_ON`/`TURN_OFF` (bits 1/2) gating and on/off-toggle command degradation), including the feature-gated fallthroughs (`cleaning` without `PAUSE` → `vacuum.stop` when `STOP`, else `more-info`; `docked`/`idle` without `START` → `more-info`) and the `returning`-state button behavior (Pause calling `vacuum.pause` when `PAUSE` is supported, disabled otherwise, while tap stays `more-info`).
- Stories MUST cover the state × tier matrix (docked / cleaning / paused / returning / error / unavailable across `glance`/`row`/`full`), plus each option toggle, per [storybook — story coverage](../specs/storybook/index.md#story-coverage).

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- New `VacuumCard` registered under `vacuum` in `domainToCard`, accepting the shared `CardProps` contract and rendering through the common shell; `vacuum` added to `SUPPORTED_DOMAINS` so it appears in the EntityBrowser. Domain color is the vacuum token (`--liebe-c-vacuum`, teal).
- **Legacy pinning** (common convention 7, mirroring 0023): `vacuum` items that predate this change (imported YAML / advanced discovery) render the fallback card today, whose tap is a power toggle — the loader MUST write `tapAction: 'toggle'` onto those items so their operation is preserved, while new cards get the state-machine `default`. Migration unit-tested.
- `tapAction: default` resolves via the state machine in the [option doc's primary-action table](../specs/entity-cards/options/vacuum.md#primary-action); every mapping is feature-gated on `supported_features` (`PAUSE` 4, `STOP` 8, `RETURN_HOME` 16, `FAN_SPEED` 32, `BATTERY` 64, `LOCATE` 512, `START` 8192) and falls through as specified. `unavailable`/`unknown` are inert.
- Options exactly per the [option table](../specs/entity-cards/options/vacuum.md#options): `showCommands` (default `true`; start/pause + dock cluster in `row`/`full`, dock disabled while `docked`/`returning`). **Every command dispatch** — start/pause/resume/stop, `vacuum.return_to_base`, and `vacuum.locate` — uses the non-retrying path from [0014](./0014-universal-card-options.md) (physical, non-idempotent commands; retries re-start runs or chirp the vacuum repeatedly), and every dispatch surface — command buttons **and the card body's default action**, which issues the same start/pause/resume services — stays guarded from dispatch until the expected state transition or an acknowledgement timeout (the 0024 guard pattern; a `vacuum.start` acknowledged before the entity leaves `docked` must not be dispatchable again by a second body tap), with single-call boundary tests per button and for the body action's laggy-integration case. `showBattery` (default `true`; battery segment appended to the state line, amber below 20%), `showFanSpeed` (default `true`; `full`-tier select over `fan_speed_list` calling `vacuum.set_fan_speed`), `showLocate` (default `false`), `showStats` (default `false`; `cleaned_area`/`cleaning_time` line). Options only hide or tune advertised capabilities — never surface an unsupported control.
- Error state (required, not an option): state `error` renders icon and state text in the alert token (`--liebe-c-alert`) and shows the diagnostic message from the standardized `status` attribute (VacuumEntityFeature.STATUS, bit 128) when present, falling back to a custom `error` attribute, then to `Error` (ellipsized), with `more-info` as the default tap; fixtures include the standard `status` shape.
- Tier layouts per the option doc: `glance` icon/name/state only, `row` adds the command cluster, `full` adds fan-speed select, locate, and stats in order; 1×N spans render `glance`; content that does not fit is omitted, never clipped.
- Config-form controls for the five options in the card's `ConfigDefinition`, round-tripping through YAML with the universal options from 0014.

#### Scenario: Tap follows the state machine

- **GIVEN** a vacuum card with defaults whose entity is `docked` and supports `START` and `PAUSE`
- **WHEN** the user taps the card body
- **THEN** the card calls `vacuum.start`; and **WHEN** the entity state becomes `cleaning` and the user taps again, **THEN** the card calls `vacuum.pause` — never a blind toggle.

#### Scenario: Options cannot enable an unsupported capability

- **GIVEN** a vacuum advertising only `START | RETURN_HOME` on a `full`-tier card with `showFanSpeed: true` and `showLocate: true`
- **WHEN** the card renders
- **THEN** it shows start and dock buttons but no fan-speed select and no locate button — the options are inert because `FAN_SPEED` and `LOCATE` are absent.

## Design Decisions

- **State machine, not toggle** — the default tap resolves per state and per supported feature; a blind toggle is wrong for half the states (`returning`, `error`) and destructive for others. The start/pause command button shares the same resolution logic for command states, with one deliberate divergence in `returning`: tap stays `more-info` (safe inspection default) while the button renders Pause when `PAUSE` is supported and disables otherwise, per the [option doc's Commands rules](../specs/entity-cards/options/vacuum.md#commands-showcommands).
- **`returning` maps to `more-info`** — mid-return the least destructive default is inspection; the dock button renders disabled (the vacuum is already returning) and Pause is the explicit interruption control (per the option doc).
- **Select for fan speed, not pills** — `fan_speed_list` length varies widely across integrations and must not overflow the tier.
- **Locate and stats default off** — locating is occasional and not all integrations report stats; defaults keep the `full` tier quiet.
- **Error text on the card, full text in the dialog** — the one-line ellipsized `status`/`error` message gives glanceability; `more-info` (the default tap in `error`) carries the full text, so the card never scrolls.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — VacuumCard core**: card component, registry entry (`domainToCard`, `SUPPORTED_DOMAINS`), primary-action state machine with feature-gated fallthroughs, command cluster + battery segment, tier layouts, error state; the legacy-pinning loader migration (`tapAction: 'toggle'` onto pre-existing vacuum items) with legacy/new-item tests; exhaustive per-state unit tests + state × tier stories
- [ ] **PR 2 — Options + spec registration**: `showFanSpeed`/`showLocate`/`showStats` controls, `ConfigDefinition` for all five options with YAML round-trip test, option stories; add the vacuum card to the [entity-cards spec](../specs/entity-cards/index.md) (requirements section, registry listing, changelog entry)

## Out of Scope

- **Room/zone map targeting** — interactive maps and per-room/zone commands are explicitly future work (option doc open question); attribute shapes are integration-specific and unstandardized.
- **Companion battery sensor binding** — `showBattery` reads the entity's own battery capability only; binding a separate battery sensor entity is an open question deferred past this change.
- **Dedicated stop button** — `STOP` serves only as the `cleaning`-tap fallback; a third cluster button is deferred pending touch testing.
- Other new card families (media player, security, person, scene), history data in the detail dialog (0015).
