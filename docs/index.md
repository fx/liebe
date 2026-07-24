# Documentation

## Specs

| Spec                                        | Description                                                                                                                       | Status |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Architecture](specs/architecture/)         | Project-level tech stack, repository layout, build system, dev workflow, testing/linting conventions, and GitHub Pages deployment | active |
| [Camera Streaming](specs/camera-streaming/) | Camera cards wrapping HA's ha-camera-stream element — bootstrap ladder, status machine, still-image fallback, in-tree fullscreen  | active |
| [Dashboard Config](specs/dashboard-config/) | Dashboard configuration state — screen tree, view/edit mode, localStorage persistence, and single-file YAML/JSON import/export    | active |
| [Entity Cards](specs/entity-cards/)         | Entity card system — domain-to-card registry, all card components and variants, size variants, config modal, and entity browser   | active |
| [Entity State](specs/entity-state/)         | Home Assistant WebSocket connection and entity-state pipeline — debouncing, batching, stores, consumer hooks, and service calls   | active |
| [Grid Layout](specs/grid-layout/)           | Grid layout system — react-grid-layout screens, item types, placement, drag/resize in edit mode, and layout persistence           | active |
| [Navigation](specs/navigation/)             | Base-path-aware routing, Home Assistant URL sync, screen slugs, and taskbar/sidebar screen-tree navigation                        | active |
| [Panel Lifecycle](specs/panel-lifecycle/)   | LiebePanel custom element — shadow-DOM React mount, hass propagation, and lifecycle-resilience mechanisms                         | active |

## Changes

| #    | Change                                                                            | Spec                                        | Status   | Depends On |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------- | -------- | ---------- |
| 0001 | [Per-Entity Store Selectors](changes/0001-per-entity-store-selectors.md)          | [Entity State](specs/entity-state/)         | complete | —          |
| 0002 | [Repository Hygiene Bundle](changes/0002-repo-hygiene.md)                         | [Architecture](specs/architecture/)         | complete | —          |
| 0003 | [Re-enable react-hooks v7 Lint Rules](changes/0003-reenable-react-hooks-rules.md) | [Architecture](specs/architecture/)         | complete | —          |
| 0004 | [Portable Configuration Contract](changes/0004-portable-config-contract.md)       | [Dashboard Config](specs/dashboard-config/) | complete | —          |
| 0005 | [Dockerized Home Assistant E2E Environment](changes/0005-dockerized-ha-e2e.md)    | [Architecture](specs/architecture/)         | complete | —          |
| 0006 | [Codecov & 100% Patch Coverage](changes/0006-codecov-patch-coverage.md)           | [Architecture](specs/architecture/)         | complete | —          |
| 0007 | [HA Camera Stream Element](changes/0007-ha-camera-stream.md)                      | [Camera Streaming](specs/camera-streaming/) | complete | —          |
