import { createFileRoute } from '@tanstack/react-router';
import React, { useEffect } from 'react';
import { Dashboard } from '~/components/Dashboard';
import { dashboardActions, useDashboardStore } from '~/store/dashboardStore';
import type { ScreenConfig } from '~/store/types';

export const Route = createFileRoute('/$slug')({
  component: ScreenView,
});

function ScreenView() {
  const { slug } = Route.useParams();
  const screens = useDashboardStore((state) => state.screens);
  const currentScreenId = useDashboardStore((state) => state.currentScreenId);
  
  // Find screen by slug
  const findScreenBySlug = (screenList: ScreenConfig[], targetSlug: string): ScreenConfig | null => {
    for (const screen of screenList) {
      if (screen.slug === targetSlug) {
        return screen;
      }
      if (screen.children) {
        const found = findScreenBySlug(screen.children, targetSlug);
        if (found) return found;
      }
    }
    return null;
  };
  
  const screen = findScreenBySlug(screens, slug);
  
  // Use effect to update current screen when route changes
  useEffect(() => {
    if (screen && currentScreenId !== screen.id) {
      dashboardActions.setCurrentScreen(screen.id);
    }
  }, [screen, currentScreenId]);
  
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
  
  if (!screen) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Screen Not Found</h2>
        <p>The screen with slug &quot;{slug}&quot; does not exist.</p>
      </div>
    );
  }
  
  // The Dashboard component will render the current screen
  return <Dashboard />;
}