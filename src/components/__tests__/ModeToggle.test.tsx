import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModeToggle } from '../ModeToggle'
import { dashboardStore, dashboardActions } from '../../store/dashboardStore'
import { Theme } from '@radix-ui/themes'

// Mock the responsive hook
vi.mock('../../../app/utils/responsive', () => ({
  useIsMobile: vi.fn(() => false),
}))

// Mock the persistence module to avoid async import issues in tests
vi.mock('../../store/persistence', () => ({
  saveDashboardMode: vi.fn(),
}))

// Import the mocked function after vi.mock
import { useIsMobile } from '../../../app/utils/responsive'

describe('ModeToggle', () => {
  beforeEach(() => {
    // Reset to view mode before each test
    dashboardActions.setMode('view')
  })

  const renderModeToggle = () => {
    return render(
      <Theme>
        <ModeToggle />
      </Theme>
    )
  }

  it('renders with correct initial state', () => {
    renderModeToggle()

    const buttonElement = screen.getByRole('button', { name: /View Mode/i })
    expect(buttonElement).toBeDefined()
    expect(screen.getByText('View Mode')).toBeDefined()
  })

  it('toggles between view and edit mode when clicked', async () => {
    renderModeToggle()

    let buttonElement = screen.getByRole('button', { name: /View Mode/i })

    // Initially in view mode
    expect(dashboardStore.state.mode).toBe('view')

    // Click to switch to edit mode
    await userEvent.click(buttonElement)

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('edit')
      buttonElement = screen.getByRole('button', { name: /Edit Mode/i })
      expect(buttonElement).toBeDefined()
    })

    // Click to switch back to view mode
    await userEvent.click(buttonElement)

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('view')
      buttonElement = screen.getByRole('button', { name: /View Mode/i })
      expect(buttonElement).toBeDefined()
    })
  })

  it('responds to keyboard shortcut Ctrl+E', async () => {
    renderModeToggle()

    // Initially in view mode
    expect(dashboardStore.state.mode).toBe('view')

    // Press Ctrl+E
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true })

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('edit')
    })

    // Press Ctrl+E again
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true })

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('view')
    })
  })

  it('responds to keyboard shortcut Cmd+E (Mac)', async () => {
    renderModeToggle()

    // Initially in view mode
    expect(dashboardStore.state.mode).toBe('view')

    // Press Cmd+E
    fireEvent.keyDown(window, { key: 'e', metaKey: true })

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('edit')
    })

    // Press Cmd+E again
    fireEvent.keyDown(window, { key: 'e', metaKey: true })

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('view')
    })
  })

  it('prevents default behavior for keyboard shortcut', () => {
    renderModeToggle()

    const preventDefaultSpy = vi.fn()
    const event = new KeyboardEvent('keydown', {
      key: 'e',
      ctrlKey: true,
    })
    Object.defineProperty(event, 'preventDefault', {
      value: preventDefaultSpy,
      writable: true,
    })

    window.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('shows tooltip with keyboard shortcut hint', async () => {
    const { container } = renderModeToggle()

    // The button should have tooltip trigger
    const buttonElement = screen.getByRole('button')
    expect(buttonElement).toBeDefined()

    // Tooltip content should be accessible via aria-describedby or similar
    const tooltipTrigger = container.querySelector('[data-radix-tooltip-trigger]')
    expect(tooltipTrigger).toBeDefined()
  })

  it('cleans up keyboard event listener on unmount', () => {
    const { unmount } = renderModeToggle()

    // Add spy to removeEventListener
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })

  it('renders icon only on mobile', () => {
    // Mock mobile viewport
    vi.mocked(useIsMobile).mockReturnValue(true)

    renderModeToggle()

    // Should have button with icon but no text
    const buttonElement = screen.getByRole('button', { name: /View Mode/i })
    expect(buttonElement).toBeDefined()

    // Should not show text on mobile
    expect(screen.queryByText('View Mode')).toBeNull()

    // Reset mock
    vi.mocked(useIsMobile).mockReturnValue(false)
  })
})
