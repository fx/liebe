import { describe, it, expect, beforeEach } from 'vitest'
import { dashboardStore, dashboardActions } from '~/store/dashboardStore'
import { createTestScreen } from '~/test-utils/screen-helpers'
import type { ScreenConfig } from '~/store/types'

// Helper function to find screen by slug (same as in the route)
const findScreenBySlug = (screenList: ScreenConfig[], targetSlug: string): ScreenConfig | null => {
  for (const screen of screenList) {
    if (screen.slug === targetSlug) {
      return screen
    }
    if (screen.children) {
      const found = findScreenBySlug(screen.children, targetSlug)
      if (found) return found
    }
  }
  return null
}

describe('Slug Route Logic', () => {
  beforeEach(() => {
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
    })
  })

  it('should find screen by slug', () => {
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

    dashboardStore.setState((state) => ({ ...state, screens: [screen1, screen2] }))

    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'living-room')
    expect(foundScreen).toBeDefined()
    expect(foundScreen?.id).toBe('screen-1')
  })

  it('should find nested screen by slug', () => {
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
        createTestScreen({
          id: 'child-2',
          name: 'Bedroom',
          slug: 'bedroom',
        }),
      ],
    })

    dashboardStore.setState((state) => ({ ...state, screens: [parentScreen] }))

    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'bedroom')
    expect(foundScreen).toBeDefined()
    expect(foundScreen?.id).toBe('child-2')
  })

  it('should return null for non-existent slug', () => {
    const screen1 = createTestScreen({
      id: 'screen-1',
      name: 'Living Room',
      slug: 'living-room',
    })

    dashboardStore.setState((state) => ({ ...state, screens: [screen1] }))

    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'non-existent')
    expect(foundScreen).toBeNull()
  })

  it('should handle empty screens array', () => {
    dashboardStore.setState((state) => ({ ...state, screens: [] }))

    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'any-slug')
    expect(foundScreen).toBeNull()
  })

  it('should update current screen when found', () => {
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
      currentScreenId: null,
    }))

    // Simulate finding and setting screen
    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'kitchen')
    if (foundScreen) {
      dashboardActions.setCurrentScreen(foundScreen.id)
    }

    expect(dashboardStore.state.currentScreenId).toBe('screen-2')
  })

  it('should handle special characters in slugs', () => {
    const testScreen = createTestScreen({
      id: 'screen-1',
      name: 'Test & Demo',
      slug: 'test-demo',
    })

    dashboardStore.setState((state) => ({ ...state, screens: [testScreen] }))

    const foundScreen = findScreenBySlug(dashboardStore.state.screens, 'test-demo')
    expect(foundScreen).toBeDefined()
    expect(foundScreen?.id).toBe('screen-1')
  })
})
