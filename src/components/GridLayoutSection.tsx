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
    const columnRatio = effectiveColumns / resolution.columns
    const scaledWidth = effectiveSpanOf(item).width
    const scaledX = Math.min(effectiveColumns - scaledWidth, Math.round(item.x * columnRatio))

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

        // Scale coordinates back to original resolution for storage
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
