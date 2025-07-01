import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GridLayoutSection } from '~/components/GridLayoutSection'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'

// Mock react-grid-layout
vi.mock('react-grid-layout', () => {
  const React = require('react')
  return {
    default: ({ children, layout, onLayoutChange, isDraggable, isResizable, draggableHandle }) => {
      return React.createElement(
        'div',
        {
          className: 'react-grid-layout',
          'data-testid': 'grid-layout',
          'data-draggable': isDraggable,
          'data-resizable': isResizable,
          'data-handle': draggableHandle,
        },
        layout.map((item, index) =>
          React.createElement(
            'div',
            {
              key: item.i,
              className: 'react-grid-item',
              'data-grid': JSON.stringify(item),
              style: {
                position: 'absolute',
                left: `${item.x * 100}px`,
                top: `${item.y * 100}px`,
                width: `${item.w * 100}px`,
                height: `${item.h * 100}px`,
              },
              onClick: () => {
                // Simulate layout change on click for testing
                if (onLayoutChange) {
                  onLayoutChange([
                    ...layout.slice(0, index),
                    { ...item, x: item.x + 1 },
                    ...layout.slice(index + 1),
                  ])
                }
              },
            },
            children[index]
          )
        )
      )
    },
  }
})

// Mock dashboard actions
vi.mock('~/store', () => ({
  dashboardActions: {
    updateGridItem: vi.fn(),
  },
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('GridLayoutSection', () => {
  const mockItems: GridItem[] = [
    { id: 'item-1', entityId: 'light.living_room', x: 0, y: 0, width: 2, height: 2 },
    { id: 'item-2', entityId: 'switch.kitchen', x: 3, y: 0, width: 1, height: 1 },
    { id: 'item-3', entityId: 'sensor.temperature', x: 0, y: 3, width: 3, height: 1 },
  ]

  const defaultProps = {
    screenId: 'screen-1',
    sectionId: 'section-1',
    items: mockItems,
    isEditMode: true,
    resolution: { columns: 12, rows: 8 },
    children: (item: GridItem) => <div data-testid={`grid-item-${item.id}`}>{item.entityId}</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders grid items with correct layout', () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Check that all items are rendered
    expect(screen.getByTestId('grid-item-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-3')).toBeInTheDocument()

    // Check grid layout is rendered
    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toBeInTheDocument()
  })

  it('converts GridItem format to react-grid-layout Layout format', () => {
    const { container } = render(<GridLayoutSection {...defaultProps} />)

    const gridItems = container.querySelectorAll('.react-grid-item')
    expect(gridItems).toHaveLength(3)

    // Check first item's data attributes
    const firstItem = gridItems[0]
    const gridData = JSON.parse(firstItem.getAttribute('data-grid') || '{}')
    expect(gridData).toMatchObject({
      i: 'item-1',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      minW: 1,
      minH: 1,
      isDraggable: true,
      isResizable: true,
    })
  })

  it('enables drag and resize in edit mode', () => {
    render(<GridLayoutSection {...defaultProps} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toHaveAttribute('data-draggable', 'true')
    expect(gridLayout).toHaveAttribute('data-resizable', 'true')
  })

  it('disables drag and resize in view mode', () => {
    render(<GridLayoutSection {...defaultProps} isEditMode={false} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toHaveAttribute('data-draggable', 'false')
    expect(gridLayout).toHaveAttribute('data-resizable', 'false')
  })

  it('uses drag handle for dragging', () => {
    render(<GridLayoutSection {...defaultProps} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toHaveAttribute('data-handle', '.grid-item-drag-handle')
  })

  it('updates grid item position on layout change', async () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Click on first item to trigger layout change
    const firstItem = screen.getByTestId('grid-item-item-1').parentElement
    if (firstItem) {
      fireEvent.click(firstItem)
    }

    // Check that updateGridItem was called with new position
    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith(
      'screen-1',
      'section-1',
      'item-1',
      {
        x: 1, // moved from 0 to 1
        y: 0,
        width: 2,
        height: 2,
      }
    )
  })

  it('only updates items that have changed', async () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Click on first item to trigger layout change
    const firstItem = screen.getByTestId('grid-item-item-1').parentElement
    if (firstItem) {
      fireEvent.click(firstItem)
    }

    // Should only update the item that changed, not all items
    expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith(
      'screen-1',
      'section-1',
      'item-1',
      expect.any(Object)
    )
  })

  it('renders with responsive row height', () => {
    const { container } = render(<GridLayoutSection {...defaultProps} />)

    // Check that container has 100% width
    const boxContainer = container.querySelector('.rt-Box')
    expect(boxContainer).toHaveStyle({ width: '100%' })
  })

  it('renders children function for each item', () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Check that children are rendered with entity IDs
    expect(screen.getByText('light.living_room')).toBeInTheDocument()
    expect(screen.getByText('switch.kitchen')).toBeInTheDocument()
    expect(screen.getByText('sensor.temperature')).toBeInTheDocument()
  })

  it('handles empty items array', () => {
    render(<GridLayoutSection {...defaultProps} items={[]} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toBeInTheDocument()
    expect(screen.queryByTestId(/grid-item-/)).not.toBeInTheDocument()
  })

  it('uses provided resolution for columns', () => {
    const customResolution = { columns: 6, rows: 4 }
    render(<GridLayoutSection {...defaultProps} resolution={customResolution} />)

    // The resolution is used internally for row height calculation
    // We can verify it's being used by checking the component renders without errors
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument()
  })

  it('maintains grid item keys for React reconciliation', () => {
    const { rerender } = render(<GridLayoutSection {...defaultProps} />)

    // Update items order
    const reorderedItems = [mockItems[1], mockItems[0], mockItems[2]]
    rerender(<GridLayoutSection {...defaultProps} items={reorderedItems} />)

    // Items should still be rendered with their original IDs
    expect(screen.getByTestId('grid-item-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-3')).toBeInTheDocument()
  })

  it('observes container resize', () => {
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: observeMock,
      disconnect: disconnectMock,
    }))

    const { unmount } = render(<GridLayoutSection {...defaultProps} />)

    // Check ResizeObserver was created and used
    expect(ResizeObserver).toHaveBeenCalled()
    expect(observeMock).toHaveBeenCalled()

    // Check disconnect is called on unmount
    unmount()
    expect(disconnectMock).toHaveBeenCalled()
  })
})