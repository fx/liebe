import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { Dashboard } from '../Dashboard'
import { dashboardActions, dashboardStore } from '../../store'
import { createTestScreen } from '../../test-utils/screen-helpers'

// Mock router
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/' }),
  useParams: () => ({}),
  Link: ({
    children,
    ...props
  }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a {...props}>{children}</a>
  ),
}))

// Helper function to render with Theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<Theme>{component}</Theme>)
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardActions.resetState()
  })

  describe('Initial State', () => {
    it('should show "No views created yet" when there are no screens', () => {
      renderWithTheme(<Dashboard />)
      expect(screen.getByText('No views created yet')).toBeInTheDocument()
    })

    it('should show "Create Your First View" button when no screens exist', () => {
      renderWithTheme(<Dashboard />)
      expect(screen.getByText('Create Your First View')).toBeInTheDocument()
    })

    it('should start in view mode', () => {
      renderWithTheme(<Dashboard />)
      // Check that the mode toggle button shows "View Mode"
      const modeButton = screen.getByRole('button', { name: 'View Mode' })
      expect(modeButton).toBeInTheDocument()
      expect(dashboardStore.state.mode).toBe('view')
    })
  })

  describe('Mode Toggle', () => {
    it('should toggle between view and edit mode', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Dashboard />)

      let modeButton = screen.getByRole('button', { name: 'View Mode' })
      expect(modeButton).toBeInTheDocument()
      expect(dashboardStore.state.mode).toBe('view')

      // Click to switch to edit mode
      await user.click(modeButton)
      modeButton = screen.getByRole('button', { name: 'Edit Mode' })
      expect(modeButton).toBeInTheDocument()
      expect(dashboardStore.state.mode).toBe('edit')

      // Click to switch back to view mode
      await user.click(modeButton)
      modeButton = screen.getByRole('button', { name: 'View Mode' })
      expect(modeButton).toBeInTheDocument()
      expect(dashboardStore.state.mode).toBe('view')
    })
  })

  describe('View Creation', () => {
    it('should open AddViewDialog when clicking "Create Your First View"', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Dashboard />)

      const createButton = screen.getByText('Create Your First View')
      await user.click(createButton)

      // Check if dialog is opened
      await waitFor(() => {
        expect(screen.getByText('Add New View')).toBeInTheDocument()
        expect(screen.getByText('Create a new view to organize your dashboard')).toBeInTheDocument()
      })
    })

    it('should open AddViewDialog when clicking + button in edit mode', async () => {
      const user = userEvent.setup()
      
      // Add a test screen first so there's a current screen
      dashboardActions.addScreen(
        createTestScreen({
          id: 'test-screen',
          name: 'Test Screen',
        })
      )
      dashboardActions.setCurrentScreen('test-screen')
      
      renderWithTheme(<Dashboard />)

      // Switch to edit mode
      await user.click(screen.getByRole('button', { name: 'View Mode' }))

      // Expand the taskbar to see the button text
      await user.click(screen.getByRole('button', { name: 'Expand' }))

      // There should be an "Add Screen" button in the tab strip
      const addButton = screen.getByRole('button', { name: 'Add Screen' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Add New View')).toBeInTheDocument()
      })
    })

    it('should create a new view and display it', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Dashboard />)

      // Open dialog
      await user.click(screen.getByText('Create Your First View'))

      // Fill in view name
      const input = screen.getByPlaceholderText('Living Room')
      await user.type(input, 'Test View')

      // Submit
      const addButton = screen.getByRole('button', { name: 'Add View' })
      await user.click(addButton)

      // Wait for dialog to close
      await waitFor(() => {
        expect(screen.queryByText('Add New View')).not.toBeInTheDocument()
      })

      // Check that navigation was called
      expect(mockNavigate).toHaveBeenCalled()

      // Get the created screen and set it as current
      const state = dashboardStore.state
      expect(state.screens.length).toBe(1)
      const newScreen = state.screens[0]
      expect(newScreen.name).toBe('Test View')

      // Manually set current screen since navigation is mocked
      dashboardActions.setCurrentScreen(newScreen.id)

      // Check if view is displayed
      await waitFor(() => {
        expect(screen.queryByText('No views created yet')).not.toBeInTheDocument()
      })
      // The screen name should be visible in the taskbar button
      expect(screen.getByRole('button', { name: 'Test View' })).toBeInTheDocument()
    })

    it('should not create a view with empty name', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Dashboard />)

      // Open dialog
      await user.click(screen.getByText('Create Your First View'))

      // Try to submit without entering a name
      const addButton = screen.getByRole('button', { name: 'Add View' })
      expect(addButton).toBeDisabled()
    })
  })

  describe('With Existing Views', () => {
    beforeEach(() => {
      // Add a test view
      dashboardActions.addScreen(
        createTestScreen({
          id: 'test-1',
          name: 'Living Room',
        })
      )
      dashboardActions.setCurrentScreen('test-1')
    })

    it('should display current view information', () => {
      renderWithTheme(<Dashboard />)

      // Screen name should be shown in taskbar button
      expect(screen.getByRole('button', { name: 'Living Room' })).toBeInTheDocument()
      // Grid size is no longer displayed
      expect(screen.getByText(/No items added yet/)).toBeInTheDocument()
    })

    it('should show entity message in edit mode', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Dashboard />)

      await user.click(screen.getByRole('button', { name: 'View Mode' }))

      expect(screen.getByText(/No items added yet/)).toBeInTheDocument()
    })
  })
})
