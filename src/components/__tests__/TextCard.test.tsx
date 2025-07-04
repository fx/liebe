import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextCard } from '../TextCard'

// Mock the store first
vi.mock('~/store', () => {
  // Create a mock function that we can control
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
import { __setMockState } from '~/store'

describe('TextCard', () => {
  beforeEach(() => {
    // Reset to default state before each test
    __setMockState({ mode: 'view', currentScreenId: 'test-screen' })
  })

  it('should enter edit mode on double click in view mode', () => {
    render(
      <TextCard
        entityId="test-text-1"
        content="Test content"
      />
    )

    const card = screen.getByText('Test content').closest('[class*="Card"]')
    expect(card).toBeTruthy()

    // Double click to enter edit mode
    fireEvent.doubleClick(card!)

    // Should show textarea and buttons
    expect(screen.getByPlaceholderText('Enter text (supports markdown)')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('should not enter edit mode on double click in edit mode', () => {
    // Change mode to edit
    __setMockState({ mode: 'edit' })

    render(
      <TextCard
        entityId="test-text-1"
        content="Test content"
        onSelect={vi.fn()}
      />
    )

    const card = screen.getByText('Test content').closest('[class*="Card"]')
    fireEvent.doubleClick(card!)

    // Should NOT show textarea
    expect(screen.queryByPlaceholderText('Enter text (supports markdown)')).toBeFalsy()
  })
})