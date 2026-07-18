# Panel Lifecycle

## Overview

Liebe integrates with Home Assistant as a native custom-element panel. This spec covers the `LiebePanel` custom element that HA instantiates (`src/panel.ts`), how it mounts a React tree into a shadow root, how the live `hass` object flows into React via `HomeAssistantContext`, and the set of lifecycle-resilience mechanisms that keep the panel alive across Home Assistant tab switches and DOM churn. The custom element MUST mount exactly one React root per instance, MUST re-render on every `hass` assignment, and MUST NOT tear down its React tree on `disconnectedCallback` while it still holds a `hass` reference. Panel-path detection (`src/config/panel.ts`) and the `useIsHomeAssistant` hook determine, at runtime, whether the app believes it is running inside Home Assistant.

## Background

Liebe is deployed as a single `panel.js` bundle registered in Home Assistant via `panel_custom`. HA constructs the registered custom element (`liebe-panel` in production, `liebe-panel-dev` in development) and pushes the `hass` object into it through a `set hass` property setter. Because HA owns the element's position in the DOM, it moves, hides, and (historically) removed the element as the user navigated between panels and browser tabs.

The bulk of the code in `src/panel.ts` exists to fight symptoms observed in July 2025, where the panel would disappear when the user switched browser tabs or left the tab idle:

- **PR #132 — "prevent panel from disappearing when switching tabs"** (commit `251c41e`, 2025-07-10) introduced the `initialized` guard and, critically, removed the `this.root?.unmount()` call from `disconnectedCallback`. The insight: HA removes and re-adds the element on navigation, so unmounting React on disconnect destroyed all state; keeping the root alive across disconnects fixed the disappearance.
- **PR #135 — "prevent panel unmount on extended tab inactivity"** (commit `c8bc464`, 2025-07-13, +303 lines) added the full resurrection machinery: the overridden `remove()`, the `MutationObserver` parent observer with auto-re-append, the keep-alive interval, the reconnect-check interval, the connection health-check interval, `window.__liebePanel` pinning, and the module-level global panel guardian.

> Note on issue numbering: PR **#131** (`853ae28`) is unrelated to the panel lifecycle — it fixes a WebRTC `InvalidStateError` in camera cards. The panel-resurrection work lives in **#132** and **#135**.

Related specs:

- Entity state pipeline (WebSocket subscriptions, `hassConnectionManager`): `../entity-state/`
- Routing and navigation (base-path handling, `RouterProvider`): `../navigation/`
- Build configuration (how `panel.js` / `liebe.css` are produced): `../architecture/`

## Requirements

### Custom Element Registration

- The bundle MUST register exactly one custom element on load, using an environment-specific name.
- In production builds the element name MUST be `liebe-panel`; in development builds it MUST be `liebe-panel-dev`, so both panels can coexist in one HA instance.
- The registered element name MUST match the `name` used in the HA `panel_custom` configuration.

#### Scenario: Development and production panels coexist

- **GIVEN** a Home Assistant instance configured with both a `liebe-panel` and a `liebe-panel-dev` panel
- **WHEN** each panel's bundle loads and calls `customElements.define`
- **THEN** the production bundle registers `liebe-panel` and the development bundle registers `liebe-panel-dev`, and neither collides with the other

### Shadow-DOM Mount

- On first `connectedCallback`, the element MUST attach an open shadow root and mount a single React root into a full-height container `div` inside it.
- The element MUST load `liebe.css` into the shadow root via a `<link>` element resolved relative to the running `panel.js` URL.
- The element MUST also inject a clone of that stylesheet into `document.head` (once) so Radix UI components that render in portals — which escape the shadow root — are styled.
- The element MUST expose the asset base URL as `window.__LIEBE_ASSET_BASE_URL__` for other code that needs to resolve bundled assets.

#### Scenario: Radix portals are styled

- **GIVEN** the panel has mounted and injected `liebe.css` into both the shadow root and `document.head`
- **WHEN** a Radix dialog or dropdown opens and renders its content in a portal attached to `document.body`
- **THEN** the portalled content is styled because the stylesheet clone exists in `document.head`

### hass Propagation

- Assigning the `hass` property MUST store the object and trigger a React re-render.
- The React tree MUST receive `hass` through `HomeAssistantProvider`, and `render()` MUST be a no-op when either the React root or `hass` is absent.
- Consumers MUST read `hass` through `useHomeAssistant` (throws outside a provider) or `useHomeAssistantOptional` (returns `null` outside a provider).

#### Scenario: HA pushes an updated hass object

- **GIVEN** a mounted panel with a live React tree
- **WHEN** Home Assistant assigns a new `hass` object to the element
- **THEN** the element stores it and re-renders the React tree with the new value flowing through context

### Lifecycle Resilience

The following mechanisms MUST keep the panel present and mounted while it holds a `hass` reference:

- `connectedCallback` MUST re-initialize (re-attach shadow root, re-create React root) if the shadow root or React root was lost, not only on the very first connect.
- `disconnectedCallback` MUST NOT unmount React or stop the keep-alive machinery while `_hass` is set; it MAY clean up only when `_hass` is absent (true teardown).
- The overridden `remove()` MUST ignore removal while `_hass` is set.
- A `MutationObserver` MUST watch the parent (and `document.body`) for removal of the element and re-append it when it is removed while `_hass` is set.
- Periodic intervals MUST attempt reconnection and monitor health: a reconnect check (~5s), a keep-alive touch (~30s), and a WebSocket health check (~30s).
- A module-level "global panel guardian" interval (~10s) MUST re-append the pinned `window.__liebePanel` element into a known HA container if it becomes disconnected while the page is visible.

#### Scenario: HA removes the element on tab switch

- **GIVEN** a mounted panel holding a `hass` reference
- **WHEN** Home Assistant removes the element from the DOM (tab switch / navigation) and later the tab becomes visible again
- **THEN** `disconnectedCallback` performs no teardown, and the parent observer / reconnect check / global guardian re-append the same element instance, preserving its React root and state

#### Scenario: Genuine teardown

- **GIVEN** a panel whose `_hass` is `null` (never received hass, or HA cleared it)
- **WHEN** `remove()` or `disconnectedCallback` runs
- **THEN** removal proceeds normally and the intervals/observer are cleaned up

### Home Assistant Detection

- `isPanelPath(pathname)` MUST return true when the pathname contains any known panel path (`/liebe` or `/liebe-dev`).
- `useIsHomeAssistant()` MUST return true when a `hass` context is present, OR the current path is a panel path, OR the app is running inside an iframe (`window.parent !== window`).

#### Scenario: Detect HA outside of provider

- **GIVEN** the app rendered at `/liebe-dev` without a `hass` context yet
- **WHEN** a component calls `useIsHomeAssistant()`
- **THEN** it returns `true` because the path matches a known panel path

## Design

### Architecture

```
Home Assistant frontend
  └─ <liebe-panel> (LiebePanel extends HTMLElement)   src/panel.ts
       set hass ──────────────► this._hass, render()
       shadowRoot
         └─ <div> (container)
              └─ ReactDOM.Root
                   └─ <StrictMode>
                        └─ <HomeAssistantProvider hass>   src/contexts/HomeAssistantContext.tsx
                             └─ <PanelApp>                 src/components/PanelApp.tsx
                                  └─ <Theme>
                                       └─ <RouterProvider router>
```

Two independent liveness layers exist:

1. **Instance-scoped** (methods on `LiebePanel`): overridden `remove()`, parent `MutationObserver`, and three `setInterval` loops (keep-alive, reconnect check, connection health check).
2. **Module-scoped** (`startGlobalPanelGuardian`): a single interval that operates on the globally pinned `window.__liebePanel` regardless of any one instance's state.

### Data Models

`HomeAssistantContext.tsx` defines the shape of the injected `hass` object (`src/contexts/HomeAssistantContext.tsx:4`):

```ts
export interface HomeAssistantState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
  context: { id: string; parent_id: string | null; user_id: string | null }
}

export interface HomeAssistant {
  states: Record<string, HomeAssistantState>
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>
  ) => Promise<void>
  callWS: <T = unknown>(message: Record<string, unknown>) => Promise<T>
  connection: Connection // from home-assistant-js-websocket
  user: { name: string; id: string; is_admin: boolean }
  themes: Record<string, unknown>
  language: string
  config: {
    /* latitude, longitude, unit_system, location_name, time_zone, components, version, ... */
  }
}
```

`PanelConfig` (`src/config/panel.ts:5`):

```ts
export interface PanelConfig {
  elementName: string
  urlPath: string
}
```

### API Surface

Panel-path helpers (`src/config/panel.ts`):

- `getPanelConfig(): PanelConfig` — returns `liebe-panel` / `/liebe` in production, `liebe-panel-dev` / `/liebe-dev` otherwise, keyed off `process.env.NODE_ENV`.
- `getAllPanelPaths(): string[]` — `['/liebe', '/liebe-dev']`.
- `isPanelPath(pathname): boolean` — substring match against all panel paths.
- `getPanelBasePath(pathname): string | undefined` — most-specific match first (iterates paths reversed).

Context API (`src/contexts/HomeAssistantContext.tsx`):

- `HomeAssistantProvider({ children, hass })`
- `useHomeAssistant()` — throws `"useHomeAssistant must be used within a HomeAssistantProvider"` if no context.
- `useHomeAssistantOptional()` — returns `HomeAssistant | null`.

Detection hook (`src/hooks/useIsHomeAssistant.ts`):

```ts
export function useIsHomeAssistant(): boolean {
  const hass = useHomeAssistantOptional()
  return !!(hass || isPanelPath(window.location.pathname) || window.parent !== window)
}
```

Cross-module contracts published by the panel:

- `window.__liebePanel` — the pinned element instance (`src/panel.ts:38`).
- `window.__LIEBE_ASSET_BASE_URL__` — asset base URL (`src/panel.ts:143`); read by `WeatherCard/index.tsx:126`.
- `liebe-websocket-check` — a bubbling/composed `CustomEvent` the panel dispatches when it detects a non-open WebSocket after visibility restore (`src/panel.ts:196`); handled in `useEntityConnection.ts:30` which calls `hassConnectionManager.checkConnectionHealth()`.

### UI Components

- `PanelApp` (`src/components/PanelApp.tsx`) is the React entry point: it selects the first screen if none is current, then renders `<Theme><RouterProvider router={router} /></Theme>`.
- `KeepAlive` (`src/components/KeepAlive.tsx`) is **not** part of the panel lifecycle despite the name. It is a React portal-caching component used only by `CameraCard` (`src/components/CameraCard.tsx:633`) to preserve a camera stream across re-renders. It is distinct from the panel's `startKeepAlive()` interval and is documented in the entity/camera specs, not here.

### Business Logic

Mount / re-mount decision (`src/panel.ts:118`):

```ts
const needsInit = !this.initialized || !this.shadowRoot || !this.root
```

Deliberate non-teardown (`src/panel.ts:250`):

```ts
// Do NOT stop keep-alive or cleanup - we want to stay ready for reconnection
// Only clean up if we're truly being destroyed (no hass object)
if (!this._hass) {
  this.stopKeepAlive()
  this.stopReconnectCheck()
  this.stopConnectionHealthCheck()
  this.cleanupParentObserver()
}
// Do NOT unmount or cleanup React - Home Assistant will re-add this element
```

Overridden `remove()` (`src/panel.ts:42`):

```ts
this.remove = () => {
  if (!this._hass) {
    originalRemove.call(this)
  }
}
```

Parent observer re-append (`src/panel.ts:311`): on detecting its own removal while `_hass` is set, it stores `mutation.target` as `lastParentElement` and, on the next tick, `mutation.target.appendChild(this)` if still disconnected.

Reconnect check (`src/panel.ts:354`, ~5s): when disconnected, visible, and holding `hass`, it targets `partial-panel-resolver`, then `[id^="panel-"]`, then the last known parent, and re-appends.

Global guardian (`src/panel.ts:413`, ~10s): reads `window.__liebePanel`; if disconnected while the page is visible, tries a list of HA containers (`partial-panel-resolver`, `[id^="panel-"]`, `ha-panel-iframe`, `.view`) and re-appends into the first that does not already contain it.

The `hass` setter (`src/panel.ts:53`) only emits a console log when one or more _subscribed_ entities actually changed state/`last_updated`, then always stores `hass` and calls `render()`.

## Constraints

- `render()` requires both `this.root` and `this._hass`; before HA pushes `hass`, the element is connected but renders nothing (`src/panel.ts:391`).
- The environment split relies on `process.env.NODE_ENV` being statically replaced at build time (`src/config/panel.ts:12`).
- Shadow-root styling depends on locating the running script via `document.currentScript || document.querySelector('script[src*="panel.js"]')` and stripping `panel.js$` from its URL (`src/panel.ts:137`). If the bundle is not named `panel.js`, CSS and `__LIEBE_ASSET_BASE_URL__` resolution break.
- `useIsHomeAssistant` and `isPanelPath` read `window.location`/`window.parent` directly, so they assume a browser DOM and are not SSR-safe.
- React is rendered in `StrictMode` (`src/panel.ts:396`), so effects double-invoke in development.
- The resurrection machinery assumes specific HA DOM structure (`partial-panel-resolver`, `ha-panel-iframe`, `.view`); these are internal HA selectors that can change across HA releases.

## Open Questions

- **Zero automated test coverage.** There are no tests exercising `LiebePanel`, `HomeAssistantContext`, `useIsHomeAssistant`, or `config/panel.ts`'s lifecycle behavior. The entire resurrection/keep-alive path is unverified by the suite; regressions here are only caught manually in a live HA instance.
- **Are the resurrection hacks still necessary?** The overridden `remove()`, parent observer, three intervals, and global guardian were added against July 2025 HA behavior (#132/#135). It is unknown whether current Home Assistant versions still remove the panel element on tab switch, i.e. whether some or all of this machinery is now dead weight (and a potential source of memory retention, since `window.__liebePanel` and intervals intentionally prevent GC).
- **Unguarded, verbose console logging.** Constructor, connect/disconnect, visibility, keep-alive, reconnect, and guardian paths all `console.log` unconditionally with an `instanceId`. There is no debug flag; this ships to production and can be noisy.
- **Competing re-append actors.** The parent observer, per-instance reconnect check, and the module-level guardian can all attempt to re-append the same element into different containers on overlapping timers. Their interaction is not coordinated and could theoretically thrash the element between containers.
- **Duplicate stylesheet accumulation.** The `document.head` clone is guarded by a `querySelector` on the exact `href`, but re-initialization paths and multiple instances (dev + prod) inject their own links; long-lived sessions could accumulate `<link>` nodes.
- **`initialized` never resets.** Once `true`, only the loss of `shadowRoot`/`root` forces re-init; if HA reused an element in an unexpected state, the guard could skip needed setup.

## References

- `src/panel.ts` — `LiebePanel` custom element and global guardian.
- `src/contexts/HomeAssistantContext.tsx` — `hass` types, provider, `useHomeAssistant`, `useHomeAssistantOptional`.
- `src/components/PanelApp.tsx` — React entry point.
- `src/components/KeepAlive.tsx` — camera portal cache (out of lifecycle scope; used by `CameraCard`).
- `src/hooks/useIsHomeAssistant.ts` — HA runtime detection.
- `src/config/panel.ts` — environment-aware panel config and path detection.
- `src/hooks/useEntityConnection.ts:30` — consumer of the `liebe-websocket-check` event.
- Git history: `251c41e` (PR #132), `c8bc464` (PR #135); `853ae28` (PR #131, WebRTC, unrelated).
- Related specs: `../entity-state/`, `../navigation/`, `../architecture/`.

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
