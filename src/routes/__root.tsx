/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { DevHomeAssistantProvider } from '~/components/DevHomeAssistantProvider'
import { useHomeAssistantRouting } from '~/hooks/useHomeAssistantRouting'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title: 'Liebe Dashboard | Home Assistant Custom Dashboard',
        description: 'A custom dashboard for Home Assistant built with React and TanStack Start',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Enable Home Assistant routing sync
  useHomeAssistantRouting()
  
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Theme>
          <DevHomeAssistantProvider>
            {children}
            <TanStackRouterDevtools position="bottom-right" />
          </DevHomeAssistantProvider>
        </Theme>
        <Scripts />
      </body>
    </html>
  )
}