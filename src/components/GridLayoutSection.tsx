import { ReactNode, useCallback, useState, useEffect, useRef } from 'react'
import GridLayout, { getCompactor, type Layout, type LayoutItem } from 'react-grid-layout'
import { Box } from '@radix-ui/themes'
import { GridItem } from '../store/types'
import { dashboardActions } from '../store'
import { useBreakpoint, getGridConfig } from '../../app/utils/responsive'

// Preserve v1 behavior: no auto-compaction, and block items from overlapping.
const freeFormCompactor = getCompactor(null, false, true)

interface GridLayoutSectionProps {
  screenId: string
  items: GridItem[]
  isEditMode: boolean
  resolution: { columns: number; rows: number }
  children: (item: GridItem) => ReactNode
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
  const effectiveColumns =
    breakpoint === 'desktop' || breakpoint === 'wide'
      ? resolution.columns
      : responsiveConfig.columns

  // Convert GridItem[] to react-grid-layout's Layout (readonly LayoutItem[])
  const layouts: LayoutItem[] = items.map((item) => {
    // Scale item dimensions based on column ratio
    const columnRatio = effectiveColumns / resolution.columns
    const scaledWidth = Math.max(1, Math.round(item.width * columnRatio))
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
    <Box ref={containerRef} style={{ width: '100%' }}>
      <GridLayout
        className="layout"
        layout={layouts}
        width={containerWidth}
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
            {children(item)}
          </div>
        ))}
      </GridLayout>
    </Box>
  )
}
