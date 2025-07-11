import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { getPanelBasePath } from './config/panel'

export function createRouter() {
  // Determine base path for Home Assistant custom panel
  let basepath: string | undefined = undefined

  if (typeof window !== 'undefined') {
    basepath = getPanelBasePath(window.location.pathname)
  }

  const router = createTanStackRouter({
    routeTree,
    basepath,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}

export const router = createRouter()
