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
/**
 * Strip a trailing extension so './routes/x' and './routes/x.tsx' map
 * identically; anything else passes through unchanged (and misses the map).
 */
export function normalizeRouteSource(source: string): string {
  return source.replace(/\.tsx?$/, '')
}

/**
 * The file-route id + path the stub registers for a normalized dev source, or
 * null when the source is not a stubbed dev route. Both fields mirror the
 * real route modules (`createFileRoute('/test-store')`,
 * `createFileRoute('/__root/test/performance')` with path '/test/performance').
 */
export function stubRoutePath(normalized: string): { id: string; path: string } | null {
  if (normalized === './routes/test-store') return { id: '/test-store', path: '/test-store' }
  if (normalized === './routes/__root.test.performance')
    return { id: '/__root/test/performance', path: '/test/performance' }
  return null
}

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
