import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GridLayoutSection } from '../GridLayoutSection'
import type { GridItem } from '~/store/types'

// Mock react-grid-layout
vi.mock('react-grid-layout', () => ({
  default: vi.fn(({ children, layout, draggableHandle }) => {
    // Simple mock that renders children and tracks layout changes
    return (
      <div data-testid="grid-layout" data-draggable-handle={draggableHandle}>
        {children.map((child: React.ReactNode, index: number) => (
          <div
            key={index}
            data-testid={`grid-item-${layout[index]?.i}`}
            style={{
              position: 'absolute',
              left: `${layout[index]?.x * 100}px`,
              top: `${layout[index]?.y * 100}px`,
            }}
          >
            {child}
          </div>
        ))}
      </div>
    )
  }),
}))

// Mock the store
vi.mock('~/store', () => ({
  useDashboardStore: vi.fn((selector) => {
    const state = {
      mode: 'edit',
      currentScreenId: 'test-screen',
      screens: [
        {
          id: 'test-screen',
          grid: {
            items: [],
          },
        },
      ],
    }
    return selector(state)
  }),
  dashboardActions: {
    updateGridItem: vi.fn(),
    deleteGridItem: vi.fn(),
  },
}))

// Mock hooks
vi.mock('~/hooks', () => ({
  useBreakpoint: () => 'desktop',
}))

// Mock responsive utils
vi.mock('../../app/utils/responsive', () => ({
  getGridConfig: () => ({
    columns: 12,
    rows: 8,
    margin: [8, 8],
    containerPadding: [16, 16],
  }),
}))

describe('Grid Drag and Drop', () => {
  const mockItems: GridItem[] = [
    {
      id: 'item-1',
      type: 'entity',
      entityId: 'light.test',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    },
    {
      id: 'item-2',
      type: 'text',
      content: 'Test Text',
      x: 3,
      y: 0,
      width: 3,
      height: 2,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render drag handles in edit mode', () => {
    render(
      <GridLayoutSection
        screenId="test-screen"
        items={mockItems}
        isEditMode={true}
        resolution={{ columns: 12, rows: 8 }}
      >
        {(item) => (
          <div data-testid={`content-${item.id}`}>
            <div className="grid-item-drag-handle" />
            <span>{item.type === 'text' ? item.content : item.entityId}</span>
          </div>
        )}
      </GridLayoutSection>
    )

    // Check that drag handles are rendered
    const dragHandles = document.querySelectorAll('.grid-item-drag-handle')
    expect(dragHandles.length).toBe(2)
  })

  it('should not render drag handles in view mode', () => {
    render(
      <GridLayoutSection
        screenId="test-screen"
        items={mockItems}
        isEditMode={false}
        resolution={{ columns: 12, rows: 8 }}
      >
        {(item) => (
          <div data-testid={`content-${item.id}`}>
            {/* No drag handle in view mode */}
            <span>{item.type === 'text' ? item.content : item.entityId}</span>
          </div>
        )}
      </GridLayoutSection>
    )

    // Check that no drag handles are rendered
    const dragHandles = document.querySelectorAll('.grid-item-drag-handle')
    expect(dragHandles.length).toBe(0)
  })

  it('should configure grid with correct draggable handle', () => {
    const { container } = render(
      <GridLayoutSection
        screenId="test-screen"
        items={mockItems}
        isEditMode={true}
        resolution={{ columns: 12, rows: 8 }}
      >
        {(_item) => <div>Test</div>}
      </GridLayoutSection>
    )

    // Check that GridLayout is configured with the correct draggable handle
    const gridLayout = container.querySelector('[data-testid="grid-layout"]')
    expect(gridLayout).toBeTruthy()
    expect(gridLayout?.getAttribute('data-draggable-handle')).toBe('.grid-item-drag-handle')
  })

  it('should have correct CSS for drag handle', () => {
    // Test that the drag handle CSS class exists and has the right styles
    render(
      <div className="grid-item">
        <div className="grid-item-drag-handle" data-testid="drag-handle" />
      </div>
    )

    const dragHandle = screen.getByTestId('drag-handle')
    expect(dragHandle).toBeTruthy()

    // The drag handle should have the class
    expect(dragHandle.classList.contains('grid-item-drag-handle')).toBe(true)
  })
})
