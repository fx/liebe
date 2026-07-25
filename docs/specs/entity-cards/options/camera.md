# Card Options — Camera

Part of the [common contract](./common.md). **Status: specified, not yet implemented** for the new presentation options below; the existing streaming-owned keys are implemented and specified in [camera-streaming](../../camera-streaming/).

This document covers only the camera card's **presentation** option surface. Everything about how the feed itself works — stream bootstrap, the still-image fallback, the status machine, in-place/native fullscreen mechanics, and the `fit`/`matting`/`showStats` configuration — is owned by the [camera-streaming spec](../../camera-streaming/) and MUST NOT be respecified here.

## Primary action

- `tapAction: default` MUST open the in-place ("semi") fullscreen overlay — the existing behavior, where the tap toggles a pure CSS/positioning flip on the stationary stream container so the stream never reconnects (mechanics in [camera-streaming — Fullscreen](../../camera-streaming/index.md#fullscreen)).
- The universal `holdAction: more-info` and `doubleTapAction: none` defaults from the [common contract](./common.md) apply unchanged.
- Per the common contract, actions MUST NOT fire from taps on the card's embedded controls (mute, native fullscreen, Retry) — those consume their own events.

## Options

New presentation options (camelCase keys, stored under `item.config` per the [common contract](./common.md)):

| Key               | Type    | Default | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `showNameOverlay` | boolean | `true`  | Renders the entity name and state line in a bottom gradient overlay ON the feed, instead of card chrome below it. When `false`, no overlay is drawn and the feed fills the card uninterrupted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `showLiveBadge`   | boolean | `true`  | Shows a `LIVE` pill in a corner of the feed with a pulsing dot **while the camera-streaming status machine reports streaming** — the badge is exactly as truthful as that signal, no stronger (WebRTC/HLS: frames actively flowing; MJPEG: initial decoded pixels with no frame watchdog, so the badge means "connected and rendering" and may persist through an undetected stall). On the still-image fallback the badge MUST NOT render at all — a snapshot must never carry a `LIVE` label, and non-live status communication (e.g. `NO SIGNAL`) is owned by the [camera-streaming](../../camera-streaming/) status pills, which this badge must not duplicate or contradict. Streaming-state determination (frame evidence, fallback) is owned by camera-streaming. |
| `showLastMotion`  | boolean | `false` | Adds a motion line to the overlay's state area from the linked motion sensor's **current state**: while the sensor is `on` it reads "Motion detected"; while `off` it reads **"Clear for X"** using `last_changed` — the duration the sensor has been in its clear state, which is what `last_changed` truthfully measures (after an HA restart or an `unavailable`→`off` recovery it marks that transition, so a "Motion X ago" claim would fabricate a motion event; "Clear for X" stays honest in every case). `last_updated` MUST NOT be used (it moves on unrelated attribute updates). No history fetch is required; locating the actual last `on` event would need one and is out of scope. Requires `motionEntity`; without one the option has no effect.        |
| `motionEntity`    | string  | `''`    | Entity id of a linked motion `binary_sensor` used by `showLastMotion`. Feature-gated per the common contract: the option only reads an entity the user already has — it never creates one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Rules:

- **Universal-option interaction:** `hideName` and `hideState` from the [common contract](./common.md) apply to the overlay — `hideName: true` removes the name line from the gradient overlay, `hideState: true` removes the state/motion line. Hiding both while `showNameOverlay: true` MUST collapse the overlay entirely (no empty gradient band).
- `showLastMotion` content renders inside the overlay state line, so it is suppressed by `hideState: true` and by `showNameOverlay: false`.
- If `motionEntity` names an entity that is missing or unavailable, the motion line MUST be omitted (never an error state on the camera card).
- The relative time ("X min ago") SHOULD refresh at least once per minute while visible.

### Existing keys (owned by camera-streaming — do not respecify)

These per-card config keys already exist; their semantics, defaults, and schema location are specified in [camera-streaming — Camera Configuration Options](../../camera-streaming/index.md#camera-configuration-options):

- `fit` — feed object-fit (`cover` default / `contain`)
- `matting` — card padding around the feed (`none` / `small` / `large`)
- `showStats` — debug statistics overlay (default `false`)

## Tier layouts

Tiers follow [design-system — size-adaptive layouts](../../design-system/index.md#size-adaptive-layouts). A live feed needs real area to be legible:

| Tier              | Span                | Content                                                                                                                                                                                  |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glance` (1×1)    | degraded            | Still thumbnail (entity snapshot) + name; no live stream, no overlay options                                                                                                             |
| `row` (≥2×1)      | degraded            | Still thumbnail + name/state in a row; no live stream                                                                                                                                    |
| `tall` (1×≥2)     | degraded            | Still thumbnail on top, name below, stacked; no live stream, no overlay options — same degradation rules as `glance`                                                                     |
| `full` (≥2×≥2)    | minimum useful size | Live feed with overlay, LIVE badge, motion line, and controls per the options above                                                                                                      |
| wide `full` (4×2) | default             | The card's default grid dimensions (see [camera-streaming — Component Map](../../camera-streaming/index.md#component-map)); same content as `full` with a comfortably wide 16:9-ish feed |

- **2×2 is the minimum useful size** for a live camera: below it the card MUST NOT mount the stream element and MUST degrade to a still thumbnail (the same `entity_picture` snapshot the still-image fallback uses — refresh cadence owned by [camera-streaming — Still-Image Fallback](../../camera-streaming/index.md#still-image-fallback)) plus the name. This is a graceful-degradation rule per the design system: content that does not fit is omitted, never clipped.
- In degraded tiers `showNameOverlay`, `showLiveBadge`, and `showLastMotion` do not render; `hideName` still hides the name, leaving an image-only tile (which MUST remain a valid layout).
- `tapAction: default` in degraded tiers still opens the in-place fullscreen overlay. The stream lifecycle on that path — lazy mount on entry, unmount on exit, and why it does not violate the ≥2×2 no-reconnect guarantee — is owned by [camera-streaming — Fullscreen](../../camera-streaming/index.md#fullscreen).

## Scenarios

### Scenario: Default card shows overlay and live badge

- **GIVEN** a stream-capable camera card at 4×2 with zero configuration, actively delivering frames
- **WHEN** the card renders in view mode
- **THEN** the feed shows a bottom gradient overlay with the camera's name and state, and a `LIVE` pill with a pulsing dot; tapping the feed opens the in-place fullscreen overlay without reconnecting the stream.

### Scenario: Still-image fallback keeps the badge honest

- **GIVEN** a camera card whose stream element could not be bootstrapped, rendering the still-image fallback (per [camera-streaming](../../camera-streaming/))
- **WHEN** the card renders with `showLiveBadge: true`
- **THEN** no `LIVE` badge renders — non-live status stays communicated by camera-streaming's status pills — so the user is never told a periodically-refreshed snapshot is live video.

### Scenario: Last motion from a linked sensor

- **GIVEN** a camera card with `showLastMotion: true` and `motionEntity: 'binary_sensor.driveway_motion'`, whose sensor last changed 12 minutes ago
- **WHEN** the card renders at 2×2 or larger with the overlay enabled
- **THEN** the overlay's state area reads "Clear for 12 min", updating as time passes; if the sensor becomes unavailable the line disappears without erroring the card.

### Scenario: Hiding both overlay lines collapses the overlay

- **GIVEN** a camera card with `showNameOverlay: true`, `hideName: true`, `hideState: true`
- **WHEN** the card renders
- **THEN** no gradient band is drawn — the feed fills the card as if `showNameOverlay` were `false`.

## Open Questions

- ~~**Overlay vs. existing status pill.**~~ Resolved (change 0021): `showLiveBadge` **subsumes the status pill's live states** — when enabled and the status machine reports streaming, the `LIVE` pill is the presentation of that state (recording variant preserved); non-live states (`CONNECTING`, `NO SIGNAL`, errors) keep the existing pill unchanged. Presentation-only skin over the pill slot; the status machine and its priority order stay owned by [camera-streaming](../../camera-streaming/index.md#card-states-and-controls). Never two live-ness indicators.
- **Motion source auto-discovery.** Should `motionEntity` offer suggestions from the camera's HA device registry (motion sensors on the same device), or stay a free entity picker? Auto-discovery improves zero-config but adds a registry dependency the card does not currently have.
- **Degraded-tier snapshot cadence.** The still thumbnail in `glance`/`row` reuses the fallback's snapshot mechanism; whether small tiles should refresh less often (battery/bandwidth on wall tablets) is open.
- **Legacy `size` prop.** The card still accepts `size: small|medium|large`; tier derivation from grid span supersedes it (see [design-system](../../design-system/index.md#size-adaptive-layouts) open questions).

## References

- [Common contract](./common.md) — universal options, action types, conventions
- [camera-streaming](../../camera-streaming/) — stream bootstrap, fallback, status machine, fullscreen, `fit`/`matting`/`showStats`
- [design-system](../../design-system/) — layout tiers, card anatomy, domain colors
- `src/components/CameraCard/index.tsx` — current card implementation (chrome, fullscreen wiring, config)
- `src/components/configurations/cardConfigurations.ts` — existing camera config schema
