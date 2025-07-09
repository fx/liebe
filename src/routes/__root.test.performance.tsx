import { createFileRoute } from '@tanstack/react-router'
import { EntityBrowserPerformanceTest } from '~/components/EntityBrowserPerformanceTest'

export const Route = createFileRoute('/__root/test/performance')({
  component: EntityBrowserPerformanceTest,
})