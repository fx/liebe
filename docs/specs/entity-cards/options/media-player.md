# Card Options — Media Player

Extends the [common contract](./common.md); universal options (`name`, `icon`, `hideName`, `hideState`, `color`, `tapAction`, `holdAction`, `doubleTapAction`) apply as specified there and are not repeated here. **Status: specified, not yet implemented (new card).**

There is currently no `media_player` entry in `domainToCard`, so media players fall back to `ButtonCard`. This document specifies the option surface of the dedicated media player card. The card MUST fit the existing registry and `CardProps` contract ([entity-cards](../index.md)): registered under the `media_player` domain, configured through `item.config` via `CardConfig.Modal`, round-tripping through YAML export. Domain color is `--liebe-c-media` (indigo, [design-system](../../design-system/index.md#domain-color-discipline)); the active tint pattern applies when the player is `playing`.

## Primary action

`tapAction: default` MUST resolve in this exact order (first match wins), so every state maps to one service deterministically:

1. `unavailable`/`unknown` → inert, regardless of retained feature bits.
2. `off`/`standby` → `media_player.turn_on` when `TURN_ON` (bit 128) is supported, else inert. (`standby` is grouped with `off` — `TURN_ON` takes precedence over `media_play` for standby entities advertising both.)
3. `playing` → `media_player.media_pause` when `PAUSE` (bit 1), else inert.
4. Any other state → `media_player.media_play` when `PLAY` (bit 16384), else inert.

Justification: play/pause is the single action users reach for most on a media surface, it is safe to trigger accidentally (state is trivially reversible with a second tap), and it is symmetric — the same gesture is correct whether the player is playing or paused, matching the whole-tile primary-action rule ([design-system — card anatomy](../../design-system/index.md#card-anatomy)). A plain power toggle would be destructive (killing a playback session), and `more-info` would waste the dominant gesture on a card whose whole point is transport control. When the player is `off`/`standby` and advertises `TURN_ON` (bit 128), the default action SHOULD call `media_player.turn_on` instead, since play/pause is meaningless on a powered-off device; when neither applies, the tap MUST be inert rather than erroring. Users who prefer detail-first behavior set `tapAction: more-info`; `holdAction: more-info` remains the universal default.

## Options

All keys camelCase, stored under `item.config`, resolved as `config[key] ?? default` per the common contract. Per convention 3 there, feature-gated controls stay automatic: whether a control _can_ render is derived from `supported_features` and attributes; these options only hide capabilities or tune presentation, never enable what the entity cannot do.

Relevant `supported_features` bits (HA `MediaPlayerEntityFeature`): `PAUSE` 1, `SEEK` 2, `VOLUME_SET` 4, `VOLUME_MUTE` 8, `PREVIOUS_TRACK` 16, `NEXT_TRACK` 32, `PLAY` 16384, `VOLUME_STEP` 1024, `SELECT_SOURCE` 2048, `GROUPING` 524288.

| Key                 | Type    | Default     | Behavior                                                                               |
| ------------------- | ------- | ----------- | -------------------------------------------------------------------------------------- |
| `artworkMode`       | select  | `thumbnail` | `background` \| `thumbnail` \| `none` — how `entity_picture` artwork renders           |
| `showVolume`        | select  | `slider`    | `slider` \| `buttons` \| `none` — volume control style, gated on volume feature bits   |
| `showTransport`     | boolean | `true`      | Previous / play-pause / next buttons, each gated on its feature bit                    |
| `showSourcePicker`  | boolean | `false`     | Source select built from `source_list`; gated on `SELECT_SOURCE`                       |
| `showProgress`      | boolean | `false`     | Media position bar from `media_position` / `media_duration`; scrubbing gated on `SEEK` |
| `collapseWhenIdle`  | boolean | `false`     | Renders a minimal idle row when state is `idle` / `off` / `standby`                    |
| `showGroupControls` | boolean | `false`     | Speaker-group volume and join/unjoin; gated on `GROUPING` + `group_members`            |

### `artworkMode`

- `thumbnail` (default): `entity_picture` renders as a small rounded image (`--liebe-control-radius`) in place of the icon circle. When no artwork is available the icon circle renders instead — the fallback MUST be automatic and per-render, since artwork comes and goes with the media session.
- `background`: artwork renders as a full-bleed cover background with a dark scrim so overlaid text and controls meet contrast requirements (same legibility approach as weather condition backgrounds). Background mode is only meaningful with room for overlay: it MUST apply only in the `full` tier (≥2×2); in `glance` and `row` the card MUST degrade to `thumbnail` behavior rather than render an illegible postage stamp.
- `none`: never show artwork; always the icon circle.

Default is `thumbnail` because it works at every tier and never compromises text contrast; `background` is the deliberate showcase choice.

Tier visibility: `thumbnail`/`none` affect all tiers; `background` takes effect in `full` only.

### `showVolume`

- `slider` (default): the embedded 42px slider (`liebe-slider`) mapped to `volume_level` 0–1, committing `media_player.volume_set` on release (optimistic-drag pattern shared with light brightness). Requires `VOLUME_SET` (bit 4); when the entity supports only `VOLUME_STEP` (bit 1024), the card MUST automatically degrade to the `buttons` presentation — the option value stays `slider`, the entity simply cannot do better. An entity advertising **only `VOLUME_MUTE`** (neither `VOLUME_SET` nor `VOLUME_STEP`) degrades further to a mute-only presentation: just the mute toggle, no slider or steppers. With none of the three bits, no volume UI renders.
- `buttons`: volume down / up steppers (`media_player.volume_down` / `volume_up` or stepped `volume_set`), plus a mute toggle when `VOLUME_MUTE` (bit 8) is supported.
- `none`: no volume UI.

When the entity supports no volume feature at all, no volume control renders regardless of this option's value.

Tier visibility: `row` at ≥4 wide, and `full`. `glance` and compact `row` never render volume.

### `showTransport`

When `true` (default), the transport cluster renders: previous (`media_player.media_previous_track`, gated on bit 16), play/pause (resolved by the **same precedence order as the primary action**, sharing one resolver so body tap and button never diverge for the same state: `turn_on` for `off`/`standby` with `TURN_ON` (glyph shows power), `media_pause` while `playing` when `PAUSE`, `media_play` otherwise when `PLAY`; rendered only when the state-appropriate bit is present), next (`media_player.media_next_track`, gated on bit 32). Unsupported buttons are omitted, not disabled — a receiver with no track concept shows only play/pause. Transport buttons are embedded controls: taps on them MUST NOT fire the card's `tapAction` (common contract). All transport targets MUST be ≥44px hit areas.

Tier visibility: `row` and `full` (`row` shows play/pause only in its compact form; the full cluster appears at ≥4 wide and in `full`). Never in `glance`.

### `showSourcePicker`

When `true` and `SELECT_SOURCE` (bit 2048) is supported with a non-empty `source_list`, a select renders the sources and sends `media_player.select_source` with `{ source }`. Current `source` attribute is the selected value. Off by default: most cards on a dashboard are speakers where source switching is noise; TV/receiver cards opt in.

Tier visibility: `full` only.

### `showProgress`

When `true` and the session exposes `media_duration`, a thin progress bar renders, its position derived from `media_position` + elapsed time since `media_position_updated_at` (the attribute is a snapshot, not a live value — the card MUST extrapolate locally rather than expect state churn). When `SEEK` (bit 2) is supported, dragging/tapping the bar sends `media_player.media_seek` with `{ seek_position }`; otherwise the bar is display-only. Off by default because position adds visual churn most speaker tiles don't need.

Tier visibility: `full` only.

### `collapseWhenIdle`

When `true` and the entity state is `idle`, `off`, or `standby`, the card renders a minimal idle presentation: icon circle (inactive tint) + name + state line only — no artwork, no transport, no volume, no progress.

Interaction with grid sizing: the card does NOT resize. Its grid span, and therefore its layout tier, is untouched; the tier simply renders simplified content, vertically centered within the same tile. A 2×2 card stays 2×2 — neighbors never reflow when a speaker goes quiet, and the layout is stable across playback sessions. `tapAction: default` still applies (turning the player on where supported), so the idle tile remains a useful touch target.

Tier visibility: applies in every tier (in `glance` the difference is only the suppressed artwork).

### `showGroupControls`

When `true`, the entity supports `GROUPING` (bit 524288), and `group_members` is non-empty, the `full` tier MAY render a group section: per-member volume rows and join/unjoin affordances (`media_player.join` / `media_player.unjoin`). This is the heaviest option on the card — it requires resolving sibling entities from `group_members` and rendering N extra controls — so it is marked **MAY / later**: a first implementation MAY ship the option key reserved but inert, provided the config UI does not show a dead toggle. See Open Questions.

Tier visibility: `full` only.

## State display rules

The state line (`liebe-state`) MUST resolve, in order:

1. `media_title` — appending ` — ${media_artist}` when `media_artist` is present;
2. else `app_name` (e.g. a streaming app on a TV with no track metadata);
3. else the raw entity state (`playing`, `paused`, `idle`, …).

The line stays single-line, ellipsized, muted ([design-system — typography](../../design-system/index.md#typography)); when the player is `playing` it SHOULD take the indigo text step per the active-state pattern. `hideState` (common contract) suppresses the line entirely. In the `row` and `full` tiers where title and artist have their own lines, `media_title` takes the name-style line and `media_artist` the muted line — `hideName` then applies to the entity name, not the track title.

## Tier layouts

Per the [design-system size-adaptive layout rules](../../design-system/index.md#size-adaptive-layouts): content adapts to the grid span, overflow is omitted rather than clipped, and the tier derives from `{width, height}`.

- **`glance` (1×1)** — artwork thumbnail (or icon circle when no artwork / `artworkMode: none`) + name + state line, stacked and centered. Whole tile is the primary action (play/pause). No embedded controls.
- **`row` (2–3 wide × 1)** — compact media row: small artwork thumbnail (or icon circle) at the left, title/artist stack (per State display rules) in the middle, a single play/pause button at the right (when `showTransport` and supported). At ≥4 wide × 1 the row expands: the full transport cluster (prev / play-pause / next) plus the volume control (`showVolume`) render alongside the meta block. This wide-row form is the "full transport row"; it remains `row` tier for every other rule (no source picker, no progress, no group controls).
- **`tall` (1 wide × ≥2)** — not specified for this card; the card MUST render its `glance` layout with the extra height absorbed by centering. (A vertical-volume tall layout is a plausible follow-up; see Open Questions.)
- **`full` (≥2×≥2)** — the showcase layout. With `artworkMode: background` and artwork present: full-bleed artwork with scrim, name/eyebrow at the top, title/artist above the bottom control stack, overlay transport cluster and volume slider; `showProgress`, `showSourcePicker`, and `showGroupControls` sections stack below the transport in that order as height allows, omitted (never scrolled) when they don't fit. With `thumbnail`/`none` or no artwork: standard card surface with artwork thumbnail beside the meta block and the same control stack beneath.

## Scenarios

#### Scenario: Tap toggles playback

- **GIVEN** a `media_player` card with default options whose entity is `playing`
- **WHEN** the user taps the card body (not an embedded control)
- **THEN** the card calls `media_player.media_pause` for the entity (state-resolved: `playing` + `PAUSE` supported), and no other action fires.

#### Scenario: Transport gates on supported_features

- **GIVEN** an entity with `supported_features` including `PLAY`/`PAUSE` but neither `PREVIOUS_TRACK` (16) nor `NEXT_TRACK` (32), rendered at 4×1 with `showTransport: true`
- **WHEN** the card renders its transport cluster
- **THEN** only the play/pause button appears — no disabled prev/next buttons — and the volume control still renders per `showVolume`.

#### Scenario: Idle collapse keeps the grid span

- **GIVEN** a 2×2 card with `collapseWhenIdle: true` whose entity is `playing` and showing background artwork with overlay controls
- **WHEN** the entity transitions to `idle`
- **THEN** the card re-renders as the minimal idle row (icon + name + state) inside the same 2×2 tile, no grid item is resized, and neighboring cards do not move.

#### Scenario: Background artwork degrades below full tier

- **GIVEN** a card with `artworkMode: background` and artwork available
- **WHEN** the user resizes it from 2×2 to 2×1 in edit mode
- **THEN** the card renders the `row` tier with a thumbnail (not a background), and the stored option value remains `background`.

## Open Questions

- ~~**Group controls scope.**~~ Resolved by change [0023](../../../changes/0023-media-player-card.md) along this doc's own MAY/later path: `showGroupControls` is **reserved but inert** for the initial card — the key exists in the option schema, the config form does not render a dead toggle, and the group-controls surface (per-member volume, join/unjoin, and whether join belongs in a dialog) lands in a follow-up change.
- ~~**Progress extrapolation cadence.**~~ Resolved by change [0023](../../../changes/0023-media-player-card.md): the ~1s `media_position` ticker MUST run only while the entity is `playing` **and** the progress bar actually renders (`showProgress: true` on the `full` tier), so re-render cost is bounded to cards that display progress. The position derivation (`media_position` + elapsed since `media_position_updated_at`) is a pure, unit-testable function.
- **`tall` layout.** A 1×≥2 layout with vertical volume slider (mirroring the light card's vertical dimmer) is natural but unspecified; deciding it here vs. a follow-up affects whether `tall` falls back to `glance` permanently.
- ~~**Off vs. idle tap semantics.**~~ Resolved by the primary-action precedence order: an `off`/`standby` player without `TURN_ON` is **inert** (never `more-info` — hold remains the details gesture), as change 0023 tests state-by-state.

## References

- [Common option contract](./common.md) · [entity-cards](../index.md) (registry, `CardProps`) · [design-system](../../design-system/index.md) (tiers, `--liebe-c-media`, anatomy)
- Home Assistant `media_player` integration: `supported_features` bit flags (`MediaPlayerEntityFeature`), services `media_play_pause`, `media_previous_track`, `media_next_track`, `volume_set`, `volume_up`/`volume_down`, `volume_mute`, `media_seek`, `select_source`, `join`/`unjoin`, `turn_on`
- Entity attributes consumed: `media_title`, `media_artist`, `app_name`, `entity_picture`, `volume_level`, `is_volume_muted`, `source`, `source_list`, `media_position`, `media_position_updated_at`, `media_duration`, `group_members`
