# Navigation & Routing

## Overview

Liebe is a single-page dashboard that runs both standalone (local dev/GitHub Pages) and embedded as a Home Assistant custom panel. This spec covers how the application maps browser URLs to dashboard screens, how it stays in sync with Home Assistant's own router when embedded under a panel path, and the screen-tree navigation UI (taskbar + sidebar). Routing MUST be base-path aware so the same bundle works at `/`, `/liebe`, and `/liebe-dev`. Screens are addressed by URL-safe slugs, and the app MUST keep the active screen, the store's `currentScreenId`, and the URL consistent. Error and not-found states MUST be handled by dedicated boundary components.

## Background

The app is built on TanStack Router with a file-based route tree (`src/routeTree.gen.ts`, auto-generated — do not edit). When mounted as a Home Assistant custom panel, Home Assistant serves the app under a fixed URL prefix (`/liebe` in production, `/liebe-dev` in development), and the panel element controls that prefix. The router therefore has to detect the prefix at runtime and register it as its `basepath`, and a side-channel of `window` custom events keeps Liebe's internal navigation and Home Assistant's URL bar in agreement. Screen identity is not the route param directly but a slug resolved against the in-memory screen tree held in `dashboardStore`. Screen CRUD, slug assignment on create, and persistence live in the dashboard-config domain; this spec consumes those slugs and the tree but does not define how they are produced or saved.

## Requirements

### Base-path detection

The router MUST derive its base path from the current URL so the same bundle works standalone and under a Home Assistant panel prefix.

- The set of recognized panel paths MUST be `['/liebe', '/liebe-dev']` (`src/config/panel.ts:29`).
- `getPanelBasePath(pathname)` MUST return the matching panel path, checking more specific paths first, and MUST return `undefined` when no panel path is present (`src/config/panel.ts:38`).
- `createRouter()` MUST set the TanStack Router `basepath` to the detected panel path, and MUST leave it `undefined` (root-relative) when running outside a panel or during SSR/non-browser evaluation (`src/router.tsx:9`).
- `isPanelPath(pathname)` MUST return `true` when the pathname contains any recognized panel path (`src/config/panel.ts:33`).

#### Scenario: Embedded under the dev panel prefix

- **GIVEN** the app loads at `/liebe-dev/kitchen`
- **WHEN** `createRouter()` runs in the browser
- **THEN** `getPanelBasePath` returns `/liebe-dev` and the router is created with `basepath: '/liebe-dev'`, so `/kitchen` resolves to the `$slug` route.

#### Scenario: Standalone (no panel prefix)

- **GIVEN** the app loads at `/kitchen` (local dev or GitHub Pages)
- **WHEN** `createRouter()` runs
- **THEN** `getPanelBasePath` returns `undefined`, the router uses no base path, and `/kitchen` still resolves to the `$slug` route.

#### Scenario: Substring match, most-specific-first

- **GIVEN** a pathname containing `/liebe-dev`
- **WHEN** `getPanelBasePath` iterates the panel paths in reversed order
- **THEN** it returns `/liebe-dev` rather than `/liebe`, even though the string also contains the substring `liebe`.

### Route tree

The application MUST expose exactly the following routes under the root route (`src/routeTree.gen.ts:44`), each a file route under `src/routes/`.

- `/` (index) MUST redirect to the first screen when screens exist, otherwise render the dashboard shell (`src/routes/index.tsx`).
- `/$slug` MUST render the screen whose slug matches the param (`src/routes/$slug.tsx`).
- `/$` (catch-all splat) MUST render the `NotFound` component (`src/routes/$.tsx`).
- `/test-store` and `/test/performance` are development/diagnostic routes and are not part of the user-facing navigation surface.
- The root route MUST register `DefaultCatchBoundary` as its `errorComponent` and `NotFound` as its `notFoundComponent` (`src/routes/__root.tsx:15`).

#### Scenario: Index redirects to first screen

- **GIVEN** `dashboardStore.state.screens` is non-empty
- **WHEN** the `/` route's `beforeLoad` runs
- **THEN** it throws `redirect({ to: '/$slug', params: { slug: screens[0].slug } })`, navigating to the first screen (`src/routes/index.tsx:6`).

#### Scenario: Index with no screens

- **GIVEN** `dashboardStore.state.screens` is empty
- **WHEN** the `/` route loads
- **THEN** no redirect is thrown and the `Dashboard` component renders directly (the empty-state shell).

#### Scenario: Unknown top-level path

- **GIVEN** a URL that matches neither `/` nor a known screen slug in a way the router resolves as a screen
- **WHEN** the splat route `/$` matches
- **THEN** the `NotFound` component renders.

### Slug-based screen resolution

The `$slug` route MUST resolve the URL slug to a screen in the (possibly nested) screen tree and MUST keep `currentScreenId` in sync.

- Resolution MUST search the screen tree recursively, matching `screen.slug` and descending into `screen.children` (`src/routes/$slug.tsx:18`).
- When a screen is found and differs from the current one, the route MUST call `dashboardActions.setCurrentScreen(screen.id)` (`src/routes/$slug.tsx:37`).
- When the screen tree is empty (not yet loaded), the route MUST navigate to `/` and render a transient "redirecting to home" message (`src/routes/$slug.tsx:44`).
- When the tree is loaded but no screen matches the slug, the route MUST render a "Screen Not Found" message that echoes the requested slug (`src/routes/$slug.tsx:58`).

#### Scenario: Resolve a top-level screen

- **GIVEN** screens `[{id: 'screen-1', slug: 'living-room'}, {id: 'screen-2', slug: 'kitchen'}]`
- **WHEN** `findScreenBySlug(screens, 'living-room')` runs
- **THEN** it returns the screen with `id: 'screen-1'` (`src/routes/__tests__/$slug.test.tsx:42`).

#### Scenario: Resolve a nested (child) screen

- **GIVEN** a parent screen `home` with children including `{id: 'child-2', slug: 'bedroom'}`
- **WHEN** `findScreenBySlug(screens, 'bedroom')` runs
- **THEN** it returns the child screen `id: 'child-2'`, proving recursion into `children` (`src/routes/__tests__/$slug.test.tsx:61`).

#### Scenario: Unknown slug returns null

- **GIVEN** a loaded, non-empty screen tree
- **WHEN** `findScreenBySlug(screens, 'non-existent')` runs
- **THEN** it returns `null`, and the route renders the "Screen Not Found" message (`src/routes/__tests__/$slug.test.tsx:87`).

#### Scenario: Active screen synced to URL

- **GIVEN** screens `[living-room, kitchen]` and `currentScreenId` is `null`
- **WHEN** the `kitchen` screen is resolved and `setCurrentScreen` is called with its id
- **THEN** `dashboardStore.state.currentScreenId` becomes `screen-2` (`src/routes/__tests__/$slug.test.tsx:107`).

### Slug generation and uniqueness

Slugs used in URLs MUST be URL-safe and unique within the screen tree. (Screen creation invokes these helpers; the helpers themselves are defined here.)

- `generateSlug(name)` MUST lowercase, trim, strip characters outside `[\w\s-]`, collapse whitespace/underscores/hyphens to single hyphens, and strip leading/trailing hyphens (`src/utils/slug.ts:4`).
- `ensureUniqueSlug(base, existing)` MUST return `base` when unused, otherwise append `-1`, `-2`, … choosing the first unused suffix (`src/utils/slug.ts:16`).
- `getAllSlugs(screens)` MUST collect slugs from the entire tree, descending into `children` (`src/utils/slug.ts:40`).

#### Scenario: Human name to slug

- **GIVEN** the name `"Master Bedroom"`
- **WHEN** `generateSlug` runs
- **THEN** it returns `"master-bedroom"` (`src/utils/__tests__/slug.test.ts:11`).

#### Scenario: Special and unicode characters

- **GIVEN** names `"Test & Demo"`, `"Room #1"`, `"Café Room"`
- **WHEN** `generateSlug` runs
- **THEN** it returns `"test-demo"`, `"room-1"`, and `"caf-room"` respectively (unicode is stripped, not transliterated) (`src/utils/__tests__/slug.test.ts:14`).

#### Scenario: Collision resolution

- **GIVEN** existing slugs `['living-room', 'living-room-1', 'living-room-2', 'living-room-4']`
- **WHEN** `ensureUniqueSlug('living-room', existing)` runs
- **THEN** it returns `'living-room-3'` (first available gap) (`src/utils/__tests__/slug.test.ts:59`).

#### Scenario: Collect slugs from a nested tree

- **GIVEN** a tree with nested children under `home` and `upstairs`
- **WHEN** `getAllSlugs` runs
- **THEN** it returns every slug in depth-first order, e.g. `['home', 'living-room', 'upstairs', 'bedroom', 'bathroom', 'garage']` (`src/utils/__tests__/slug.test.ts:97`).

### Home Assistant routing sync

When embedded in a Home Assistant panel, the app MUST bridge its internal router to Home Assistant via `window` custom events; when not embedded, it MUST NOT install any listeners.

- `useHomeAssistantRouting` MUST no-op (install nothing) when `isPanelPath(window.location.pathname)` is false (`src/hooks/useHomeAssistantRouting.ts:13`).
- When embedded, it MUST subscribe to the router's `onResolved` event and, on each resolution, dispatch a `liebe-route-change` `CustomEvent` whose `detail.path` is the current router pathname (`src/hooks/useHomeAssistantRouting.ts:19`).
- When embedded, it MUST listen for `liebe-navigate` events and call `router.navigate({ to: detail.path })` for each (`src/hooks/useHomeAssistantRouting.ts:31`).
- It MUST remove the `liebe-navigate` listener and unsubscribe from the router on unmount (`src/hooks/useHomeAssistantRouting.ts:40`).

#### Scenario: Outbound route change notifies Home Assistant

- **GIVEN** the app is at a panel path and mounted
- **WHEN** the router resolves a navigation (the `onResolved` callback fires)
- **THEN** a `liebe-route-change` event is dispatched with `detail.path` equal to the router's current pathname (`src/hooks/__tests__/useHomeAssistantRouting.test.ts:81`).

#### Scenario: Inbound navigation from the panel element

- **GIVEN** the app is at a panel path and mounted
- **WHEN** a `liebe-navigate` event fires with `detail.path = '/custom-path'`
- **THEN** the hook calls `router.navigate({ to: '/custom-path' })` (`src/hooks/__tests__/useHomeAssistantRouting.test.ts:106`).

#### Scenario: No-op outside Home Assistant

- **GIVEN** the pathname is `/some-other-path`
- **WHEN** the hook mounts
- **THEN** it neither subscribes to the router nor registers a `liebe-navigate` listener (`src/hooks/__tests__/useHomeAssistantRouting.test.ts:146`).

#### Scenario: Cleanup on unmount

- **GIVEN** the hook is mounted at a panel path
- **WHEN** the component unmounts
- **THEN** the `liebe-navigate` listener is removed (`src/hooks/__tests__/useHomeAssistantRouting.test.ts:128`).

### Environment detection

The app MUST detect whether it is running inside Home Assistant to adjust behavior (e.g. hiding router devtools).

- `useIsHomeAssistant` MUST return `true` when any of these hold: a Home Assistant context is present, the pathname is a panel path, or the app runs inside an iframe (`window.parent !== window`) (`src/hooks/useIsHomeAssistant.ts:8`).
- The router devtools MUST render only when NOT in Home Assistant (`src/routes/__root.tsx:67`).

#### Scenario: Devtools hidden inside Home Assistant

- **GIVEN** `useIsHomeAssistant()` returns `true`
- **WHEN** the root component renders
- **THEN** `TanStackRouterDevtools` is not rendered.

### Screen-tree navigation UI

The app MUST provide a persistent taskbar for switching screens and toggling the sidebar, and a collapsible sidebar for widgets.

- The taskbar MUST render one button per top-level screen, using a `HomeIcon` for the first screen and `ViewGridIcon` for the rest (`src/components/AppTaskbar.tsx:88`).
- The button for the screen matching `currentScreenId` MUST use the `solid` variant; the others MUST use `soft` (`src/components/AppTaskbar.tsx:94`).
- Clicking a screen button MUST call `setCurrentScreen(id)` and then `navigate({ to: '/$slug', params: { slug: screen.slug } })` (`src/components/AppTaskbar.tsx:52`).
- The taskbar MUST support an expanded/collapsed state (`tabsExpanded`): collapsed shows icons only, expanded shows icons + labels and widens to 200px (`src/components/AppTaskbar.css:12`).
- The sidebar toggle button MUST reflect `sidebarOpen` (filled vs outline heart) and toggle it (`src/components/AppTaskbar.tsx:76`).
- The sidebar MUST render nothing when `sidebarOpen` is false, and on mobile (`max-width: 768px`) MUST render full-width and fixed-position over the content (`src/components/Sidebar.tsx:16`, `src/components/Sidebar.css:15`).
- In edit mode with an active screen, the taskbar MUST additionally render "Add Screen" and "Add Item" controls that dispatch `addScreen` / `addItem` window events (`src/components/AppTaskbar.tsx:107`).
- Screen buttons in edit mode MUST expose an edit affordance that dispatches an `editScreen` window event (`src/components/AppTaskbar.tsx:97`, `src/components/ScreenTaskbarButton.tsx:27`).

#### Scenario: Switch screens from the taskbar

- **GIVEN** the taskbar is rendered with screens loaded
- **WHEN** the user clicks the button for a screen with slug `kitchen`
- **THEN** `setCurrentScreen` is called with that screen's id and the router navigates to `/$slug` with `params.slug = 'kitchen'`, keeping URL and active screen in sync.

#### Scenario: Active screen highlighted

- **GIVEN** `currentScreenId` equals a given screen's id
- **WHEN** the taskbar renders that screen's button
- **THEN** the button uses the `solid` variant while the others use `soft`.

#### Scenario: Edit affordances only in edit mode

- **GIVEN** the store `mode` is `view`
- **WHEN** the taskbar and screen buttons render
- **THEN** no per-screen edit button and no Add Screen / Add Item controls are shown; switching `mode` to `edit` (with an active screen) reveals them.

### Error and not-found boundaries

The app MUST present recoverable error and not-found UIs rather than crashing.

- `DefaultCatchBoundary` MUST render the error, offer a "Try Again" action that calls `router.invalidate()`, and offer a home/back link depending on whether the failing match is the root route (`src/components/DefaultCatchBoundary.tsx:4`).
- `NotFound` MUST offer a "Go back" (history back) button and a "Start Over" link to `/` (`src/components/NotFound.tsx:3`).
- Both components are wired as router-level defaults in `createRouter()` and on the root route (`src/router.tsx:19`, `src/routes/__root.tsx:16`).

#### Scenario: Retry after a route error

- **GIVEN** a route threw during load and `DefaultCatchBoundary` is shown
- **WHEN** the user clicks "Try Again"
- **THEN** `router.invalidate()` re-runs the route, attempting recovery.

## Design

### Architecture

Routing is layered:

1. **File routes** (`src/routes/`) compiled into `src/routeTree.gen.ts` (generated).
2. **Router factory** (`src/router.tsx`) that injects the runtime base path and default boundaries.
3. **Panel-path config** (`src/config/panel.ts`) — the single source of truth for which URL prefixes count as "inside Home Assistant".
4. **HA sync hook** (`src/hooks/useHomeAssistantRouting.ts`) bridging the router to `window` custom events.
5. **Navigation UI** (`AppTaskbar`, `Sidebar`, `SidebarWidgets`, `TaskbarButton`, `ScreenTaskbarButton`) reading/writing `dashboardStore` and calling `navigate`.

The store's `currentScreenId` and the URL slug are two representations of the same "active screen" fact; the `$slug` route (URL → store) and the taskbar click handler (store + URL together) both keep them aligned.

```
src/router.tsx (createRouter → basepath) ─┐
src/config/panel.ts (getPanelBasePath)  ──┤→ TanStack Router ── routeTree.gen.ts
                                          │        │
useHomeAssistantRouting ◄─ onResolved ────┘        ├─ / (index → redirect first screen)
   │  ▲                                            ├─ /$slug (findScreenBySlug → setCurrentScreen)
   ▼  │ liebe-navigate                             ├─ /$ (NotFound)
window events ◄──► Home Assistant panel            └─ __root (Theme, boundaries, devtools)
```

### Data Models

`PanelConfig` (`src/config/panel.ts:5`):

```typescript
export interface PanelConfig {
  elementName: string // custom element name ('liebe-panel' | 'liebe-panel-dev')
  urlPath: string // '/liebe' | '/liebe-dev'
}
```

Navigation consumes `ScreenConfig` from the store (`src/store/types.ts`), of which the routing-relevant fields are:

```typescript
interface ScreenConfig {
  id: string
  name: string
  slug: string
  children?: ScreenConfig[]
  // grid, type, etc. — see dashboard-config spec
}
```

### API Surface

Panel-path helpers (`src/config/panel.ts`):

```typescript
getPanelConfig(): PanelConfig          // env-aware element name + url path
getAllPanelPaths(): string[]           // ['/liebe', '/liebe-dev']
isPanelPath(pathname: string): boolean // pathname contains any panel path
getPanelBasePath(pathname: string): string | undefined // most-specific match
```

Slug helpers (`src/utils/slug.ts`):

```typescript
generateSlug(name: string): string
ensureUniqueSlug(baseSlug: string, existingSlugs: string[]): string
getAllSlugs(screens: ScreenWithSlug[]): string[]
```

Window custom-event contract (HA sync):

- Outbound: `liebe-route-change`, `detail: { path: string }`
- Inbound: `liebe-navigate`, `detail: { path: string }`
- Also emitted by the taskbar for the panel-lifecycle/edit layer: `addScreen`, `addItem` (`detail.screenId`), `editScreen` (`detail.screen`).

### UI Components

- **AppTaskbar** (`src/components/AppTaskbar.tsx`) — vertical rail: expand/collapse toggle, sidebar toggle, one button per top-level screen, spacer, then (edit-mode) add controls plus `ConnectionStatus`, `ModeToggle`, `ConfigurationMenu`. Reads `sidebarOpen`, `tabsExpanded`, `screens`, `currentScreenId`, `mode` from the store.
- **TaskbarButton** (`src/components/TaskbarButton.tsx`) — renders a Radix `Button` (with label) when `showText`, else an `IconButton`; size `3` for touch targets.
- **ScreenTaskbarButton** (`src/components/ScreenTaskbarButton.tsx`) — a screen button with an inline (expanded) or corner-badge (collapsed) edit `IconButton` shown only in edit mode.
- **Sidebar** (`src/components/Sidebar.tsx` + `.css`) — a `ScrollArea` panel gated on `sidebarOpen`; fixed full-width overlay on mobile.
- **SidebarWidgets** (`src/components/SidebarWidgets.tsx`) — renders sidebar widgets (clock/weather/quick-controls) sorted by `position`; widget config UI is out of scope here.

### Business Logic

Screen resolution is a recursive depth-first search used identically in three places — the `$slug` route (`findScreenBySlug`), the taskbar click handler (`findScreenById`), and `getAllSlugs`/tree walks. Example (`src/routes/$slug.tsx:18`):

```typescript
const findScreenBySlug = (screenList, targetSlug) => {
  for (const screen of screenList) {
    if (screen.slug === targetSlug) return screen
    if (screen.children) {
      const found = findScreenBySlug(screen.children, targetSlug)
      if (found) return found
    }
  }
  return null
}
```

Base-path detection reverses the panel-path list so the longer, more specific prefix wins on substring match (`src/config/panel.ts:41`):

```typescript
for (const path of paths.reverse()) {
  if (pathname.includes(path)) return path
}
return undefined
```

## Constraints

- `src/routeTree.gen.ts` is generated by TanStack Router and MUST NOT be hand-edited; route changes are made by adding/renaming files in `src/routes/`.
- Base-path detection uses `pathname.includes(path)` (substring match), not a prefix/segment match — a screen slug that happens to contain the literal `liebe` would still be matched by substring; this is accepted because slugs render under the panel prefix, not as siblings of it.
- `getPanelBasePath` mutates the array returned by `getAllPanelPaths` via `.reverse()`; this is safe only because `getAllPanelPaths` returns a fresh array on each call.
- Panel paths are hard-coded to `/liebe` and `/liebe-dev`; supporting additional custom `url_path` values would require changing `getAllPanelPaths`.
- `useIsHomeAssistant` and `useHomeAssistantRouting` read `window.location`/`window.parent` directly and therefore assume a browser environment; the router factory guards `window` access for non-browser evaluation but these hooks run only client-side.
- Slug generation strips (does not transliterate) non-ASCII characters, so `"Café"` becomes `"caf"`; distinct names can collapse to the same base slug and rely on `ensureUniqueSlug` for disambiguation.

## Open Questions

- Substring matching in `isPanelPath`/`getPanelBasePath` could theoretically mismatch if Home Assistant were configured with a `url_path` that is a superstring/substring of another; no guard exists. Is a stricter segment match warranted?
- The `$slug` route renders a static "Screen Not Found" message but does not surface the router-level `NotFound` component for unknown slugs; whether these two not-found experiences should be unified is unresolved.
- Deep-linking directly to a nested child slug works via `findScreenBySlug`, but the taskbar only renders top-level screens — nested-screen navigation UI (breadcrumbs/expansion) is not present.

## References

- Router factory & base path: `src/router.tsx`
- Panel path config: `src/config/panel.ts`
- Route tree (generated): `src/routeTree.gen.ts`
- Routes: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/$.tsx`
- HA routing sync: `src/hooks/useHomeAssistantRouting.ts` (tests: `src/hooks/__tests__/useHomeAssistantRouting.test.ts`)
- Environment detection: `src/hooks/useIsHomeAssistant.ts`
- Slug utilities: `src/utils/slug.ts` (tests: `src/utils/__tests__/slug.test.ts`)
- Slug route logic tests: `src/routes/__tests__/$slug.test.tsx`
- Navigation UI: `src/components/AppTaskbar.tsx` (+ `.css`), `src/components/Sidebar.tsx` (+ `.css`), `src/components/SidebarWidgets.tsx`, `src/components/TaskbarButton.tsx`, `src/components/ScreenTaskbarButton.tsx`
- Boundaries: `src/components/DefaultCatchBoundary.tsx`, `src/components/NotFound.tsx`
- Layout host: `src/components/Dashboard.tsx`
- Related specs: screen CRUD/persistence & theme — `../dashboard-config/`; panel element registration & lifecycle — `../panel-lifecycle/`

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
