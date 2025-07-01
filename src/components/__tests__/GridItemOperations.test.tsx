import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { SectionGrid } from '../SectionGrid'
import { dashboardStore, dashboardActions } from '../../store'
import type { SectionConfig } from '../../store/types'

const mockSections: SectionConfig[] = [
  {
    id: 'section-1',
    title: 'Test Section',
    order: 0,
    width: 'full',
    items: [
      {
        id: 'item-1',
        entityId: 'light.living_room',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      {
        id: 'item-2',
        entityId: 'switch.outlet',
        x: 1,
        y: 0,
        width: 1,
        height: 1,
      },
    ],
  },
]

// Mock entity store data
vi.mock('../../hooks/useEntity', () => ({
  useEntity: (entityId: string) => ({
    entity: {
      entity_id: entityId,
      state: 'on',
      attributes: {
        friendly_name: entityId.split('.')[1].replace('_', ' '),
      },
    },
    isConnected: true,
    isStale: false,
  }),
}))

vi.mock('../../hooks/useServiceCall', () => ({
  useServiceCall: () => ({
    loading: false,
    error: null,
    toggle: vi.fn(),
    clearError: vi.fn(),
  }),
}))

const renderWithTheme = (component: React.ReactElement) => {
  return render(<Theme>{component}</Theme>)
}

describe('GridItemOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardActions.resetState()
    dashboardActions.setMode('view')
  })

  describe('Delete Operations', () => {
    it('should show delete button in edit mode', async () => {
      dashboardActions.setMode('edit')
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Should show delete buttons on hover
      const deleteButtons = screen.getAllByLabelText('Delete entity')
      expect(deleteButtons).toHaveLength(2)
    })

    it('should not show delete button in view mode', () => {
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Should not show delete buttons
      const deleteButtons = screen.queryAllByLabelText('Delete entity')
      expect(deleteButtons).toHaveLength(0)
    })

    it('should open confirmation dialog when delete button is clicked', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Click delete button
      const deleteButtons = screen.getAllByLabelText('Delete entity')
      await user.click(deleteButtons[0])

      // Should show confirmation dialog
      await waitFor(() => {
        expect(screen.getByText('Delete Entity')).toBeInTheDocument()
        expect(screen.getByText(/Are you sure you want to remove this entity/)).toBeInTheDocument()
      })
    })

    it('should delete item when confirmed', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      
      // Create a screen first
      dashboardActions.addScreen({
        id: 'test-screen',
        name: 'Test Screen',
        slug: 'test-screen',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          sections: mockSections,
        },
      })
      dashboardActions.setCurrentScreen('test-screen')

      renderWithTheme(<SectionGrid screenId="test-screen" sections={dashboardStore.state.screens[0]?.grid?.sections || []} />)

      // Click delete button
      const deleteButtons = screen.getAllByLabelText('Delete entity')
      await user.click(deleteButtons[0])

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' })
      await user.click(confirmButton)

      // Item should be removed
      await waitFor(() => {
        const state = dashboardStore.state
        const section = state.screens[0]?.grid?.sections[0]
        expect(section?.items).toHaveLength(1)
        expect(section?.items[0].id).toBe('item-2')
      })
    })
  })

  describe('Selection', () => {
    it('should select items in edit mode', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Click on an entity card
      const cards = screen.getAllByText(/living room|outlet/i)
      await user.click(cards[0])

      // Card should be selected (has blue background)
      const card = cards[0].closest('[style*="background"]')
      expect(card).toHaveStyle({ backgroundColor: 'var(--blue-3)' })
    })

    it('should not select items in view mode', async () => {
      const user = userEvent.setup()
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Click on an entity card
      const cards = screen.getAllByText(/living room|outlet/i)
      await user.click(cards[0])

      // Card should not be selected
      const card = cards[0].closest('[style*="background"]')
      expect(card).not.toHaveStyle({ backgroundColor: 'var(--blue-3)' })
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should delete selected items with Delete key', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      
      // Create a screen first
      dashboardActions.addScreen({
        id: 'test-screen',
        name: 'Test Screen',
        slug: 'test-screen',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          sections: mockSections,
        },
      })
      dashboardActions.setCurrentScreen('test-screen')

      renderWithTheme(<SectionGrid screenId="test-screen" sections={dashboardStore.state.screens[0]?.grid?.sections || []} />)

      // Select an item
      const cards = screen.getAllByText(/living room|outlet/i)
      await user.click(cards[0])

      // Press Delete key
      fireEvent.keyDown(window, { key: 'Delete' })

      // Should show confirmation dialog
      await waitFor(() => {
        expect(screen.getByText('Delete Entity')).toBeInTheDocument()
      })

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' })
      await user.click(confirmButton)

      // Item should be removed
      await waitFor(() => {
        const state = dashboardStore.state
        const section = state.screens[0]?.grid?.sections[0]
        expect(section?.items).toHaveLength(1)
      })
    })

    it('should clear selection with Escape key', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Select items
      const cards = screen.getAllByText(/living room|outlet/i)
      await user.click(cards[0])
      await user.click(cards[1])

      // Both should be selected
      expect(cards[0].closest('[style*="background"]')).toHaveStyle({ backgroundColor: 'var(--blue-3)' })
      expect(cards[1].closest('[style*="background"]')).toHaveStyle({ backgroundColor: 'var(--blue-3)' })

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' })

      // Selection should be cleared
      await waitFor(() => {
        expect(cards[0].closest('[style*="background"]')).not.toHaveStyle({ backgroundColor: 'var(--blue-3)' })
        expect(cards[1].closest('[style*="background"]')).not.toHaveStyle({ backgroundColor: 'var(--blue-3)' })
      })
    })

    it('should select all items with Ctrl+A', async () => {
      dashboardActions.setMode('edit')
      renderWithTheme(<SectionGrid screenId="test-screen" sections={mockSections} />)

      // Press Ctrl+A
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

      // All items should be selected
      await waitFor(() => {
        const cards = screen.getAllByText(/living room|outlet/i)
        cards.forEach(card => {
          expect(card.closest('[style*="background"]')).toHaveStyle({ backgroundColor: 'var(--blue-3)' })
        })
      })
    })
  })

  describe('Bulk Delete', () => {
    it('should delete multiple selected items', async () => {
      const user = userEvent.setup()
      dashboardActions.setMode('edit')
      
      // Create a screen first
      dashboardActions.addScreen({
        id: 'test-screen',
        name: 'Test Screen',
        slug: 'test-screen',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          sections: mockSections,
        },
      })
      dashboardActions.setCurrentScreen('test-screen')

      renderWithTheme(<SectionGrid screenId="test-screen" sections={dashboardStore.state.screens[0]?.grid?.sections || []} />)

      // Select both items
      const cards = screen.getAllByText(/living room|outlet/i)
      await user.click(cards[0])
      await user.click(cards[1])

      // Press Delete key
      fireEvent.keyDown(window, { key: 'Delete' })

      // Should show bulk delete confirmation
      await waitFor(() => {
        expect(screen.getByText('Delete 2 Entities')).toBeInTheDocument()
        expect(screen.getByText(/Are you sure you want to remove 2 entities/)).toBeInTheDocument()
      })

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete (2)' })
      await user.click(confirmButton)

      // Both items should be removed
      await waitFor(() => {
        const state = dashboardStore.state
        const section = state.screens[0]?.grid?.sections[0]
        expect(section?.items).toHaveLength(0)
      })
    })
  })
})