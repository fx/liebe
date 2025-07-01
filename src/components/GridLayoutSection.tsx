import { ReactNode, useCallback, useState, useEffect, useRef } from 'react'
import GridLayout, { Layout } from 'react-grid-layout'
import { Box } from '@radix-ui/themes'
import { GridItem } from '../store/types'
import { dashboardActions } from '../store'

interface GridLayoutSectionProps {
  screenId: string
  sectionId: string
  items: GridItem[]
  isEditMode: boolean
  resolution: { columns: number; rows: number }
  children: (item: GridItem) => ReactNode
}

export function GridLayoutSection({
  screenId,
  sectionId,
  items,
  isEditMode,
  resolution,
  children,
}: GridLayoutSectionProps) {
  // Convert GridItem[] to Layout[] for react-grid-layout
  const layouts: Layout[] = items.map((item) => ({
    i: item.id,
    x: item.x,
    y: item.y,
    w: item.width,
    h: item.height,
    minW: 1,
    minH: 1,
    isDraggable: isEditMode,
    isResizable: isEditMode,
  }))

  // Handle layout changes (drag/resize)
  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      // Update each item that has changed
      newLayout.forEach((layoutItem) => {
        const originalItem = items.find((item) => item.id === layoutItem.i)
        if (
          originalItem &&
          (originalItem.x !== layoutItem.x ||
            originalItem.y !== layoutItem.y ||
            originalItem.width !== layoutItem.w ||
            originalItem.height !== layoutItem.h)
        ) {
          dashboardActions.updateGridItem(screenId, sectionId, layoutItem.i, {
            x: layoutItem.x,
            y: layoutItem.y,
            width: layoutItem.w,
            height: layoutItem.h,
          })
        }
      })
    },
    [screenId, sectionId, items]
  )

  // Calculate row height based on container width
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const rowHeight = Math.floor(containerWidth / resolution.columns)

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
        cols={resolution.columns}
        rowHeight={rowHeight}
        width={containerWidth}
        onLayoutChange={handleLayoutChange}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        compactType={null} // Disable auto-compacting to preserve user positions
        preventCollision={true} // Prevent items from overlapping
        margin={[16, 16]} // Gap between items
        containerPadding={[0, 0]}
        resizeHandles={isEditMode ? ['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'] : []}
        draggableHandle=".grid-item-drag-handle"
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
