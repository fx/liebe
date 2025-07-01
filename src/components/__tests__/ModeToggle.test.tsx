import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModeToggle } from '../ModeToggle'
import { dashboardStore, dashboardActions } from '../../store/dashboardStore'
import { Theme } from '@radix-ui/themes'

// Mock the persistence module to avoid async import issues in tests
vi.mock('../../store/persistence', () => ({
  saveDashboardMode: vi.fn(),
}))

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

    const switchElement = screen.getByRole('switch', { name: /toggle edit mode/i })
    expect(switchElement).toBeDefined()
    expect(switchElement.getAttribute('aria-checked')).toBe('false')

    expect(screen.getByText('View')).toBeDefined()
    expect(screen.getByText('Edit')).toBeDefined()
  })

  it('toggles between view and edit mode when clicked', async () => {
    renderModeToggle()

    const switchElement = screen.getByRole('switch', { name: /toggle edit mode/i })

    // Initially in view mode
    expect(dashboardStore.state.mode).toBe('view')
    expect(switchElement.getAttribute('aria-checked')).toBe('false')

    // Click to switch to edit mode
    await userEvent.click(switchElement)

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('edit')
      expect(switchElement.getAttribute('aria-checked')).toBe('true')
    })

    // Click to switch back to view mode
    await userEvent.click(switchElement)

    await waitFor(() => {
      expect(dashboardStore.state.mode).toBe('view')
      expect(switchElement.getAttribute('aria-checked')).toBe('false')
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

    // The tooltip content should be accessible
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
})
