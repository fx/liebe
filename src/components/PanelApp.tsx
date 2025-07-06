import { Theme } from '@radix-ui/themes'
import { Dashboard } from './Dashboard'
import { dashboardActions, dashboardStore } from '~/store/dashboardStore'
import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { panelRouter } from '~/panel-router'

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
    <Theme>
      <RouterProvider router={panelRouter} />
    </Theme>
  )
}