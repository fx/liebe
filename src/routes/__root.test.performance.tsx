import { createFileRoute } from '@tanstack/react-router'
import { EntityBrowserPerformanceTest } from '~/components/EntityBrowserPerformanceTest'
import { NotFound } from '~/components/NotFound'
import { resolveDevRouteComponent } from './devRoute'

function DevOnlyNotFound() {
  return <NotFound />
}

// Dev-only route: same production exclusion as `/test-store` — the perf
// harness never ships in the panel artifact.
export const Route = createFileRoute('/__root/test/performance')({
  component: resolveDevRouteComponent(
    import.meta.env.DEV,
    EntityBrowserPerformanceTest,
    DevOnlyNotFound
  ),
})
