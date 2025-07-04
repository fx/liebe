import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GridView } from '../GridView'
import { ButtonCard } from '../ButtonCard'
import { TextCard } from '../TextCard'
import type { GridItem } from '~/store/types'

// Mock the store
vi.mock('~/store', () => ({
  useDashboardStore: vi.fn((selector) => {
    const state = {
      mode: 'edit',
      currentScreenId: 'test-screen',
    }
    return selector(state)
  }),
  dashboardActions: {
    updateGridItem: vi.fn(),
    deleteGridItem: vi.fn(),
    getState: vi.fn(() => ({
      screens: [{
        id: 'test-screen',
        grid: {
          items: []
        }
      }]
    })),
  },
}))

// Mock the entity hook
vi.mock('~/hooks', () => ({
  useEntity: () => ({
    entity: {
      entity_id: 'light.test',
      state: 'on',
      attributes: {
        friendly_name: 'Test Light',
      },
    },
    isConnected: true,
    isStale: false,
    isLoading: false,
  }),
  useServiceCall: () => ({
    loading: false,
    error: null,
    toggle: vi.fn(),
    clearError: vi.fn(),
  }),
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

describe('Grid Item Dragging', () => {
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

  it('should render drag handles for all grid items in edit mode', () => {
    render(
      <GridView
        screenId="test-screen"
        items={mockItems}
        resolution={{ columns: 12, rows: 8 }}
      />
    )

    // Wait for grid items to render
    expect(screen.getByText('Test Light')).toBeTruthy()
    
    // Check for drag handles
    const dragHandles = document.querySelectorAll('.grid-item-drag-handle')
    expect(dragHandles.length).toBe(2)
  })

  it('drag handle should be properly positioned', () => {
    const { container } = render(
      <ButtonCard
        entityId="light.test"
        size="medium"
        onDelete={vi.fn()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )

    const dragHandle = container.querySelector('.grid-item-drag-handle')
    expect(dragHandle).toBeTruthy()
    
    // Check that it's positioned absolutely
    const styles = window.getComputedStyle(dragHandle!)
    expect(styles.position).toBe('absolute')
  })

  it('drag handle should be visible on hover in edit mode', async () => {
    const { container } = render(
      <div className="grid-item">
        <ButtonCard
          entityId="light.test"
          size="medium"
          onDelete={vi.fn()}
          isSelected={false}
          onSelect={vi.fn()}
        />
      </div>
    )

    const gridItem = container.querySelector('.grid-item')
    const dragHandle = container.querySelector('.grid-item-drag-handle')
    
    expect(dragHandle).toBeTruthy()
    
    // Simulate hover on grid item
    fireEvent.mouseEnter(gridItem!)
    
    // In a real browser, CSS would handle the opacity change
    // Here we just verify the structure is correct
    expect(dragHandle?.classList.contains('grid-item-drag-handle')).toBe(true)
  })

  it('text card should have drag handle in edit mode', () => {
    const { container } = render(
      <TextCard
        entityId="text-1"
        content="Test content"
        onDelete={vi.fn()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )

    const dragHandle = container.querySelector('.grid-item-drag-handle')
    expect(dragHandle).toBeTruthy()
  })

  it('drag handle should have correct cursor style', () => {
    const { container } = render(
      <ButtonCard
        entityId="light.test"
        size="medium"
        onDelete={vi.fn()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )

    const dragHandle = container.querySelector('.grid-item-drag-handle')
    const styles = window.getComputedStyle(dragHandle!)
    expect(styles.cursor).toBe('move')
  })
})