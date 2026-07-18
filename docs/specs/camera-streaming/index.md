# Camera Streaming

## Overview

Liebe renders live camera feeds inside the dashboard grid by wrapping Home Assistant frontend's own `<ha-camera-stream>` custom element in React. HA's element owns all stream negotiation (WebRTC, HLS, or MJPEG as it sees fit); Liebe MUST NOT own an `RTCPeerConnection` or perform any `camera/webrtc/*` signaling. The card MUST bootstrap the element on demand (it is not defined on a deep link into the panel), MUST fall back to the entity's still image when the element cannot be bootstrapped, MUST surface connecting/streaming/no-signal/stalled states from a frame-watching status machine, and SHOULD provide mute, native fullscreen, an in-app fullscreen modal that keeps the element inside the `<home-assistant>` DOM tree, and per-card fit/matting/debug-stats configuration. Camera entities MUST be excluded from stale-entity tracking because they update via the media stream rather than state events. This document describes the current implementation; it does not propose changes.

## Background

Home Assistant exposes cameras as entities in the `camera` domain and ships a frontend element, `<ha-camera-stream>`, that negotiates the best available stream type per camera (WebRTC via go2rtc, HLS, or MJPEG). Liebe originally hand-rolled its own WebRTC pipeline (`useWebRTC.ts`, ~594 lines of `camera/webrtc/offer` signaling); change [0007](../../changes/0007-ha-camera-stream.md) replaced it with the platform element, deleting the Liebe-owned signaling entirely. Delegating to HA's element removed the protocol-drift risk (the 2026.7 frontend changed the element's dependency injection from a `hass` property to `@lit/context`), gained HLS/MJPEG support for cameras without WebRTC, and turned HA frontend upgrades from a breakage risk into a free upgrade.

The cost of embedding an internal HA frontend element is a compatibility surface Liebe must manage itself: element bootstrap (the defining module chunk is lazily loaded by HA), dependency injection across HA generations, and DOM-tree placement constraints for `@lit/context` resolution. This spec covers that wrapper architecture, the status machine, fullscreen, stats, configuration, stale-tracking exclusion, and the e2e camera stack. It does NOT cover the general card registry (see [../entity-cards/](../entity-cards/)) or the entity state pipeline (see [../entity-state/](../entity-state/)).

## Requirements

### Component Map

The camera surface is self-contained in `src/components/CameraCard/`:

| File                       | Role                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `index.tsx`                | `CameraCard` — card chrome, config, fullscreen wiring, KeepAlive orchestration (default grid dimensions 4×2) |
| `HaCameraStream.tsx`       | React wrapper that imperatively creates and property-syncs the `<ha-camera-stream>` element                  |
| `useCameraStreamReady.ts`  | Bootstrap ladder — ensures the custom element is defined, or reports it unavailable                          |
| `useCameraStreamStatus.ts` | Status machine — frame watchdog, auto-remounts, stall error, retry                                           |
| `StillImageFallback.tsx`   | `entity_picture` still-image renderer used when the element cannot be bootstrapped                           |
| `CameraControls.tsx`       | Status pill + mute/native-fullscreen buttons, `em`-scaled by card size                                       |
| `CameraStats.tsx`          | Debug overlay (FPS, resolution, decoded/dropped frames)                                                      |
| `CameraCard.css`           | Recording-dot pulse animation                                                                                |

Each component has a matching unit test in `src/components/CameraCard/__tests__/`. Camera registration into the card system is via the card registry (`src/components/cardRegistry.ts`, `camera: CameraCard`) — see [../entity-cards/](../entity-cards/).

### Stream Support Detection

- The card MUST treat a camera as stream-capable only when its `supported_features` attribute has the `SUPPORT_STREAM` bit (value `2`) set (`src/components/CameraCard/index.tsx:39`, `:82`-`85`).
- When the camera is not stream-capable, the card MUST render a static video icon instead of a stream, tinted blue while recording or streaming and gray otherwise.
- The stream path MUST be enabled only when an entity exists, Home Assistant is connected, the camera supports streaming, AND the bootstrap ladder reports `ready` (`streamEnabled`, `src/components/CameraCard/index.tsx:92`).

#### Scenario: Camera without stream support

- **GIVEN** a `camera.*` entity whose `supported_features` does not include bit `2`
- **WHEN** the card renders
- **THEN** no stream element is mounted and a static video icon is shown

### Element Bootstrap Ladder

`<ha-camera-stream>` is defined by a lazily-loaded HA frontend module chunk, so on a deep link straight into the panel it is usually NOT yet in the custom-element registry. `useCameraStreamReady` (`src/components/CameraCard/useCameraStreamReady.ts`) runs a bootstrap ladder that MUST:

1. Return `ready` immediately if `customElements.get('ha-camera-stream')` already resolves.
2. Otherwise poll `window.loadCardHelpers` (HA defines it lazily) every 250 ms for up to 20 attempts; if it never appears (standalone dev outside HA), return `unavailable`.
3. Otherwise call `loadCardHelpers()` and create a **throwaway** `picture-entity` card with `camera_view: 'live'` — creating that Lovelace card makes the HA frontend import the module chunk that defines `<ha-camera-stream>`. The throwaway card is never attached to the DOM.
4. Race `customElements.whenDefined('ha-camera-stream')` against a 10 s timeout; resolve `ready` on definition, `unavailable` on timeout or any thrown error.

- The ladder MUST run at most once per app: all camera cards share a single module-level promise (`ladderPromise`), so N cards create at most one throwaway card. A test-only `resetCameraStreamReadyForTests()` clears the cache.
- The hook exposes three readiness states: `loading` (ladder in flight — card keeps the connecting state), `ready` (render `HaCameraStream`), `unavailable` (render `StillImageFallback`).

#### Scenario: Deep link into the panel

- **GIVEN** a fresh browser context deep-linked into the panel (no Lovelace warm-up), where `window.loadCardHelpers` is undefined at first paint
- **WHEN** a camera card mounts
- **THEN** the ladder polls `loadCardHelpers` into existence, creates the throwaway card, `<ha-camera-stream>` becomes defined, and the card mounts it (exercised end-to-end by `tests/e2e/camera-stream.spec.ts`)

#### Scenario: Standalone dev outside HA

- **GIVEN** the panel running without an HA frontend (no `loadCardHelpers` ever appears)
- **WHEN** the ladder exhausts its 20 × 250 ms poll
- **THEN** readiness is `unavailable` and the card falls back to the still image

### The `<ha-camera-stream>` Wrapper

`HaCameraStream` (`src/components/CameraCard/HaCameraStream.tsx`) MUST:

- Create the element imperatively in a layout effect so its identity survives React re-renders, recreating it only when the camera `entity_id` or `remountKey` changes.
- Sync properties on every render: `stateObj` (the entity), `hass`, `muted`, `fitMode`, and `controls = false`. Each assignment is an independent tolerant write — see the compat matrix below.
- Listen for the element's `streams` and `load` events on the wrapper container (they are dispatched bubbling + composed, so a container listener survives element recreation) and forward them to the status machine.
- Expose an imperative handle with `getInnerVideo()` — shadow-piercing lookup `ha-camera-stream → (ha-web-rtc-player | ha-hls-player) → video` — and `getMjpegImg()` (MJPEG mode renders an `<img>` directly in the element's shadow root).

#### Scenario: Element identity across re-renders

- **GIVEN** a mounted wrapper
- **WHEN** React re-renders with the same entity and remountKey
- **THEN** the same element instance is kept and only its properties are re-assigned; bumping `remountKey` or changing the entity recreates it

### HA Compatibility Matrix

The wrapper MUST support both HA dependency-injection generations:

| HA version                     | Injection path                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 2026.6                       | Element exposes a `hass` property — the wrapper assigns it directly.                                                                                                                                                        |
| ≥ 2026.7 (frontend 20260624.x) | Element consumes `apiContext` / `connectionContext` / `configContext` via `@lit/context`; `context-request` events resolve at the `<home-assistant>` ancestor. The wrapper's `hass` assignment is a harmless plain expando. |
| < 2024.10 / standalone dev     | Element unavailable or unsupported — still-image fallback.                                                                                                                                                                  |

- Because the ≥ 2026.7 path depends on DOM ancestry, the element MUST always be mounted inside the liebe-panel shadow-root React container (within the `<home-assistant>` DOM tree) — including in fullscreen (see below).
- **Internal-API fragility:** `<ha-camera-stream>` is not a public API; its property surface can change between HA releases. The wrapper therefore assigns each property independently and tolerantly (an unknown property becomes an inert expando rather than an error), and the still-image fallback bounds the blast radius of a future breaking change.

#### Scenario: Context-based injection on 2026.7+

- **GIVEN** HA ≥ 2026.7 where the element has no `hass` property
- **WHEN** the element mounts inside the panel's shadow-root container
- **THEN** its `@lit/context` `context-request` events propagate to `<home-assistant>`, the api/connection/config contexts resolve, and the stream plays

### Still-Image Fallback

When readiness is `unavailable`, the card MUST render `StillImageFallback` (`src/components/CameraCard/StillImageFallback.tsx`):

- It MUST show the entity's `entity_picture` snapshot, refreshed every 10 s by re-rendering with an incrementing cache-busting query param (`_ts=<counter>`; a deterministic counter, not `Date.now()`, so the cadence is testable). It appends with `&` when the URL already has a query string.
- When the entity has no `entity_picture`, it MUST render a gray video icon (labeled "No camera image available") instead of a broken `<img>`.
- The card MUST show a **truthful pill**: the raw entity state (e.g. `IDLE`) instead of a forever-`CONNECTING` spinner pill (`pillSupportsStream`, `src/components/CameraCard/index.tsx:196`), and MUST suppress the loading-spinner overlay.
- The still image participates in the fullscreen KeepAlive swap like the live stream, and fullscreen forces `contain` fit for it too.

#### Scenario: Still-image fallback

- **GIVEN** readiness `unavailable` and an entity with an `entity_picture`
- **WHEN** the card renders
- **THEN** the snapshot is shown (refreshing every 10 s with a cache-buster), the pill reads the raw entity state, and no spinner overlay is drawn

### Stream Status Machine

`useCameraStreamStatus` (`src/components/CameraCard/useCameraStreamStatus.ts`) owns all surfaced stream health. It is driven by the element's `streams`/`load` events — each event bumps a watch epoch and starts a fresh watch against the (possibly recreated) inner `<video>`:

- **Frame detection:** `isStreaming` MUST become true only after a decoded frame is observed — via `requestVideoFrameCallback` when the browser implements it (checked at runtime, not by type narrowing), otherwise by polling `currentTime` / `getVideoPlaybackQuality().totalVideoFrames` every 250 ms.
- **Watchdog:** a 250 ms interval MUST raise `hasFrameWarning` after 500 ms without a new frame (`FRAME_WARNING_MS`) and MUST treat 5 s without a frame (`STALL_MS`) as a sustained stall.
- **Auto-remount with cap:** on a stall the machine stops the current watch and bumps `remountKey` (recreating the element, whose new `load` event starts a fresh watch) — at most `MAX_AUTO_REMOUNTS` (3) consecutive times. Past the cap it MUST surface the error `'Stream stalled'` instead of looping forever. Any observed frame or entity-state transition restores the budget.
- **Retry:** `retry()` MUST clear the surfaced error, reset streaming/warning state, restore the auto-remount budget, and bump `remountKey`. The card wires it to the Retry button in the error branch (semantics match the old `useWebRTC` retry).
- **MJPEG path:** when there is no inner `<video>` but `getMjpegImg()` finds an `<img>`, the machine MUST poll `naturalWidth` every 500 ms and mark streaming once the image has decoded pixels — with NO frame watchdog (the browser owns the multipart stream).
- **Disable reset:** when `enabled` flips false, all surfaced status MUST reset in the effect cleanup.

#### Scenario: Stream stalls and recovers via remount

- **GIVEN** a playing stream that stops delivering frames
- **WHEN** 500 ms pass, then 5 s
- **THEN** the pill shows `NO SIGNAL` at 500 ms, and at 5 s the element is remounted (fresh watch); frames on the new element clear everything

#### Scenario: Stall persists past the remount budget

- **GIVEN** three consecutive auto-remounts each ending in a 5 s stall
- **WHEN** the fourth stall is detected
- **THEN** the card shows the `Stream stalled` error with a Retry button; Retry clears the error, restores the budget, and remounts once more

### Card States and Controls

- The card MUST render a skeleton while the entity loads and an error display when disconnected or the entity is missing.
- The status pill (`CameraControls`) MUST resolve, in priority order: `ERROR`, `CONNECTING` (reconnecting, or stream-capable but not yet streaming), `NO SIGNAL`, `RECORDING` (recording, or streaming while `entity.state === 'streaming'`), `STREAMING`, `IDLE`, then the raw entity state uppercased.
- While streaming without error and not in edit mode, the card MUST show mute/unmute and native-fullscreen buttons; the stream MUST start muted by default.
- Stream errors MUST render the message plus a Retry button wired to the status machine's `retry()`. There is no go2rtc-guidance branch: the old "Camera Configuration Required" guidance keyed off Liebe's own signaling errors, which no longer exist — the only machine-surfaced error is `Stream stalled` (change 0007 decision).
- **Mute caveat:** toggling mute only flips the element's `muted` property, but the element's internal `_streams()` selection MAY pick a different player (HLS vs WebRTC) depending on audio requirements — a brief blink on toggle is accepted rather than pinning the stream type.

#### Scenario: Streaming card in view mode

- **GIVEN** a camera actively delivering frames, not in edit mode
- **WHEN** the card renders
- **THEN** the pill reads `STREAMING` (or `RECORDING` per the priority above) with a pulsing recording dot, and mute + native-fullscreen buttons are shown

### Fullscreen

- Clicking the card body (view mode, no error) MUST toggle an in-app fullscreen modal showing only the camera feed; it closes on backdrop click or ESC and shows a "Click or press ESC to exit" hint.
- **In-tree portal (change 0007 decision):** the modal MUST portal into the liebe-panel shadow-root React container — resolved from the card's root node via `resolvePanelPortalContainer` (`src/components/ui/FullscreenModal.tsx:50`) — NOT `document.body`, so `@lit/context` `context-request` events still bubble to `<home-assistant>` on HA ≥ 2026.7. Standalone (light-DOM) rendering falls back to `document.body`.
- **Why not CSS fullscreen on the card:** `react-grid-layout` positions `.react-grid-item` via `transform: translate(...)` and its stylesheet sets `will-change: transform` (`node_modules/react-grid-layout/css/styles.css:25`), and GridCard applies `transform: scale(0.98)` — each creates a CSS containing block that breaks `position: fixed` descendants.
- **Verified fixed-positioning outcome:** the e2e spec asserts at runtime, via `getBoundingClientRect()`, that the portalled overlay's fixed backdrop covers the viewport (±2 px) while `<ha-camera-stream>` remains a shadow-DOM descendant of `<home-assistant>` (parent/host chain walk). No HA ancestor creates a containing block for the overlay, so no contingency positioning is needed.
- `KeepAlive` (`src/components/KeepAlive.tsx`, cache key `camera-${entityId}`) relocates the stream (or still image) between the normal and fullscreen containers. The container swap still detaches/reattaches the element, and `ha-web-rtc-player` closes its peer connection in `disconnectedCallback` — **one sub-second WebRTC renegotiation per fullscreen toggle is accepted**. Fullscreen forces `contain` fit.
- The native-fullscreen button MUST call `requestFullscreen()` on the element's inner `<video>` when present, else on the `<ha-camera-stream>` host itself (e.g. MJPEG mode, which has no inner video), and exit when that target is already fullscreen.

#### Scenario: Enter and leave in-app fullscreen

- **GIVEN** a playing camera stream
- **WHEN** the user clicks the feed and later presses ESC
- **THEN** the overlay opens covering the viewport, the stream element stays inside the `<home-assistant>`/`liebe-panel` tree, playback resumes after at most a brief renegotiation, and it recovers in the card after close (asserted end-to-end in `tests/e2e/camera-stream.spec.ts`)

### Debug Statistics Overlay

- When `showStats` is enabled, the card MUST overlay FPS, resolution, decoded frames, and dropped frames, sampled once per second from the element's inner `<video>` via `getVideoPlaybackQuality()` (with `webkit*`/`moz*` counter fallbacks). **Bitrate was removed** (change 0007): it required Liebe's own `RTCPeerConnection.getStats()`, which no longer exists.
- The overlay MUST render a compact single line at `small` size and a labeled multi-column layout at `medium`/`large`, in both normal and fullscreen views, and MUST hide while a stream error is shown.
- The inner video reference is mirrored into React state on each `streams`/`load` event (the video is recreated when the element remounts or swaps players), so the overlay always reads the live element.

### Camera Configuration Options

- The camera card MUST expose three per-card configuration options: `fit` (`cover` default, or `contain`), `matting` (`none` / `small` default / `large` card padding), and `showStats` (boolean, default false). Schema: `src/components/configurations/cardConfigurations.ts`.
- The card MUST map `matting` to Radix space tokens relative to the card size (`small` matches the size's default padding; `large` uses `--space-5`; `none` uses `0`).

### Stale-Tracking Exclusion

- Camera entities MUST be excluded from stale-entity tracking; a camera MUST never be reported stale even with no state events past the stale threshold, and a previously-stale camera MUST be marked fresh on the monitor's next pass (`src/services/staleEntityMonitor.ts`; full pipeline in [../entity-state/](../entity-state/)).

### E2E Coverage with a Synthetic Camera

The dockerized e2e stack ([../architecture/](../architecture/), change [0005](../../changes/0005-dockerized-ha-e2e.md)) includes a camera topology (change 0007):

- **go2rtc sidecar** (`alexxit/go2rtc:1.9.14`, `ha/docker-compose.yml`): publishes `e2e_pattern`, a fully synthetic ffmpeg `testsrc2` 1280×720@15 stream defined in `ha/go2rtc/go2rtc.yaml` — deterministic, no network access. Only the WebRTC media port (8555) is published to the host; the API (1984) and RTSP (8554) ports stay internal, reached by HA via the `go2rtc` hostname.
- **Writable config copy:** HA's go2rtc integration registers `camera.*` streams via `PUT /api/streams`, which go2rtc persists into its config file; a `:ro` bind mount of `/config` made that write fail (400) and aborted every WebRTC offer. The compose service therefore mounts the committed config read-only at `/ro` and copies it into a container-local writable `/config` at start, keeping the repo file pristine.
- **HA side** (`ha/config/configuration.yaml`): `ffmpeg:`, `go2rtc: {url: http://go2rtc:1984}`, and ffmpeg camera platform entries consuming go2rtc's RTSP restreams — `camera.e2e_pattern` (guaranteed) and `camera.personal` (optional, unavailable unless `RTSP_TEST_URL` is set; tests MUST NOT depend on it).
- **HLS guaranteed, WebRTC best-effort:** the e2e spec (`tests/e2e/camera-stream.spec.ts`) asserts playback (STREAMING/RECORDING pill, inner `<video>` with real dimensions and not paused) without asserting which player won; the winner is recorded informationally. Known quirk: HA 2026.7's `go2rtc-client` (0.4.0) requires a `url` field on every producer, but go2rtc reports _active_ `exec:` sessions with `source`/`remote_addr` instead, so `streams.list()` (run on every offer) raises and the offer fails with `{code: "unknown_error"}`; `<ha-camera-stream>` then falls back to HLS. In practice WebRTC wins on a cold stack and HLS wins once the exec producer is warm. The spec filters that specific unhandled rejection as benign; all other console errors are fatal.
- **RTSP secret policy:** a personal/real stream may only ever enter the stack via go2rtc's `${RTSP_TEST_URL:}` env substitution (value in untracked `.env.local` / CI secrets). `scripts/check-rtsp-leak.sh` fails CI if any tracked file contains a credentialed `rtsp://` URL or the literal `$RTSP_TEST_URL` value; only the placeholder reference may be committed.
- **Service-worker neutering:** in a fresh context the HA frontend reloads the page when its service worker first takes control (~4 s after load), and tokens from the panel's single-use auth code are not persisted — the reload bounced to the login screen and killed any test still waiting on stream startup. `openPanel` (`tests/e2e/helpers.ts`) neutralizes `navigator.serviceWorker.register` via an init script that never settles, keeping the API surface present (Playwright's `serviceWorkers: 'block'` would remove `navigator.serviceWorker` entirely, which HA frontend code touches unguarded).

#### Scenario: Synthetic camera plays in CI

- **GIVEN** the compose stack (HA + go2rtc) is up and a dashboard is seeded with a card for `camera.e2e_pattern`
- **WHEN** the e2e suite deep-links into the panel
- **THEN** the bootstrap ladder defines `<ha-camera-stream>`, the pill reaches STREAMING/RECORDING, the inner `<video>` plays with real dimensions, fullscreen open/close keeps the element in-tree with a viewport-covering fixed backdrop, and no non-benign console errors occur

## Design

### Architecture

```
camera.* entity (SUPPORT_STREAM)
        │
        ▼
CameraCard/index.tsx
   │        │
   │        ├─ useCameraStreamReady ── bootstrap ladder ──► customElements /
   │        │      loading | ready | unavailable            loadCardHelpers (HA frontend)
   │        │
   │        ├─ ready ──► HaCameraStream ──► <ha-camera-stream> (HA element)
   │        │               │                   └─ ha-web-rtc-player | ha-hls-player | <img> (MJPEG)
   │        │               │                        (HA owns WebRTC/HLS negotiation vs go2rtc)
   │        │               └─ streams/load events ──► useCameraStreamStatus
   │        │                                             (watchdog, remounts, retry)
   │        └─ unavailable ──► StillImageFallback (entity_picture, 10 s refresh)
   │
   ├─ CameraControls (pill + mute/native-fullscreen)
   ├─ CameraStats (getVideoPlaybackQuality)
   └─ FullscreenModal(portalContainer = resolvePanelPortalContainer(...)) + KeepAlive

staleEntityMonitor.ts ── excludes 'camera' domain (independent path)
```

The card owns UI, configuration, fullscreen, and wiring; the wrapper owns the element lifecycle and property sync; the readiness hook owns bootstrap; the status hook owns stream health; HA's element owns all protocol work.

### Data Models

```typescript
// useCameraStreamReady.ts
type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

// HaCameraStream.tsx — property surface of HA's element (frontend 20260624.x)
interface HaCameraStreamElement extends HTMLElement {
  stateObj?: HomeAssistantState
  hass?: HomeAssistant // consumed ≤ 2026.6; inert expando ≥ 2026.7
  muted?: boolean
  fitMode?: 'cover' | 'contain' | 'fill'
  controls?: boolean
}

interface HaCameraStreamHandle {
  getInnerVideo: () => HTMLVideoElement | null
  getMjpegImg: () => HTMLImageElement | null
}

// useCameraStreamStatus.ts
interface UseCameraStreamStatusResult {
  isStreaming: boolean
  hasFrameWarning: boolean
  error: string | null // only ever 'Stream stalled'
  remountKey: number
  onStreams: () => void
  onLoad: () => void
  retry: () => void
}
```

Thresholds (exported constants): `FRAME_WARNING_MS = 500`, `STALL_MS = 5000`, `MAX_AUTO_REMOUNTS = 3`; internal intervals: watchdog/poll 250 ms, MJPEG poll 500 ms, ladder poll 250 ms × 20, `whenDefined` timeout 10 s, still-image refresh 10 s.

Configuration values live on the grid item (`item.config`): `fit`, `matting`, `showStats`.

### API Surface

Liebe sends no camera-specific WebSocket commands. All negotiation (`camera/webrtc/*`, HLS playlist fetches, MJPEG) happens inside HA's element against HA's backend/go2rtc. Liebe's only touchpoints are DOM-level: element creation, property assignment, `streams`/`load` events, shadow-piercing reads of the inner `<video>`/`<img>`, and `GET entity_picture` for the fallback.

### Scenarios Covered by Tests

Unit tests (`src/components/CameraCard/__tests__/`, jsdom):

- `useCameraStreamReady.test.tsx` — ladder outcomes: already-defined, helpers-poll timeout, helpers rejection, `createCardElement` throw, `whenDefined` timeout, shared single-run promise across consumers, no post-unmount state set.
- `useCameraStreamStatus.test.tsx` — rVFC frame path, 500 ms warning + clear, 5 s stall → remount, remount cap → `Stream stalled` + recovery, `retry()` semantics, budget reset on entity-state transition, rVFC-absent polling fallback (with and without `getVideoPlaybackQuality`), MJPEG `naturalWidth` path, disabled reset, watchdog cleanup on unmount.
- `HaCameraStream.test.tsx` — element creation/identity, property sync (incl. `hass: undefined`), remount on `remountKey`/entity change, event forwarding, shadow-piercing `getInnerVideo`/`getMjpegImg` across both players and MJPEG.
- `StillImageFallback.test.tsx` — snapshot render, 10 s cache-buster refresh, `?`/`&` separator, no-picture icon branch.
- `CameraCard.test.tsx` — skeleton/disconnected states, non-stream icon, readiness branches (ready/loading/unavailable + truthful pill), status wiring, error + retry branch, fullscreen modal + native fullscreen fallbacks, mute toggle, stats visibility, matting/chrome, edit mode, config modal.
- `CameraControls.test.tsx` / `CameraStats.test.tsx` — pill priority order, buttons, sizing; stats math + vendor fallbacks.

E2E (`tests/e2e/camera-stream.spec.ts`, real HA + go2rtc): deep-link bootstrap ladder, element mounted in the panel, pill reaches STREAMING/RECORDING, inner `<video>` plays, fullscreen in-tree portal + fixed backdrop verification, recovery after ESC, no non-benign console errors/unhandled rejections.

## Constraints

- **Internal HA API.** `<ha-camera-stream>` and its players are not a public API; property names, shadow-DOM structure (relied on by `getInnerVideo`/`getMjpegImg` and the e2e shadow-piercing), and event names can change per HA release. The tolerant per-property assignment and still-image fallback bound the failure mode, but a breaking frontend change degrades cards to stills until the wrapper is updated.
- **DOM-tree placement is load-bearing on HA ≥ 2026.7.** The element must stay a descendant of `<home-assistant>` for `@lit/context` resolution — this forbids `document.body` portals for anything containing the element.
- **Fullscreen renegotiation.** Each fullscreen toggle detaches the element; `ha-web-rtc-player` closes its peer connection in `disconnectedCallback`, costing one sub-second renegotiation per toggle (accepted).
- **Single cached element per camera.** `KeepAlive` caches one subtree per `entityId`; two cards for the same camera would contend for the same portal element.
- **No bitrate stat.** Without a Liebe-owned peer connection there is no `getStats()`; only `getVideoPlaybackQuality`-derived stats remain.
- **WebRTC not guaranteed in CI.** The e2e contract is HLS-guaranteed / WebRTC best-effort; the go2rtc-client 0.4.0 exec-producer `url` quirk means warm stacks typically fall back to HLS.
- **`trust_external_script` tradeoff.** When Liebe is loaded from the hosted `panel.js`, HA may require `trust_external_script: true` in `panel_custom`; the README warns about the security implications and recommends self-hosting (affects the whole panel, load-bearing for camera users on the hosted build).

## Open Questions

- Does the second `Personal` ffmpeg camera entry (unavailable when `RTSP_TEST_URL` is unset) pollute e2e determinism? (Tracked in change 0007.)
- Should the wrapper detect a future `<ha-camera-stream>` property-surface change (e.g. a renamed `stateObj`) and degrade to the still image proactively, rather than showing a stalled stream?

## References

- `src/components/CameraCard/` — card, wrapper, readiness ladder, status machine, fallback, controls, stats (see Component Map)
- `src/components/CameraCard/__tests__/` — unit coverage for every component above
- `src/components/KeepAlive.tsx` — portal cache that preserves the stream across normal/fullscreen containers
- `src/components/ui/FullscreenModal.tsx` — modal with `portalContainer` prop + `resolvePanelPortalContainer`
- `src/components/configurations/cardConfigurations.ts` — camera card config schema (fit/matting/showStats)
- `src/services/staleEntityMonitor.ts` — camera-domain exclusion from stale tracking
- `src/components/cardRegistry.ts` — camera → CameraCard registration
- `tests/e2e/camera-stream.spec.ts` — end-to-end camera flow; `tests/e2e/helpers.ts` — `openPanel` service-worker neutering, `seedCameraConfig`
- `ha/docker-compose.yml`, `ha/go2rtc/go2rtc.yaml`, `ha/config/configuration.yaml` — e2e camera topology
- `scripts/check-rtsp-leak.sh` — CI gate against committing RTSP secrets
- HA frontend source: `ha-camera-stream`, `ha-web-rtc-player`, `ha-hls-player` (home-assistant/frontend)
- External: [go2rtc](https://github.com/AlexxIT/go2rtc), [@lit/context protocol](https://lit.dev/docs/data/context/), [HA ffmpeg camera](https://www.home-assistant.io/integrations/camera.ffmpeg/)
- Related specs: [../entity-cards/](../entity-cards/) (card registry), [../entity-state/](../entity-state/) (entity state + stale pipeline), [../architecture/](../architecture/) (e2e stack, testing conventions)

## Changelog

| Date       | Change                                                                                                                                                            | Document                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 2026-07-18 | Initial spec created (baseline of the hand-rolled WebRTC implementation)                                                                                          | —                                              |
| 2026-07-18 | Rewritten for the `<ha-camera-stream>` wrapper architecture (bootstrap ladder, status machine, in-tree fullscreen portal, still-image fallback, go2rtc e2e stack) | [0007](../../changes/0007-ha-camera-stream.md) |
