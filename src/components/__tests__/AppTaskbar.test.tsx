import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { AppTaskbar } from '../AppTaskbar'
import { dashboardActions } from '../../store'
import { createTestScreen } from '../../test-utils/screen-helpers'

// Mock router
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// Helper function to render with Theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<Theme>{component}</Theme>)
}

describe('AppTaskbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardActions.resetState()

    // Add a test screen by default so we have a current screen
    dashboardActions.addScreen(
      createTestScreen({
        id: 'test-screen',
        name: 'Test Screen',
        slug: 'test-screen',
      })
    )
    dashboardActions.setCurrentScreen('test-screen')
  })

  describe('Add Item Button', () => {
    it('should show add item button in edit mode', async () => {
      renderWithTheme(<AppTaskbar />)

      // Should not show add item in view mode
      expect(screen.queryByTitle('Add Item')).not.toBeInTheDocument()

      // Switch to edit mode
      dashboardActions.setMode('edit')

      // Should show add item button now
      await waitFor(() => {
        expect(screen.getByTitle('Add Item')).toBeInTheDocument()
      })
    })

    it('should dispatch addItem event when add item button is clicked', async () => {
      const user = userEvent.setup()

      // Set up event listener
      const addItemHandler = vi.fn()
      window.addEventListener('addItem', addItemHandler)

      renderWithTheme(<AppTaskbar />)

      // Switch to edit mode
      dashboardActions.setMode('edit')

      // Click add item button
      const addItemButton = await screen.findByTitle('Add Item')
      await user.click(addItemButton)

      // Check event was dispatched
      expect(addItemHandler).toHaveBeenCalledTimes(1)
      const event = addItemHandler.mock.calls[0][0] as CustomEvent
      expect(event.detail.screenId).toBe('test-screen')

      // Clean up
      window.removeEventListener('addItem', addItemHandler)
    })

    it('should not show add item button when no screen is selected', async () => {
      // Clear current screen
      dashboardActions.setCurrentScreen(null)
      dashboardActions.setMode('edit')

      renderWithTheme(<AppTaskbar />)

      // Should not show add item button
      expect(screen.queryByTitle('Add Item')).not.toBeInTheDocument()
    })
  })

  describe('Screen Navigation', () => {
    it('should render screen buttons', () => {
      renderWithTheme(<AppTaskbar />)

      // Should show the test screen button
      expect(screen.getByRole('button', { name: 'Test Screen' })).toBeInTheDocument()
    })

    it('should navigate when screen button is clicked', async () => {
      const user = userEvent.setup()
      renderWithTheme(<AppTaskbar />)

      const screenButton = screen.getByRole('button', { name: 'Test Screen' })
      await user.click(screenButton)

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$slug',
        params: { slug: 'test-screen' },
      })
    })
  })

  describe('Mode Toggle', () => {
    it('should show mode toggle button', () => {
      renderWithTheme(<AppTaskbar />)

      // Should show view mode button by default
      expect(screen.getByRole('button', { name: 'View Mode' })).toBeInTheDocument()
    })
  })

  describe('Add Screen Button', () => {
    it('should show add screen button in edit mode', async () => {
      renderWithTheme(<AppTaskbar />)

      // Switch to edit mode
      dashboardActions.setMode('edit')

      // Should show add screen button
      await waitFor(() => {
        expect(screen.getByTitle('Add Screen')).toBeInTheDocument()
      })
    })

    it('should dispatch addScreen event when clicked', async () => {
      const user = userEvent.setup()

      // Set up event listener
      const addScreenHandler = vi.fn()
      window.addEventListener('addScreen', addScreenHandler)

      renderWithTheme(<AppTaskbar />)

      // Switch to edit mode
      dashboardActions.setMode('edit')

      // Click add screen button
      const addScreenButton = await screen.findByTitle('Add Screen')
      await user.click(addScreenButton)

      // Check event was dispatched
      expect(addScreenHandler).toHaveBeenCalledTimes(1)

      // Clean up
      window.removeEventListener('addScreen', addScreenHandler)
    })
  })
})
