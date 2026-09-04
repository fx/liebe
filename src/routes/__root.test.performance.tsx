import { createFileRoute } from '@tanstack/react-router'
import { EntityBrowserPerformanceTest } from '~/components/EntityBrowserPerformanceTest'

// Dev-only route: same production exclusion as `/test-store` (build-time stub
// via devRouteStubPlugin) — the perf harness never ships in the panel artifact.
export const Route = createFileRoute('/__root/test/performance')({
  component: EntityBrowserPerformanceTest,
})
