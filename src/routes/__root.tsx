/// <reference types="vite/client" />
import { createRootRoute, Outlet, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { useHomeAssistantRouting } from '~/hooks/useHomeAssistantRouting'
import { useDashboardPersistence, useDashboardStore } from '~/store'
import '~/styles/app.css'

export const Route = createRootRoute({
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  // Enable persistence globally
  useDashboardPersistence()

  // Enable Home Assistant routing sync
  useHomeAssistantRouting()

  // Get theme from dashboard store
  const theme = useDashboardStore((state) => state.theme)
  const [systemPrefersDark, setSystemPrefersDark] = React.useState(false)

  // Listen for system theme changes
  React.useEffect(() => {
    if (theme !== 'auto' || typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemPrefersDark(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  // Determine the appearance based on theme setting
  const getAppearance = () => {
    if (theme === 'light' || theme === 'dark') {
      return theme
    }
    // For 'auto', use system preference
    if (theme === 'auto') {
      return systemPrefersDark ? 'dark' : 'light'
    }
    // Default to light
    return 'light'
  }

  return (
    <>
      <Theme appearance={getAppearance()}>
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
      </Theme>
      <Scripts />
    </>
  )
}
