import { createFileRoute, redirect } from '@tanstack/react-router'
import { Dashboard } from '~/components/Dashboard'
import { dashboardStore } from '~/store/dashboardStore'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // If there are screens, redirect to the first one
    const state = dashboardStore.state
    if (state.screens.length > 0) {
      const firstScreen = state.screens[0]
      throw redirect({
        to: '/$slug',
        params: { slug: firstScreen.slug },
      })
    }
  },
  component: Dashboard,
})
