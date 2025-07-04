import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextCard } from '../TextCard'

// Mock the store first
vi.mock('~/store', () => {
  let mockState = {
    mode: 'view',
    currentScreenId: 'test-screen',
  }
  
  return {
    useDashboardStore: vi.fn((selector) => selector(mockState)),
    dashboardActions: {
      getState: vi.fn(() => ({
        screens: [{
          id: 'test-screen',
          grid: {
            items: [{
              id: 'test-text-1',
              type: 'text',
              content: 'Test content',
            }]
          }
        }]
      })),
      updateGridItem: vi.fn(),
    },
    // Export function to update mock state in tests
    __setMockState: (newState: any) => {
      mockState = { ...mockState, ...newState }
    }
  }
})

// Import the mocked module
import { __setMockState, dashboardActions } from '~/store'

describe('TextCard', () => {
  beforeEach(() => {
    // Reset to default state before each test
    __setMockState({ mode: 'view', currentScreenId: 'test-screen' })
    vi.clearAllMocks()
  })

  it('should show markdown content in view mode', () => {
    render(
      <TextCard
        entityId="test-text-1"
        content="# Test Header"
      />
    )

    // Should render markdown header
    const headerElement = screen.getByText('Test Header')
    expect(headerElement).toBeTruthy()
    expect(headerElement.tagName).toBe('SPAN') // Radix Text component renders as span
    
    // Should not show textarea
    expect(screen.queryByPlaceholderText('Enter text (supports markdown)')).toBeFalsy()
  })

  it('should show textarea in edit mode', () => {
    // Change mode to edit
    __setMockState({ mode: 'edit' })

    render(
      <TextCard
        entityId="test-text-1"
        content="Test content"
        onSelect={vi.fn()}
      />
    )

    // Should show textarea with content
    const textarea = screen.getByPlaceholderText('Enter text (supports markdown)')
    expect(textarea).toBeTruthy()
    expect(textarea).toHaveValue('Test content')
    
    // Should show drag handle in edit mode
    expect(document.querySelector('.grid-item-drag-handle')).toBeTruthy()
  })

  it('should update content in real-time when typing in edit mode', () => {
    __setMockState({ mode: 'edit' })

    render(
      <TextCard
        entityId="test-text-1"
        content="Initial content"
      />
    )

    const textarea = screen.getByPlaceholderText('Enter text (supports markdown)')
    
    // Type new content
    fireEvent.change(textarea, { target: { value: 'Updated content' } })

    // Should call updateGridItem with new content
    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith(
      'test-screen',
      'test-text-1',
      { content: 'Updated content' }
    )
  })

  it('should show delete button in edit mode', () => {
    __setMockState({ mode: 'edit' })
    const onDelete = vi.fn()

    render(
      <TextCard
        entityId="test-text-1"
        content="Test content"
        onDelete={onDelete}
      />
    )

    const deleteButton = screen.getByLabelText('Delete text card')
    expect(deleteButton).toBeTruthy()
    
    // Click delete button
    fireEvent.click(deleteButton)
    expect(onDelete).toHaveBeenCalled()
  })
})