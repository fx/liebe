# Grid Layout System

## Overview

The grid layout system renders each dashboard screen as a responsive, react-grid-layout–backed grid onto which users freely place cards. Grid items MUST be one of three item types — `entity`, `separator`, or `text` — and each item's stored `x`/`y`/`width`/`height` MUST be interpreted against the screen's base resolution. In view mode the grid MUST be static (no drag or resize); in edit mode items MUST be draggable and resizable, and layout changes MUST persist back to the dashboard store. All interactive controls SHOULD honour the project's touch-first sizing requirements.

## Background

Liebe organises a dashboard into a tree of screens; each screen of type `grid` carries a `grid` object with a `resolution` (`{ columns, rows }`) and an ordered array of `GridItem`s (`src/store/types.ts:27`). The grid layout system is the rendering and interaction layer that turns those stored items into a live, editable canvas.

Rendering flows top-down: `src/components/Dashboard.tsx` selects the current screen and, when it has items, renders `GridView` (`src/components/Dashboard.tsx:94`). `GridView` owns selection/delete/config UI state and dispatches each item to the correct card via a render-prop child, while delegating the actual grid mechanics to `GridLayoutSection`, which wraps `react-grid-layout`. Shared card chrome (selection border, delete/configure buttons, loading/error/stale states, fullscreen overlay) lives in `GridCard`. Supporting pure utilities compute new-item placement (`src/utils/gridPositioning.ts`), compaction (`src/utils/gridPacking.ts`), and default card sizes (`src/utils/cardDimensions.ts`).

This spec is the living baseline of the grid layout system as implemented. Entity card internals are out of scope (see `../entity-cards/`); store mutation and persistence semantics are out of scope (see `../dashboard-config/`).

## Requirements

### Screen-to-Grid Rendering

- The dashboard MUST render `GridView` for the current screen only when that screen has a `grid` with at least one item; otherwise it MUST render an empty-state prompt with an "Add Items" action.
- `GridView` MUST pass the screen's `id`, `grid.items`, and `grid.resolution` into the grid.
- The grid MUST render exactly one DOM cell per `GridItem`, keyed by `item.id`, so React reconciliation is stable across reorders.

#### Scenario: Screen with items renders the grid

- **GIVEN** the current screen's `grid.items` is non-empty
- **WHEN** `Dashboard` renders
- **THEN** it renders `<GridView>` with `screenId`, `items`, and `resolution` (`src/components/Dashboard.tsx:94`)

#### Scenario: Screen without items renders empty state

- **GIVEN** the current screen has no grid items
- **WHEN** `Dashboard` renders
- **THEN** it shows a card reading "No items added yet" with an "Add Items" button (`src/components/Dashboard.tsx:100`)

#### Scenario: Stable keys across reorder

- **GIVEN** a grid with items `item-1`, `item-2`, `item-3`
- **WHEN** the `items` prop is re-ordered
- **THEN** each item is still rendered under its original id (`src/components/__tests__/GridLayoutSection.test.tsx:248`)

### Item-Type Dispatch

- For each `GridItem`, `GridView` MUST render a component chosen by `item.type`: `text` → `TextCard`, `separator` → `Separator`, `entity` → `EntityCard` wrapped in an `EntityErrorBoundary`.
- Any unrecognised `item.type` MUST render nothing (`return null`).
- Only `entity` items MUST be wrapped in an error boundary; `text` and `separator` items are rendered directly.

#### Scenario: Entity item is error-boundary wrapped

- **GIVEN** an item with `type: 'entity'` and an `entityId`
- **WHEN** `GridView` renders it
- **THEN** it renders `<EntityErrorBoundary><EntityCard entityId={item.entityId!} .../></EntityErrorBoundary>` (`src/components/GridView.tsx:235`)

#### Scenario: Unknown item type renders nothing

- **GIVEN** an item whose `type` is none of `text`/`separator`/`entity`
- **WHEN** `GridView` renders it
- **THEN** the render-prop returns `null` (`src/components/GridView.tsx:256`)

### Entity Card Selection via Registry

- `EntityCard` MUST resolve the card component from the entity domain using `cardRegistry`: if `item.config.variant` is set it MUST first try `getCardVariant(domain, variant)`; otherwise (or on miss) it MUST fall back to `getCardForEntity(entityId)`.
- If no registry entry matches the domain, `EntityCard` MUST fall back to `ButtonCard`.
- `EntityCard` MUST forward `entityId`, `size`, `onDelete`, `isSelected`, `onSelect`, the item's `config`, and the `item` itself to the resolved card.

#### Scenario: Variant is preferred when configured

- **GIVEN** an entity item whose `config.variant` names a registered variant for its domain
- **WHEN** `EntityCard` resolves the component
- **THEN** it uses `getCardVariant(domain, variant)` (`src/components/GridView.tsx:53`)

#### Scenario: Unmapped domain falls back to ButtonCard

- **GIVEN** an entity in a domain with no registry entry and no variant
- **WHEN** `EntityCard` resolves the component
- **THEN** it renders `<ButtonCard {...cardProps} />` (`src/components/GridView.tsx:66`)

### Size Derived From Item Dimensions

- Each item type MUST derive its card `size` prop from the item's grid footprint using the same thresholds: `large` when `width >= 4 && height >= 3`, else `medium` when `width >= 3 && height >= 2`, else `small`.

#### Scenario: Large card

- **GIVEN** an item with `width: 4, height: 3`
- **WHEN** its size is computed
- **THEN** it resolves to `'large'` (`src/components/GridView.tsx:171`, `:189`, `:241`)

#### Scenario: Small card

- **GIVEN** an item with `width: 2, height: 2`
- **WHEN** its size is computed
- **THEN** neither the `large` nor `medium` threshold is met, so it resolves to `'small'`

### react-grid-layout Integration

- `GridLayoutSection` MUST convert every `GridItem` to a react-grid-layout `Layout` entry `{ i, x, y, w, h, minW: 1, minH: 1, isDraggable, isResizable }`, where `isDraggable`/`isResizable` equal the edit-mode flag.
- The grid MUST disable auto-compaction (`compactType={null}`) and prevent overlap (`preventCollision={true}`) so user positions are preserved.
- The grid MUST use `margin` and `containerPadding` from the responsive config for the current breakpoint.
- The grid MUST NOT define a specific drag handle — the entire card MUST be draggable — but MUST cancel drags that begin on interactive elements via `draggableCancel="button, input, textarea, select, [role='button'], .no-drag"`.
- In edit mode the grid MUST expose eight resize handles (`['se','sw','ne','nw','e','w','n','s']`); in view mode it MUST expose none (`[]`).

#### Scenario: GridItem converts to Layout

- **GIVEN** an item `{ id: 'item-1', x: 0, y: 0, width: 2, height: 2 }` at desktop resolution
- **WHEN** `GridLayoutSection` builds the layout
- **THEN** the emitted entry matches `{ i: 'item-1', x: 0, y: 0, w: 2, h: 2, minW: 1, minH: 1, isDraggable: true, isResizable: true }` (`src/components/__tests__/GridLayoutSection.test.tsx:141`)

#### Scenario: Edit mode enables interaction

- **GIVEN** `isEditMode` is true
- **WHEN** the grid renders
- **THEN** the react-grid-layout is draggable and resizable (`src/components/__tests__/GridLayoutSection.test.tsx:154`)

#### Scenario: View mode disables interaction

- **GIVEN** `isEditMode` is false
- **WHEN** the grid renders
- **THEN** the grid is neither draggable nor resizable (`src/components/__tests__/GridLayoutSection.test.tsx:162`)

#### Scenario: Whole card is the drag surface

- **GIVEN** the grid is in edit mode
- **WHEN** it renders
- **THEN** no `draggableHandle` is set (`src/components/__tests__/GridLayoutSection.test.tsx:170`)

### Responsive Column Scaling

- For `desktop` and `wide` breakpoints the grid MUST use the screen's stored `resolution.columns`; for `mobile` and `tablet` it MUST use the breakpoint's configured column count (4 and 8 respectively).
- When the effective column count differs from the stored resolution, item `x` and `width` MUST be scaled by `effectiveColumns / resolution.columns`, with `width` clamped to at least 1 and `x` clamped so the item stays in bounds.
- Row height MUST be computed as `floor(containerWidth / effectiveColumns)`, and `containerWidth` MUST be measured from the live container via a `ResizeObserver`.

#### Scenario: Desktop uses stored columns

- **GIVEN** breakpoint `desktop` and `resolution.columns = 12`
- **WHEN** effective columns are computed
- **THEN** `effectiveColumns === 12` (`src/components/GridLayoutSection.tsx:28`)

#### Scenario: Container resize is observed

- **GIVEN** a mounted grid
- **WHEN** the container mounts and later unmounts
- **THEN** a `ResizeObserver` observes the container and is disconnected on unmount (`src/components/__tests__/GridLayoutSection.test.tsx:261`)

### Layout-Change Persistence

- On every react-grid-layout `onLayoutChange`, the grid MUST scale each changed item's `x`/`width` back to the stored resolution (`resolution.columns / effectiveColumns`) and persist via `dashboardActions.updateGridItem(screenId, id, { x, y, width, height })`.
- The grid MUST persist ONLY items whose scaled position or size actually differs from the stored item; unchanged items MUST NOT trigger an update.

#### Scenario: Moved item is persisted

- **GIVEN** `item-1` at `x: 0` is dragged to `x: 1`
- **WHEN** `onLayoutChange` fires
- **THEN** `updateGridItem('screen-1', 'item-1', { x: 1, y: 0, width: 2, height: 2 })` is called (`src/components/__tests__/GridLayoutSection.test.tsx:178`)

#### Scenario: Only changed items update

- **GIVEN** a layout change touching a single item
- **WHEN** `onLayoutChange` fires
- **THEN** `updateGridItem` is called exactly once (`src/components/__tests__/GridLayoutSection.test.tsx:196`)

### Card Chrome (GridCard)

- `GridCard` MUST render selection state only in edit mode: a selected card MUST use a blue border (`--blue-7`) and blue background (`--blue-3`); an error card MUST use a red border (`--red-6`); an unavailable card MUST use a dotted gray border and 50% opacity.
- Stale state MUST be tracked but MUST NOT be rendered visually.
- Delete and configure buttons MUST appear only in edit mode, only when their handlers/flags are present, and MUST NOT appear while the card is fullscreen; each MUST `stopPropagation` so it does not trigger card selection.
- A click MUST call `onSelect` in edit mode and `onClick` in view mode (never both).
- Fullscreen content MUST render through a `createPortal` overlay on `document.body` (escaping the shadow DOM) and MUST be dismissable via click or the `Escape` key.

#### Scenario: Selected card in edit mode is highlighted

- **GIVEN** `isSelected` and edit mode
- **WHEN** `GridCard` renders
- **THEN** it applies a `--blue-7` border and `--blue-3` background (`src/components/GridCard.tsx:111`, `:127`)

#### Scenario: Stale is not shown

- **GIVEN** `isStale` is true
- **WHEN** `GridCard` renders
- **THEN** no stale-specific styling is applied (`src/components/GridCard.tsx:123`)

#### Scenario: Action button does not select the card

- **GIVEN** edit mode with a delete handler
- **WHEN** the delete button is clicked
- **THEN** `stopPropagation` runs and only `onDelete` fires (`src/components/GridCard.tsx:218`)

### Selection, Deletion, and Keyboard Shortcuts

- In edit mode `GridView` MUST support multi-select; deleting a single item MUST open a confirm dialog, and confirming MUST call `dashboardActions.removeGridItem`.
- Bulk delete MUST be available: pressing `Delete` with a non-empty selection MUST open a confirm dialog whose copy reflects the selection count, and confirming MUST remove every selected item.
- `Escape` MUST clear the current selection; `Ctrl/Cmd+A` MUST select all items. These shortcuts MUST be active only in edit mode.

#### Scenario: Select-all shortcut

- **GIVEN** edit mode with three items
- **WHEN** the user presses `Ctrl/Cmd+A`
- **THEN** all three item ids become selected (`src/components/GridView.tsx:144`)

#### Scenario: Bulk delete confirmation copy

- **GIVEN** two selected items and a pending bulk delete
- **WHEN** the confirm dialog renders
- **THEN** its title reads "Delete 2 items?" (`src/components/GridView.tsx:271`)

### Card Configuration

- When an item exposes a configure action, `GridView` MUST open `CardConfig.Modal` for that item and, on save, MUST persist the partial update via `dashboardActions.updateGridItem`.

#### Scenario: Saving card config persists updates

- **GIVEN** a configurable item open in the config modal
- **WHEN** the user saves changes
- **THEN** `updateGridItem(screenId, item.id, updates)` is called (`src/components/GridView.tsx:121`)

### Separator Item Type

- A `separator` item MUST render a horizontal or vertical divider (default horizontal) with an optional centered title, using `separatorOrientation` and `separatorTextColor` from the item.
- In edit mode a separator MUST toggle selection on click and MUST show a blue selected background; in view mode it MUST be non-interactive.
- The separator's default footprint MUST be `4×1`.

#### Scenario: Vertical separator

- **GIVEN** a separator with `separatorOrientation: 'vertical'`
- **WHEN** it renders
- **THEN** the divider is drawn as a vertical rule with vertically-oriented title text (`src/components/Separator.tsx:43`)

### Text Item Type

- A `text` item MUST render its `config.content` (falling back to props then `"Double-click to edit"`) as Markdown in view mode, honouring `alignment`, `textSize`, and `textColor`.
- In edit mode the text card MUST render an editable `TextArea` and persist edits via `dashboardActions.updateGridItem`.
- The text card's default footprint MUST be `3×2`.

#### Scenario: Markdown rendering in view mode

- **GIVEN** a text item with markdown content
- **WHEN** it renders in view mode
- **THEN** the content is rendered via `ReactMarkdown` with the configured alignment/size/color (`src/components/TextCard.tsx:135`)

### New-Item Placement and Default Sizing

- When an item is added with default coordinates (`x === 0 && y === 0`), the store MUST compute a non-overlapping position via `findOptimalPosition` before inserting it.
- Batch additions MUST place items sequentially without overlap via `findOptimalPositionsForBatch`, which threads each placement into a virtual item list for the next iteration.
- Default card dimensions MUST come from the resolved card component's `defaultDimensions`, falling back to `2×2` for unknown domains.
- Reordering a screen MUST compact items top-to-bottom via `packGridItemsCompact`.

#### Scenario: Default-positioned add is auto-placed

- **GIVEN** an added item with `x === 0` and `y === 0`
- **WHEN** `addGridItem` runs
- **THEN** its position is replaced with the result of `findOptimalPosition` (`src/store/dashboardStore.ts:167`)

#### Scenario: Default dimensions per domain

- **GIVEN** entity `weather.home`
- **WHEN** `getDefaultCardDimensions` runs
- **THEN** it returns `{ width: 4, height: 3 }` from `WeatherCard.defaultDimensions` (`src/utils/__tests__/cardDimensions.test.ts:23`)

#### Scenario: Unknown domain default size

- **GIVEN** entity `unknown.something`
- **WHEN** `getDefaultCardDimensions` runs
- **THEN** it returns `{ width: 2, height: 2 }` (`src/utils/__tests__/cardDimensions.test.ts:49`)

### Touch-First Sizing

- Interactive grid affordances MUST be enlarged on coarse-pointer devices: resize handles MUST grow to at least `32×32` (edge handles `32×60` / `60×32`) under `@media (pointer: coarse)`, and cards MUST provide active-press feedback and a tap-highlight there.

#### Scenario: Coarse pointer enlarges resize handles

- **GIVEN** a coarse-pointer device
- **WHEN** the grid renders in edit mode
- **THEN** `.react-resizable-handle` is sized `32×32` (`src/components/GridLayoutSection.css:244`)

## Design

### Architecture

```
Dashboard (selects current screen)
  └─ GridView (per-screen: selection/delete/config state, item-type dispatch)
       └─ GridLayoutSection (react-grid-layout wrapper: cols/rows, drag/resize, persistence)
            └─ grid-item cell (keyed by item.id)
                 └─ render-prop child →
                      • TextCard        (type: 'text')
                      • Separator       (type: 'separator')
                      • EntityErrorBoundary > EntityCard (type: 'entity')
                                              └─ cardRegistry → domain/variant card → GridCard chrome
```

`GridView` is stateful (React `useState` for selection, delete dialog, config modal); `GridLayoutSection` is the only component that talks to `react-grid-layout` and to `dashboardActions.updateGridItem` for position/size changes; `GridCard` is a memoized, forwardRef presentational shell shared by entity cards.

### Data Models

`GridItem` is the unit of layout (`src/store/types.ts:8`):

```ts
export interface GridItem {
  id: string
  type: GridItemType // 'entity' | 'separator' | 'text'
  entityId?: string // entity items only
  title?: string // separators
  separatorOrientation?: 'horizontal' | 'vertical'
  separatorTextColor?: string
  content?: string // text cards
  alignment?: 'left' | 'center' | 'right'
  textSize?: 'small' | 'medium' | 'large'
  textColor?: string
  hideBackground?: boolean
  config?: Record<string, unknown> // entity-specific config (incl. `variant`)
  x: number
  y: number
  width: number
  height: number
}
```

Placement fields `x`/`y`/`width`/`height` are integer grid cells expressed against the screen's stored `resolution.columns`. The `react-grid-layout` `Layout` shape uses `w`/`h` (not `width`/`height`) and adds `minW: 1, minH: 1` plus per-item `isDraggable`/`isResizable`.

### API Surface

Grid-layout utilities (pure functions):

```ts
// gridPositioning.ts — non-overlapping placement for new items
findOptimalPosition(existingItems, itemWidth, itemHeight, gridResolution): { x, y }
findOptimalPositionsForBatch(existingItems, newItems[], gridResolution): { x, y }[]

// gridPacking.ts — compaction
packGridItems(items, gridColumns, gridRows): GridItem[]         // simple top-left fill
packGridItemsCompact(items, gridColumns, gridRows): GridItem[]  // skyline/lowest-y fill (used by reorderGrid)

// cardDimensions.ts — default footprint from the registry
getDefaultCardDimensions(entityId): { width, height }          // falls back to 2×2
```

Store actions consumed by the grid layer (defined in `../dashboard-config/`): `updateGridItem`, `removeGridItem`, `addGridItem`, `reorderGrid`.

### UI Components

- **`GridView`** (`src/components/GridView.tsx`): item-type dispatch, selection/delete/config state, keyboard shortcuts, `DeleteConfirmDialog`, `CardConfig.Modal`.
- **`GridLayoutSection`** (`src/components/GridLayoutSection.tsx`): `react-grid-layout` config, responsive column scaling, row-height measurement, layout-change persistence.
- **`GridCard`** (`src/components/GridCard.tsx`): shared card chrome and compound sub-components (`Icon`, `Title`, `Controls`, `Status`); size → `minHeight`/`padding`/font-size mapping; fullscreen portal.
- **`Separator`** (`src/components/Separator.tsx`) and **`TextCard`** (`src/components/TextCard.tsx`): non-entity grid item types, each carrying a static `defaultDimensions`.
- **`GridLayoutSection.css`**: `react-grid-layout` overrides, resize-handle styling, coarse-pointer touch sizing.

### Business Logic

Responsive column scaling (`src/components/GridLayoutSection.tsx:34`):

```ts
const columnRatio = effectiveColumns / resolution.columns
const scaledWidth = Math.max(1, Math.round(item.width * columnRatio))
const scaledX = Math.min(effectiveColumns - scaledWidth, Math.round(item.x * columnRatio))
```

Persistence scales back and diffs before writing (`src/components/GridLayoutSection.tsx:57`):

```ts
const columnRatio = resolution.columns / effectiveColumns
const scaledX = Math.round(layoutItem.x * columnRatio)
const scaledWidth = Math.round(layoutItem.w * columnRatio)
if (
  originalItem &&
  (originalItem.x !== scaledX ||
    originalItem.y !== layoutItem.y ||
    originalItem.width !== scaledWidth ||
    originalItem.height !== layoutItem.h)
) {
  dashboardActions.updateGridItem(screenId, layoutItem.i, {
    x: scaledX,
    y: layoutItem.y,
    width: scaledWidth,
    height: layoutItem.h,
  })
}
```

Size-from-dimensions ternary (repeated for each item type in `GridView`, e.g. `src/components/GridView.tsx:170`):

```ts
item.width >= 4 && item.height >= 3
  ? 'large'
  : item.width >= 3 && item.height >= 2
    ? 'medium'
    : 'small'
```

## Constraints

- **Radix-first styling**: cards are built on Radix `Card`/theme tokens; per project rules custom CSS and non-portal z-index are avoided. `GridCard` uses fixed-position action buttons at `zIndex: 10` and a fullscreen portal at `zIndex: 9999`.
- **compactType null + preventCollision**: user positions are never auto-compacted at render time; compaction happens only on explicit `reorderGrid`.
- **Integer grid cells against stored resolution**: all persisted coordinates are integers relative to `resolution.columns`; scaling to/from responsive breakpoints uses `Math.round`, which can drift on repeated round-trips at non-integer ratios.
- **Touch targets**: coarse-pointer resize handles are enlarged to ≥32px; the project's 44px touch-target principle is only partially met by handle CSS.
- **Whole-card drag**: dragging is enabled on the entire card, relying on `draggableCancel` to exclude interactive controls (buttons, inputs, `[role='button']`, `.no-drag`).

## Open Questions

- **`src/utils/gridPacking.ts` and `src/utils/gridPositioning.ts` have no direct unit tests.** Their behavior (overlap avoidance, compaction, batch threading) is asserted only indirectly through store/UI usage. `packGridItems` (the simple top-left variant) currently has no callers — only `packGridItemsCompact` is used (by `reorderGrid`, `src/store/dashboardStore.ts:393`); the simple variant may be dead code.
- **Duplicated size ternary.** The `large`/`medium`/`small` threshold logic is copy-pasted four times in `GridView` (text, separator, entity, plus the `EntityCard` call site) with no shared helper — a change to thresholds must be made in every copy. A `sizeFromDimensions(width, height)` utility would remove the duplication.
- **Round-trip coordinate drift.** Scaling `x`/`width` down for a responsive breakpoint and back up on `onLayoutChange` uses `Math.round` in both directions; on `mobile`/`tablet` breakpoints a drag can persist coordinates that differ from a pure identity round-trip. No test currently pins this behavior.
- **`Separator` size prop is inert.** `GridView` computes and passes a `size` to `Separator`, but `Separator` destructures it as `size: _size` and never uses it (text sizing is derived only from orientation, `src/components/Separator.tsx:37`).
- **Stale tracking without display.** `GridCard` accepts `isStale` but deliberately renders nothing for it (`src/components/GridCard.tsx:123`); whether stale should ever surface visually is unresolved.

## References

- `src/components/Dashboard.tsx` — current-screen selection and grid vs empty-state rendering
- `src/components/GridView.tsx` — item-type dispatch, `EntityCard` registry resolution, selection/delete/config
- `src/components/GridLayoutSection.tsx` + `.css` — `react-grid-layout` integration, responsive scaling, persistence, touch sizing
- `src/components/GridCard.tsx` — shared card chrome, states, fullscreen portal
- `src/components/Separator.tsx`, `src/components/TextCard.tsx` — non-entity grid item types
- `src/components/cardRegistry.ts` — domain/variant → card component mapping
- `src/utils/gridPositioning.ts`, `src/utils/gridPacking.ts`, `src/utils/cardDimensions.ts` — placement, compaction, default sizing
- `app/utils/responsive.ts` — breakpoints and per-breakpoint grid config
- `src/store/types.ts` — `GridItem`, `ScreenConfig`, `GridResolution`
- `src/components/__tests__/GridLayoutSection.test.tsx`, `src/utils/__tests__/cardDimensions.test.ts` — behavioral tests
- `../entity-cards/` — entity card internals (out of scope)
- `../dashboard-config/` — store, mutations, persistence (out of scope)

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
