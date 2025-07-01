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
import { RemoteHomeAssistantProvider } from '~/components/RemoteHomeAssistantProvider'
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

  // Check if we're running in an iframe (remote mode)
  const isInIframe = typeof window !== 'undefined' && window.parent !== window

  const content = (
    <>
      <Theme>
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
      </Theme>
      <Scripts />
    </>
  )

  // Wrap with RemoteHomeAssistantProvider if in iframe
  if (isInIframe) {
    return <RemoteHomeAssistantProvider>{content}</RemoteHomeAssistantProvider>
  }

  return content
}
