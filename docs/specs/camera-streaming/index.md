# Camera Streaming

## Overview

Liebe renders live camera feeds inside the dashboard grid by wrapping Home Assistant frontend's own `<ha-camera-stream>` custom element in React. HA's element owns all stream negotiation (WebRTC, HLS, or MJPEG as it sees fit); Liebe MUST NOT own an `RTCPeerConnection` or perform any `camera/webrtc/*` signaling. The card MUST bootstrap the element on demand (it is not defined on a deep link into the panel), MUST fall back to the entity's still image when the element cannot be bootstrapped, MUST surface connecting/streaming/no-signal/stalled/failed-to-start states from a frame-watching, visibility-aware status machine, and MUST provide mute, native fullscreen, an in-app ("semi") fullscreen that is a pure CSS/positioning flip on a stationary stream node — the element NEVER moves in the DOM, so a fullscreen toggle never reconnects the stream — and per-card fit/matting/debug-stats configuration. Camera entities MUST be excluded from stale-entity tracking because they update via the media stream rather than state events. This document describes the current implementation; it does not propose changes.

## Background

Home Assistant exposes cameras as entities in the `camera` domain and ships a frontend element, `<ha-camera-stream>`, that negotiates the best available stream type per camera (WebRTC via go2rtc, HLS, or MJPEG). Liebe originally hand-rolled its own WebRTC pipeline (`useWebRTC.ts`, ~594 lines of `camera/webrtc/offer` signaling); change [0007](../../changes/0007-ha-camera-stream.md) replaced it with the platform element, deleting the Liebe-owned signaling entirely. Delegating to HA's element removed the protocol-drift risk (the 2026.7 frontend changed the element's dependency injection from a `hass` property to `@lit/context`), gained HLS/MJPEG support for cameras without WebRTC, and turned HA frontend upgrades from a breakage risk into a free upgrade.

The cost of embedding an internal HA frontend element is a compatibility surface Liebe must manage itself: element bootstrap (the defining module chunk is lazily loaded by HA), dependency injection across HA generations, and DOM-tree placement constraints for `@lit/context` resolution. This spec covers that wrapper architecture, the status machine, fullscreen, stats, configuration, stale-tracking exclusion, and the e2e camera stack. It does NOT cover the general card registry (see [../entity-cards/](../entity-cards/)) or the entity state pipeline (see [../entity-state/](../entity-state/)).

## Requirements

### Component Map

The camera surface is self-contained in `src/components/CameraCard/`:

| File                       | Role                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `index.tsx`                | `CameraCard` — card chrome, config, in-place fullscreen wiring (no DOM move — default grid dimensions 4×2) |
| `HaCameraStream.tsx`       | React wrapper that imperatively creates and property-syncs the `<ha-camera-stream>` element                |
| `useCameraStreamReady.ts`  | Bootstrap ladder — ensures the custom element is defined, or reports it unavailable                        |
| `useCameraStreamStatus.ts` | Status machine — frame watchdog, auto-remounts, stall error, retry                                         |
| `StillImageFallback.tsx`   | `entity_picture` still-image renderer used when the element cannot be bootstrapped                         |
| `CameraControls.tsx`       | Status pill + mute/native-fullscreen buttons, `em`-scaled by card size                                     |
| `CameraStats.tsx`          | Debug overlay (FPS, resolution, decoded/dropped frames)                                                    |
| `CameraCard.css`           | Recording-dot pulse animation                                                                              |

Each component has a matching unit test in `src/components/CameraCard/__tests__/`. Camera registration into the card system is via the card registry (`src/components/cardRegistry.ts`, `camera: CameraCard`) — see [../entity-cards/](../entity-cards/).

### Stream Support Detection

- The card MUST treat a camera as stream-capable only when its `supported_features` attribute has the `SUPPORT_STREAM` bit (value `2`) set (`src/components/CameraCard/index.tsx:39`, `:82`-`85`).
- When the camera is not stream-capable, the card MUST render a static video icon instead of a stream, tinted blue while recording or streaming and gray otherwise.
- The stream path MUST be enabled only when an entity exists, Home Assistant is connected, the camera supports streaming, AND the bootstrap ladder reports `ready` (`streamEnabled`, `src/components/CameraCard/index.tsx`).
- **Unavailable suspension (not teardown):** entity availability MUST NOT gate mounting — a 1-2 s `unavailable` blip (HA reconnects) must not hard-unmount `<ha-camera-stream>`, because the underlying stream often keeps playing straight through. Instead: the element stays MOUNTED; the card shows the unavailable chrome (GridCard `isUnavailable`) and the truthful `UNAVAILABLE` pill immediately whenever the entity is unavailable and frames are not DEMONSTRABLY flowing (recent-frame evidence — see the status machine — keeps the `STREAMING` pill); and the status hook SUSPENDS its entire machine via `entityAvailable` while the entity is unavailable, exactly like a hidden tab (see the status-machine section for the full suspension/recovery semantics), so a dead camera can never burn budgets or surface sticky errors during the blip. On recovery the machine resumes automatically — including an auto-retry of any surfaced error.

#### Scenario: Camera without stream support

- **GIVEN** a `camera.*` entity whose `supported_features` does not include bit `2`
- **WHEN** the card renders
- **THEN** no stream element is mounted and a static video icon is shown

#### Scenario: Unavailable camera / availability blip

- **GIVEN** a stream-capable camera whose entity state is `unavailable`
- **WHEN** the card renders (or a live stream's entity blips `unavailable` for 1-2 s during an HA reconnect)
- **THEN** the stream element stays mounted, the unavailable chrome shows, the pill reads `UNAVAILABLE` unless recent-frame evidence proves frames are still flowing (in which case it stays `STREAMING`), the whole status machine is suspended for the duration (no budget burn, no watchdog verdicts, no media-error fast-fails), and on recovery the machine resumes with a frame-clock grace, a restored remount budget, and an automatic retry of any surfaced error — no manual Retry click

### Element Bootstrap Ladder

`<ha-camera-stream>` is defined by a lazily-loaded HA frontend module chunk, so on a deep link straight into the panel it is usually NOT yet in the custom-element registry. `useCameraStreamReady` (`src/components/CameraCard/useCameraStreamReady.ts`) runs a bootstrap ladder that MUST:

1. Return `ready` immediately if `customElements.get('ha-camera-stream')` already resolves.
2. Otherwise, if there is no HA frontend document context — `isHaFrontendContext()` checks synchronously for the `<home-assistant>` root element, which the panel always lives inside when embedded in HA — resolve `unavailable` IMMEDIATELY. Standalone dev must get its still-image fallback instantly instead of burning the 5 s helpers poll on every card mount, and this negative MAY be cached permanently: a standalone page can never become an HA frontend later.
3. Otherwise poll `window.loadCardHelpers` (HA defines it lazily) every 250 ms for up to 20 attempts; if it never appears, return `unavailable`.
4. Otherwise call `loadCardHelpers()` and create a **throwaway** `picture-entity` card with `camera_view: 'live'` — creating that Lovelace card makes the HA frontend import the module chunk that defines `<ha-camera-stream>`. The throwaway card is never attached to the DOM.
5. Race `customElements.whenDefined('ha-camera-stream')` against a 10 s timeout; resolve `ready` on definition, `unavailable` on timeout or any thrown error.

- The ladder MUST be single-flight per tag: all camera cards share one in-flight promise (`ladderPromises` in `src/utils/haFrontend.ts`), so N cards create at most one throwaway card per attempt. A test-only `resetEnsureHaElementForTests()` clears the cache.
- In HA contexts, only a **successful** (true) resolution MUST stay cached. A false resolution can be transient (the `loadCardHelpers` poll window missed on a slow HA load, `whenDefined` timeout), so the cache entry MUST be evicted on failure — the next consumer (a remounted card, the retry path) re-runs the ladder instead of being pinned to `unavailable` until a full page reload. `useCameraStreamReady` calls `ensureHaElement` on every mount, so a component remount is a genuine fresh chance.
- **Unavailable retry with backoff and cap (HA contexts only):** while readiness is `unavailable` inside an HA context, the hook MUST re-attempt the ladder and flip to `ready` when an attempt succeeds — an already-mounted card that hit a transient miss must eventually converge with later-mounted streaming cards. Because each attempt creates a throwaway Lovelace card and can wait up to 10 s on `whenDefined`, the retry schedule MUST back off exponentially from `BOOTSTRAP_RETRY_INTERVAL_MS` (15 s → 30 s → 60 s → ... capped at `BOOTSTRAP_RETRY_MAX_DELAY_MS` = 5 min per gap) and MUST stop for good after `BOOTSTRAP_RETRY_MAX_ATTEMPTS` (10) total attempts: past the cap the card stays `unavailable` permanently for that mount — that frontend evidently cannot define the element. Standalone MUST NOT retry — its negative is permanent.
- The hook exposes three readiness states: `loading` (ladder in flight — card keeps the connecting state), `ready` (render `HaCameraStream`), `unavailable` (render `StillImageFallback`).

#### Scenario: Deep link into the panel

- **GIVEN** a fresh browser context deep-linked into the panel (no Lovelace warm-up), where `window.loadCardHelpers` is undefined at first paint
- **WHEN** a camera card mounts
- **THEN** the ladder polls `loadCardHelpers` into existence, creates the throwaway card, `<ha-camera-stream>` becomes defined, and the card mounts it (exercised end-to-end by `tests/e2e/camera-stream.spec.ts`)

#### Scenario: Standalone dev outside HA

- **GIVEN** the panel running without an HA frontend (no `<home-assistant>` root element in the document)
- **WHEN** a camera card mounts
- **THEN** readiness is `unavailable` immediately (no helpers poll), the card falls back to the still image, and the permanent negative cache means later mounts skip the ladder too

#### Scenario: Transient bootstrap miss converges

- **GIVEN** a card inside HA whose first ladder run missed (slow HA load exhausted the helpers poll), showing the still image
- **WHEN** a backoff retry (first after 15 s) re-attempts the ladder after the frontend has caught up
- **THEN** readiness flips to `ready` and the card starts streaming without a remount or page reload

#### Scenario: Element can never define

- **GIVEN** a frontend where `<ha-camera-stream>` can never be defined (every ladder attempt fails)
- **WHEN** the backoff ladder exhausts its 10-attempt cap (15 s, 30 s, 60 s, 120 s, 240 s, then 5 min gaps)
- **THEN** no further throwaway cards are ever created and the card stays on the still-image fallback permanently for that mount

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
- The still image fullscreens in place exactly like the live stream — the `<img>` node stays mounted at one DOM location and only its container's positioning flips — and fullscreen forces `contain` fit for it too.

#### Scenario: Still-image fallback

- **GIVEN** readiness `unavailable` and an entity with an `entity_picture`
- **WHEN** the card renders
- **THEN** the snapshot is shown (refreshing every 10 s with a cache-buster), the pill reads the raw entity state, and no spinner overlay is drawn

### Stream Status Machine

`useCameraStreamStatus` (`src/components/CameraCard/useCameraStreamStatus.ts`) owns all surfaced stream health. It is driven by the element's `streams`/`load` events — each event bumps a watch epoch and starts a fresh watch against the (possibly recreated) inner `<video>`:

- **Frame detection:** `isStreaming` MUST become true only after a decoded frame is observed — via `requestVideoFrameCallback` when the browser implements it (checked at runtime, not by type narrowing), otherwise by polling `currentTime` / `getVideoPlaybackQuality().totalVideoFrames` every 250 ms.
- **Watchdog:** a 250 ms interval MUST raise `hasFrameWarning` after 500 ms without a new frame (`FRAME_WARNING_MS`) and MUST treat 5 s without a frame (`STALL_MS`) as a sustained stall.
- **Visibility awareness:** hidden tabs suspend `requestVideoFrameCallback` (and throttle rendering) without the stream being unhealthy, so the watchdog MUST skip stall/warning evaluation entirely while `document.hidden`. On return to visible it MUST reset the frame clock to now (grace period before evaluation resumes) and MUST restore the auto-remount budget — a hidden tab must never burn the budget into a spurious `Stream stalled`.
- **ONE load-budget timer, owned by connection state:** the connect/load timeout MUST be a single timer armed exactly while the machine is CONNECTING — `enabled && !isStreaming && !error` — independent of watch epochs, attach state, and the video-vs-MJPEG branch. Streaming flipping true disarms it; streaming falling back to false (stall remount, player swap) re-arms a FRESH `CONNECT_TIMEOUT_MS` (20 s) budget; a surfaced error disarms it. By construction the timer therefore ALWAYS exists while CONNECTING: an incarnation that never fires an event, an early `streams` event with no attachable element, an attached `<video>`/`<img>` that never decodes, and a post-stall remount that never comes up all expire into `'Stream failed to start'` (Retry via the normal error branch) instead of an infinite CONNECTING spinner. Attaching to an element is NOT the end of the load phase — only decoded frames/pixels are. Only counted time burns budget: the timer is a single re-scheduled `setTimeout` for the remaining budget (`createVisibleTimeout`, composed from the single `createVisibleElapsedTracker` banking implementation) that pauses while the tab is hidden AND while the entity is unavailable (`entityAvailable` input).
- **Load-budget expiry race guard:** the first decoded frame can beat the expiring timer inside the same task window — `markFrame` flips the streaming ref synchronously, but React commits the re-render (whose cleanup disposes the timer) later. Expiry MUST therefore no-op when the streaming ref is already true, and `markFrame` MUST additionally clear a pending `'Stream failed to start'` whenever frames flow while that specific error is surfaced with streaming true (belt-and-braces — reachable e.g. when an MJPEG epoch fast-fails while the streaming flag is still true from a superseded video watch): flowing frames always win over a stale load failure.
- **Entity-unavailability suspension:** while `entityAvailable` is false the ENTIRE machine MUST be suspended, exactly like a hidden tab: the load budget is paused (above), the watchdog evaluates neither warnings nor stalls (so the auto-remount budget cannot burn), and the fast-fail media `error` listeners — the inner `<video>`'s and the MJPEG `<img>`'s — are suppressed: a backend dying during a blip must not surface a sticky `'Video playback error'`/`'Stream failed to start'`. Frames that keep arriving are still marked (rVFC is not suspended by unavailability), so a stream playing through the blip keeps its status.
- **Automatic recovery on unavailable→available:** the transition MUST grace-reset the frame clock (like return-to-visible), restore the auto-remount budget, and AUTO-RETRY any surfaced error — clear it and bump `remountKey` — so recovery never requires a manual Retry click (the cleared error flips the machine back to CONNECTING, re-arming a fresh load budget). This replaces the earlier "errors survive blips" rule: errors persist for the DURATION of a blip but are auto-retried at recovery. Errors surfaced while the entity was available still require manual Retry. A recovery with no surfaced error MUST NOT remount (a healthy blip must not churn the element); a suppressed dead element instead recovers via the resumed watchdog's stall remount.
- **Recent-frame evidence (`isActivelyStreaming`):** the hook MUST expose recent-frame evidence — true only when decoded frames were observed within `FRAME_WARNING_MS` — maintained (evaluated immediately on the transition, then every watchdog interval) ONLY while the entity is unavailable, and false whenever it is available. The `UNAVAILABLE`-vs-`STREAMING` pill precedence MUST key off this evidence, never the lagging `isStreaming` flag: with the watchdog suspended, a frozen frame never flips `isStreaming` false, so a dead camera would otherwise keep a `STREAMING` (or NO SIGNAL→stall-error) pill instead of reading `UNAVAILABLE` immediately. MJPEG mode has no frame evidence, so an MJPEG stream always reads `UNAVAILABLE` during a blip.
- **Auto-remount with cap:** on a stall the machine stops the current watch and bumps `remountKey` (recreating the element, whose new `load` event starts a fresh watch) — at most `MAX_AUTO_REMOUNTS` (3) consecutive times. Past the cap it MUST surface the error `'Stream stalled'` instead of looping forever. Any observed frame, entity-state transition, or return-to-visible restores the budget. (A stream that never produced frames at all expires into `'Stream failed to start'` via the load budget instead — `'Stream stalled'` is reachable only after streaming once, since only a prior streaming phase re-arms the fresh budget the stall cycles fit inside.)
- **Watchdog epoch guard:** each watch captures its epoch at creation, and every watchdog tick MUST no-op when a newer epoch has been announced (synchronous epoch ref bumped in `onStreamEvent`) — a queued tick from a superseded watch could otherwise re-set `hasFrameWarning` in the window between the event's reset and the effect cleanup.
- **Immediate video errors:** the machine MUST listen for the inner `<video>`'s `error` event during each watch and surface `'Video playback error'` immediately (stopping the watch) instead of waiting out the 5 s stall plus the remount budget. The listener is re-attached per watch (the video is recreated on remounts/player swaps) and removed on watch teardown.
- **Retry:** `retry()` MUST clear the surfaced error, reset streaming/warning state, restore the auto-remount budget, and bump `remountKey`; clearing the error flips the machine back to CONNECTING, which re-arms the load budget. The card wires it to the Retry button in the error branch (semantics match the old `useWebRTC` retry).
- **MJPEG path:** when there is no inner `<video>` but `getMjpegImg()` finds an `<img>`, the machine MUST poll `naturalWidth` every 500 ms and mark streaming once the image has decoded pixels (which also clears any stale error, mirroring the video path's frame transition) — with NO frame watchdog (the browser owns the multipart stream) and NO budget of its own: the load phase is covered entirely by the connection-state timer, so an image attaching mid-load does NOT get a fresh 20 s. An `error` event on the `<img>` fast-fails to `'Stream failed to start'`.
- **Warning reset across epochs:** a stale `hasFrameWarning` MUST NOT survive into a new watch epoch — a video watch that warned before a player swap would otherwise latch `NO SIGNAL` into MJPEG mode, which never raises or clears warnings itself. The epoch bump (`onStreamEvent`) resets the warning.
- **Disable reset:** when `enabled` flips false, all surfaced status MUST reset in the effect cleanup. Availability changes are NOT a disable — surfaced status persists through a blip and is auto-retried at recovery (above) instead of being wiped mid-blip.

#### Scenario: Stream stalls and recovers via remount

- **GIVEN** a playing stream that stops delivering frames
- **WHEN** 500 ms pass, then 5 s
- **THEN** the pill shows `NO SIGNAL` at 500 ms, and at 5 s the element is remounted (fresh watch); frames on the new element clear everything

#### Scenario: Stall persists past the remount budget

- **GIVEN** three consecutive auto-remounts each ending in a 5 s stall
- **WHEN** the fourth stall is detected
- **THEN** the card shows the `Stream stalled` error with a Retry button; Retry clears the error, restores the budget, and remounts once more

#### Scenario: Camera never starts

- **GIVEN** an enabled stream whose element never fires a `load`/`streams` event, fires one before any player/inner element exists, attaches an element that never decodes, or is a post-stall remount that never comes up
- **WHEN** 20 s of counted time pass without the machine reaching streaming
- **THEN** the card shows `Stream failed to start` with a Retry button instead of an infinite CONNECTING spinner; time spent in a hidden tab or while the entity is unavailable does not count

#### Scenario: Hidden tab does not fake a stall

- **GIVEN** a playing stream in a tab that goes hidden (rVFC suspended)
- **WHEN** the tab returns to visible after minutes
- **THEN** no warning, remount, or `Stream stalled` error was raised while hidden; the watchdog resumes after a fresh grace period with a full auto-remount budget

#### Scenario: Backend dies during an availability blip

- **GIVEN** a playing stream whose entity goes `unavailable` and whose backend then kills the media element (an `error` event fires on the inner `<video>`)
- **WHEN** the entity later recovers
- **THEN** no sticky `Video playback error` was surfaced during the blip (the fast-fail listener was suppressed), the pill read `UNAVAILABLE` as soon as frames stopped being recent, and after recovery the resumed watchdog stalls out the dead element and auto-remounts it — the stream comes back with no manual Retry

#### Scenario: Error surfaced before a blip is auto-retried at recovery

- **GIVEN** a card showing `Stream failed to start` (surfaced while the entity was available)
- **WHEN** the entity blips `unavailable` and recovers
- **THEN** the error keeps showing during the blip, and at recovery it is cleared and the element remounted automatically with a fresh connect budget — a camera that is genuinely dead re-errors after another 20 s of counted time

### Card States and Controls

- The card MUST render a skeleton while the entity loads and an error display when disconnected or the entity is missing.
- The status pill (`CameraControls`) MUST resolve, in priority order: `ERROR`, `UNAVAILABLE` (raw state — entity unavailable without recent-frame evidence; only `isActivelyStreaming`, never the lagging `isStreaming` flag, lets a stream playing through a blip keep `STREAMING`), `CONNECTING` (reconnecting, or stream-capable but not yet streaming), `NO SIGNAL`, `RECORDING` (recording, or streaming while `entity.state === 'streaming'`), `STREAMING`, `IDLE`, then the raw entity state uppercased.
- While streaming without error and not in edit mode, the card MUST show mute/unmute and native-fullscreen buttons; the stream MUST start muted by default.
- Stream errors MUST render the message plus a Retry button wired to the status machine's `retry()`. There is no go2rtc-guidance branch: the old "Camera Configuration Required" guidance keyed off Liebe's own signaling errors, which no longer exist — the machine-surfaced errors are `Stream stalled` (watchdog cap), `Stream failed to start` (connect timeout / MJPEG failure), and `Video playback error` (media element `error` event).
- **Mute caveat:** toggling mute only flips the element's `muted` property, but the element's internal `_streams()` selection MAY pick a different player (HLS vs WebRTC) depending on audio requirements — a brief blink on toggle is accepted rather than pinning the stream type.

#### Scenario: Streaming card in view mode

- **GIVEN** a camera actively delivering frames, not in edit mode
- **WHEN** the card renders
- **THEN** the pill reads `STREAMING` (or `RECORDING` per the priority above) with a pulsing recording dot, and mute + native-fullscreen buttons are shown

- **In-place CSS fullscreen — the stream node NEVER moves (change 0008):** in-app fullscreen MUST be a pure CSS/positioning change on the card's own, persistently-mounted stream container (`streamContainerRef`, `src/components/CameraCard/index.tsx`). Toggling fullscreen in EITHER direction MUST NOT detach or reattach the `<ha-camera-stream>` element (or the still-image `<img>`): no `removeChild`/`appendChild`/`moveBefore` of the node or any ancestor wrapper. Because the node never disconnects, HA's inner players (`ha-hls-player`/`ha-web-rtc-player`) never run their `disconnectedCallback`/`connectedCallback`, so the HLS/WebRTC connection is never torn down or renegotiated — there is NO reconnect on a fullscreen toggle. The guarantee is browser-agnostic BY CONSTRUCTION (it uses no DOM-move API at all — in particular it never depends on the Chromium-only `Element.moveBefore()`); the e2e suite empirically verifies it in Chromium (the only project configured in `playwright.config.ts`).
- Clicking the card body (view mode, no error) MUST toggle the overlay showing only the camera feed; it shows a "Click or press ESC to exit" hint and MUST close on ESC or **any tap on the overlay — including the letterbox area** (the stream container itself carries the close handler, so a tap anywhere on the black backdrop exits, not only taps landing on the video). The overlay controls (mute/native-fullscreen) `stopPropagation` and MUST NOT close the overlay. ESC handling lives on the card (a `keydown` listener active only while fullscreen); `FullscreenModal` is no longer used by the camera card (its semantics for other callers — e.g. `EntityBrowser` — are unchanged).
- **Enabling the in-place fixed overlay — two containing blocks removed, one stacking context lifted:**
  - The grid positions items via `positionStrategy={absoluteStrategy}` (`src/components/GridLayoutSection.tsx`, imported from `react-grid-layout/core`) — `top`/`left` instead of `transform: translate(...)` — so no grid-item transform establishes a containing block that would trap the overlay's `position: fixed` (grid-layout spec: [../grid-layout/](../grid-layout/index.md)).
  - While fullscreen, `CameraCard` sets `contain: 'none'` on its `GridCard` via the `style` passthrough, dropping the Radix card's `contain: paint` (a containing block AND a paint clip) for exactly the overlay's duration; it is restored the instant the overlay closes.
  - The root `.radix-themes` element establishes its own stacking context (`position: relative; z-index: 0`), which would cap a descendant `z-index: 99999` below Home Assistant's chrome. While any camera overlay is open, `PanelApp` lifts that root Theme element's stacking (`position: relative; zIndex: CAMERA_FULLSCREEN_Z_INDEX`) — a STYLE change on an ancestor, never a move of the stream node — so the overlay paints OVER HA's header/sidebar. A COUNTER (`cameraFullscreenStore`, `src/store/cameraFullscreenStore.ts`) keeps the lift correct even if two overlays were ever open at once; the card increments it on open and decrements (clamped at zero) on close.
- **`:active`-scale hazard:** the `.grid-card:active { transform: scale(0.98) }` on coarse pointers would re-establish a containing block during the very tap that opens fullscreen; it MUST be mitigated so the ~100 ms transition tail cannot re-trap the just-promoted overlay.
- **DOM-tree placement preserved:** because the node never moves, `<ha-camera-stream>` remains a shadow-DOM descendant of `<home-assistant>` at all times (including fullscreen), so `@lit/context` `context-request` resolution keeps working on HA ≥ 2026.7 — the same in-tree requirement change 0007 satisfied with a portal, now satisfied by never leaving the card.
- **Verified coverage — geometry AND topmost:** the e2e spec asserts at runtime, via `getBoundingClientRect()`, that the overlay's fixed backdrop covers the viewport (±2 px) while `<ha-camera-stream>` stays a shadow-DOM descendant of `<home-assistant>` (parent/host chain walk). Geometry alone cannot distinguish a covering overlay from one trapped behind a higher stacking context, so the spec ALSO asserts a shadow-aware `document.elementFromPoint()` topmost hit-test at coordinates over HA's sidebar chrome resolves INTO the overlay, not HA chrome (proving the root-Theme stacking lift actually out-paints HA).
- Fullscreen forces `contain` fit. The native-fullscreen button MUST call `requestFullscreen()` on the element's inner `<video>` when present, else on the `<ha-camera-stream>` host itself (e.g. MJPEG mode, which has no inner video), and exit when that target is already fullscreen.

#### Scenario: Enter and leave in-app fullscreen without reconnecting

- **GIVEN** a playing camera stream
- **WHEN** the user clicks the feed and later taps the overlay's letterbox area (or presses ESC)
- **THEN** the overlay opens covering the viewport (over HA's chrome), the `<ha-camera-stream>` element is never detached/reattached, the same inner `<video>` keeps playing with no renegotiation (no fresh HLS master-playlist bootstrap, no new WebRTC offer) in EITHER direction, and the stream element stays inside the `<home-assistant>`/`liebe-panel` tree throughout (BOTH close paths — letterbox click and Escape — plus the no-DOM-move / no-renegotiation / topmost-coverage proofs asserted end-to-end in `tests/e2e/camera-stream.spec.ts`)

### Debug Statistics Overlay

- When `showStats` is enabled, the card MUST overlay FPS, resolution, decoded frames, and dropped frames, sampled once per second from the element's inner `<video>` via `getVideoPlaybackQuality()` (with `webkit*`/`moz*` counter fallbacks). **Bitrate was removed** (change 0007): it required Liebe's own `RTCPeerConnection.getStats()`, which no longer exists.
- The FPS baseline MUST be seeded from the video's current frame counters on mount, and FPS MUST render as `—` until a second sample exists: a zero baseline against a long-running video would inflate the first sample into an absurd rate (all frames ever decoded divided by roughly one second).
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
- **RTSP secret policy:** a personal/real stream may only ever enter the stack via go2rtc's `${RTSP_TEST_URL:}` env substitution (value in untracked `.env.local` / CI secrets). `scripts/check-rtsp-leak.sh` fails CI if any tracked file contains a credentialed `rtsp://` URL or the literal `$RTSP_TEST_URL` value; only env-var placeholder references (go2rtc `${RTSP_TEST_URL:}`, Compose `${RTSP_TEST_URL:-}`) may be committed, never the value.
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
   └─ streamContainerRef ── in-place fullscreen: CSS position flip, node never moves
           └─ cameraFullscreenStore (counter) ──► PanelApp lifts root-Theme stacking

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
interface UseCameraStreamStatusOptions {
  getInnerVideo: () => HTMLVideoElement | null
  getMjpegImg: () => HTMLImageElement | null
  entityState?: string
  enabled: boolean
  // false suspends the whole machine (budget, watchdog, media-error
  // fast-fails); recovery grace-resets, restores the budget, auto-retries
  entityAvailable: boolean
}

interface UseCameraStreamStatusResult {
  isStreaming: boolean
  // Recent-frame evidence (frames within FRAME_WARNING_MS), maintained only
  // while the entity is unavailable — drives the UNAVAILABLE pill precedence
  isActivelyStreaming: boolean
  hasFrameWarning: boolean
  // 'Stream stalled' | 'Stream failed to start' | 'Video playback error'
  error: string | null
  remountKey: number
  onStreamEvent: () => void // fired for both `streams` and `load`
  retry: () => void
}
```

Thresholds (exported constants): `FRAME_WARNING_MS = 500`, `STALL_MS = 5000`, `MAX_AUTO_REMOUNTS = 3`, `CONNECT_TIMEOUT_MS = 20_000` (counted time only — visible and entity-available — single re-scheduled `setTimeout` armed while CONNECTING), `BOOTSTRAP_RETRY_INTERVAL_MS = 15_000` / `BOOTSTRAP_RETRY_MAX_DELAY_MS = 300_000` / `BOOTSTRAP_RETRY_MAX_ATTEMPTS = 10` (unavailable-readiness backoff, HA contexts only); internal intervals: watchdog/poll 250 ms, MJPEG poll 500 ms, ladder poll 250 ms × 20, `whenDefined` timeout 10 s, still-image refresh 10 s.

Configuration values live on the grid item (`item.config`): `fit`, `matting`, `showStats`.

### API Surface

Liebe sends no camera-specific WebSocket commands. All negotiation (`camera/webrtc/*`, HLS playlist fetches, MJPEG) happens inside HA's element against HA's backend/go2rtc. Liebe's only touchpoints are DOM-level: element creation, property assignment, `streams`/`load` events, shadow-piercing reads of the inner `<video>`/`<img>`, and `GET entity_picture` for the fallback.

### Scenarios Covered by Tests

Unit tests (`src/components/CameraCard/__tests__/`, jsdom):

- `useCameraStreamReady.test.tsx` — ladder outcomes: already-defined, helpers-poll timeout, helpers rejection, `createCardElement` throw, `whenDefined` timeout, shared single-run promise across consumers, fresh ladder run on remount after a transient failure, no post-unmount state set, unavailable-retry backoff (exponential gaps in HA contexts, convergence to `ready`, 5 min delay cap + permanent stop at the 10-attempt cap, no retry standalone, unmount cancellation of both pending timeouts and in-flight attempts). Failure eviction and the standalone fast-path/permanent negative cache: `src/utils/__tests__/haFrontend.test.ts`.
- `useCameraStreamStatus.test.tsx` — rVFC frame path, 500 ms warning + clear, 5 s stall → remount, remount cap → `Stream stalled` + recovery, `retry()` semantics, budget reset on entity-state transition, rVFC-absent polling fallback (with and without `getVideoPlaybackQuality`), MJPEG `naturalWidth` path + `error` fast-fail + no fresh budget at attach + late-decode recovery, the connection-state load budget (`Stream failed to start` with no event, with an early no-element event, and with an attached element that never decodes; disarmed by streaming, not attach; paused while hidden and while the entity is unavailable — including arming paused and resuming with the remainder; not scheduled while mounted hidden; re-armed by retry; expiry-race no-op when the first frame won; `markFrame` clearing a stale `Stream failed to start` while streaming), entity-unavailability suspension (watchdog silent, no budget burn, video/MJPEG media-error fast-fails suppressed), automatic recovery (grace period, budget restore, error auto-retry with fresh connect budget, no remount on healthy blips, stall-remount recovery of a suppressed dead element), recent-frame evidence (`isActivelyStreaming` true only during blips with frames within `FRAME_WARNING_MS`, immediate stale-frame demotion, mid-blip demotion, reset at recovery), watchdog epoch guard (queued stale tick no-ops), stale-warning reset across epochs (video warning → MJPEG epoch), visibility-aware watchdog (hidden skip, return-to-visible grace + budget restore), immediate `Video playback error` surfacing + listener cleanup, disabled reset, watchdog cleanup on unmount.
- `HaCameraStream.test.tsx` — element creation/identity, property sync (incl. `hass: undefined`), remount on `remountKey`/entity change, event forwarding, shadow-piercing `getInnerVideo`/`getMjpegImg` across both players and MJPEG.
- `StillImageFallback.test.tsx` — snapshot render, 10 s cache-buster refresh, `?`/`&` separator, no-picture icon branch.
- `CameraCard.test.tsx` — skeleton/disconnected states, non-stream icon, readiness branches (ready/loading/unavailable + truthful pill), unavailable-entity handling (element stays mounted with a suspended machine, `UNAVAILABLE` pill unless recent-frame evidence — including over a lagging `isStreaming` flag, `STREAMING` survives frame-flowing blips, errors keep showing mid-blip, resume without remount), status wiring, error + retry branch, in-place fullscreen (single persistently-mounted stream container promoted to `position: fixed`; `contain: 'none'` on the card while fullscreen; root-Theme stacking lift via `cameraFullscreenStore`; ESC/letterbox/backdrop exit; auto-close when the overlay can no longer render) + native fullscreen fallbacks, mute toggle, stats visibility, matting/chrome, edit mode, config modal.
- `CameraControls.test.tsx` / `CameraStats.test.tsx` — pill priority order, buttons, sizing; stats math + vendor fallbacks.

E2E (`tests/e2e/camera-stream.spec.ts`, real HA + go2rtc): deep-link bootstrap ladder, element mounted in the panel, pill reaches STREAMING/RECORDING, inner `<video>` plays, then the change-0008 no-reconnect proof across all four fullscreen transitions (open → letterbox close → reopen → ESC close). The **primary, transport-agnostic** proof is a `MutationObserver` armed on every root of the stream host's parent chain (shadow roots included) recording ZERO detach/reattach of `<ha-camera-stream>` — the players tear down HLS/WebRTC only in their disconnect/connect callbacks, so a stationary node cannot renegotiate whichever transport won. Network capture corroborates it: no fresh HLS `master_playlist.m3u8` bootstrap fires during the toggles (the **guaranteed** signal — this stack is HLS-winning per change 0007's HLS-guaranteed/WebRTC-best-effort contract), and, complementarily, no new `camera/webrtc/offer` websocket frame fires (a zero-delta guard that would catch a toggle-triggered WebRTC renegotiation on a stack where WebRTC does win). A shadow-aware `document.elementFromPoint()` topmost hit-test at HA sidebar coordinates resolves INTO the overlay (guarded by a pre-fullscreen assertion that the same points are HA `ha-sidebar` chrome); strict playback continuity holds (the SAME inner `<video>` instance keeps playing with a never-restarting, advancing `currentTime` at every transition checkpoint); plus the retained viewport-coverage (±2 px) and `<home-assistant>`-ancestry assertions; and no non-benign console errors/unhandled rejections. Benign matchers (regexes or predicates) are anchored on distinctive substrings of the specific known-benign messages — never on player names, since the collector appends source URLs like `ha-hls-player.js` and a broad `/hls/i` would swallow real player crashes:

- hls.js `networkError`/`*LoadError` retry payloads while ffmpeg spins up, and the go2rtc `unknown_error` offer failure.
- Recoverable hls.js `mediaError` payloads: a predicate anchored on the `"type": "mediaError"` field AND a known recoverable `details` value (`bufferStalledError`, `bufferAppendError`, `bufferAppendingError`, `bufferNudgeOnStall`, `bufferSeekOverHole`, `bufferFullError`), order-insensitively, that additionally REJECTS any payload containing `"fatal": true` — a fatal escalation is never benign, whatever its details value.

**Collector design** (`tests/e2e/helpers.ts`): a depth-limited, cycle-safe stringifier (`safeStringify`, `tests/e2e/safeStringify.ts` — still self-contained so its source text can be serialized into the page; extracted from helpers so it is unit-testable in `tests/unit/safeStringify.test.ts`) is used by BOTH channels that would otherwise lose payloads — the init-script rejection recorder, and the console-argument fallback that evaluates it in-page whenever `jsonValue()` rejects (circular hls.js `ErrorData`). Cycle detection MUST use a path stack (mark before recursing into an object, unmark after), never a visited set: a visited set marks shared non-circular references (a DAG — the same object reached via two sibling fields) as `[circular]`, potentially hiding the very `type`/`details`/`fatal` fields the benign filters inspect. Only true ancestor cycles are marked; shared siblings serialize fully (the depth limit still bounds size). Property reads are guarded too, so a throwing getter degrades one field to `[unreadable]` instead of aborting the whole stringification. Every reachable hls.js payload therefore serializes to inspectable text containing `type`/`details`/`fatal`, which is why NO broad `<unserializable>` benign escape hatch exists. The recorder tags rejection records `unhandled rejection (object):` ONLY for plain-object reasons (`[object Object]` toString tag, not an Error) — exactly the shape Chromium collapses to a bare `Object` pageerror — making the placeholder dedupe exact; arrays/Dates/Maps/class instances never consume a placeholder, so a synchronous plain-object throw still fails the suite.

**Serialization-failure placeholder policy:** when even the in-page `safeStringify` evaluation fails for a console argument (e.g. the argument handle's execution context was destroyed at teardown), the collector records `SERIALIZATION_FAILURE_PLACEHOLDER` (`<failed to serialize console argument>`, exported from `tests/e2e/helpers.ts`). Such entries carry no inspectable content, so content-based benign filters can never match them — they MUST stay fatal by default. The camera spec adds ONE narrowly scoped benign predicate: an entry is benign only when it consists PURELY of such placeholders (no readable text beyond the collector's `(at <url>:<line>)` source suffix) AND its recorded source is a media-player chunk (hls/webrtc player URL) — the same startup/teardown noise sources whose serializable payloads are already benign-listed. Content-bearing entries from those chunks, and bare placeholders from any other source, still fail the suite.

## Constraints

- **Internal HA API.** `<ha-camera-stream>` and its players are not a public API; property names, shadow-DOM structure (relied on by `getInnerVideo`/`getMjpegImg` and the e2e shadow-piercing), and event names can change per HA release. The tolerant per-property assignment and still-image fallback bound the failure mode, but a breaking frontend change degrades cards to stills until the wrapper is updated.
- **DOM-tree placement is load-bearing on HA ≥ 2026.7.** The element must stay a descendant of `<home-assistant>` for `@lit/context` resolution — this forbids `document.body` portals for anything containing the element, and is why fullscreen is done in place rather than by moving the node out of the card.
- **In-place fixed overlay is silently re-breakable by future ancestors.** The in-place `position: fixed` host works only because no ancestor establishes a containing block in view mode; any FUTURE ancestor gaining `transform`/`filter`/`perspective` (or `will-change` naming one of those), or `contain` with a containing-block value (`layout`/`paint`/`strict`/`content`), would re-trap it. The e2e viewport-coverage + topmost `elementFromPoint` assertions are the standing guard against that regression.
- **Grid positioning is global.** Enabling the in-place overlay required switching every grid item from `transform` to `top`/`left` positioning (`positionStrategy={absoluteStrategy}`) — a global change (grid-layout spec: [../grid-layout/](../grid-layout/index.md)), not a camera-local one.
- **No bitrate stat.** Without a Liebe-owned peer connection there is no `getStats()`; only `getVideoPlaybackQuality`-derived stats remain.
- **WebRTC not guaranteed in CI.** The e2e contract is HLS-guaranteed / WebRTC best-effort; the go2rtc-client 0.4.0 exec-producer `url` quirk means warm stacks typically fall back to HLS.
- **`trust_external_script` tradeoff.** When Liebe is loaded from the hosted `panel.js`, HA may require `trust_external_script: true` in `panel_custom`; the README warns about the security implications and recommends self-hosting (affects the whole panel, load-bearing for camera users on the hosted build).

## Open Questions

- Does the second `Personal` ffmpeg camera entry (unavailable when `RTSP_TEST_URL` is unset) pollute e2e determinism? (Tracked in change 0007.)
- Should the wrapper detect a future `<ha-camera-stream>` property-surface change (e.g. a renamed `stateObj`) and degrade to the still image proactively, rather than showing a stalled stream?

## References

- `src/components/CameraCard/` — card, wrapper, readiness ladder, status machine, fallback, controls, stats (see Component Map)
- `src/components/CameraCard/__tests__/` — unit coverage for every component above
- `src/store/cameraFullscreenStore.ts` — overlay-open counter + `CAMERA_FULLSCREEN_Z_INDEX`; `src/components/PanelApp.tsx` — root-Theme stacking lift while an overlay is open
- `src/components/GridLayoutSection.tsx` — `positionStrategy={absoluteStrategy}` (grid items positioned via `top`/`left`, enabling the in-place fixed overlay)
- `src/components/configurations/cardConfigurations.ts` — camera card config schema (fit/matting/showStats)
- `src/services/staleEntityMonitor.ts` — camera-domain exclusion from stale tracking
- `src/components/cardRegistry.ts` — camera → CameraCard registration
- `tests/e2e/camera-stream.spec.ts` — end-to-end camera flow; `tests/e2e/helpers.ts` — `openPanel` service-worker neutering, `seedCameraConfig`, console collector; `tests/e2e/safeStringify.ts` — page-side stringifier (unit-tested in `tests/unit/safeStringify.test.ts`)
- `ha/docker-compose.yml`, `ha/go2rtc/go2rtc.yaml`, `ha/config/configuration.yaml` — e2e camera topology
- `scripts/check-rtsp-leak.sh` — CI gate against committing RTSP secrets
- HA frontend source: `ha-camera-stream`, `ha-web-rtc-player`, `ha-hls-player` (home-assistant/frontend)
- External: [go2rtc](https://github.com/AlexxIT/go2rtc), [@lit/context protocol](https://lit.dev/docs/data/context/), [HA ffmpeg camera](https://www.home-assistant.io/integrations/camera.ffmpeg/)
- Related specs: [../entity-cards/](../entity-cards/) (card registry), [../entity-state/](../entity-state/) (entity state + stale pipeline), [../architecture/](../architecture/) (e2e stack, testing conventions)

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Document                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 2026-07-18 | Initial spec created (baseline of the hand-rolled WebRTC implementation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                           |
| 2026-07-18 | Rewritten for the `<ha-camera-stream>` wrapper architecture (bootstrap ladder, status machine, in-tree fullscreen portal, still-image fallback, go2rtc e2e stack)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-18 | Status-machine hardening: visibility-aware watchdog, 20 s connect timeout (`Stream failed to start`), immediate video/MJPEG error surfacing, ladder failure eviction (bootstrap retry), letterbox-click fullscreen exit, seeded FPS baseline, narrowed e2e benign filters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-18 | Review-fix pass: connect timer armed until a watch attaches (early `streams` gap), unavailable-entity gating with automatic recovery, standalone fast-path + unavailable-readiness retry interval, single-timeout connect budget, cross-epoch warning reset, exact object-rejection dedupe + recoverable hls.js mediaError/unserializable filters, ESC + letterbox close both covered e2e                                                                                                                                                                                                                                                                                                                                                                                     | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-18 | Structural consolidation: single load-budget timer owned by connection state (replacing per-incarnation/per-branch timers), watchdog epoch guard, unavailable = paused budget instead of stream teardown (with `UNAVAILABLE`-vs-`STREAMING` pill precedence), readiness retry backoff + attempt cap, cycle-safe e2e console serialization (unserializable whitelist deleted, fatal `mediaError` never benign, exact plain-object dedupe)                                                                                                                                                                                                                                                                                                                                      | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-18 | Unavailability = full machine suspension (watchdog silent, no budget burn, media-error fast-fails suppressed) with automatic recovery (grace, budget restore, error auto-retry replacing "errors survive blips"), recent-frame `isActivelyStreaming` pill evidence, load-budget expiry-race guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-18 | E2E collector: DAG-safe path-stack cycle detection in `safeStringify` (extracted + unit-tested), guarded property reads, serialization-failure placeholder policy (fatal by default; narrowly scoped media-player-chunk benign predicate in the camera spec)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [0007](../../changes/0007-ha-camera-stream.md)              |
| 2026-07-24 | In-place CSS fullscreen: the `<ha-camera-stream>` (or still-image `<img>`) node NEVER moves in the DOM — fullscreen is a `position: fixed` flip on the card's persistent stream container, enabled by the grid's `absoluteStrategy` positioning + per-card `contain: 'none'` while fullscreen + a root-Theme stacking lift (`cameraFullscreenStore` counter, `PanelApp`). `KeepAlive` and the camera's `FullscreenModal` usage retired; the accepted "one sub-second WebRTC renegotiation per fullscreen toggle" concession dropped — there is now NO reconnect on a toggle, either direction, on all browsers. E2E proves it directly (MutationObserver zero-detach, no fresh HLS bootstrap / WebRTC offer, `elementFromPoint` topmost coverage, strict playback continuity) | [0008](../../changes/0008-camera-fullscreen-no-dom-move.md) |
