import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function createRouter() {
  // Determine base path for Home Assistant custom panel
  // In HA, the panel is served at /liebe/ (or whatever url_path is configured)
  const isInHomeAssistant = typeof window !== 'undefined' && window.location.pathname.includes('/liebe')
  const basepath = isInHomeAssistant ? '/liebe' : undefined
  
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
