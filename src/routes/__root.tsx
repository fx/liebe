/// <reference types="vite/client" />
import {
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { DevHomeAssistantProvider } from '~/components/DevHomeAssistantProvider'
import { useHomeAssistantRouting } from '~/hooks/useHomeAssistantRouting'
import { useDashboardPersistence } from '~/store'
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
  
  return (
    <Theme>
      <DevHomeAssistantProvider>
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
      </DevHomeAssistantProvider>
    </Theme>
  )
}