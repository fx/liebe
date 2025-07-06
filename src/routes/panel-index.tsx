import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '~/components/Dashboard'

// Simple index route for the panel that doesn't do any redirects
export const Route = createFileRoute('/panel-index')({
  component: Dashboard,
})