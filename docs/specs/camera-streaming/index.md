# Camera Streaming

## Overview

Liebe renders live camera feeds inside the dashboard grid using a WebRTC peer connection negotiated through the Home Assistant WebSocket API (which fronts go2rtc). A camera card MUST attempt a WebRTC stream whenever its entity reports the `SUPPORT_STREAM` feature and Home Assistant is connected, MUST display connection, streaming, recording, and error states, and SHOULD provide mute, native fullscreen, an in-app fullscreen modal, and per-card fit/padding/debug-stats configuration. Camera entities MUST be excluded from stale-entity tracking because they update via the media stream rather than state events. This document describes the current implementation as of the baseline date; it does not propose changes.

## Background

Home Assistant exposes cameras as entities in the `camera` domain. Modern HA installations stream camera video over WebRTC, typically brokered by the [go2rtc](https://github.com/AlexxIT/go2rtc#quick-start) component that ships with recent HA releases. Rather than embed HA's own `<ha-camera-stream>` element, Liebe negotiates its own `RTCPeerConnection` directly against HA's `camera/webrtc/offer` / `candidate` WebSocket commands, which lets the panel own the video element, its styling, and its lifecycle.

The camera surface was introduced in PR #104 and extended incrementally: fullscreen and mute controls (PR #134), fit/matting/debug-stats configuration (PR #141), an `InvalidStateError` guard in signaling (PR #131), and exclusion from stale-entity tracking (PR #139, issue-driven fullscreen-modal scoping from issue #136). The card and hook total roughly 1400 lines (`CameraCard.tsx` 852 lines, `useWebRTC.ts` 584 lines) and have essentially no direct automated coverage — see [Open Questions](#open-questions).

This spec covers the camera card, the WebRTC hook, stale-tracking exclusion for cameras, and the camera fullscreen modal. It does NOT cover the general card registry (see [../entity-cards/](../entity-cards/)) or the entity state pipeline (see [../entity-state/](../entity-state/)); those are linked rather than duplicated.

## Requirements

### Stream Support Detection

- The card MUST treat a camera as stream-capable only when its `supported_features` attribute has the `SUPPORT_STREAM` bit (value `2`) set.
- When the camera is not stream-capable, the card MUST render a static video icon instead of a video element, tinted blue while recording or streaming and gray otherwise.
- WebRTC negotiation MUST be enabled only when an entity exists, Home Assistant is connected, and the camera supports streaming.

`CameraCard.tsx:38` defines the flag, and support is derived and gated at `CameraCard.tsx:430`-`440`:

```typescript
const SUPPORT_STREAM = 2
// ...
const supportsStream = useMemo(
  () => !!((cameraAttributes?.supported_features ?? 0) & SUPPORT_STREAM),
  [cameraAttributes?.supported_features]
)
// ...
const webRTCEnabled = useMemo(() => {
  const enabled = hasEntity && isConnected && supportsStream
  return enabled
}, [hasEntity, isConnected, supportsStream])
```

#### Scenario: Camera without stream support

- **GIVEN** a `camera.*` entity whose `supported_features` does not include bit `2`
- **WHEN** the card renders
- **THEN** no WebRTC connection is attempted and a static video icon is shown in place of a video element

#### Scenario: Camera with stream support while connected

- **GIVEN** a `camera.*` entity with `supported_features & 2` and Home Assistant connected
- **WHEN** the card renders in view mode
- **THEN** `useWebRTC` is enabled and begins negotiating a peer connection

### WebRTC Session Negotiation

- The hook MUST create an `RTCPeerConnection` configured with STUN servers, add recvonly video and audio transceivers, create an SDP offer, set it as the local description, and send it to Home Assistant via the `camera/webrtc/offer` WebSocket subscription.
- The hook MUST handle four inbound message types on that subscription — `session`, `answer`, `candidate`, and `error` — and MUST relay locally-gathered ICE candidates back to HA via `camera/webrtc/candidate` using the session id returned in the `session` message.
- The hook MUST set the remote description from an `answer` message ONLY when the connection's `signalingState` is `have-local-offer`; otherwise it MUST ignore the answer and log a warning (the PR #131 `InvalidStateError` guard).
- The hook MUST queue inbound ICE candidates that arrive before the remote description is set, and flush them immediately after the remote description resolves.
- Initialization MUST be debounced (200 ms) and guarded by `initializing`/`pending`/existing-connection refs so rapid re-renders do not open duplicate peer connections.

The signaling flow, message handling, and the state guard live in `useWebRTC.ts:271`-`478`:

```typescript
// Create peer connection with STUN servers
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
})
peerConnectionRef.current = pc

pc.addTransceiver('video', { direction: 'recvonly' })
pc.addTransceiver('audio', { direction: 'recvonly' })
// ...
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

const offerMessage: WebRTCOfferMessage = {
  type: 'camera/webrtc/offer',
  entity_id: entityId,
  offer: offer.sdp!,
}

const unsubscribePromise = hass.connection.subscribeMessage<WebRTCReceiveMessage>((message) => {
  switch (message.type) {
    case 'session': {
      sessionId = message.session_id
      // ... store session id, wire pc.onicecandidate -> camera/webrtc/candidate
    }
    case 'answer':
      // PR #131 guard: only set remote description in the correct state
      if (pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription({ type: 'answer', sdp: message.answer }).then(() => {
          /* flush pendingCandidatesRef */
        })
      } else {
        console.warn(`[WebRTC] Ignoring answer in wrong state: ${pc.signalingState}...`)
      }
    case 'candidate':
      if (pc.remoteDescription) pc.addIceCandidate(message.candidate)
      else pendingCandidatesRef.current.push(message.candidate) // queue until remote desc set
    case 'error':
      setError(/* message.error */)
  }
}, offerMessage)
```

#### Scenario: Answer arrives in the wrong signaling state

- **GIVEN** a peer connection whose `signalingState` is not `have-local-offer` (e.g. a duplicate answer)
- **WHEN** an `answer` message is received
- **THEN** `setRemoteDescription` is NOT called, the answer is ignored, and a warning is logged — no `InvalidStateError` is thrown

#### Scenario: ICE candidate before remote description

- **GIVEN** the remote description has not yet been applied
- **WHEN** a `candidate` message arrives
- **THEN** the candidate is pushed to `pendingCandidatesRef` and later flushed once `setRemoteDescription` resolves

#### Scenario: Rapid re-renders

- **GIVEN** the enabling conditions toggle quickly (re-renders during mount)
- **WHEN** the initialization effect runs repeatedly
- **THEN** the 200 ms debounce plus the `initializing`/`pending`/existing-connection guards ensure at most one peer connection is created

### Streaming State and Frame Monitoring

- The hook MUST report `isStreaming` true only after at least one decoded video frame is observed, detected via `requestVideoFrameCallback` when available and otherwise by `currentTime`/decoded-frame-count polling on `requestAnimationFrame`.
- The hook MUST raise `hasFrameWarning` after 500 ms without a new frame and MUST force a cleanup-and-reconnect after 5 s without a new frame.
- On connection-state `failed` the hook MUST set an error and clean up; on `disconnected` it MUST set an error; on `connected` it MUST clear the error; on `closed` it MUST stop streaming.

`useWebRTC.ts:118`-`269` implements frame monitoring; the 500 ms warning and 5 s reconnect thresholds are at `useWebRTC.ts:226` and `useWebRTC.ts:241`. Connection-state handling is at `useWebRTC.ts:328`-`351`.

#### Scenario: First frame received

- **GIVEN** a negotiated connection with an incoming media track
- **WHEN** the first frame is decoded
- **THEN** `isStreaming` becomes true and the video element becomes visible (`display: block`)

#### Scenario: Stream stalls

- **GIVEN** a stream that stops delivering frames
- **WHEN** no new frame arrives for 500 ms, then 5 s
- **THEN** `hasFrameWarning` is set at 500 ms (card shows "NO SIGNAL"), and at 5 s the hook cleans up and increments the retry counter to reconnect

### Reconnection Behavior

- The hook MUST attempt reconnection when the tab becomes visible again and the existing connection is `disconnected`, `failed`, or `closed`, or when no connection exists.
- The hook MUST fully tear down the peer connection, unsubscribe from the WebSocket subscription (ignoring `not_found` errors), clear the video `srcObject`, and stop frame monitoring on cleanup, disable, entity change, and unmount.
- The card MUST expose a manual `retry` that re-triggers initialization for recoverable errors.

Visibility handling is at `useWebRTC.ts:541`-`567`; cleanup at `useWebRTC.ts:64`-`115`; unmount cleanup at `useWebRTC.ts:570`-`574`.

#### Scenario: Return to a backgrounded tab

- **GIVEN** the panel tab was hidden and the connection dropped to `disconnected`
- **WHEN** the tab becomes visible
- **THEN** the hook cleans up and retries after a 500 ms delay

### Card States and Controls

- The card MUST render a skeleton while the entity is loading and an error display when disconnected or the entity is missing.
- The card MUST show a status label that resolves, in priority order, to `ERROR`, `CONNECTING`, `NO SIGNAL`, `RECORDING`, `STREAMING`, `IDLE`, or the raw entity state uppercased.
- While streaming without error and not in edit mode, the card MUST show mute/unmute and native-fullscreen buttons; the video MUST start muted by default.
- Clicking the video (not in edit mode, no error) MUST open the in-app fullscreen modal.
- When the stream error indicates the camera is not yet configured, the card MUST show go2rtc setup guidance linking to `https://github.com/AlexxIT/go2rtc#quick-start`; other errors MUST show the message plus a Retry button.

Status resolution is at `CameraCard.tsx:316`-`328`; controls at `CameraCard.tsx:333`-`394`; mute default at `CameraCard.tsx:412`; the go2rtc guidance branch at `CameraCard.tsx:580`-`617`.

#### Scenario: Streaming card in view mode

- **GIVEN** a camera actively streaming, not in edit mode
- **WHEN** the card renders
- **THEN** the status reads "STREAMING" (or "RECORDING" when `entity.state === 'streaming'`/recording), and mute and fullscreen buttons are shown

#### Scenario: Unconfigured camera

- **GIVEN** a stream error containing `not yet fully implemented`
- **WHEN** the error state renders
- **THEN** "Camera Configuration Required" guidance is shown with a link to the go2rtc quick-start guide (no Retry button)

### Fullscreen Behavior

- Clicking the card body MUST open an in-app fullscreen modal that shows only the camera feed (issue #136: the fullscreen modal is camera-only), reusing the live video element via the `KeepAlive` portal so the stream is not renegotiated.
- The modal MUST close on backdrop click or ESC, MUST render the feed with `object-fit: contain`, and MUST show mute/fullscreen controls scaled to the viewport plus an "Click or press ESC to exit" hint.
- The native-fullscreen button MUST request/exit `requestFullscreen()` on the underlying `<video>` element directly.

The `KeepAlive` portal (`KeepAlive.tsx`) moves the single cached video element between the normal container and the fullscreen container (`CameraCard.tsx:633`-`649`), so entering/leaving the modal does not tear down the WebRTC session. The modal is `FullscreenModal` (`CameraCard.tsx:731`-`814`); native fullscreen at `CameraCard.tsx:461`-`475`.

#### Scenario: Enter and leave in-app fullscreen

- **GIVEN** a streaming camera card in view mode
- **WHEN** the user clicks the feed and then presses ESC
- **THEN** the same video element is portaled into and back out of the fullscreen container, the stream keeps running, and only the camera feed (no other card chrome) is shown while fullscreen

### Debug Statistics Overlay

- When `showStats` is enabled, the card MUST overlay FPS, bitrate (kbps), decoded frame count, dropped frame count, and resolution, sampled once per second from the video element and the peer connection's `getStats()`.
- The overlay MUST render a compact single line at `small` size and a labeled multi-column layout at `medium`/`large`, and MUST appear in both the normal and fullscreen views.

`CameraStats` is at `CameraCard.tsx:41`-`230`; bitrate is computed from `inbound-rtp` video reports at `CameraCard.tsx:105`-`116`.

#### Scenario: Debug stats enabled

- **GIVEN** a card configured with `showStats: true` and an active stream
- **WHEN** the card renders
- **THEN** an overlay updates FPS/bitrate/frames/resolution every second in both normal and fullscreen views

### Camera Configuration Options

- The camera card MUST expose three per-card configuration options: `fit` (`cover` default, or `contain`), `matting` (`none` / `small` default / `large` card padding), and `showStats` (boolean, default false).
- The card MUST map `matting` to Radix space tokens relative to the card size (`small` matches the size's default padding; `large` uses `--space-5`; `none` uses `0`).

Option schema is at `cardConfigurations.ts:77`-`109`; the card reads them at `CameraCard.tsx:419`-`422` and maps matting at `CameraCard.tsx:520`-`529`.

#### Scenario: Contain fit with large matting

- **GIVEN** a card configured `fit: 'contain'`, `matting: 'large'`
- **WHEN** the card renders in normal (non-fullscreen) view
- **THEN** the video uses `object-fit: contain` and the card padding is `var(--space-5)`

### Stale-Tracking Exclusion

- Camera entities MUST be excluded from stale-entity tracking; a camera MUST never be reported stale even if it produces no state events for longer than the stale threshold (PR #139).
- If a camera was previously marked stale, the monitor MUST mark it fresh on its next pass.

`StaleEntityMonitor` excludes the `camera` domain (`staleEntityMonitor.ts:9`, `:48`-`54`, `:98`-`104`). The full stale pipeline is specified in [../entity-state/](../entity-state/); only the camera exclusion is in scope here.

#### Scenario: Camera with no recent state updates

- **GIVEN** a `camera.*` entity whose `last_updated` is older than the 5-minute stale threshold
- **WHEN** the stale monitor runs
- **THEN** the entity is not marked stale, and if it was previously stale it is marked fresh

## Design

### Architecture

```
camera.* entity (SUPPORT_STREAM)
        │
        ▼
CameraCard.tsx ──uses──► useWebRTC.ts ──► HA WebSocket (camera/webrtc/offer,candidate)
   │  │  │                     │                    │
   │  │  │                     ▼                    ▼
   │  │  └─ CameraStats     RTCPeerConnection ◄─ go2rtc / HA stream backend
   │  └──── CameraControls   (recvonly A/V)
   └─────── FullscreenModal + KeepAlive (portaled <video>)

staleEntityMonitor.ts ── excludes 'camera' domain (independent path)
```

The card owns UI, state labels, configuration, mute/fullscreen, and the stats overlay. The hook owns the peer connection, signaling, frame monitoring, and reconnection. `KeepAlive` owns a single cached `<video>` element per camera so it survives moving between the grid and the fullscreen modal. Camera registration into the card system is via the card registry (`cardRegistry.ts:43`, `camera: CameraCard`) — see [../entity-cards/](../entity-cards/).

### Data Models

Hook interfaces (`useWebRTC.ts:5`-`36`):

```typescript
interface UseWebRTCOptions {
  entityId: string
  enabled?: boolean
}

interface UseWebRTCReturn {
  videoRef: (element: HTMLVideoElement | null) => void
  isStreaming: boolean
  error: string | null
  retry: () => void
  hasFrameWarning: boolean
  peerConnection: RTCPeerConnection | null
}

interface WebRTCReceiveMessage {
  type: 'session' | 'answer' | 'candidate' | 'error'
  session_id?: string
  answer?: string
  candidate?: RTCIceCandidateInit
  error?: { code: string; message: string } | string
}

// pc is extended at runtime with sessionId + unsubscribe
interface ExtendedRTCPeerConnection extends RTCPeerConnection {
  sessionId?: string
  unsubscribe?: UnsubscribeFunc
}
```

Camera attributes read by the card (`CameraCard.tsx:29`-`35`): `access_token`, `entity_picture`, `frontend_stream_type` (declared but currently unused), `friendly_name`, `supported_features`.

Configuration values live on the grid item (`item.config`): `fit`, `matting`, `showStats`.

### API Surface

WebSocket commands sent to Home Assistant:

- `camera/webrtc/offer` — subscription carrying `{ entity_id, offer: sdp }`; streams back `session`/`answer`/`candidate`/`error` messages.
- `camera/webrtc/candidate` — `sendMessagePromise` with `{ entity_id, session_id, candidate }` per locally-gathered ICE candidate.

STUN servers are hardcoded to Google's public STUN (`useWebRTC.ts:294`-`296`); no TURN servers are configured.

### UI Components

- `CameraCardComponent` (`CameraCard.tsx:399`) — memoized (`CameraCard.tsx:838`), default grid dimensions 4×2 (`CameraCard.tsx:850`-`852`).
- `CameraControls` (`CameraCard.tsx:233`) — status label + mute/fullscreen buttons, `em`-scaled by card size.
- `CameraStats` (`CameraCard.tsx:41`) — debug overlay.
- `FullscreenModal` (`ui/FullscreenModal.tsx`) — body-portaled modal (default z-index 99999 to escape shadow DOM), used camera-only per issue #136.
- `KeepAlive` (`KeepAlive.tsx`) — portal cache keyed `camera-${entityId}` that relocates the live `<video>` between containers without unmounting.

### Business Logic

The video element uses `muted={isMuted}` (default true), `autoPlay`, `playsInline`, and toggles visibility via `display: isStreaming ? 'block' : 'none'` (`CameraCard.tsx:637`-`648`). A combined ref callback (`CameraCard.tsx:489`-`495`) feeds the element to both the hook's `videoRef` and a local ref used by the stats overlay and native-fullscreen handler.

The commented-out block at `useWebRTC.ts:536`-`538` documents a deliberate design decision from PR #139: camera streams do NOT reconnect on global entity-update events, only on their own connection state — consistent with excluding cameras from stale tracking.

## Constraints

- **No TURN / hardcoded STUN.** Only Google public STUN is configured (`useWebRTC.ts:294`-`296`); cameras that require TURN relaying (strict NATs) will fail to connect. There is no configuration surface for ICE servers.
- **HA/go2rtc dependency.** Streaming requires the HA `camera/webrtc/*` WebSocket API, which in practice depends on go2rtc; unconfigured cameras surface the "Camera Configuration Required" guidance rather than video.
- **`trust_external_script` tradeoff.** When Liebe is loaded from the hosted `panel.js` (`https://fx.github.io/liebe/panel.js`), HA may raise an `alert()` unless `trust_external_script: true` is set in `panel_custom`. The README warns this disables certain security protections and recommends self-hosting the build for maximum security (README.md:18-45). This affects the whole panel, not only cameras, but is load-bearing for camera users on the hosted build.
- **Single cached video element per camera.** `KeepAlive` caches one `<video>` per `entityId`; two cards for the same camera would contend for the same portal element.
- **Component size.** `CameraCard.tsx` (852 lines) and `useWebRTC.ts` (584 lines) are large and mix rendering, signaling, frame heuristics, and stats in single files.

## Open Questions

- **Zero direct automated coverage of ~1400 lines.** There are no tests exercising `CameraCard.tsx` rendering or `useWebRTC.ts` signaling/frame-monitoring/reconnection logic. Only two peripheral tests touch cameras: `useEntity.test.tsx:100` (camera excluded from stale tracking) and `cardDimensions.test.ts:9` (default 4×2 dimensions). All scenarios above are derived from code paths and `docs/test-camera-card.md`, not from executable tests. Should the signaling state machine and frame-monitoring heuristics get unit/integration coverage?
- **Hardcoded Google STUN (`useWebRTC.ts:295`).** No TURN and no user configuration — is this acceptable for the target deployments, or should ICE servers be configurable / sourced from HA?
- **Component size / separation.** Should `CameraStats`, `CameraControls`, and the frame-monitoring logic be extracted into their own modules to reduce the size and interleaving of `CameraCard.tsx` and `useWebRTC.ts`?
- **`frontend_stream_type` unused.** The attribute is declared (`CameraCard.tsx:32`) but never read; is HLS/native-stream-type branching intended?

## References

- `src/components/CameraCard.tsx` — camera card, controls, stats overlay, fullscreen modal wiring
- `src/components/CameraCard.css` — recording-dot pulse animation
- `src/hooks/useWebRTC.ts` — WebRTC session negotiation, frame monitoring, reconnection
- `src/components/KeepAlive.tsx` — portal cache that preserves the video element across containers
- `src/components/ui/FullscreenModal.tsx` — body-portaled fullscreen modal
- `src/components/configurations/cardConfigurations.ts:77` — camera card config schema (fit/matting/showStats)
- `src/services/staleEntityMonitor.ts` — camera-domain exclusion from stale tracking
- `src/components/cardRegistry.ts:43` — camera → CameraCard registration
- `docs/test-camera-card.md` — manual test guide (the only test artifact for this area)
- `README.md:18` — `trust_external_script` warning and self-hosting recommendation
- [go2rtc quick-start](https://github.com/AlexxIT/go2rtc#quick-start) — linked from the unconfigured-camera guidance
- Related specs: [../entity-cards/](../entity-cards/) (card registry), [../entity-state/](../entity-state/) (entity state + stale pipeline)
- PRs/issues: #104 (initial card), #131 (InvalidStateError guard), #134 (fullscreen + mute), #139 (stale exclusion), #141 (fit/matting/stats config), #136 (camera-only fullscreen modal)

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
