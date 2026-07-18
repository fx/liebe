# 0007: HA Camera Stream Element

## Summary

Replace the hand-rolled WebRTC camera pipeline (`useWebRTC.ts`, ~594 lines of `camera/webrtc/offer` signaling, plus the CameraCard-owned `<video>` element) with Home Assistant frontend's own `<ha-camera-stream>` custom element wrapped in React. The HA element owns stream negotiation (WebRTC and HLS), so Liebe stops duplicating protocol logic it cannot keep in sync with HA. When the element is unavailable (deep-link bootstrap failure or standalone dev outside HA), the card falls back to the entity's `entity_picture` still image.

**Spec:** [Camera Streaming](../specs/camera-streaming/)
**Status:** in progress
**Depends On:** —

## Motivation

The current `useWebRTC.ts` hand-rolls the `camera/webrtc/offer` websocket signaling: SDP munging, ICE candidate exchange, retry ladders, and teardown — all of which HA's frontend already implements and keeps current in `<ha-camera-stream>`. Every HA release risks breaking our copy (the 2026.7 frontend moved the element's dependencies from a `hass` property to `@lit/context`), and our implementation only supports WebRTC while HA's element negotiates the best available stream type per camera (WebRTC, HLS, or MJPEG). Delegating to the platform element removes ~600 lines of protocol code, gains HLS support for cameras without WebRTC, and turns HA frontend upgrades from a breakage risk into a free upgrade.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint`, and `npm run typecheck` MUST all pass before each PR is opened.
- Changed/added lines MUST be 100% covered (`codecov/patch` gate; check with `npm run test:coverage`).
- E2E assertions MUST be made against the live DOM / accessibility tree, REST/websocket state, and console output — never against screenshots.
- The RTSP leak gate (`scripts/check-rtsp-leak.sh`) MUST pass in CI: no credentialed `rtsp://` URL and no `$RTSP_TEST_URL` value may appear in tracked files. Only the literal env-var reference `${RTSP_TEST_URL:}` may be committed.

Skipping or weakening any of these rules to land a PR MUST be treated as a bug in the PR, not in the rule.

### Stream rendering via `<ha-camera-stream>`

- CameraCard MUST render live streams through HA frontend's `<ha-camera-stream>` element wrapped in a React component; Liebe MUST NOT own an `RTCPeerConnection` or perform `camera/webrtc/offer` signaling.
- The wrapper MUST support both HA dependency-injection generations (see compat matrix below) and MUST fall back to the still image when neither works.

#### Scenario: Stream renders through the HA element

- **GIVEN** the panel runs inside a supported HA (≥ 2024.10) and a camera entity supports streaming
- **WHEN** a CameraCard mounts
- **THEN** an `<ha-camera-stream>` element renders the live stream (WebRTC or HLS as negotiated by HA) with no Liebe-owned peer connection.

#### Scenario: Still-image fallback

- **GIVEN** the `<ha-camera-stream>` element cannot be bootstrapped (deep-link bootstrap failure, or standalone dev outside HA)
- **WHEN** a CameraCard mounts
- **THEN** the card shows the entity's `entity_picture` still image (refreshed periodically) instead of an empty/broken player.

### Dual-path HA compatibility

The wrapper MUST implement this compat matrix:

| HA version                     | Injection path                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ≤ 2026.6                       | Element exposes a `hass` property — assign it directly.                                                                   |
| ≥ 2026.7 (frontend 20260624.x) | Element consumes `apiContext` / `connectionContext` / `configContext` via `@lit/context`, resolved at `<home-assistant>`. |
| < 2024.10 / standalone dev     | Still-image fallback (element unavailable or unsupported).                                                                |

#### Scenario: Context-based injection on 2026.7+

- **GIVEN** HA ≥ 2026.7 where `<ha-camera-stream>` has no `hass` property
- **WHEN** the element is mounted inside the liebe-panel shadow-root React container (within the `<home-assistant>` DOM tree)
- **THEN** the element's `@lit/context` `context-request` events propagate to `<home-assistant>` and resolve the api/connection/config contexts, and the stream plays.

### Fullscreen

- Fullscreen MUST portal the player into the liebe-panel shadow-root React container (in-tree portal), not `document.body`, so `@lit/context` `context-request` events still resolve at `<home-assistant>`.
- One sub-second WebRTC renegotiation per fullscreen toggle is accepted (`ha-web-rtc-player` closes its peer connection in `disconnectedCallback`).

#### Scenario: Fullscreen keeps context resolution

- **GIVEN** a playing camera stream on HA ≥ 2026.7
- **WHEN** the user toggles fullscreen
- **THEN** the player re-mounts inside the panel's shadow-root container, contexts still resolve, and the stream resumes after at most a brief renegotiation.

### Stats and controls

- The bitrate stat MUST be removed (Liebe no longer owns an `RTCPeerConnection` to read it from). FPS, resolution, decoded frames, and dropped frames MUST be kept, read from the element's inner `<video>` via `getVideoPlaybackQuality()`.
- The mute toggle MUST keep working; it MAY cause the element to swap between HLS and WebRTC players (the element's internal `_streams()` selection logic) — a brief blink on toggle is accepted.

### E2E coverage with a synthetic camera

- The e2e stack MUST include a go2rtc service publishing a synthetic ffmpeg `testsrc2` pattern stream, exposed to HA as an ffmpeg camera (`camera.e2e_pattern`).
- HLS playback is the guaranteed CI assertion path; WebRTC is asserted best-effort (CI network permitting).
- A personal/real stream MUST only ever enter the stack via `${RTSP_TEST_URL:}` env substitution; its value MUST never be committed. `scripts/check-rtsp-leak.sh` MUST gate this in CI.

#### Scenario: Synthetic camera plays in CI

- **GIVEN** the compose stack (HA + go2rtc) is up and `camera.e2e_pattern` reports streaming support
- **WHEN** the e2e suite renders a seeded CameraCard for it
- **THEN** the stream reaches a playing state (HLS guaranteed; WebRTC best-effort) with no fatal console errors.

## Design

### Approach

- **Wrapper component**: a React component creates the `<ha-camera-stream>` element imperatively, applies the injection ladder (assign `hass` when the property exists; otherwise rely on `@lit/context` resolution through the DOM), and falls back to a still-image `<img src={entity_picture}>` renderer when the element can't be bootstrapped. Element availability comes from HA's frontend registry (deep-link import bootstrap); a bootstrap failure trips the fallback.
- **Status machine + chrome extraction**: CameraCard's connection/status UI is extracted from the old WebRTC hook into a small status machine driven by element/video events, so card chrome (spinner, error, stats overlay) is independent of the streaming implementation.
- **Fullscreen (in-tree portal — option b)**: `FullscreenModal` gains a `portalContainer` prop; CameraCard resolves the panel's shadow-root React container via `resolvePanelPortalContainer` and portals the fullscreen overlay there instead of `document.body`.
- **E2E**: `ha/docker-compose.yml` gains a pinned `go2rtc` service (`alexxit/go2rtc:1.9.14`) with a committed `ha/go2rtc/go2rtc.yaml` defining the synthetic `e2e_pattern` exec/ffmpeg stream and a `personal: ${RTSP_TEST_URL:}` stream; HA config gains `ffmpeg:`, `go2rtc:` and ffmpeg camera platform entries pointing at go2rtc's RTSP restream. `scripts/check-rtsp-leak.sh` runs in the e2e workflow before tests.

### Decisions

- **Decision: in-tree portal for fullscreen (option b)** — `react-grid-layout` positions `.react-grid-item` via `transform: translate(...)` and its stylesheet sets `will-change: transform` (`node_modules/react-grid-layout/css/styles.css:25`), and GridCard applies `transform: scale(0.98)`. Each of these creates a CSS containing block that breaks `position: fixed` descendants, so promoting the card itself to fullscreen via CSS is unviable. Portaling to `document.body` would work for ≤ 2026.6 but breaks ≥ 2026.7, where `@lit/context` `context-request` events must bubble to `<home-assistant>`; portaling into the liebe-panel shadow-root React container keeps the element inside that tree. Cost: the element unmounts/remounts on fullscreen toggle, and `ha-web-rtc-player` closes its peer connection in `disconnectedCallback` — one sub-second renegotiation per toggle, accepted.
- **Decision: drop the bitrate stat** — bitrate came from our own `RTCPeerConnection.getStats()`; with the peer connection owned inside HA's element it is not reachable. FPS/resolution/decoded/dropped remain available via the inner video's `getVideoPlaybackQuality()`.
- **Decision: accept player-swap blink on mute** — the element's `_streams()` logic may pick a different player (HLS vs WebRTC) depending on audio requirements; toggling mute can therefore swap players with a brief blink. Accepted rather than pinning stream type.
- **Decision: HLS as the guaranteed CI path** — WebRTC in CI depends on UDP/host networking quirks; the suite asserts HLS playback deterministically and treats WebRTC as best-effort.
- **Decision: personal stream via env substitution only** — go2rtc config references `${RTSP_TEST_URL:}`; compose passes `RTSP_TEST_URL` through to the container. The value lives only in untracked `.env.local`/CI secrets; `scripts/check-rtsp-leak.sh` fails CI if a credentialed RTSP URL or the actual value appears in tracked files.

### Non-Goals

- Supporting MJPEG-only cameras beyond whatever `<ha-camera-stream>` itself does.
- Preserving the bitrate stat or any Liebe-owned WebRTC signaling.
- Multi-camera grid-of-streams views or PTZ controls.
- Guaranteeing WebRTC playback in CI.

## Tasks

- [ ] Change doc 0007 + index sync
- [ ] E2E infra: go2rtc service, synthetic `testsrc2` camera, HA ffmpeg/go2rtc config, `scripts/check-rtsp-leak.sh` + CI wiring
- [ ] `FullscreenModal` `portalContainer` prop + `resolvePanelPortalContainer` util with tests
- [ ] `<ha-camera-stream>` React wrapper: injection ladder (hass property / @lit/context) + still-image fallback
- [ ] CameraCard status machine + chrome extraction (stats via `getVideoPlaybackQuality`, bitrate removed)
- [ ] The swap: CameraCard renders the wrapper; delete `useWebRTC.ts` and Liebe-owned signaling
- [ ] E2E camera spec: seeded CameraCard plays `camera.e2e_pattern` (HLS guaranteed, WebRTC best-effort)
- [ ] CI wiring: leak gate ordering, e2e workflow updates for go2rtc
- [ ] Rewrite [Camera Streaming](../specs/camera-streaming/) spec to the new architecture

## Open Questions

- Does the second `Personal` ffmpeg camera entry (unavailable when `RTSP_TEST_URL` is unset) pollute e2e determinism? If so, drop it from committed HA config and note that the personal stream is consumed via the same go2rtc but manual config.

## References

- Spec: [Camera Streaming](../specs/camera-streaming/)
- HA frontend source: `ha-camera-stream`, `ha-web-rtc-player`, `ha-hls-player` (home-assistant/frontend)
- Containing-block evidence: `node_modules/react-grid-layout/css/styles.css:25` (`will-change: transform`), GridCard `transform: scale(0.98)`
- External: [go2rtc](https://github.com/AlexxIT/go2rtc), [@lit/context protocol](https://lit.dev/docs/data/context/), [HA ffmpeg camera](https://www.home-assistant.io/integrations/camera.ffmpeg/)
