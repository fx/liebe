/// <reference types="vite/client" />
import { createRootRoute, Outlet, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { LiebeThemeProvider } from '~/components/LiebeThemeProvider'
import { NotFound } from '~/components/NotFound'
import { useHomeAssistantRouting, useIsHomeAssistant } from '~/hooks'
import { useDashboardPersistence } from '~/store'
import { useThemeSelection } from '~/theme/useThemeSelection'
import '~/styles/app.css'

export const Route = createRootRoute({
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

/**
 * The routed tree's own theme root.
 *
 * Standalone (the dev SPA) this is the only one; inside the panel it nests
 * under `PanelApp`'s. Either way it is a `LiebeThemeProvider` reading the same
 * `useThemeSelection`, which is what keeps the two in step: a plain Radix
 * `Theme` here would re-declare every `--liebe-*` token on an element carrying
 * none of the theming stamps, and a token override the user wrote against
 * `.liebe-root` would then lose to the base sheet on this element (a
 * declaration beats an inherited value, whatever the layer). It used to resolve
 * the appearance a second time as well, from its own media-query state, which
 * rendered light for one frame on a dark OS and ignored a theme's forced
 * appearance.
 */
export function RootComponent() {
  // Enable persistence globally
  useDashboardPersistence()

  // Enable Home Assistant routing sync
  useHomeAssistantRouting()

  // Check if we're running in Home Assistant
  const isInHomeAssistant = useIsHomeAssistant()

  const { themeId, appearance } = useThemeSelection()

  return (
    <>
      <LiebeThemeProvider themeId={themeId} appearance={appearance}>
        <Outlet />
        {!isInHomeAssistant && <TanStackRouterDevtools position="bottom-right" />}
      </LiebeThemeProvider>
      <Scripts />
    </>
  )
}
