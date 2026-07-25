# 0023 — Media Player Card

## Summary

Create the dedicated media player card specified in the [media-player option contract](../specs/entity-cards/options/media-player.md) on top of the tier layouts (0011) and universal option surface (0014): a `MediaPlayerCard` registered under `media_player` in `domainToCard`, with play/pause as the default tap action, `artworkMode` (background / thumbnail / none via the HA-proxied `entity_picture`), `showVolume` (slider / buttons / none), `showTransport`, `showSourcePicker`, `showProgress` (with seek where supported), `collapseWhenIdle`, and the `media_title` → `app_name` → raw-state fallback chain — every control feature-gated on `supported_features` bits. Universal options and the action system are already in place per 0014 and are not re-implemented here.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/media-player](../specs/entity-cards/options/media-player.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

There is no `media_player` entry in `domainToCard`, so media players fall back to `ButtonCard`: a bare toggle tile with no track metadata, no artwork, no transport, and no volume — for a domain whose whole point is transport control. The option doc fully specifies the card's option surface, tier layouts, primary action, and state display rules; this change implements it as the first entirely new card family built on the 0011/0014 foundation, registered through the existing registry and `CardProps` contract per [entity-cards](../specs/entity-cards/index.md).

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Entity fixtures MUST cover the four canonical states — `playing`, `paused`, `idle`, `off` — with realistic attribute sets (title/artist/artwork, position/duration, volume, source_list, feature bits), shared between unit tests and stories.
- The card MUST ship the full story matrix: states × tiers × option values (artwork modes incl. background degradation, volume styles incl. the step-only degradation, transport gating variants, source picker, progress, idle collapse) per [storybook — story coverage](../specs/storybook/index.md#story-coverage).
- Transport, volume, seek, source, and default-action service payloads MUST have unit tests (state-resolved `media_pause`/`media_play`, `turn_on`-when-off, inert when the state-appropriate bit is absent, `media_previous_track`/`media_next_track`, `volume_set` on release, `volume_up`/`volume_down`/mute, `media_seek` with `seek_position`, `select_source` with `source`), each paired with feature-gating tests over the `supported_features` bit matrix — unsupported controls render nothing, and gated services are never called. Step commands (`media_previous_track`/`media_next_track`, `volume_up`/`volume_down`) and all transport dispatches MUST use the non-retrying service path from [0014](./0014-universal-card-options.md) — a retried step skips tracks or jumps volume — and each such control carries a per-control guard held until the expected state change or an acknowledgement timeout (the 0024 pattern; HA can acknowledge before `media_position`/state updates), with boundary-level single-call tests including the early-acknowledgement case.
- The state-line fallback chain and the `media_position` extrapolation MUST be unit-tested as pure helpers.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

- `MediaPlayerCard` registers in `domainToCard` under `media_player`, accepts the shared `CardProps` contract, renders through `GridCard`, and is wrapped in the entity error boundary by the existing `GridView` dispatch; `media_player` is added to `SUPPORTED_DOMAINS` so the EntityBrowser lists the domain. **Legacy pinning** (common convention 7): `media_player` items that predate this change (placed via imported YAML or advanced discovery) render the fallback card today, whose body tap is a power toggle — the loader MUST write `tapAction: 'toggle'` onto those items so their tap keeps toggling power (the family defines no `toggle` semantics, so it resolves to `homeassistant.toggle`), while newly created cards get the play/pause `default`. Migration unit-tested.
- `tapAction: default` resolves in the option doc's exact precedence order (first match wins): 1) `unavailable`/`unknown` → inert regardless of retained feature bits; 2) `off`/`standby` → `media_player.turn_on` when `TURN_ON` (bit 128), else inert (standby groups with off — `turn_on` beats `media_play`); 3) `playing` → `media_player.media_pause` when `PAUSE` (bit 1), else inert; 4) any other state → `media_player.media_play` when `PLAY` (bit 16384), else inert. Never an unconditional `media_play_pause` (errors on volume-only receivers). The full precedence table is unit-tested state-by-state. Embedded controls consume their events and never fire the card's actions (0014 contract).
- Option keys, types, defaults, feature gating, and tier visibility exactly per the [media-player options table](../specs/entity-cards/options/media-player.md#options), stored under `item.config`, edited via the card's `CardConfig` form merged with the shared 0014 fragment, round-tripping through YAML:
  - `artworkMode` (`thumbnail` default): thumbnail replaces the icon circle with automatic per-render icon fallback when no artwork; `background` renders full-bleed artwork with a scrim in the `full` tier only, degrading to thumbnail behavior in smaller tiers; `none` always shows the icon circle. Artwork renders from the entity's `entity_picture` as provided: usually the HA-proxied relative URL, but integrations flagging artwork remotely accessible may supply an absolute external URL, which the card MAY render directly — artwork is content imagery from the user's own integration (matching HA frontend behavior), distinct from the theming no-external-fetch boundary. A failed artwork load falls back to the icon, never an error state, and the card itself never constructs an external fetch.
  - `showVolume` (`slider` default): 42px slider mapped to `volume_level` 0–1 committing `media_player.volume_set` on release (optimistic drag); automatic degradation to `buttons` when only `VOLUME_STEP` is supported; `buttons` adds mute when `VOLUME_MUTE` is supported; no volume UI at all when the entity has no volume feature.
  - `showTransport` (`true` default): prev / play-pause / next, each gated on its own feature bit, unsupported buttons omitted (not disabled), all targets ≥44px.
  - `showSourcePicker` (`false` default): select over `source_list` sending `media_player.select_source` `{ source }`; gated on `SELECT_SOURCE`; `full` tier only.
  - `showProgress` (`false` default): position bar extrapolated locally from `media_position` + `media_position_updated_at` (snapshot, not live); scrubbing sends `media_player.media_seek` `{ seek_position }` only when `SEEK` is supported, display-only otherwise; `full` tier only.
  - `collapseWhenIdle` (`false` default): minimal idle presentation for `idle`/`off`/`standby` inside the unchanged grid span — no resize, no neighbor reflow.
- The state line resolves `media_title` (appending ` — ${media_artist}` when present) → `app_name` → raw entity state; single-line, ellipsized, muted; indigo text step while `playing`. In `row`/`full`, `media_title` takes the name-style line and `media_artist` the muted line, with `hideName` applying to the entity name, not the track title.
- Tier layouts per the option doc: stacked `glance`, compact/wide `row` (full transport cluster + volume at ≥4 wide), `tall` rendering the `glance` layout centered, and the `full` showcase (overlay stack over background artwork, or thumbnail-beside-meta with the control stack beneath), overflow sections omitted rather than scrolled.
- Domain color is `--liebe-c-media`; the active tint pattern applies while `playing`.

#### Scenario: Tap toggles playback

- **GIVEN** a `media_player` card with default options whose entity is `playing`
- **WHEN** the user taps the card body (not an embedded control)
- **THEN** the card calls `media_player.media_pause` for the entity (state-resolved, `PAUSE` supported), and no other action fires.

#### Scenario: Transport gates on supported_features

- **GIVEN** an entity supporting `PLAY`/`PAUSE` but neither `PREVIOUS_TRACK` (16) nor `NEXT_TRACK` (32), rendered at 4×1 with `showTransport: true`
- **WHEN** the card renders its transport cluster
- **THEN** only the play/pause button appears — no disabled prev/next buttons — and the volume control still renders per `showVolume`.

#### Scenario: Idle collapse keeps the grid span

- **GIVEN** a 2×2 card with `collapseWhenIdle: true` whose entity is `playing` with background artwork and overlay controls
- **WHEN** the entity transitions to `idle`
- **THEN** the card re-renders as the minimal idle presentation (icon + name + state) inside the same 2×2 tile, no grid item is resized, and neighboring cards do not move.

## Design Decisions

- **`showGroupControls` deferred** — resolves the option doc's open question for this change by taking the doc's own **MAY / later** path: the group-controls section (per-member volume, join/unjoin) does not ship here. The `showGroupControls` key is reserved in the option schema but inert, and the config form does not render a dead toggle. A follow-up change owns it.
- **Progress ticks only when visible** — the `media_position` extrapolation runs a local ~1s ticker only while the entity is `playing` _and_ the bar actually renders (`showProgress: true`, `full` tier); the helper deriving position from `media_position` + elapsed-since-`media_position_updated_at` is a pure, unit-testable function, so re-render cost stays bounded to cards that display progress.
- **Artwork renders `entity_picture` as provided** — usually an authenticated, HA-proxied relative URL; integrations flagging artwork remotely accessible may supply an absolute external URL, which renders directly (content imagery from the user's own integration, matching HA frontend behavior — see the functional requirement; distinct from the theming no-external-fetch boundary). A failed load falls back to the icon, and artwork presence is re-evaluated per render since it comes and goes with the media session.
- **State-line resolution is a pure helper** — the `media_title`/`media_artist` → `app_name` → raw-state chain lives in one function inside the MediaPlayerCard component folder, shared by every tier layout, keeping the fallback logic out of JSX and identical between the compact state line and the split title/artist lines.
- **Fixtures as the contract surface** — the four state fixtures (`playing`, `paused`, `idle`, `off`) encode representative `supported_features` combinations (full-featured, play/pause-only, step-only volume, no-volume) so gating tests and the story matrix draw from the same source of truth.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Core card + registration**: `MediaPlayerCard` component folder with tier layouts (`glance`, `row` incl. wide form, `tall`-as-`glance`, `full` thumbnail form), state-line fallback helper, `artworkMode: thumbnail`/`none` with automatic icon fallback, default action (play/pause, `turn_on`-when-off, inert), feature-gated transport cluster, `collapseWhenIdle`; registry entry in `domainToCard`; `media_player` added to `SUPPORTED_DOMAINS`; playing/paused/idle/off fixtures; the legacy-pinning loader migration (`tapAction: 'toggle'` onto pre-existing media_player items) with legacy/new-item tests; payload + gating unit tests; base stories
- [ ] **PR 2 — Volume, source, progress, background artwork**: `showVolume` slider with optimistic drag + `buttons` degradation + mute; `showSourcePicker`; `showProgress` with local extrapolation and gated seek; `artworkMode: background` with scrim and below-`full` degradation; config-form entries merged with the shared 0014 fragment; YAML round-trip test; payload/gating/extrapolation unit tests; full story matrix
- [ ] **PR 3 — Spec sync**: add a Media Player section to [entity-cards](../specs/entity-cards/index.md) with requirements and scenarios reflecting the implemented card, update the registry snippet and EntityBrowser/`SUPPORTED_DOMAINS` text, mark the [media-player option doc](../specs/entity-cards/options/media-player.md) status implemented (noting the reserved `showGroupControls` key), and record the change in the spec changelog

## Out of Scope

- `showGroupControls` behavior (per-member volume, join/unjoin) — key reserved but inert per the option doc's open question; a follow-up change.
- A dedicated `tall` layout (vertical volume); `tall` renders the `glance` layout per the option doc.
- Universal options and the action system (0014); layout tiers themselves (0011); tokens/anatomy (0010).
- Media browsing, playlists, text-to-speech, and any service surface beyond the specified options.
- History data in the detail dialog (0015) and the other new card families (0024+).
