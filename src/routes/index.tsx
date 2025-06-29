import { createFileRoute, redirect } from '@tanstack/react-router'
import { Dashboard } from '~/components/Dashboard'
import { dashboardStore } from '~/store/dashboardStore'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    console.log('Index route beforeLoad');
    // If there are screens, redirect to the first one
    const state = dashboardStore.state;
    if (state.screens.length > 0) {
      const firstScreen = state.screens[0];
      console.log('Redirecting to first screen:', firstScreen.id);
      throw redirect({
        to: '/screen/$screenId',
        params: { screenId: firstScreen.id },
      });
    }
  },
  component: Dashboard,
})