import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '~/components/Dashboard'

// Simple index route for the panel that doesn't redirect
export const Route = createFileRoute('/panel/')({
  component: Dashboard,
})