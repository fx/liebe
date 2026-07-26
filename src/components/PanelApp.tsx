import { dashboardActions, dashboardStore } from '~/store/dashboardStore'
import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '~/router'
import { LiebeThemeProvider } from './LiebeThemeProvider'
import { useThemeSelection } from '~/theme/useThemeSelection'

export function PanelApp() {
  // Resolved here rather than inside the provider: the provider is the shell
  // the workshop shares, and the workshop's toolbar — not the dashboard
  // configuration — decides what it renders.
  const { themeId, appearance } = useThemeSelection()

  useEffect(() => {
    // Initialize the dashboard store
    // For panel mode, we start with no screens and let the user create them
    const state = dashboardStore.state
    if (!state.currentScreenId && state.screens.length > 0) {
      dashboardActions.setCurrentScreen(state.screens[0].id)
    }
  }, [])

  return (
    <LiebeThemeProvider themeId={themeId} appearance={appearance}>
      <RouterProvider router={router} />
    </LiebeThemeProvider>
  )
}
