# 0007: HA Camera Stream Element

## Summary

Replace the hand-rolled WebRTC camera pipeline (`useWebRTC.ts`, ~594 lines of `camera/webrtc/offer` signaling, plus the CameraCard-owned `<video>` element) with Home Assistant frontend's own `<ha-camera-stream>` custom element wrapped in React. The HA element owns stream negotiation (WebRTC and HLS), so Liebe stops duplicating protocol logic it cannot keep in sync with HA. When the element is unavailable (deep-link bootstrap failure or standalone dev outside HA), the card falls back to the entity's `entity_picture` still image.

**Spec:** [Camera Streaming](../specs/camera-streaming/)
**Status:** complete
**Depends On:** —

## Motivation

The current `useWebRTC.ts` hand-rolls the `camera/webrtc/offer` websocket signaling: SDP munging, ICE candidate exchange, retry ladders, and teardown — all of which HA's frontend already implements and keeps current in `<ha-camera-stream>`. Every HA release risks breaking our copy (the 2026.7 frontend moved the element's dependencies from a `hass` property to `@lit/context`), and our implementation only supports WebRTC while HA's element negotiates the best available stream type per camera (WebRTC, HLS, or MJPEG). Delegating to the platform element removes ~600 lines of protocol code, gains HLS support for cameras without WebRTC, and turns HA frontend upgrades from a breakage risk into a free upgrade.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint`, and `npm run typecheck` MUST all pass before each PR is opened.
- Changed/added lines MUST be 100% covered (`codecov/patch` gate; check with `npm run test:coverage`).
- E2E assertions MUST be made against the live DOM / accessibility tree, REST/websocket state, and console output — never against screenshots.
- The RTSP leak gate (`scripts/check-rtsp-leak.sh`) MUST pass in CI: no credentialed `rtsp://` URL and no `$RTSP_TEST_URL` value may appear in tracked files. Only literal env-var placeholder references may be committed — go2rtc's `${RTSP_TEST_URL:}` and Compose's `${RTSP_TEST_URL:-}` substitution syntax — never the actual value.

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
- **Decision: drop the go2rtc-guidance error branch** — the old card special-cased a "not yet fully implemented" stream error with go2rtc setup instructions. That string came from Liebe's own `camera/webrtc/offer` signaling errors; with streaming delegated to `<ha-camera-stream>`, the status machine only ever surfaces `"Stream stalled"` (watchdog) — the guidance branch can no longer trigger and was removed in the swap.
- **Decision: status machine exposes `retry()`** — the card's Retry button must clear the surfaced error, restore the auto-remount budget, and bump `remountKey`; `useCameraStreamStatus` gained a `retry()` callback for this (semantics match the old `useWebRTC` `retry`).
- **Decision: truthful pill in still-image fallback** — when the element cannot be bootstrapped, the card shows the raw entity state (e.g. IDLE) instead of a forever-CONNECTING pill, and suppresses the loading spinner overlay. The still image also participates in the fullscreen KeepAlive swap (fullscreen forces `contain` fit, same as the stream).
- **Decision: native fullscreen falls back to the element host** — the native-fullscreen button targets the element's inner `<video>` when present, else the `<ha-camera-stream>` host itself (e.g. MJPEG mode, which renders an `<img>`).
- **Decision: personal stream via env substitution only** — go2rtc config references `${RTSP_TEST_URL:}`; compose passes `RTSP_TEST_URL` through to the container. The value lives only in untracked `.env.local`/CI secrets; `scripts/check-rtsp-leak.sh` fails CI if a credentialed RTSP URL or the actual value appears in tracked files.
- **Verified at runtime: fullscreen in-tree portal survives as `position: fixed`** — the e2e spec asserts, via `getBoundingClientRect()`, that the fullscreen overlay's fixed backdrop covers the viewport (±2px) while `<ha-camera-stream>` remains a shadow-DOM descendant of `<home-assistant>` (parent/host chain walk). No HA ancestor creates a containing block for the portalled overlay, so the plan's contingency (absolute-inset positioning relative to the panel) was NOT needed.
- **Decision: go2rtc config is copied into a writable `/config` at container start** — HA's go2rtc integration registers `camera.*` streams via `PUT /api/streams`, which go2rtc persists into its config file; with `/config` bind-mounted `:ro` that write failed (400) and every WebRTC offer was aborted before HLS fallback. The compose service now mounts the committed config read-only at `/ro` and copies it into a container-local `/config` on start, keeping the repo file pristine.
- **Known environment quirk: WebRTC offers fail while the exec producer is active** — HA 2026.7's `go2rtc-client` (0.4.0) requires a `url` field on every producer, but go2rtc reports _active_ `exec:` sessions with `source`/`remote_addr` instead, so `streams.list()` (run on every offer) raises and the offer fails with `{code: "unknown_error"}`. `<ha-camera-stream>` then falls back to HLS — matching this change's "WebRTC best-effort, HLS guaranteed" contract. The e2e spec filters that specific unhandled rejection as benign; in practice WebRTC wins on a cold stack and HLS wins once the exec producer is warm.
- **Hardening pass (post-swap correctness fixes):**
  - **Connect (load-phase) timeout — new behavior:** the status machine previously only started watching after a `load`/`streams` event, so a camera that never started (or a post-stall remount whose element never fired) left an infinite CONNECTING spinner. Each element incarnation now has a `CONNECT_TIMEOUT_MS` (20 s, exported for tests) budget of **visible** time to fire its first event — the MJPEG path shares the budget until the image has decoded pixels (plus an `error` listener on the `<img>` for a fast-fail) — after which the machine surfaces `Stream failed to start` with the normal Retry button.
  - **Visibility-aware watchdog:** rVFC is suspended in hidden tabs while the 250 ms watchdog kept running, producing spurious stalls that burned all 3 auto-remounts into `Stream stalled` on tab return. The watchdog now skips evaluation while `document.hidden`, resets the frame clock (grace period) and restores the auto-remount budget on return-to-visible, and the connect timeout pauses while hidden.
  - **Immediate video error surfacing:** the swap had dropped the old `Video playback error` from the `<video>` `error` event; the status machine now attaches a per-watch `error` listener to the inner video and surfaces it immediately instead of waiting out the 5 s stall × 3 remounts.
  - **Bootstrap ladder retries:** `ensureHaElement` cached false resolutions forever, pinning every camera card to the still image until a full reload; failures are now evicted from the cache so a remounted card retries the ladder (successes stay cached).
  - **Letterbox fullscreen exit:** the modal's content div swallowed clicks, so only taps landing on the video itself exited; the CameraCard fullscreen container now closes on any overlay tap (FullscreenModal semantics for other callers unchanged), and the e2e spec closes fullscreen via a letterbox-area click.
  - **Seeded FPS baseline:** CameraStats' zero baseline inflated the first sample against a long-running video (e.g. 250000 FPS); the baseline is seeded from the current playback quality on mount and FPS renders `—` until the second sample.
  - **E2E error-gate fixes:** bare `Object` pageerrors (synchronous plain-object throws) are recorded as placeholders and deduped against in-page rejection records instead of vanishing; in-flight console-arg serializations are awaited (with a timeout guard) before `fatalErrors()` reads; and the benign filters were narrowed from `/hls/i`·`/webrtc/i` (which matched any error whose source URL mentioned a player) to the specific known-benign payload substrings.
- **Review-fix pass (post-hardening correctness fixes):**
  - **Connect timer armed until a watch attaches:** the element's `streams` event can fire when the camera capabilities resolve — before the player and its inner `<video>`/`<img>` exist. Clearing the connect timer on the event therefore disarmed the load-phase timeout with nothing watching, reopening the infinite-CONNECTING gap. The timer is now cleared at the attach point inside the watch effect (video or MJPEG image found); an event with nothing attachable leaves it armed so the 20 s budget can still expire.
  - **Connect timeout is a single re-scheduled `setTimeout`:** the previous 4 Hz polling interval (up to ~80 wakeups per incarnation) was replaced by `createVisibleTimeout` — one timeout for the remaining visible-time budget, cancelled on hide and re-scheduled on return-to-visible. Visible-time-only semantics and all tests preserved.
  - **Unavailable entities never arm the stream:** `entity.state === 'unavailable'` previously still enabled streaming + the connect timeout, ending in a red `Stream failed to start` with a pointless Retry that contradicted GridCard's unavailable chrome. `streamEnabled` now gates on availability; unavailable cameras render the still-image fallback with the raw `UNAVAILABLE` pill and recover the stream automatically when the entity comes back.
  - **Standalone fast path + unavailable-readiness retry:** the failure-eviction fix had regressed standalone dev into a repeated 5 s `loadCardHelpers` poll per card mount. `ensureHaElement` now checks synchronously for the `<home-assistant>` root element (`isHaFrontendContext`): absent → resolve false immediately and cache the negative permanently (standalone can never become HA). In HA contexts, `useCameraStreamReady` re-attempts the ladder every 15 s while `unavailable` (`BOOTSTRAP_RETRY_INTERVAL_MS`), so cards mounted during a transient miss converge with later-mounted streaming cards instead of latching the still image. (The fixed 15 s cadence was later refined into exponential backoff with a 5 min delay cap and a 10-attempt total cap — see "Readiness retry backoff + cap" in the structural consolidation pass below.)
  - **Cross-epoch warning reset:** a `hasFrameWarning` raised by a video watch could survive a player swap into MJPEG mode, which never clears it, latching NO SIGNAL over a playing stream; the epoch bump now resets the warning.
  - **Exact object-rejection dedupe in e2e:** the in-page recorder tags non-Error object rejection reasons as `unhandled rejection (object):`, making the bare-`Object` pageerror dedupe exact — circular reasons serialize to `[object Object]` and slipped past the previous `{`-prefix heuristic, producing spurious fatal placeholders.
  - **Recoverable hls.js noise filters:** the narrowed benign filters had lost tolerance for recoverable hls.js `mediaError` payloads (buffer stall/append details during spin-up) and for circular `ErrorData` args that serialize to `<unserializable>`. New filters anchor on the `mediaError` type plus a known recoverable details value (order-insensitive), and accept `<unserializable>` entries only when the whole entry is unserializable parts sourced from the hls player chunk — still far narrower than the old `/hls/i`.
  - **Both fullscreen close paths in e2e:** the letterbox-click switch had dropped ESC from end-to-end coverage; the spec now closes via letterbox click, asserts recovery, reopens, closes via Escape, and asserts recovery again.
- **Structural consolidation pass (round-3 review — resolved by design, not by patching):**
  - **ONE load-budget timer, owned by connection state:** the connect timeout had accreted per-incarnation arming, an attach-point clearing rule, and a second MJPEG-owned copy of the budget — and still left gaps (a post-attach epoch with no attachable element had no timeout; the MJPEG branch granted a fresh 20 s at attach). The budget is now a single timer armed exactly while the machine is CONNECTING (`enabled && !isStreaming && !error`), independent of watch epochs, attach state, and the video-vs-MJPEG branch: streaming disarms it, streaming falling back to false (stall remount, player swap) re-arms a fresh budget, a surfaced error disarms it. Every epoch/branch gap is closed by construction; the per-branch timer code and the "owns the remaining load budget" complexity were deleted. `createVisibleTimeout` now composes `createVisibleElapsedTracker` (one banking implementation) instead of copy-pasting the visible-time banking.
  - **Watchdog epoch guard:** a stale watch's 250 ms tick could re-set `hasFrameWarning` in the window between `onStreamEvent`'s reset and the effect cleanup. Each watch captures its epoch at creation and every watchdog tick no-ops when a newer epoch has been announced (synchronous epoch ref).
  - **Entity blips no longer tear down the stream:** gating `streamEnabled` on `!isUnavailable` hard-unmounted `<ha-camera-stream>` on every 1-2 s `unavailable` blip (HA reconnects), killing a live stream that previously survived them. The element now stays mounted through `unavailable`; the card shows the unavailable chrome/pill immediately (UNAVAILABLE outranks CONNECTING/NO SIGNAL unless the stream is still actively delivering frames); the status hook gained `entityAvailable`, which PAUSES the load budget while the entity is unavailable (unavailable time doesn't count, like hidden time) and resumes it on recovery; surfaced errors are never wiped by blips.
  - **Readiness retry backoff + cap:** the uncapped 15 s bootstrap retry created a throwaway Lovelace card (with up to a 10 s `whenDefined` wait) forever on frontends where the element can never define. Retries now back off exponentially (15 s → 30 s → 60 s → ... capped at 5 min) with a total cap of 10 attempts, after which the card stays `unavailable` permanently for that mount. The standalone fast path is untouched.
  - **Cycle-safe e2e console serialization instead of a whitelist arms race:** a depth-limited, cycle-safe stringifier (`safeStringify`, self-contained by design) is now used by BOTH the init-script rejection recorder and the console-arg fallback (when `jsonValue()` rejects, the argument handle is stringified in-page instead of collapsing to `<unserializable>`), so hls.js `ErrorData` always yields inspectable text containing `type`/`details`/`fatal`. That made the `<unserializable> at hls chunk` benign pattern — which could have swallowed a fatal circular `ErrorData` — deletable outright. The benign list now supports predicates, and the recoverable-`mediaError` matcher rejects any payload carrying `"fatal": true` (the previous regex never excluded fatal escalations). The recorder's `(object)` dedupe tag is applied ONLY to plain-object rejection reasons (`[object Object]` toString tag, non-Error) — the one shape Chromium collapses to a bare `Object` pageerror — so arrays/Dates/Maps no longer over-consume placeholders and mask real throws.
- **Unavailability-suspension pass (final review round):**
  - **Unavailable = the WHOLE machine suspends, like a hidden tab:** the previous pass only paused the load budget during entity unavailability, leaving the watchdog and media-error fast-fails live — a backend dying during a 1-2 s reconnect blip could still burn the auto-remount budget into `Stream stalled` or surface a sticky `Video playback error`/`Stream failed to start` with a pointless Retry. While `entityAvailable` is false the watchdog now evaluates neither warnings nor stalls (no budget burn), and the inner-`<video>`/MJPEG-`<img>` `error` listeners are suppressed. Frames that keep arriving are still marked, so a stream playing through the blip keeps its status.
  - **Recovery is automatic — auto-retry replaces "errors survive blips":** the unavailable→available transition grace-resets the frame clock (like return-to-visible), restores the remount budget, and AUTO-RETRIES any surfaced error (clear + remount, re-arming a fresh connect budget). A backend restart therefore never requires a manual Retry click; errors surfaced while the entity was available still do. A healthy blip (no error) does not remount; a suppressed dead element recovers via the resumed watchdog's stall remount.
  - **Recent-frame pill evidence (`isActivelyStreaming`):** with the watchdog suspended, the `isStreaming` flag lags — a frozen frame never flips it false — so the `UNAVAILABLE`-vs-`STREAMING` pill precedence now keys off recent-frame evidence (frames observed within `FRAME_WARNING_MS`, evaluated immediately on the transition and every 250 ms during the blip). A dead camera reads `UNAVAILABLE` immediately instead of `NO SIGNAL` followed by a stall error; MJPEG (no frame evidence) always reads `UNAVAILABLE` during blips.
  - **Load-budget expiry race guard:** the first decoded frame can beat the expiring 20 s timer inside the same task window (`markFrame` flips the streaming ref synchronously; React commits the timer-disposing cleanup later). Expiry now no-ops when the streaming ref is already true, and `markFrame` additionally clears a pending `Stream failed to start` whenever frames flow while that error is surfaced with streaming true (belt-and-braces — reachable when an MJPEG epoch fast-fails under a stale streaming flag).
  - **`safeStringify` DAG false-positives fixed with a path stack:** the collector's stringifier used a never-cleared visited `WeakSet`, so a shared non-circular reference (the same object reached via two sibling fields — common in hls.js `ErrorData`, where `context`/`frag`/`loader` share objects) serialized as `[circular]`, potentially hiding the `type`/`details`/`fatal` fields the benign filters inspect. Cycle detection now uses a path stack (mark before recursing, unmark after): only true ancestor cycles are marked, shared siblings serialize fully, and the depth limit still bounds size. Property reads moved inside the guarded path too, so a throwing getter degrades one field to `[unreadable]` instead of aborting the whole stringification into the unmatchable placeholder. The function was extracted to `tests/e2e/safeStringify.ts` (still self-contained for in-page serialization) and unit-tested in `tests/unit/safeStringify.test.ts` (DAG serializes both references; true cycles marked).
  - **Serialization-failure placeholders scoped, not whitelisted:** when even the in-page `safeStringify` evaluation fails (the argument handle's execution context destroyed — typically a player logging during teardown), the collector emits `SERIALIZATION_FAILURE_PLACEHOLDER`, which no content filter can match. Placeholders stay fatal by default; the camera spec adds one narrowly scoped benign predicate accepting an entry ONLY when it is PURELY such placeholders (no readable text beyond the collector's source suffix) AND its source URL is a media-player chunk (hls/webrtc) — mirroring the previously deleted narrow escape hatch but scoped to serialization-failure placeholders instead of all unserializable text. Content-bearing entries from those chunks still fail the suite.
- **Fixed: HA's service worker reloaded the panel ~4s after load in e2e** — in a fresh browser context the HA frontend reloads the page when its service worker first takes control, and tokens from the panel's single-use auth code are not persisted, so the reload bounced to the login screen and killed any test still running (every existing spec just happened to finish in under 4s; the camera spec, waiting on stream startup, did not). `openPanel` now neutralizes `navigator.serviceWorker.register` via an init script (the API surface stays present — `serviceWorkers: 'block'` would remove `navigator.serviceWorker` entirely, which HA frontend code touches unguarded).

### Non-Goals

- Supporting MJPEG-only cameras beyond whatever `<ha-camera-stream>` itself does.
- Preserving the bitrate stat or any Liebe-owned WebRTC signaling.
- Multi-camera grid-of-streams views or PTZ controls.
- Guaranteeing WebRTC playback in CI.

## Tasks

- [x] Change doc 0007 + index sync
- [x] E2E infra: go2rtc service, synthetic `testsrc2` camera, HA ffmpeg/go2rtc config, `scripts/check-rtsp-leak.sh` + CI wiring
- [x] `FullscreenModal` `portalContainer` prop + `resolvePanelPortalContainer` util with tests
- [x] `<ha-camera-stream>` React wrapper: injection ladder (hass property / @lit/context) + still-image fallback
- [x] CameraCard status machine + chrome extraction (stats via `getVideoPlaybackQuality`, bitrate removed)
- [x] The swap: CameraCard renders the wrapper; delete `useWebRTC.ts` and Liebe-owned signaling
- [x] E2E camera spec: seeded CameraCard plays `camera.e2e_pattern` (HLS guaranteed, WebRTC best-effort)
- [x] CI wiring: leak gate ordering, e2e workflow updates for go2rtc — the e2e workflow gained a leak-gate step running `scripts/check-rtsp-leak.sh` (with the `RTSP_TEST_URL` secret) before tests, and the compose-up step passes `RTSP_TEST_URL` through to `e2e:ha:up` so the optional personal stream reaches go2rtc; go2rtc itself comes up via the same compose file with no further workflow changes
- [x] Rewrite [Camera Streaming](../specs/camera-streaming/) spec to the new architecture

## Open Questions

- Does the second `Personal` ffmpeg camera entry (unavailable when `RTSP_TEST_URL` is unset) pollute e2e determinism? If so, drop it from committed HA config and note that the personal stream is consumed via the same go2rtc but manual config.

## References

- Spec: [Camera Streaming](../specs/camera-streaming/)
- HA frontend source: `ha-camera-stream`, `ha-web-rtc-player`, `ha-hls-player` (home-assistant/frontend)
- Containing-block evidence: `node_modules/react-grid-layout/css/styles.css:25` (`will-change: transform`), GridCard `transform: scale(0.98)`
- External: [go2rtc](https://github.com/AlexxIT/go2rtc), [@lit/context protocol](https://lit.dev/docs/data/context/), [HA ffmpeg camera](https://www.home-assistant.io/integrations/camera.ffmpeg/)
