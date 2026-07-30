import { ReactNode, useCallback, useMemo, useState, useEffect, useRef } from 'react'
import GridLayout, { getCompactor, type Layout, type LayoutItem } from 'react-grid-layout'
// `absoluteStrategy` is only exported from the `react-grid-layout/core` subpath,
// not the package root. It positions grid items via `top`/`left` instead of
// `transform: translate(...)`, so items no longer establish a containing block
// that would trap `position: fixed` descendants (needed by the camera card's
// in-place fullscreen — change 0008).
import { absoluteStrategy } from 'react-grid-layout/core'
import { Box } from '@radix-ui/themes'
import { GridItem } from '../store/types'
import { dashboardActions } from '../store'
import { useBreakpoint, getGridConfig, getEffectiveColumns } from '../../app/utils/responsive'
import { scaleSpanToColumns, type CardSpan } from '../utils/cardTier'

// Preserve v1 behavior: no auto-compaction, and block items from overlapping.
const freeFormCompactor = getCompactor(null, false, true)

/**
 * The inline-axis geometry the grid actually lays a stored item out at.
 *
 * The forward mapping, written once so the two readers cannot drift: the layout
 * handed to react-grid-layout, and the change handler that has to recognise the
 * values it gets back. It is deliberately not invertible — `scaleSpanToColumns`
 * floors a span at one cell and `x` is clamped into bounds — which is why the
 * handler compares against it rather than trying to undo it
 * (docs/changes/0039-responsive-drag-integrity.md).
 */
function effectiveInlineOf(
  item: GridItem,
  storedColumns: number,
  effectiveColumns: number
): { x: number; width: number } {
  const columnRatio = effectiveColumns / storedColumns
  const { width } = scaleSpanToColumns(item, storedColumns, effectiveColumns)

  return {
    // Both bounds, because the upper one goes negative for an item wider than
    // the screen it is on — which a screen whose resolution was reduced after
    // the item was placed will have. A derivation that reported a negative `x`
    // could never equal the `x` the grid reports back, so the change handler
    // would read every such item as moved and rewrite it.
    x: Math.max(0, Math.min(effectiveColumns - width, Math.round(item.x * columnRatio))),
    width,
  }
}

interface GridLayoutSectionProps {
  screenId: string
  items: GridItem[]
  isEditMode: boolean
  resolution: { columns: number; rows: number }
  /**
   * Renders one placed item, given the span the grid is **actually** laying it
   * out at.
   *
   * The stored dimensions are on the item; the effective ones exist only here,
   * because only this component knows the breakpoint's column count. Handing
   * them to the caller is what lets `GridView` derive a layout tier without
   * either measuring the DOM or re-deriving the responsive mapping from
   * scratch (docs/changes/0011-layout-tiers.md — "Renderer-computed tier,
   * effective span exposed by the layout layer").
   */
  children: (item: GridItem, effectiveSpan: CardSpan) => ReactNode
}

export function GridLayoutSection({
  screenId,
  items,
  isEditMode,
  resolution,
  children,
}: GridLayoutSectionProps) {
  // Get current breakpoint and responsive config
  const breakpoint = useBreakpoint()
  const responsiveConfig = getGridConfig(breakpoint)

  // Use responsive config for columns/rows, fallback to resolution prop
  const effectiveColumns = useMemo(
    () => getEffectiveColumns(breakpoint, resolution.columns),
    [breakpoint, resolution.columns]
  )

  /*
   * The span an item is really laid out at.
   *
   * One expression, read twice — by the layout below, and by the child callback
   * at the bottom — so what a card is told about its size cannot drift from
   * what the grid gives it.
   */
  const effectiveSpanOf = (item: GridItem): CardSpan =>
    scaleSpanToColumns(item, resolution.columns, effectiveColumns)

  // Convert GridItem[] to react-grid-layout's Layout (readonly LayoutItem[])
  const layouts: LayoutItem[] = items.map((item) => {
    // Scale item dimensions based on column ratio
    const { x: scaledX, width: scaledWidth } = effectiveInlineOf(
      item,
      resolution.columns,
      effectiveColumns
    )

    return {
      i: item.id,
      x: scaledX,
      y: item.y,
      w: scaledWidth,
      h: item.height,
      minW: 1,
      minH: 1,
      isDraggable: isEditMode,
      isResizable: isEditMode,
    }
  })

  // Handle layout changes (drag/resize)
  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // If we're on a responsive breakpoint, we need to scale back to original resolution
      const columnRatio = resolution.columns / effectiveColumns

      // Update each item that has changed
      newLayout.forEach((layoutItem) => {
        const originalItem = items.find((item) => item.id === layoutItem.i)

        if (!originalItem) return

        /*
         * Only genuinely moved fields are scaled back.
         *
         * The forward mapping floors a span at one cell, so it is not
         * invertible: a stored width of 1 on a 12-column screen renders as 1
         * cell on a 4-column phone, and `round(1 × 12 / 4)` comes back as 3. A
         * handler that inverse-scaled unconditionally rewrote every item on the
         * screen — including the ones the user never touched — on any drag or
         * resize. Comparing against the derivation is what makes the untouched
         * case exactly lossless.
         */
        const derived = effectiveInlineOf(originalItem, resolution.columns, effectiveColumns)
        const xMoved = layoutItem.x !== derived.x
        const widthMoved = layoutItem.w !== derived.width

        /*
         * Recombining a preserved field with a scaled one can overrun the
         * screen: one effective cell is three stored columns at a 12→4
         * breakpoint, so widening an item stored at `x: 7` by a single cell asks
         * for six columns where five remain. Something has to give, and it is
         * the field the interaction changed — clamping the untouched one would
         * be the very rewrite this handler exists to prevent. Which also means
         * an item whose stored geometry is *already* out of bounds is left
         * exactly as it is until the user moves it (0039 — existing damage is
         * not repaired here, because a widened card is indistinguishable from a
         * deliberately wide one).
         *
         * Both clamps need a floor as well as a cap, and for the same reason the
         * forward mapping does: an untouched field never passes through the cap,
         * so an item already wider than the screen leaves `columns - width`
         * negative. That case is not covered by "existing damage is left alone" —
         * the user did move the item, so this writes — and what it would write is
         * a coordinate off the edge of the grid.
         */
        const widthCap = xMoved ? resolution.columns : resolution.columns - originalItem.x
        const scaledWidth = widthMoved
          ? Math.max(1, Math.min(widthCap, Math.round(layoutItem.w * columnRatio)))
          : originalItem.width
        const scaledX = xMoved
          ? Math.max(
              0,
              Math.min(resolution.columns - scaledWidth, Math.round(layoutItem.x * columnRatio))
            )
          : originalItem.x

        if (
          originalItem.x !== scaledX ||
          originalItem.y !== layoutItem.y ||
          originalItem.width !== scaledWidth ||
          originalItem.height !== layoutItem.h
        ) {
          dashboardActions.updateGridItem(screenId, layoutItem.i, {
            x: scaledX,
            y: layoutItem.y,
            width: scaledWidth,
            height: layoutItem.h,
          })
        }
      })
    },
    [screenId, items, resolution.columns, effectiveColumns]
  )

  // Calculate row height based on container width and responsive columns
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const rowHeight = Math.floor(containerWidth / effectiveColumns)

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }

    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    /*
     * `liebe-section` is the structural hook of the stable selector contract
     * (docs/specs/theming — "Stable selector contract"): a section of a screen,
     * which today is the screen's one grid. It goes on the measured container
     * rather than on a wrapper because that element IS the section — themes
     * frame it, and `containerRef` proves nothing else stands between it and
     * the grid.
     *
     * A theme framing this element must not give it inline-axis padding or a
     * border: the `offsetWidth` measured above is the width handed to
     * react-grid-layout, and it counts both, so either would lay the grid out
     * wider than the box that holds it. Block-axis space is free.
     */
    <Box ref={containerRef} className="liebe-section" style={{ width: '100%' }}>
      <GridLayout
        className="layout"
        layout={layouts}
        width={containerWidth}
        positionStrategy={absoluteStrategy}
        onLayoutChange={handleLayoutChange}
        gridConfig={{
          cols: effectiveColumns,
          rowHeight,
          margin: responsiveConfig.margin, // Responsive gap between items
          containerPadding: responsiveConfig.containerPadding, // Responsive container padding
        }}
        dragConfig={{
          enabled: isEditMode,
          cancel: "button, input, textarea, select, [role='button'], .no-drag",
        }}
        resizeConfig={{
          enabled: isEditMode,
          handles: isEditMode ? ['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'] : [],
        }}
        compactor={freeFormCompactor} // No auto-compacting; preserve user positions and prevent overlap
      >
        {items.map((item) => (
          <div key={item.id} className="grid-item">
            {children(item, effectiveSpanOf(item))}
          </div>
        ))}
      </GridLayout>
    </Box>
  )
}
