# 0008: Camera In-App Fullscreen Without DOM Moves

## Summary

Redesign the camera card's in-app ("semi") fullscreen so the `<ha-camera-stream>` node NEVER moves in the DOM: fullscreen becomes a pure CSS/positioning change on the card's own persistently-mounted stream container, eliminating the stream reconnect that currently fires on BOTH entering and exiting the overlay. Enabled by switching the grid to absolute (`top`/`left`) positioning and dropping the card's paint containment while fullscreen; retires the `KeepAlive` container-swap mechanism (and the spec's "one sub-second WebRTC renegotiation per fullscreen toggle is accepted" concession) for the camera card.

**Spec:** [Camera Streaming](../specs/camera-streaming/)
**Status:** draft
**Depends On:** —

## Motivation

### The bug

The camera card has two fullscreen paths:

- **Native fullscreen** (`CameraControls` button → `requestFullscreen()` on the inner `<video>` or the `<ha-camera-stream>` host) — does NOT reconnect the stream.
- **In-app fullscreen** (tap the stream → `FullscreenModal` overlay) — reconnects the stream on entry AND again on exit. The whole point of the in-app overlay is that it is faster than native fullscreen and styleable (letterbox exit hint, overlay controls, stats); a reconnect on every toggle defeats it.

### Root cause

In-app fullscreen physically MOVES the `<ha-camera-stream>` DOM node between two containers — the in-card container (`normalContainerRef`) and a container inside the portalled `FullscreenModal` (`fullscreenContainerRef`) — via `KeepAlive` (`src/components/KeepAlive.tsx`, sole consumer: the camera card). `KeepAlive`'s effect relocates its cached portal element with a plain `container.appendChild(portalElement)` (appending an already-connected node detaches it from its old parent first), and its unmount cleanup uses `removeChild`. Detaching/reattaching the custom element fires its `disconnectedCallback`/`connectedCallback`, and HA's inner player (`ha-hls-player` / `ha-web-rtc-player`) tears down and rebuilds the HLS/WebRTC connection on those callbacks. Native fullscreen never moves the node, which is why it never reconnects.

The move exists because the overlay had to be portalled OUT of the grid item to fill the viewport: two ancestor properties establish containing blocks that trap `position: fixed` descendants — `react-grid-layout`'s inline `transform: translate(...)` on every grid item, and `contain: paint` on the Radix `<Card>` that `GridCard` renders (`.rt-BaseCard`, `node_modules/@radix-ui/themes/styles.css:7494`; `contain: paint` also clips descendant painting to the card's bounds). Both are addressable without a portal — see Design — which is what this change exploits.

### Why a `moveBefore()` patch is not the fix

`Element.moveBefore()` — the state-preserving atomic move that skips the disconnect/reconnect callbacks — was explored inside `KeepAlive` and REVERTED; the baseline codebase contains no `moveBefore` usage. It was rejected because:

- It is **Chromium 133+ only** (absent in Firefox, Safari, and jsdom). On any unsupported browser the `KeepAlive` move falls back to `insertBefore`/`appendChild`, which fires the `<ha-camera-stream>` element's `disconnectedCallback`/`connectedCallback` and reconnects the stream — exactly the bug. (Even where `moveBefore()` IS supported, an element that implements `connectedMoveCallback` to react to moves cannot rely on it being transparent; `<ha-camera-stream>` does not, so a supported-browser move would preserve it — but the feature must work on ALL supported browsers, which this does not.)
- It **fails on the exit path even on Chromium**: closing the modal makes React unmount the `FullscreenModal` subtree that contains the stream's current parent BEFORE any effect can move the node back out, so the node is detached by the unmount itself and the reconnect fires anyway.

The decision (this change) is therefore to stop moving the node at all, on all browsers.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Architecture › Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before any PR; the pre-push hook re-runs them.
- Tests run under Vitest + jsdom with `@testing-library/react`; component tests are colocated in `__tests__/` folders.
- `codecov/patch` MUST be 100% — every line added or changed by a PR MUST be covered by tests — and `codecov/project` MUST NOT regress (run `npm run test:coverage` locally before the PR).
- **jsdom cannot prove the core property of this change** (no real media playback, no custom-element connection callbacks driving player teardown). Unit tests cover the React wiring; the no-reconnect guarantee MUST additionally be verified in a real browser against the dockerized HA e2e environment (`tests/e2e/camera-stream.spec.ts`, change [0005](./0005-dockerized-ha-e2e.md)/[0007](./0007-ha-camera-stream.md)) — and the verification MUST directly observe DOM movement/lifecycle, not proxies that survive a detach+reattach (see the e2e requirement below).

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### The stream node MUST never move in the DOM

- Toggling in-app fullscreen (both entering AND exiting) MUST NOT detach or reattach the `<ha-camera-stream>` element (or the `StillImageFallback` when readiness is `unavailable`): no `removeChild`/`appendChild`/`moveBefore` of the node or any ancestor wrapper, in either direction. Fullscreen MUST be implemented purely as CSS/positioning changes on a host that stays mounted at one DOM location.
- The guarantee MUST hold on ALL supported browsers — it MUST NOT depend on `moveBefore()` or any other Chromium-only API.
- `KeepAlive` usage in the camera card MUST be removed; if the camera card was its last consumer (it is today), `src/components/KeepAlive.tsx` and `src/components/__tests__/KeepAlive.test.tsx` SHOULD be deleted.

#### Scenario: Entering fullscreen does not reconnect

- **GIVEN** a camera card actively streaming (STREAMING/RECORDING pill, inner `<video>` decoding frames)
- **WHEN** the user taps the stream to open in-app fullscreen
- **THEN** the `<ha-camera-stream>` element is never removed from its parent (no `disconnectedCallback`), playback continues without interruption, and no new HLS/WebRTC connection is negotiated

#### Scenario: Exiting fullscreen does not reconnect

- **GIVEN** the in-app fullscreen overlay is open and streaming
- **WHEN** the user exits via ESC, letterbox tap, or backdrop tap
- **THEN** the same element instance continues playing in the card with no detach and no reconnect

#### Scenario: Non-Chromium browser

- **GIVEN** a browser without `Element.moveBefore()` (Firefox, Safari)
- **WHEN** fullscreen is toggled in either direction
- **THEN** behavior is identical — the guarantee never relied on a DOM-move API

### DOM-tree placement and viewport coverage

- The `<ha-camera-stream>` element MUST remain inside the liebe-panel shadow root (a descendant of `<home-assistant>`) at all times, so `@lit/context` `context-request` resolution keeps working on HA ≥ 2026.7 (spec: [HA Compatibility Matrix](../specs/camera-streaming/index.md#ha-compatibility-matrix)).
- The fullscreen overlay MUST visually cover the full viewport INCLUDING HA's sidebar and header — parity with the current portalled `FullscreenModal` at z-index 99999. The existing e2e `getBoundingClientRect()` viewport-coverage assertion (±2 px) MUST keep passing.
- Geometry alone is NOT sufficient proof of coverage: an overlay trapped under a higher stacking context still reports a full-viewport rect while painting BEHIND HA's chrome. Coverage MUST therefore also be verified as a live-DOM TOPMOST check — `document.elementFromPoint()` (or the shadow-aware equivalent, descending through `shadowRoot.elementFromPoint`) at header and sidebar coordinates while fullscreen, asserting the hit element belongs to the camera overlay, not HA chrome (see the e2e requirement).

#### Scenario: Overlay covers HA chrome

- **GIVEN** the panel embedded in HA with sidebar and header visible
- **WHEN** in-app fullscreen opens
- **THEN** the overlay's fixed backdrop rect equals the viewport (±2 px), a topmost hit test at header and sidebar coordinates resolves to the overlay (not HA chrome), and the stream element's host chain still walks up to `<home-assistant>`

### Grid positioning change MUST NOT regress layout

- The grid MUST switch from CSS-transform item positioning to absolute (`top`/`left`) positioning via `positionStrategy={absoluteStrategy}` (see Design for the exact API). This is a GLOBAL change affecting every card, and it MUST be verified not to regress: item placement (including responsive breakpoint scaling), edit-mode drag, resize on all 8 handles, non-overlap behavior, and visual appearance across cards.

#### Scenario: Grid behavior unchanged under absolute positioning

- **GIVEN** a dashboard with items across breakpoints
- **WHEN** the grid renders with `positionStrategy={absoluteStrategy}` and the user drags/resizes items in edit mode
- **THEN** placement, drag, resize, and persistence behave exactly as before the change

### Existing behavior MUST be preserved

All current camera-card behaviors MUST survive the redesign unchanged:

- Tap/Enter/Space on the stream surface toggles in-app fullscreen (view mode only, no error shown).
- Exit via ESC, backdrop tap, and **letterbox-area tap**; the "Click or press ESC to exit" hint shows; overlay mute/native-fullscreen controls `stopPropagation` and do not exit.
- Mute toggle, the native-fullscreen button (`requestFullscreen()` semantics untouched), the camera stats overlay (in-card and fullscreen variants), fit/matting configuration (fullscreen still forces `contain` fit), the status/pill state machine (`useCameraStreamStatus` — no semantic changes), and the still-image fallback (which MUST also fullscreen without a DOM move).
- `FullscreenModal` semantics for other callers MUST NOT change (the camera card simply stops using it).

#### Scenario: Still-image fallback fullscreens without moving

- **GIVEN** readiness `unavailable` (still-image fallback showing)
- **WHEN** the user toggles in-app fullscreen open and closed
- **THEN** the `<img>` node is not detached/reattached and fullscreen forces `contain` fit as today

### Real-browser e2e verification of the no-reconnect property

`tests/e2e/camera-stream.spec.ts` MUST be extended to prove no reconnect on BOTH toggle directions against the dockerized HA + go2rtc stack. The proof MUST directly observe DOM movement/lifecycle — an element-identity expando plus `currentTime` advancing is NOT sufficient evidence: an expando survives a `removeChild`→`appendChild` of the SAME node, and buffered media keeps `currentTime` advancing briefly through a reconnect. Required assertions:

- **Zero detach/reattach, observed directly:** install a `MutationObserver` (via `page.evaluate`, watching `childList` on the stream host's parent chain) before the first toggle, and assert ZERO removals/re-insertions of the `<ha-camera-stream>` node (or any wrapper containing it) across all four toggle transitions (open → letterbox close → reopen → ESC close). Equivalently or additionally, instrument the element to assert `disconnectedCallback`/`connectedCallback` never fire during the toggles.
- **No renegotiation:** assert no NEW stream-negotiation network activity is triggered by the toggles (no new WebRTC offer / no fresh HLS playlist bootstrap attributable to a player rebuild), e.g. via Playwright network capture filtered to the camera stream endpoints.
- **Continuity as a secondary signal:** the existing post-close STREAMING/RECORDING recovery assertions become strict continuity assertions (playback never re-enters a loading state), complementing — not replacing — the direct observations above.
- **Topmost coverage, not just geometry:** while fullscreen, assert via `document.elementFromPoint()` (descending through `shadowRoot.elementFromPoint` for shadow-DOM hits) at coordinates inside HA's header and sidebar regions that the topmost element is the camera overlay — a `getBoundingClientRect()` full-viewport rect alone cannot distinguish a covering overlay from one trapped behind a higher stacking context. This check also empirically settles whether HA chrome out-stacks the panel (see Open Questions).
- The viewport-coverage and in-tree (`<home-assistant>` ancestry) assertions from change 0007 MUST be retained.

#### Scenario: E2E proves the node never detaches

- **GIVEN** the seeded `camera.e2e_pattern` card streaming in the e2e stack, with a `MutationObserver` armed on the stream host's parent chain
- **WHEN** the spec opens fullscreen, closes via letterbox tap, reopens, and closes via ESC
- **THEN** the observer records zero `childList` removals/insertions of the stream node, no new stream negotiation occurs, playback never restarts, and no non-benign console errors occur

## Design

### Approach

Two candidates were analyzed. Both keep the stream node stationary; they differ in WHERE it permanently lives. **Option B (in-place CSS fullscreen) is selected**: in normal mode NOTHING moves or floats — the stream stays in-card, normally themed, clipped, and stacked — and fullscreen is a style flip on the card's own container. Option A (persistent portalled host + rect tracking) is retained only as a documented, heavier fallback; the analysis below records the three verified problems that demoted it.

#### Containing-block audit for the in-place fixed overlay

For a `position: fixed` overlay promoted IN PLACE inside the card, every ancestor property that establishes a containing block traps it. Audit of the actual ancestor chain (the HA ancestors above the panel are proven safe by change 0007's e2e viewport-coverage assertion on the portalled modal, whose ancestor chain above `[data-liebe-root]` is identical):

| Ancestor property                                                       | Where                                                                                                                    | Effect on in-place `position: fixed`                                                                                                                                                                | Removable?                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transform: translate(...)` on `.react-grid-item`                       | react-grid-layout inline positioning                                                                                     | Containing block                                                                                                                                                                                    | **Yes — grid-level:** `positionStrategy={absoluteStrategy}` switches items to `top`/`left` (see API note below). Global change; requires grid regression verification                                                                                                                                                                                                                     |
| `contain: paint` on `.rt-BaseCard`                                      | Radix `<Card>` rendered by `GridCard` (`src/components/GridCard.tsx:3`; `node_modules/@radix-ui/themes/styles.css:7494`) | Containing block AND paint clipping to card bounds                                                                                                                                                  | **Yes — per-card:** `GridCard` spreads its `style` prop into the Card's inline style (`cardStyle = { ...style, ... }`, `GridCard.tsx:154`, applied via `style={cardStyle}` at `:184`; `CardElement === Card` for non-transparent cards, `:173`). `CameraCard` already passes `style` and can add `contain: 'none'` WHILE fullscreen only, restoring the card's normal containment on exit |
| `.grid-card:active { transform: scale(0.98) }` on coarse pointers       | `GridCard.tsx:448-451` (0.1 s transition)                                                                                | **Hazard:** the card is `:active` during the very tap that opens fullscreen, and the transition tail keeps a transform up to ~100 ms after release — re-trapping the just-promoted overlay mid-open | Yes — suppress the `:active` transform for the camera card (or while entering/showing fullscreen); MUST be mitigated                                                                                                                                                                                                                                                                      |
| `transform: scale(0.98)` while `isLoading`                              | `GridCard.tsx:153`                                                                                                       | Containing block while loading                                                                                                                                                                      | Non-issue: `CameraCard` passes `isLoading={false}`                                                                                                                                                                                                                                                                                                                                        |
| `will-change: transform` on `.react-grid-item.react-draggable-dragging` | RGL stylesheet + `GridLayoutSection.css:21-26`                                                                           | Containing block, drag-time only                                                                                                                                                                    | Non-issue: edit-mode drag and view-mode fullscreen are mutually exclusive                                                                                                                                                                                                                                                                                                                 |
| `backdrop-filter` via `--backdrop-filter-panel`                         | Radix `.rt-Card:where(.rt-variant-surface)::before` (`styles.css:7660`)                                                  | None — it is on a `::before` pseudo-element (a child), not an ancestor                                                                                                                              | n/a                                                                                                                                                                                                                                                                                                                                                                                       |

**react-grid-layout 2.2.3 API note:** `useCSSTransforms` exists only on the internal `GridItemProps` interface (`node_modules/react-grid-layout/dist/react.d.ts:40`) — it is NOT a prop of the `GridLayout` component. The grid-level knob is `positionStrategy?: PositionStrategy` (`GridLayoutProps`, `dist/ResponsiveGridLayout-BrhkSyZk.d.ts:37-40`: "Use transformStrategy (default), absoluteStrategy, or createScaledStrategy(scale)"), with `absoluteStrategy` imported from the **`react-grid-layout/core` subpath** (`dist/core.d.ts:4`, `dist/position-CSgQSjwQ.d.ts:308`) — it is not re-exported from the package root.

#### Option B — In-place CSS fullscreen (SELECTED)

Remove the two containing blocks instead of escaping them; then fullscreen is a style flip on the node's own container. Recipe:

1. **Grid:** pass `positionStrategy={absoluteStrategy}` to the `GridLayout` in `src/components/GridLayoutSection.tsx` (import from `react-grid-layout/core`). Grid items position via `top`/`left`; no transform remains in the ancestor chain in view mode.
2. **Card containment:** while fullscreen, `CameraCard` sets `contain: 'none'` on its `GridCard` via the existing `style` passthrough, lifting the Radix card's paint containment for exactly the duration of the overlay.
3. **`:active` hazard mitigation:** suppress the `.grid-card:active` scale transform for the camera card (or while entering/showing fullscreen) so the opening tap's ~100 ms transform tail cannot re-trap the overlay.
4. **Fullscreen:** the camera's own stream container promotes IN PLACE to `position: fixed; inset: 0; z-index: 99999` with the black backdrop, exit hint, overlay controls, and stats rendered inside it (single instances, replacing today's duplicated normal/fullscreen sets); ESC handling moves into the card. The `<ha-camera-stream>` node never moves → no `disconnectedCallback`/`connectedCallback` → no HLS/WebRTC teardown → no reconnect, on ALL browsers. `KeepAlive` and the camera's `FullscreenModal` usage are removed.

**Stacking-context escape (open implementation risk — not solved by the recipe above):** the in-place host stays INSIDE the root `.radix-themes` element, which is itself a stacking context (`position: relative; z-index: 0`, `.radix-themes:where([data-is-root-theme='true'])`, `@radix-ui/themes/styles.css:15581-15584`). A descendant's `z-index: 99999` is therefore capped WITHIN that context and cannot compete with Home Assistant chrome (header/sidebar) that sits OUTSIDE `.radix-themes` at a positive stacking level — the overlay can be a full-viewport rectangle yet still paint BEHIND HA's chrome. The current `FullscreenModal` avoids this only because it portals to `[data-liebe-root]` as a SIBLING of `<Theme>`, escaping that context. Preferred mitigation: while fullscreen, LIFT the stacking of an ancestor at/above `.radix-themes` WITHOUT moving the stream node — e.g. a fullscreen-active flag (store/context, or a data-attribute set on a high ancestor, since the camera card must reach UP to an app-root ancestor) that temporarily raises that ancestor's `z-index`/stacking. This preserves the core invariant (only an ancestor's STYLE changes; the `<ha-camera-stream>` node itself never moves, so no reconnect). The alternative — escaping via a portal/DOM move — is rejected because moving the node reintroduces the reconnect. Note this differs from Option A's stacking problem in scope: here the issue exists only WHILE fullscreen and is addressable by a temporary ancestor lift; Option A's persistent host suffers it permanently in NORMAL mode. Whether HA chrome actually out-stacks the panel in practice is settled empirically by the e2e `elementFromPoint` topmost check (see Requirements and Open Questions).

- **Pros:** in normal mode NOTHING moves or floats — the stream stays in-card with normal theming (inside `<Theme>`), normal scroll clipping (inside the dashboard's `overflow: auto` content area), and normal stacking; least camera-card code; deletes two mechanisms (`KeepAlive`, the per-toggle portal) and adds none.
- **Cons / accepted trade-off:** the `positionStrategy` switch is GLOBAL — every card's positioning changes from compositor-friendly transforms to `top`/`left` (edit-mode drag/resize feel may change marginally) — so it carries a grid regression-verification burden; the fullscreen path needs the stacking-context escape above (ancestor lift) to out-paint HA chrome; and the in-place fixed host is silently re-breakable by any FUTURE ancestor gaining `transform`/`filter`/`contain` — the e2e viewport-coverage + topmost assertions are the standing guard.

#### Option A — Persistent portalled host + rect tracking (fallback only)

Portal the stream host ONCE into the `[data-liebe-root]` container (`src/panel.ts:137`) and rect-track the in-card slot in normal mode, expanding to `inset: 0` in fullscreen. Demoted to fallback because of three verified problems:

1. **Stacking:** `[data-liebe-root]` is the container `ReactDOM.createRoot` renders into (`src/panel.ts:162`), making it the PARENT of the Radix `<Theme>` wrapper (`src/routes/__root.tsx:65`) — and the root `.radix-themes` element establishes its own stacking context (`position: relative; z-index: 0`, `@radix-ui/themes/styles.css:15581-15584`). A persistent host portalled as a SIBLING of that stacking context cannot be layered between the camera card and in-Theme chrome: below the Theme it is hidden behind the card; above it, it floats over every edit control, modal, and menu.
2. **Scrollport clipping:** the dashboard content area scrolls (`overflow: 'auto'`, `src/components/Dashboard.tsx:87`). `getBoundingClientRect()` returns the slot's full UNCLIPPED rect, so a fixed host portalled outside the scroll container would paint over surrounding app/HA chrome whenever the card is partially scrolled out of view — requiring hand-rolled intersection clipping on top of the rect tracking.
3. **Theme inheritance:** a host at `[data-liebe-root]` sits OUTSIDE the `<Theme>` wrapper, so controls/stats/spinner/background moved there lose the Radix appearance/token overrides — the same class of dark-mode regression previously fixed for portalled Drawer content (commit `a5aea4d`).

Option B avoids all three by construction: in normal mode nothing leaves the card.

### Decisions

- **Decision:** the stream node never moves in the DOM; fullscreen is CSS-only on a persistently-mounted host.
  - **Why:** detach/reattach fires `disconnectedCallback`/`connectedCallback` on `<ha-camera-stream>`, whose inner players tear down HLS/WebRTC connections; only a stationary node avoids the reconnect on every browser.
  - **Alternatives considered:** (1) `Element.moveBefore()` in `KeepAlive` — explored and reverted, never shipped: Chromium-133+-only, and defeated on the exit path by React unmounting the modal subtree before any effect can rescue the node; (2) accepting the reconnect (status quo, spec-documented) — rejected: it negates the feature's purpose (faster than native fullscreen).
- **Decision (reversal of an earlier draft):** select Option B (in-place CSS fullscreen via `positionStrategy={absoluteStrategy}` + per-card `contain: 'none'` while fullscreen); demote Option A (persistent `[data-liebe-root]` portal + rect tracking) to fallback.
  - **Why:** an earlier draft rejected Option B believing the Radix card's `contain: paint` was unremovable from a descendant; in fact `GridCard` spreads its `style` prop into the Radix Card's inline style (`GridCard.tsx:154`/`:184`), so the containment is droppable per-card for exactly the fullscreen duration. Meanwhile Option A carries three verified structural problems (Theme-sibling stacking, scrollport clipping of the tracked host, loss of Theme token inheritance) plus the rect-tracking machinery itself — all of which Option B avoids in normal mode because nothing moves. (Option B's own fullscreen-mode stacking escape — lifting an ancestor at/above `.radix-themes` — remains an open implementation risk; see the Design consideration and Open Questions.)
  - **Alternatives considered:** Option A (fallback if grid verification surfaces an unfixable regression); overriding `.rt-BaseCard` containment globally in CSS (rejected — per-card inline `contain: 'none'` scoped to the open overlay is strictly narrower).
- **Decision:** keep `FullscreenModal` and `resolvePanelPortalContainer`/`usePanelPortalContainer` untouched for other consumers.
  - **Why:** the in-tree portal target decision from change 0007 is still correct for content that does not need to stay stationary; only the camera card stops using it.

### Non-Goals

- No changes to the bootstrap ladder (`useCameraStreamReady`), the status machine semantics (`useCameraStreamStatus`), the still-image fallback logic, stats math, or the pill priority order.
- No changes to native fullscreen (`requestFullscreen()` path).
- No changes to `GridCard`'s own separate fullscreen feature (its `document.body` portal for non-camera content) beyond the `:active`-scale mitigation.
- Not a general "fullscreen framework" — this change fixes the camera card only.
- NOTE: the grid positioning mode IS changed globally (transform → absolute) as a deliberate enabler of this design — that is in scope, with its regression-verification burden, not a non-goal.

## Tasks

- [x] Grid positioning pivot (code + unit tests) — pass `positionStrategy={absoluteStrategy}` (imported from `react-grid-layout/core`) to the `GridLayout` in `src/components/GridLayoutSection.tsx`; add/adjust unit tests for item positioning
- [ ] Grid positioning regression verification — verify edit-mode drag, resize (all 8 handles), responsive breakpoint scaling, non-overlap, and visual appearance in the e2e environment and manually across cards (rides with the e2e task below)
- [x] Camera card in-place fullscreen — promote the single persistently-mounted stream container to `position: fixed; inset: 0` while fullscreen; set `contain: 'none'` on the `GridCard` via the `style` passthrough for the overlay's duration; implement the stacking-context escape (fullscreen-active ancestor lift at/above `.radix-themes`, per the Design consideration — never moving the stream node); mitigate the `.grid-card:active` scale transform; move backdrop, exit hint, ESC/letterbox/backdrop exit handling, overlay controls, and fullscreen stats into the card (single instances); force `contain` fit in fullscreen; remove `KeepAlive` and `FullscreenModal` usage from the camera card; delete `src/components/KeepAlive.tsx` + `src/components/__tests__/KeepAlive.test.tsx` (camera card is the sole consumer); 100%-covered unit tests for all preserved behaviors
- [ ] E2E no-reconnect proof + spec updates — extend `tests/e2e/camera-stream.spec.ts` with the MutationObserver zero-detach assertion, no-new-negotiation network assertion, the `elementFromPoint` topmost check at header/sidebar coordinates, and strict playback-continuity assertions across all four toggle transitions, retaining viewport-coverage and `<home-assistant>`-ancestry assertions; update [camera-streaming](../specs/camera-streaming/index.md) (Fullscreen section, Constraints — drop the accepted-renegotiation concession and `KeepAlive` references, changelog entry) and [grid-layout](../specs/grid-layout/index.md) (positioning strategy) to match the implementation

## Open Questions

- [ ] Stacking-context escape mechanism — which ancestor at/above `.radix-themes` gets the fullscreen-active lift, and via what wiring (store flag, context, or data-attribute reached from the camera card)? And does HA chrome actually out-stack the panel in current HA builds? The e2e `elementFromPoint` topmost check settles the latter empirically; the lift design must be chosen during implementation without ever moving the stream node.
- [ ] Global `positionStrategy` regression risk — does switching every grid item from transform to `top`/`left` positioning change edit-mode drag/resize feel or performance noticeably on low-end tablets? If an unfixable regression surfaces, fall back to Option A per the Design section.
- [ ] `:active`-scale mitigation shape — exempt the camera card entirely vs. suppress the transform only while its fullscreen overlay is open/opening (narrower, but must beat the 0.1 s transition tail race on the opening tap).

## References

- Spec: [Camera Streaming](../specs/camera-streaming/) — Fullscreen section documents the current (superseded-by-this-change) accepted reconnect; [Grid Layout](../specs/grid-layout/) — positioning strategy
- Related changes: [0007-ha-camera-stream](./0007-ha-camera-stream.md) (in-tree portal decision, e2e camera stack), [0005-dockerized-ha-e2e](./0005-dockerized-ha-e2e.md)
- Key files: `src/components/CameraCard/index.tsx`, `src/components/CameraCard/HaCameraStream.tsx`, `src/components/KeepAlive.tsx`, `src/components/ui/FullscreenModal.tsx`, `src/components/GridCard.tsx`, `src/components/GridLayoutSection.tsx`, `src/components/GridLayoutSection.css`, `src/components/Dashboard.tsx` (scroll container), `src/panel.ts` (`data-liebe-root`), `src/routes/__root.tsx` (Theme wrapper), `tests/e2e/camera-stream.spec.ts`
- External: [Element.moveBefore() (Chromium 133+)](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore), [CSS containing block rules (transform/filter/contain/will-change)](https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block), [CSS Containment (`contain: paint`)](https://developer.mozilla.org/en-US/docs/Web/CSS/contain), [react-grid-layout `positionStrategy`](https://github.com/react-grid-layout/react-grid-layout)
