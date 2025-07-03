import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import { saveDashboardConfig } from '../persistence'
import type { DashboardConfig } from '../types'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('Sidebar State Persistence', () => {
  beforeEach(() => {
    // Reset store to initial state
    dashboardActions.resetState()
    // Clear localStorage mock
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
  })

  it('should include sidebar state in exported configuration', () => {
    // Set sidebar state
    dashboardActions.toggleSidebar(true)
    dashboardActions.toggleSidebarPin()

    // Export configuration
    const config = dashboardActions.exportConfiguration()

    // Check that sidebar state is included
    expect(config.sidebarOpen).toBe(true)
    expect(config.sidebarPinned).toBe(true)
  })

  it('should restore sidebar state from configuration', () => {
    // Create a configuration with sidebar state
    const config: DashboardConfig = {
      version: '1.0.0',
      screens: [],
      theme: 'auto',
      sidebarOpen: true,
      sidebarPinned: true,
    }

    // Load the configuration
    dashboardActions.loadConfiguration(config)

    // Check that sidebar state was restored
    const state = dashboardStore.state
    expect(state.sidebarOpen).toBe(true)
    expect(state.sidebarPinned).toBe(true)
  })

  it('should persist sidebar state changes to localStorage', () => {
    // Mock the export configuration
    const mockConfig: DashboardConfig = {
      version: '1.0.0',
      screens: [],
      theme: 'auto',
      sidebarOpen: true,
      sidebarPinned: false,
    }

    // Save configuration
    saveDashboardConfig(mockConfig)

    // Check localStorage was called
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'liebe-config',
      JSON.stringify(mockConfig)
    )
  })

  it('should mark state as dirty when sidebar state changes', () => {
    // Initial state should not be dirty
    expect(dashboardStore.state.isDirty).toBe(false)

    // Toggle sidebar
    dashboardActions.toggleSidebar(true)
    expect(dashboardStore.state.isDirty).toBe(true)

    // Mark clean
    dashboardActions.markClean()
    expect(dashboardStore.state.isDirty).toBe(false)

    // Toggle pin
    dashboardActions.toggleSidebarPin()
    expect(dashboardStore.state.isDirty).toBe(true)
  })

  it('should preserve sidebar state when not specified in config', () => {
    // Set initial sidebar state
    dashboardActions.toggleSidebar(true)
    dashboardActions.toggleSidebarPin()
    dashboardActions.markClean()

    // Load config without sidebar state
    const config: DashboardConfig = {
      version: '1.0.0',
      screens: [],
      theme: 'dark',
    }
    dashboardActions.loadConfiguration(config)

    // Sidebar state should be preserved
    const state = dashboardStore.state
    expect(state.sidebarOpen).toBe(true)
    expect(state.sidebarPinned).toBe(true)
    expect(state.theme).toBe('dark') // Theme should be updated
  })
})
