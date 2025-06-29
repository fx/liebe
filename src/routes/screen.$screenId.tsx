import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Dashboard } from '~/components/Dashboard';
import { dashboardActions, useDashboardStore } from '~/store/dashboardStore';
import type { ScreenConfig } from '~/store/types';

export const Route = createFileRoute('/screen/$screenId')({
  component: ScreenView,
});

function ScreenView() {
  const { screenId } = Route.useParams();
  const screens = useDashboardStore((state) => state.screens);
  const currentScreenId = useDashboardStore((state) => state.currentScreenId);
  
  // Use effect to update current screen when route changes
  useEffect(() => {
    console.log('ScreenView: checking screen', screenId, 'in', screens.length, 'screens');
    
    // Find the screen in the store
    const findScreen = (screenList: ScreenConfig[], id: string): boolean => {
      for (const screen of screenList) {
        if (screen.id === id) {
          return true;
        }
        if (screen.children && findScreen(screen.children, id)) {
          return true;
        }
      }
      return false;
    };
    
    const screenExists = findScreen(screens, screenId);
    
    if (screenExists && currentScreenId !== screenId) {
      console.log('ScreenView: Setting current screen to:', screenId);
      dashboardActions.setCurrentScreen(screenId);
    }
  }, [screenId, screens, currentScreenId]);
  
  // Check if screen exists
  const findScreen = (screenList: ScreenConfig[], id: string): boolean => {
    for (const screen of screenList) {
      if (screen.id === id) {
        return true;
      }
      if (screen.children && findScreen(screen.children, id)) {
        return true;
      }
    }
    return false;
  };
  
  const screenExists = findScreen(screens, screenId);
  
  // If screens haven't loaded yet, show loading
  if (screens.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }
  
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