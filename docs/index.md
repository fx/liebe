# Documentation

## Specs

| Spec                                        | Description                                                                                                                                                                                                                                 | Status |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Architecture](specs/architecture/)         | Project-level tech stack, repository layout, build system, dev workflow, testing/linting conventions, and GitHub Pages deployment                                                                                                           | active |
| [Camera Streaming](specs/camera-streaming/) | Camera cards wrapping HA's ha-camera-stream element — bootstrap ladder, status machine, still-image fallback, in-tree fullscreen                                                                                                            | active |
| [Dashboard Config](specs/dashboard-config/) | Dashboard configuration state — screen tree, view/edit mode, localStorage persistence, and single-file YAML/JSON import/export                                                                                                              | active |
| [Design System](specs/design-system/)       | Visual language — token contract, domain color discipline, card anatomy, size-adaptive layout tiers, typography, motion (tokens, anatomy and card shell implemented; layout tiers pending)                                                  | active |
| [Entity Cards](specs/entity-cards/)         | Entity card system — domain-to-card registry, all card components and variants, size variants, config modal, and entity browser                                                                                                             | active |
| [Entity State](specs/entity-state/)         | Home Assistant WebSocket connection and entity-state pipeline — debouncing, batching, stores, consumer hooks, and service calls                                                                                                             | active |
| [Grid Layout](specs/grid-layout/)           | Grid layout system — react-grid-layout screens, item types, placement, drag/resize in edit mode, and layout persistence                                                                                                                     | active |
| [Navigation](specs/navigation/)             | Base-path-aware routing, Home Assistant URL sync, screen slugs, and taskbar/sidebar screen-tree navigation                                                                                                                                  | active |
| [Panel Lifecycle](specs/panel-lifecycle/)   | LiebePanel custom element — shadow-DOM React mount, hass propagation, and lifecycle-resilience mechanisms                                                                                                                                   | active |
| [Storybook](specs/storybook/)               | Component workshop — Storybook with entity fixtures, theme/appearance/grid-cell decorators, per-state stories, a11y, CI gate, Pages publishing                                                                                              | active |
| [Theming](specs/theming/)                   | CSS-token theming — theme model/cascade, stable selector contract, shadow-DOM injection, YAML-persisted selection and custom CSS, built-in Default/Liquid Glass/LCARS (engine and Default implemented; Liquid Glass and LCARS pending 0013) | active |

## Changes

| #    | Change                                                                               | Spec                                        | Status   | Depends On       |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------- | -------- | ---------------- |
| 0001 | [Per-Entity Store Selectors](changes/0001-per-entity-store-selectors.md)             | [Entity State](specs/entity-state/)         | complete | —                |
| 0002 | [Repository Hygiene Bundle](changes/0002-repo-hygiene.md)                            | [Architecture](specs/architecture/)         | complete | —                |
| 0003 | [Re-enable react-hooks v7 Lint Rules](changes/0003-reenable-react-hooks-rules.md)    | [Architecture](specs/architecture/)         | complete | —                |
| 0004 | [Portable Configuration Contract](changes/0004-portable-config-contract.md)          | [Dashboard Config](specs/dashboard-config/) | complete | —                |
| 0005 | [Dockerized Home Assistant E2E Environment](changes/0005-dockerized-ha-e2e.md)       | [Architecture](specs/architecture/)         | complete | —                |
| 0006 | [Codecov & 100% Patch Coverage](changes/0006-codecov-patch-coverage.md)              | [Architecture](specs/architecture/)         | complete | —                |
| 0007 | [HA Camera Stream Element](changes/0007-ha-camera-stream.md)                         | [Camera Streaming](specs/camera-streaming/) | complete | —                |
| 0008 | [Camera Fullscreen Without DOM Moves](changes/0008-camera-fullscreen-no-dom-move.md) | [Camera Streaming](specs/camera-streaming/) | complete | —                |
| 0009 | [Storybook Setup](changes/0009-storybook-setup.md)                                   | [Storybook](specs/storybook/)               | complete | —                |
| 0010 | [Design Tokens & Card Anatomy](changes/0010-design-tokens-and-anatomy.md)            | [Design System](specs/design-system/)       | complete | 0009             |
| 0011 | [Size-Adaptive Layout Tiers](changes/0011-layout-tiers.md)                           | [Design System](specs/design-system/)       | draft    | 0010, 0014       |
| 0012 | [Theming Engine](changes/0012-theming-engine.md)                                     | [Theming](specs/theming/)                   | complete | 0010             |
| 0013 | [Built-in Themes: Liquid Glass & LCARS](changes/0013-built-in-themes.md)             | [Theming](specs/theming/)                   | draft    | 0012             |
| 0014 | [Universal Card Options](changes/0014-universal-card-options.md)                     | [Entity Cards](specs/entity-cards/)         | complete | 0010             |
| 0015 | [History & Forecast Data Pipeline](changes/0015-history-and-forecast-data.md)        | [Entity State](specs/entity-state/)         | draft    | 0014             |
| 0016 | [Light Card to Spec](changes/0016-light-card-to-spec.md)                             | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0017 | [Climate Card to Spec](changes/0017-climate-card-to-spec.md)                         | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0018 | [Sensor Cards to Spec](changes/0018-sensor-cards-to-spec.md)                         | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014, 0015 |
| 0019 | [Cover & Fan Cards to Spec](changes/0019-cover-fan-cards-to-spec.md)                 | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0020 | [Weather Card to Spec](changes/0020-weather-card-to-spec.md)                         | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014, 0015 |
| 0021 | [Camera Presentation Options](changes/0021-camera-presentation-options.md)           | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0022 | [Switch & Input Helper Cards to Spec](changes/0022-switch-input-helpers-to-spec.md)  | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0023 | [Media Player Card](changes/0023-media-player-card.md)                               | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0024 | [Security Cards (Lock & Alarm)](changes/0024-security-cards.md)                      | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0025 | [Vacuum Card](changes/0025-vacuum-card.md)                                           | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0026 | [Person Card](changes/0026-person-card.md)                                           | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
| 0027 | [Scene, Script & Button Cards](changes/0027-scene-cards.md)                          | [Entity Cards](specs/entity-cards/)         | draft    | 0011, 0014       |
