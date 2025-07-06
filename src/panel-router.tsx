import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function createPanelRouter() {
  // For the Home Assistant panel, we don't use a basepath
  // The panel handles its own routing within HA
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: false, // Disable for embedded panel
    defaultPendingMinMs: 0, // Don't show pending state in panel
    defaultPendingMs: 0,
  })

  return router
}

export const panelRouter = createPanelRouter()