import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '~/components/Dashboard';
import { dashboardStore, dashboardActions } from '~/store/dashboardStore';
import type { ScreenConfig } from '~/store/types';

export const Route = createFileRoute('/screen/$screenId')({
  beforeLoad: ({ params }) => {
    // Set the current screen when navigating to this route
    const { screenId } = params;
    console.log('Route beforeLoad: navigating to screen:', screenId);
    
    // Find the screen in the store
    const findScreen = (screens: ScreenConfig[], id: string): boolean => {
      for (const screen of screens) {
        if (screen.id === id) {
          return true;
        }
        if (screen.children && findScreen(screen.children, id)) {
          return true;
        }
      }
      return false;
    };
    
    const state = dashboardStore.state;
    const screenExists = findScreen(state.screens, screenId);
    
    if (screenExists) {
      // Only update if it's different to avoid loops
      if (state.currentScreenId !== screenId) {
        console.log('Setting current screen to:', screenId);
        dashboardActions.setCurrentScreen(screenId);
      }
    }
    
    return {
      screenExists,
    };
  },
  component: ScreenView,
});

function ScreenView() {
  const { screenId } = Route.useParams();
  const { screenExists } = Route.useRouteContext();
  
  if (!screenExists) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Screen Not Found</h2>
        <p>The screen with ID &quot;{screenId}&quot; does not exist.</p>
      </div>
    );
  }
  
  // The Dashboard component will render the current screen
  return <Dashboard />;
}