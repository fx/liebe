# 0021 — Camera Presentation Options

## Summary

Implement the camera card's new presentation options from the [camera option contract](../specs/entity-cards/options/camera.md) on top of the tier layouts (0011) and universal option surface (0014): `showNameOverlay` (name/state in a bottom gradient overlay on the feed), `showLiveBadge` (a `LIVE` pill with a reduced-motion-safe pulsing dot, absent on the still-image fallback), `showLastMotion` + `motionEntity` (a "Motion detected" / "Clear for X" line from a linked motion sensor), the `hideName`/`hideState` overlay interaction, and the glance/row still-thumbnail degraded tiers. Everything about the feed itself — stream bootstrap, the status machine, ≥2×2 fullscreen mechanics, and the existing `fit`/`matting`/`showStats` config — is owned by the [camera-streaming spec](../specs/camera-streaming/index.md) and is not touched here, **with one scoped stream-lifecycle exception this change does own**: suppressing stream mounts below 2×2 and the degraded-tier lazy fullscreen mount/unmount path, documented back into camera-streaming by the spec-sync task.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [options/camera](../specs/entity-cards/options/camera.md) · **Status:** draft · **Depends on:** 0011, 0014

## Motivation

The camera card renders a live feed with a hardened streaming pipeline but no presentation surface: the entity name sits in card chrome below the feed, live-ness is only signaled by the streaming-owned status pill, there is no motion context, and small grid spans clip a stream that cannot be legible there anyway. The option doc specifies an overlay-first presentation (name/state on the feed, an honest LIVE badge, an optional motion line) and a graceful-degradation rule for sub-2×2 spans; landing it completes the camera card's option contract without touching the streaming machinery that changes 0007/0008 stabilized.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- Every option MUST ship stories demonstrating its values with mocked stream states ([storybook — story coverage](../specs/storybook/index.md#story-coverage)): overlay on/off, LIVE badge over a streaming feed vs. absent on the still-image fallback, motion line present/absent/unavailable-sensor, hideName/hideState combinations including the collapsed-overlay case, and the glance/tall/row still-thumbnail tiers.
- Overlay/badge/motion rendering MUST have unit tests for every rule below, including the reduced-motion pulse guard, the minute-cadence relative-time refresh, missing/unavailable `motionEntity` omission, and the no-stream-mount rule below 2×2.
- The e2e suite (dockerized go2rtc synthetic camera from changes [0005](./0005-dockerized-ha-e2e.md)/[0007](./0007-ha-camera-stream.md), `tests/e2e/camera-stream.spec.ts`) MUST add one assertion that toggling the overlay options on a playing stream never disturbs the stream node — zero detach/reattach of `<ha-camera-stream>` and no reconnect, the same no-DOM-move invariant change [0008](./0008-camera-fullscreen-no-dom-move.md) proves for fullscreen.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

The [camera option doc](../specs/entity-cards/options/camera.md) owns the option keys, defaults, overlay composition, live-badge honesty rules, motion-line semantics, tier layouts, and its scenarios — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- Options are stored under `item.config` and edited via the camera card's `CardConfig` form alongside the shared 0014 fragment, round-tripping through YAML.
- **Overlay elements MUST be siblings layered over the stationary stream container, never wrappers around it**, so toggling any presentation option cannot move the stream node in the DOM — the [0008](./0008-camera-fullscreen-no-dom-move.md) no-reconnect invariant is the constraint every option here is built under.
- **Scoped exception to that invariant — the one stream-lifecycle change this proposes:** below 2×2 no stream element is mounted at all, so entering fullscreen from a degraded tier mounts the stream fresh and exiting unmounts it. A new connection is acceptable precisely because no stream existed to preserve. This lazy mount/unmount path is coordinated with [camera-streaming](../specs/camera-streaming/index.md), whose fullscreen section MUST be updated in the spec-sync task; the no-reconnect invariant continues to hold unchanged for the ≥2×2 case.
- Anything else about stream bootstrap, the status machine, or the still-image fallback mechanism stays owned by camera-streaming and is untouched here.

## Design Decisions

- **LIVE badge subsumes the streaming pill's live states, presentation-only** — resolves the option doc's open question about redundant live-ness indicators. When `showLiveBadge: true` and the status machine reports streaming, the `LIVE` pill is the presentation of that state (with the recording variant preserved); non-live states (`CONNECTING`, `NO SIGNAL`, `UNAVAILABLE`, errors) keep the existing pill unchanged. This is a skin over the pill slot: the status machine, its state resolution, and its priority order stay untouched in [camera-streaming](../specs/camera-streaming/index.md)'s ownership.
- **Overlay is a sibling layer, never a wrapper** — the no-DOM-move invariant from change 0008 is load-bearing (the stream node must never detach or the connection renegotiates), so all overlay/badge/motion elements are absolutely-positioned siblings over the persistent stream container, and option toggles only add/remove those siblings. The new e2e assertion guards this by construction and by proof.
- **Reduced-motion via media query, not config** — the pulse is a pure CSS animation gated by `prefers-reduced-motion`; no per-card option, matching how the platform expresses the preference.
- **`motionEntity` stays a free entity picker** — device-registry auto-discovery of sibling motion sensors is deferred (option-doc open question); a plain picker needs no new registry dependency.
- **Degraded-tier snapshots reuse the fallback cadence** — the glance/row thumbnail uses the same snapshot mechanism and refresh cadence the still-image fallback already owns; a slower small-tile cadence stays an open question in the option doc.
- **Relative time is a shared helper** — the minute-refreshing "X min ago" formatter lives in the CameraCard component folder as a unit-tested pure function driving a single interval, not per-render date math.

## Tasks

Spec restatements update **in the same PR** as each behavior change they describe (repo consistency rule — the living spec must never lag a merged PR); any task below naming a spec update covers only final changelog entries and status-line flips not tied to a single behavior.

- [ ] **PR 1 — Overlay and LIVE badge**: `showNameOverlay` gradient overlay (sibling layer) with `hideName`/`hideState` interaction and full-collapse rule; `showLiveBadge` with reduced-motion-safe pulse, absent-on-fallback behavior, and pill subsumption; config-form entries; unit tests; stories with mocked stream states; e2e assertion that overlay toggles never disturb the stream node (no detach/reattach, no reconnect)
- [ ] **PR 2 — Motion line, degraded tiers, and spec sync**: `showLastMotion` + `motionEntity` with minute refresh and missing/unavailable omission; glance/row still-thumbnail tiers with the no-stream-mount-below-2×2 rule and image-only-tile validity; config-form entries; unit tests + stories; update the [camera-streaming spec](../specs/camera-streaming/index.md) fullscreen section with the degraded-tier lazy mount/unmount contract (required by the functional requirements — this task is the spec-sync that keeps the owning contract current); update the [camera option doc](../specs/entity-cards/options/camera.md) status line and resolved open questions, and record the change in the [entity-cards](../specs/entity-cards/index.md) changelog

## Out of Scope

- Everything owned by [camera-streaming](../specs/camera-streaming/index.md): stream bootstrap, the still-image fallback mechanism, the status machine and its states, in-place/native fullscreen mechanics **for tiers ≥2×2**, and the existing `fit`/`matting`/`showStats` config keys — none of these change here, with one scoped exception: the degraded-tier lazy-mount fullscreen entry/exit defined in Functional requirements IS in scope, including its documentation in the camera-streaming spec (spec-sync task).
- Universal options and the action system (0014); layout tiers themselves (0011).
- `motionEntity` auto-discovery from the device registry and a slower degraded-tier snapshot cadence (option-doc open questions).
- Retiring the legacy `size` prop (superseded by tier derivation; tracked in the design-system spec).
