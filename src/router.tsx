import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function createRouter() {
  // Determine base path for Home Assistant custom panel
  // In HA, the panel is served at /liebe/ (production) or /liebe-dev/ (development)
  let basepath: string | undefined = undefined
  
  if (typeof window !== 'undefined') {
    if (window.location.pathname.includes('/liebe-dev')) {
      basepath = '/liebe-dev'
    } else if (window.location.pathname.includes('/liebe')) {
      basepath = '/liebe'
    }
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
