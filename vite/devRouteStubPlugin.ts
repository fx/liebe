import type { Plugin } from 'vite'

/**
 * Production panel diet (change 0044, PR 3): keep dev-only file routes OUT of
 * the prod bundle's module graph.
 *
 * The DEV render-gate (`resolveDevRouteComponent`) hides the pages but cannot
 * remove them: a static import is bundled whether or not its component ever
 * renders (and `inlineDynamicImports` inlines lazy chunks too, so `lazy()`
 * would not help either). This plugin resolves the two dev route files to a
 * virtual stub in production builds only — same route paths rendering
 * `NotFound`, zero harness bytes. Development resolves the real files, so the
 * workshop and its route tests keep working.
 */
export function devRouteStubPlugin(isProduction: boolean): Plugin {
  return {
    name: 'liebe:dev-route-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!isProduction) return null
      if (importer === undefined) return null

      // routeTree.gen imports the dev routes as './routes/...' from src/.
      // Direct imports elsewhere (route tests, dev SPA) keep the real files.
      if (
        importer.endsWith('/src/routeTree.gen.ts') &&
        (source === './routes/test-store' ||
          source === './routes/__root.test.performance' ||
          source === './routes/__root.test.performance.tsx' ||
          source === './routes/test-store.tsx')
      ) {
        return `\0liebe:dev-route-stub:${source}`
      }
      return null
    },
    load(id) {
      if (!id.startsWith('\0liebe:dev-route-stub:')) return null
      const source = id.slice('\0liebe:dev-route-stub:'.length)
      const routePath = source === './routes/test-store' ? '/test-store' : '/test/performance'
      return `import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'
export const Route = createFileRoute('${routePath}')({
  component: NotFound,
})
`
    },
  }
}
