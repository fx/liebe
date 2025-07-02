import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ViewTabs } from '../ViewTabs'
import { dashboardStore } from '~/store/dashboardStore'
import { createTestScreen } from '~/test-utils/screen-helpers'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock the responsive utilities
let mockIsMobile = false
vi.mock('../../../app/utils/responsive', () => ({
  useIsMobile: () => mockIsMobile,
}))

// Mock window.matchMedia for responsive behavior
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Helper to render with Theme
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<Theme>{ui}</Theme>)
}

describe('ViewTabs', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to initial state
    dashboardStore.setState({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: {
        version: '1.0.0',
        screens: [],
        theme: 'auto',
      },
      gridResolution: { columns: 12, rows: 8 },
      theme: 'auto',
      isDirty: false,
      sidebarOpen: false,
      sidebarWidgets: [],
    })
    // Clear mock calls
    mockNavigate.mockClear()
    window.parent.postMessage = vi.fn()
  })

  describe('Desktop View', () => {
    it('should render tabs for all screens', () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
      }))

      renderWithTheme(<ViewTabs />)

      expect(screen.getByRole('tab', { name: /Living Room/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Kitchen/ })).toBeInTheDocument()
    })

    it('should navigate to screen slug when tab is clicked', async () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
      }))

      renderWithTheme(<ViewTabs />)

      const kitchenTab = screen.getByRole('tab', { name: /Kitchen/ })
      await user.click(kitchenTab)

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$slug',
        params: { slug: 'kitchen' },
      })
      expect(dashboardStore.state.currentScreenId).toBe('screen-2')
    })

    it('should show add button in edit mode', () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1],
        mode: 'edit',
      }))

      const onAddView = vi.fn()
      renderWithTheme(<ViewTabs onAddView={onAddView} />)

      // Should show the IconButton when screens exist
      // Get the button by finding the one that's not a tab
      const buttons = screen.getAllByRole('button')
      const addButton = buttons.find((btn) => !btn.hasAttribute('aria-selected'))
      expect(addButton).toBeInTheDocument()
    })

    it('should show remove buttons on tabs in edit mode', () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2], // Need at least 2 screens to show remove buttons
        currentScreenId: 'screen-1',
        mode: 'edit',
      }))

      renderWithTheme(<ViewTabs />)

      // The remove button should be visible within the tab
      const tab = screen.getByRole('tab', { name: /Living Room/ })
      const removeButton = tab.querySelector('[style*="cursor: pointer"]')
      expect(removeButton).toBeInTheDocument()
    })

    it('should remove screen and navigate to another when remove is clicked', async () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
        mode: 'edit',
      }))

      renderWithTheme(<ViewTabs />)

      // Find the remove button within the Living Room tab
      const livingRoomTab = screen.getByRole('tab', { name: /Living Room/ })
      // Look for the Box containing Cross2Icon (the remove button)
      const removeButtons = livingRoomTab.querySelectorAll('[style*="cursor: pointer"]')
      // The Cross2Icon button will be the one containing an svg with specific path for Cross2Icon
      const removeButton = Array.from(removeButtons).find(
        (btn) => btn.querySelector('svg path[d*="M11.7816"]') // Part of Cross2Icon path
      )

      await user.click(removeButton!)

      // Should navigate to the remaining screen
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$slug',
        params: { slug: 'kitchen' },
      })

      // Should remove the screen from store
      expect(dashboardStore.state.screens).toHaveLength(1)
      expect(dashboardStore.state.screens[0].id).toBe('screen-2')
    })

    it('should not allow removing the last screen', async () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
        mode: 'edit',
      }))

      renderWithTheme(<ViewTabs />)

      // First remove the kitchen screen
      const kitchenTab = screen.getByRole('tab', { name: /Kitchen/ })
      const kitchenRemoveButtons = kitchenTab.querySelectorAll('[style*="cursor: pointer"]')
      const kitchenRemoveButton = Array.from(kitchenRemoveButtons).find(
        (btn) => btn.querySelector('svg path[d*="M11.7816"]') // Part of Cross2Icon path
      )
      await user.click(kitchenRemoveButton!)

      // Wait for first removal
      await waitFor(() => {
        expect(dashboardStore.state.screens.length).toBe(1)
      })

      // Now try to find remove button on the last screen
      const livingRoomTab = screen.getByRole('tab', { name: /Living Room/ })
      const livingRoomButtons = livingRoomTab.querySelectorAll('[style*="cursor: pointer"]')
      const livingRoomRemoveButton = Array.from(livingRoomButtons).find(
        (btn) => btn.querySelector('svg path[d*="M11.7816"]') // Part of Cross2Icon path
      )

      // Since there's only one screen left, there should be no remove button
      expect(livingRoomRemoveButton).toBeUndefined()

      // This test actually verifies that we DON'T allow removing the last screen
      // The UI should not show a remove button when there's only one screen left
    })

    it('should render nested screens with indentation', () => {
      const parentScreen = createTestScreen({
        id: 'parent-1',
        name: 'Home',
        slug: 'home',
        children: [
          createTestScreen({
            id: 'child-1',
            name: 'Living Room',
            slug: 'living-room',
          }),
        ],
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [parentScreen],
        currentScreenId: 'parent-1',
      }))

      renderWithTheme(<ViewTabs />)

      const homeTab = screen.getByRole('tab', { name: /Home/ })
      const livingRoomTab = screen.getByRole('tab', { name: /Living Room/ })

      expect(homeTab).toBeInTheDocument()
      expect(livingRoomTab).toBeInTheDocument()

      // Check indentation
      expect(livingRoomTab).toHaveStyle({ paddingLeft: '20px' })
    })
  })

  describe('Mobile View', () => {
    beforeEach(() => {
      // Mock mobile viewport before component renders
      mockIsMobile = true
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      })
    })

    afterEach(() => {
      // Reset to desktop after each test
      mockIsMobile = false
    })

    it('should render dropdown menu on mobile', () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1],
        currentScreenId: 'screen-1',
      }))

      renderWithTheme(<ViewTabs />)

      // Should show dropdown button with current screen name
      expect(screen.getByRole('button', { name: /Living Room/ })).toBeInTheDocument()
    })

    it('should navigate when dropdown item is selected', async () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
      }))

      renderWithTheme(<ViewTabs />)

      // Open dropdown
      const dropdownButton = screen.getByRole('button', { name: /Living Room/ })
      await user.click(dropdownButton)

      // Click Kitchen option
      const kitchenOption = await screen.findByRole('menuitem', { name: /Kitchen/ })
      await user.click(kitchenOption)

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$slug',
        params: { slug: 'kitchen' },
      })
    })
  })

  describe('iframe communication', () => {
    beforeEach(() => {
      // Mock that we're in an iframe
      Object.defineProperty(window, 'parent', {
        writable: true,
        value: { postMessage: vi.fn() },
      })
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })
    })

    it('should navigate to correct route when clicking tab', async () => {
      const screen1 = createTestScreen({
        id: 'screen-1',
        name: 'Living Room',
        slug: 'living-room',
      })
      const screen2 = createTestScreen({
        id: 'screen-2',
        name: 'Kitchen',
        slug: 'kitchen',
      })

      dashboardStore.setState((state) => ({
        ...state,
        screens: [screen1, screen2],
        currentScreenId: 'screen-1',
      }))

      renderWithTheme(<ViewTabs />)

      const kitchenTab = screen.getByRole('tab', { name: /Kitchen/ })
      await user.click(kitchenTab)

      // Check that navigation was called with the correct route
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$slug',
        params: { slug: 'kitchen' },
      })
    })
  })
})
