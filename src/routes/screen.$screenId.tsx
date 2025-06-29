import { createFileRoute } from '@tanstack/react-router';
import React, { useEffect } from 'react';
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
  
  // If screens haven't loaded yet, redirect to home
  if (screens.length === 0) {
    const navigate = Route.useNavigate();
    React.useEffect(() => {
      navigate({ to: '/' });
    }, [navigate]);
    
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No screens found. Redirecting to home...</p>
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