# Dashboard Configuration & Persistence

## Overview

The dashboard configuration subsystem owns the in-memory representation of a Liebe dashboard — the tree of screens, the current screen, view/edit mode, sidebar and theme state — and the persistence of that representation to `localStorage` and to portable JSON/YAML files. The store MUST be the single source of truth mutated exclusively through `dashboardActions`, and every mutation that changes shareable configuration MUST mark the state dirty so it can be auto-saved. The entire dashboard MUST be exportable as, and importable from, a single self-contained YAML (or JSON) document so a configuration can be shared or backed up as one file. Configuration import from untrusted files MUST validate at least the presence of a `version` string and a `screens` array before applying.

The set of shareable fields is a single **canonical portable contract**: `version`, `screens`, `theme`, `sidebarOpen`, `tabsExpanded`, and `sidebarWidgets`. `DashboardConfig`, the JSON export, the YAML export, and import MUST all serialize exactly this set, and `isDirty` MUST be set by exactly the mutations that change one of these fields — no more, no fewer. Device-local state (`mode`, persisted separately under `liebe-mode`, and the top-level `gridResolution`) is deliberately outside the contract: it never travels with the portable document and never marks it dirty.

This spec covers configuration _state and persistence_ only. Grid rendering and layout mechanics are specified in [../grid-layout/](../grid-layout/), the card components placed into grids in [../entity-cards/](../entity-cards/), and the sidebar/navigation UI structure in [../navigation/](../navigation/).

## Background

Liebe is a Home Assistant custom panel whose core design principle is _in-panel configuration_: users never edit files by hand. All structural changes happen live in an "edit mode", and the resulting configuration is a single serializable object that can be exported and shared as one YAML file (the "single-YAML-export" principle).

State is held in a TanStack `Store` (`dashboardStore`) and read through the `useDashboardStore` React hook. Mutations flow through a fixed set of action functions (`dashboardActions`). Persistence is a separate concern (`persistence.ts`): it subscribes to the store, mirrors the exported configuration into `localStorage` under stable keys, and provides file import/export plus a one-slot backup used to guard imports. A lightweight migration step upgrades older on-disk shapes (notably the pre-flat `grid.sections` format) on load and on import.

## Requirements

### Store Initialization & Shape

- The store MUST initialize in `view` mode with an empty `screens` array, `currentScreenId` of `null`, `gridResolution` of 12×8, `theme` of `auto`, `isDirty` false, `sidebarOpen` false, `tabsExpanded` false, and three default `sidebarWidgets` (`clock`, `weather`, `quick-controls`).
- All state reads by React components SHOULD go through `useDashboardStore(selector)`; all mutations MUST go through `dashboardActions`.

#### Scenario: Fresh store

- **GIVEN** no configuration has been loaded
- **WHEN** `dashboardStore.state` is read
- **THEN** `mode` is `view`, `screens` is `[]`, `currentScreenId` is `null`, `theme` is `auto`, and `isDirty` is `false`

### Dirty Tracking & Auto-Save

- Every action that changes a portable field (screens, grid items, theme, sidebar open/expanded, sidebar widgets) MUST set `isDirty` to `true`, and only those actions may. Device-local mutations — `setMode` and the top-level `setGridResolution` — MUST NOT set `isDirty`.
- `markClean()` MUST set `isDirty` to `false` without otherwise altering state.
- `loadConfiguration()` MUST leave `isDirty` `false` (a freshly loaded config is not a pending change).
- `useDashboardPersistence()` MUST subscribe to the store and, whenever `isDirty` is true, write the exported configuration to `localStorage` and then call `markClean()`. `useAutoSave(interval)` MUST perform the same save-if-dirty check on a timer (default 5000 ms).

#### Scenario: Mutation marks dirty, save clears it

- **GIVEN** `isDirty` is `false`
- **WHEN** `toggleSidebar(true)` is called
- **THEN** `isDirty` becomes `true`
- **WHEN** `markClean()` is then called
- **THEN** `isDirty` becomes `false`

### Screen Tree CRUD

- `addScreen(screen, parentId?)` MUST append `screen` to the top-level list when `parentId` is omitted, and MUST otherwise recursively locate `parentId` anywhere in the tree and append `screen` to that node's `children`.
- `removeScreen(screenId)` MUST recursively remove the matching node from anywhere in the tree, and MUST reset `currentScreenId` to `null` if it referenced the removed screen.
- `updateScreen(screenId, updates)` MUST recursively patch the matching node's `name`/`slug` only.
- `clearScreen(screenId)` MUST empty the matching screen's `grid.items` while preserving the screen and its grid resolution.
- All four MUST set `isDirty` true.

#### Scenario: Nested add

- **GIVEN** a top-level screen `A` exists
- **WHEN** `addScreen(B, 'A')` is called
- **THEN** `B` appears in `A.children` and `A` remains top-level

#### Scenario: Removing the current screen

- **GIVEN** `currentScreenId` is `'A'` and screen `A` exists
- **WHEN** `removeScreen('A')` is called
- **THEN** `A` is gone from the tree and `currentScreenId` is `null`

#### Scenario: Clear vs delete

- **GIVEN** screen `A` has grid items
- **WHEN** `clearScreen('A')` is called
- **THEN** `A` still exists but `A.grid.items` is `[]`

### Grid Item Mutations

- `addGridItem(screenId, item)` MUST append the item to the target screen's `grid.items`; when the item's `x` and `y` are both `0`, it MUST first compute an optimal position via `findOptimalPosition` before insertion.
- `updateGridItem(screenId, itemId, updates)` MUST shallow-merge `updates` into the matching item.
- `removeGridItem(screenId, itemId)` MUST drop the matching item.
- `reorderGrid(screenId)` MUST replace the screen's items with the result of `packGridItemsCompact` over the current items and resolution.
- All MUST set `isDirty` true. (Grid geometry/packing rules themselves are specified in [../grid-layout/](../grid-layout/).)

#### Scenario: Auto-position on default coordinates

- **GIVEN** a screen with existing items and a new item at `x:0, y:0`
- **WHEN** `addGridItem` is called
- **THEN** the inserted item's position is the value returned by `findOptimalPosition`, not `0,0`

### Mode Toggle & Persistence

- `setMode(mode)` MUST update `mode` and asynchronously persist the raw mode string to `localStorage` under `liebe-mode` (via a deferred import to avoid a circular dependency). Because `mode` is device-local and outside the portable contract, `setMode` MUST NOT set `isDirty` (a mode toggle MUST NOT rewrite `liebe-config`).
- `loadDashboardMode()` MUST return the stored mode only when it is exactly `'view'` or `'edit'`, and MUST default to `'view'` for a missing, invalid, or unreadable value.
- The `ModeToggle` component MUST toggle between `view` and `edit` on click and on the `Ctrl/⌘ + E` keyboard shortcut (preventing that event's default), and MUST remove its key listener on unmount.

#### Scenario: Invalid stored mode

- **GIVEN** `localStorage['liebe-mode']` is `'invalid-mode'`
- **WHEN** `loadDashboardMode()` is called
- **THEN** it returns `'view'`

#### Scenario: Keyboard toggle

- **GIVEN** the dashboard is in `view` mode and `ModeToggle` is mounted
- **WHEN** the user presses `Ctrl+E`
- **THEN** the default is prevented and `mode` becomes `edit`

#### Scenario: Mode switch does not rewrite config

- **GIVEN** a clean (non-dirty) dashboard
- **WHEN** the user toggles view/edit mode
- **THEN** `liebe-mode` is updated but `isDirty` stays `false` and `liebe-config` is not rewritten

### Theme Selection & Application

- `setTheme('light' | 'dark' | 'auto')` MUST update `theme` and set `isDirty` true.
- The `ConfigurationMenu` MUST expose a radio group bound to the current `theme` that calls `setTheme` for Light/Dark/System.
- The root component MUST map the stored theme to a Radix `Theme` `appearance`: `light`/`dark` pass through, and `auto` MUST resolve to the system `prefers-color-scheme`, updating live when the OS preference changes.

#### Scenario: Selecting Dark

- **GIVEN** the configuration menu is open with theme `auto`
- **WHEN** the user selects "Dark"
- **THEN** `dashboardStore.state.theme` is `dark`

#### Scenario: Auto follows system

- **GIVEN** `theme` is `auto`
- **WHEN** the system `prefers-color-scheme` is dark
- **THEN** the Radix `Theme` renders with `appearance="dark"`

### Sidebar & Tabs State

- `toggleSidebar(open?)` and `toggleTabsExpanded(expanded?)` MUST set the value explicitly when the argument is provided, otherwise invert the current value, and MUST set `isDirty` true.
- `sidebarOpen`, `tabsExpanded`, and `sidebarWidgets` MUST be included in `exportConfiguration()` and restored by `loadConfiguration()`, but `loadConfiguration()` MUST fall back to the existing store value (via `??`) when the incoming config omits them.
- The `sidebarWidgets` list is mutated by `updateSidebarWidgets`/`addSidebarWidget`/`removeSidebarWidget` (all set `isDirty` true) and IS part of the portable `DashboardConfig`, so it round-trips through JSON and YAML export/import. (Widget rendering belongs to [../navigation/](../navigation/).)

#### Scenario: Sidebar state round-trips through export

- **GIVEN** `toggleSidebar(true)` has been called
- **WHEN** `exportConfiguration()` is read
- **THEN** `config.sidebarOpen` is `true`

#### Scenario: Missing sidebar key preserves current value

- **GIVEN** `sidebarOpen` is `true` in the store
- **WHEN** a config without `sidebarOpen` is loaded
- **THEN** `sidebarOpen` remains `true` and `theme` takes the loaded value

### localStorage Persistence

- `saveDashboardConfig(config)` MUST write `JSON.stringify(config)` to `localStorage['liebe-config']`, and MUST swallow storage errors (log, no throw).
- `loadDashboardConfig()` MUST read `liebe-config`, `JSON.parse` it, run it through migration, and MUST return `null` on absence or parse error.
- `clearDashboardConfig()` MUST remove `liebe-config` and reset the store to initial state; it MUST throw `'Failed to reset configuration'` if `removeItem` fails.
- `initializeDashboard()` MUST load any saved config, then apply the saved mode; it runs once at module load when `window` is defined.

#### Scenario: Corrupt stored config

- **GIVEN** `localStorage['liebe-config']` holds `'invalid json'`
- **WHEN** `loadDashboardConfig()` is called
- **THEN** it returns `null` (no throw)

### File Export

- `exportConfigurationToFile()` MUST download the current configuration as pretty-printed JSON named `liebe-<YYYY-MM-DD>.json`.
- `exportConfigurationAsYAML()` MUST serialize the full canonical portable set — `version`, `theme` (defaulting to `auto`), `sidebarOpen`, `tabsExpanded`, `sidebarWidgets`, and `screens` — with leading comment keys — into a single YAML document, matching the JSON export field-for-field; `exportConfigurationToYAMLFile()` downloads it as `liebe-<YYYY-MM-DD>.yaml`, and `copyYAMLToClipboard()` writes it to the clipboard.

#### Scenario: YAML contains the whole dashboard

- **GIVEN** a configuration with an entity item and a separator item
- **WHEN** `exportConfigurationAsYAML()` is called
- **THEN** the output contains `version:`, `theme:`, `screens:`, `type: entity`, and `type: separator`

### File Import & Version Handling

- Both `parseConfigurationFromFile(file)` and `importConfigurationFromFile(file)` MUST select the parser by extension (`.yaml`/`.yml` → `js-yaml`, `.json` → `JSON.parse`) and reject any other extension.
- They MUST reject when the parsed object lacks a truthy `version` or a `screens` array (`'Invalid configuration format'`), and MUST run `checkVersionCompatibility`: a higher major version than `CURRENT_VERSION` (`1.0.0`) is rejected; a lower major is accepted with an upgrade message; equal is accepted silently.
- `parseConfigurationFromFile` MUST return `{ config, versionMessage? }` for preview WITHOUT mutating the store. `importConfigurationFromFile` MUST additionally back up the current config, migrate, force `version` to `CURRENT_VERSION`, load it into the store, and save it to `localStorage`.
- YAML and JSON syntax errors MUST be surfaced as `'Failed to parse YAML: …'` / `'Failed to parse JSON: …'` respectively.

#### Scenario: Import preview does not mutate

- **GIVEN** a valid `.yaml` file
- **WHEN** `parseConfigurationFromFile` resolves
- **THEN** the store is unchanged and the caller receives the parsed config for display in `ImportPreviewDialog`

#### Scenario: Reject invalid structure

- **GIVEN** a JSON file whose content is `{ "foo": "bar" }`
- **WHEN** `importConfigurationFromFile` is called
- **THEN** it rejects with `'Failed to import configuration: Invalid configuration format'`

### Backup & Restore

- `backupCurrentConfiguration()` MUST copy the raw `liebe-config` value into `liebe-config-backup` (no-op when nothing is stored).
- `restoreConfigurationFromBackup()` MUST copy the backup back to `liebe-config`, parse it, and load it into the store, throwing `'No backup found'` when absent.
- Import MUST take a backup before overwriting so a failed or unwanted import can be reverted; the `ConfigurationMenu` surfaces a "Restore Backup" affordance when an import error mentions a backup.

#### Scenario: Import backs up first

- **GIVEN** an existing stored configuration
- **WHEN** `importConfigurationFromFile` runs
- **THEN** `liebe-config-backup` holds the pre-import configuration

### Legacy Migration

- Migration MUST flatten any `grid.sections[].items` into a single `grid.items` array, MUST ensure a `grid.items` array exists, and MUST backfill a unique `slug` (derived from `name`) for screens lacking one, recursing into `children`.

#### Scenario: Sections flattened on load

- **GIVEN** a stored screen whose `grid` has two `sections`, each with one item
- **WHEN** `loadDashboardConfig()` runs
- **THEN** `screens[0].grid.items` has length 2 and no `sections` key remains

### Storage Usage Reporting

- `getStorageInfo()` MUST report the byte size of the current exported configuration, a `percentage` against a 5 MB estimate, and `available` (false at ≥ 90 %). The `ConfigurationMenu` displays used KB and percentage.

#### Scenario: Large config flagged

- **GIVEN** a configuration large enough to exceed 90 % of the estimated limit
- **WHEN** `getStorageInfo()` is called
- **THEN** `available` is `false` and `percentage` is greater than 90

### Screen Configuration Dialog

- `ScreenConfigDialog` MUST create a screen (default 12×8 grid, empty items, `type: 'grid'`, id `screen-<timestamp>`) or edit an existing screen's name/slug, auto-generating a unique slug from the name when the slug field is untouched and navigating to the resulting `/$slug`.
- In edit mode it MUST offer Reorder Grid (only when items exist), Clear Screen (disabled when empty, confirms), and Delete Screen (confirms, then navigates to a remaining screen or `/`).

#### Scenario: Delete from dialog

- **GIVEN** the edit dialog is open for a screen with siblings
- **WHEN** the user confirms Delete Screen
- **THEN** `removeScreen` is dispatched and navigation moves to a remaining screen

## Design

### Architecture

```
components (ConfigurationMenu, ModeToggle, ScreenConfigDialog, ImportPreviewDialog)
        │  read via useDashboardStore(selector)
        │  mutate via dashboardActions
        ▼
dashboardStore  ── TanStack Store<DashboardState>  (single source of truth)
        ▲                                   │ subscribe()
        │ loadConfiguration / actions       ▼
persistence.ts ──► localStorage  (liebe-config, liebe-mode, liebe-config-backup)
        └────────► File I/O (JSON / YAML), backup, migration, version check
routes/__root.tsx ──► maps state.theme → Radix <Theme appearance>
```

The store never touches `localStorage` directly; `dashboardStore.ts` reaches persistence only via a deferred dynamic `import('./persistence')` inside `setMode` to break the module cycle (`persistence.ts` imports the store at top level).

### Data Models

The exported/shared document — the single-YAML unit — is `DashboardConfig` (`src/store/types.ts:40`):

```typescript
export interface DashboardConfig {
  version: string
  screens: ScreenConfig[]
  theme?: 'light' | 'dark' | 'auto'
  sidebarOpen?: boolean
  tabsExpanded?: boolean
  sidebarWidgets?: WidgetConfig[]
}
```

These six fields are the canonical portable contract: `exportConfiguration` (JSON) and `exportConfigurationAsYAML` serialize exactly this set, and the import paths validate these fields via `dashboardConfigSchema` while tolerating unknown extra keys (`.passthrough()`) for forward compatibility.

Screens form a recursive tree (`src/store/types.ts:27`):

```typescript
export interface ScreenConfig {
  id: string
  name: string
  slug: string
  type: 'grid'
  parentId?: string
  children?: ScreenConfig[]
  grid?: {
    resolution: GridResolution
    items: GridItem[]
  }
}
```

Grid items are a discriminated-by-`type` union of entity/separator/text cards (`src/store/types.ts:6`); `config?: Record<string, unknown>` carries per-entity card configuration:

```typescript
export type GridItemType = 'entity' | 'separator' | 'text'

export interface GridItem {
  id: string
  type: GridItemType
  entityId?: string // Only required for entity type
  title?: string // Optional title for separators
  separatorOrientation?: 'horizontal' | 'vertical'
  separatorTextColor?: string
  content?: string // For text cards
  alignment?: 'left' | 'center' | 'right'
  textSize?: 'small' | 'medium' | 'large'
  textColor?: string
  hideBackground?: boolean
  config?: Record<string, unknown> // Entity-specific configuration
  x: number
  y: number
  width: number
  height: number
}
```

The full in-memory state is a superset of the exported config (`src/store/types.ts:59`):

```typescript
export interface DashboardState {
  mode: DashboardMode // 'view' | 'edit'
  screens: ScreenConfig[]
  currentScreenId: string | null
  configuration: DashboardConfig
  gridResolution: GridResolution
  theme: 'light' | 'dark' | 'auto'
  isDirty: boolean
  sidebarOpen: boolean
  tabsExpanded: boolean
  sidebarWidgets: WidgetConfig[]
}
```

Note the divergence: `gridResolution`, `mode`, `currentScreenId`, and `configuration` live in state but are NOT fields of `DashboardConfig`, so they are not part of the shared YAML. `mode` is persisted separately under `liebe-mode`; the top-level `gridResolution` is reset to the 12×8 default on load. `sidebarWidgets` IS a portable field and does travel with the document.

### API Surface

`dashboardActions` (`src/store/dashboardStore.ts:43`) — the only sanctioned mutators:

| Action                                                      | Effect                                       | Dirty           |
| ----------------------------------------------------------- | -------------------------------------------- | --------------- |
| `setMode(mode)`                                             | set mode; async-persist to `liebe-mode`      | —               |
| `setCurrentScreen(id)`                                      | set `currentScreenId`                        | —               |
| `addScreen(screen, parentId?)`                              | append top-level or into parent's children   | ✓               |
| `removeScreen(id)`                                          | recursive delete; null current if matched    | ✓               |
| `updateScreen(id, {name?, slug?})`                          | recursive patch                              | ✓               |
| `clearScreen(id)`                                           | empty `grid.items`                           | ✓               |
| `addGridItem/updateGridItem/removeGridItem`                 | grid item CRUD                               | ✓               |
| `reorderGrid(id)`                                           | compact-pack items                           | ✓               |
| `setTheme(theme)`                                           | set theme                                    | ✓               |
| `setGridResolution(res)`                                    | set top-level resolution (device-local)      | —               |
| `toggleSidebar/toggleTabsExpanded`                          | set-or-invert                                | ✓               |
| `updateSidebarWidgets/addSidebarWidget/removeSidebarWidget` | widget list CRUD                             | ✓               |
| `loadConfiguration(config)`                                 | replace tree/theme/sidebar; mode→view; clean | resets to false |
| `exportConfiguration()`                                     | derive `DashboardConfig` from state          | —               |
| `resetState()`                                              | back to `initialState`                       | resets to false |
| `markClean()`                                               | `isDirty = false`                            | —               |

`persistence.ts` free functions: `saveDashboardConfig`, `loadDashboardConfig`, `clearDashboardConfig`, `saveDashboardMode`, `loadDashboardMode`, `initializeDashboard`, `useDashboardPersistence`, `useAutoSave`, `exportConfigurationToFile`, `exportConfigurationToYAMLFile`, `exportConfigurationAsYAML`, `copyYAMLToClipboard`, `importConfigurationFromFile`, `parseConfigurationFromFile`, `backupCurrentConfiguration`, `restoreConfigurationFromBackup`, `checkVersionCompatibility`, `getStorageInfo`.

Storage keys (`src/store/persistence.ts:7`): `liebe-config`, `liebe-mode`, `liebe-config-backup`; `CURRENT_VERSION = '1.0.0'`.

### UI Components

- **`ConfigurationMenu`** (`src/components/ConfigurationMenu.tsx`) — dropdown for export (JSON / YAML / copy-YAML), import (opens the hidden file input, parses to a preview), storage readout, theme radio group, and a red Reset action guarded by an `AlertModal` (reset reloads the page). Import errors that mention "backup" render an inline Restore Backup button.
- **`ImportPreviewDialog`** (`src/components/ImportPreviewDialog.tsx`) — read-only summary (version, theme, recursive screen/item counts, indented screen tree) shown before an import is confirmed; returns `null` when `config` is `null`.
- **`ScreenConfigDialog`** (`src/components/ScreenConfigDialog.tsx`) — add/edit-a-view modal with name + slug fields (slug auto-derived and de-duplicated via `generateSlug`/`ensureUniqueSlug`/`getAllSlugs`), optional parent selection, and the Reorder / Clear / Delete management block in edit mode.
- **`ModeToggle`** (`src/components/ModeToggle.tsx`) — view/edit button plus the `Ctrl/⌘ + E` global shortcut.
- **`routes/__root.tsx`** — bridges `state.theme` to the Radix `Theme` `appearance`, resolving `auto` against `prefers-color-scheme` with a live media-query listener.

### Business Logic

- **Dirty/auto-save loop**: `useDashboardPersistence` subscribes once; on any dirty transition it exports and saves, then `markClean()` — meaning a store subscription drives the save, and `loadConfiguration` deliberately lands clean so loading never re-triggers a save.
- **Recursive tree edits**: add/remove/update/clear/grid actions all walk `screens` with a local `updateInTree`/`removeFromTree`/`addToParent` helper that maps immutably and recurses into `children`.
- **Migration**: `migrateScreenConfig` runs on both `loadDashboardConfig` and the two file-parse paths, flattening `grid.sections` → `grid.items`, guaranteeing an `items` array, and backfilling slugs.
- **Version gate**: only the _major_ component of the semver is compared against `1.0.0`; minor/patch differences are ignored.

## Constraints

- **Radix Theme, no custom CSS** — theme is applied through the Radix `Theme` `appearance` prop, not bespoke stylesheets.
- **Single-file portability** — a configuration MUST remain fully described by one `DashboardConfig` document so it can be exported/shared as one YAML (or JSON) file; anything not in `DashboardConfig` (mode, top-level grid resolution, current screen) does not travel with that file.
- **localStorage budget** — persistence targets a ~5 MB `localStorage` budget; `getStorageInfo` warns at 90 %.
- **Store-only mutation** — components MUST NOT mutate store state directly; all writes go through `dashboardActions`.
- **Backward compatibility on load** — older on-disk shapes MUST continue to load via migration rather than being rejected.

## Open Questions

- **`StoreActions` interface is stale.** The exported `StoreActions` type (`src/store/types.ts:72`) omits several actions that exist on `dashboardActions` (sidebar/tabs/widget toggles, `reorderGrid`) and types `updateScreen` more broadly than the implementation, which only patches `name`/`slug`.

## References

- `src/store/dashboardStore.ts` — store, initial state, `dashboardActions`
- `src/store/types.ts` — `DashboardConfig`, `ScreenConfig`, `GridItem`, `DashboardState`, `WidgetConfig`
- `src/store/persistence.ts` — localStorage/file persistence, migration, backup, version check
- `src/store/__tests__/persistence.test.ts`, `modePersistence.test.ts`, `sidebar-persistence.test.ts`
- `src/components/ConfigurationMenu.tsx` + `__tests__/ConfigurationMenu.test.tsx`, `__tests__/ThemeToggle.test.tsx`
- `src/components/ImportPreviewDialog.tsx`, `ScreenConfigDialog.tsx` + `__tests__/ScreenConfigDialog.test.tsx`, `ModeToggle.tsx` + `__tests__/ModeToggle.test.tsx`
- `src/routes/__root.tsx` — theme → Radix appearance mapping
- Related specs: [../grid-layout/](../grid-layout/), [../entity-cards/](../entity-cards/), [../navigation/](../navigation/)

## Changelog

| Date       | Change                                                                                                                                                          | Document                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2026-07-18 | Initial spec created (baseline of existing implementation)                                                                                                      | —                                                      |
| 2026-07-18 | Canonical portable contract: `sidebarWidgets` now portable, YAML carries `tabsExpanded`/`sidebarWidgets`, `setMode`/top-level `setGridResolution` stop dirtying | [0004](../../changes/0004-portable-config-contract.md) |
