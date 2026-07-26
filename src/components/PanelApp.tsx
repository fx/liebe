import { dashboardActions, dashboardStore } from '~/store/dashboardStore'
import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '~/router'
import { LiebeThemeProvider } from './LiebeThemeProvider'

export function PanelApp() {
  useEffect(() => {
    // Initialize the dashboard store
    // For panel mode, we start with no screens and let the user create them
    const state = dashboardStore.state
    if (!state.currentScreenId && state.screens.length > 0) {
      dashboardActions.setCurrentScreen(state.screens[0].id)
    }
  }, [])

  return (
    <LiebeThemeProvider>
      <RouterProvider router={router} />
    </LiebeThemeProvider>
  )
}
