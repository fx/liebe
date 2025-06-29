import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from '../../routeTree.gen';
import { ViewTabs } from '../ViewTabs';
import { dashboardStore, dashboardActions } from '../../store/dashboardStore';
import type { ScreenConfig } from '../../store/types';

describe('ViewTabs Integration Test', () => {
  it('should render tabs and handle clicks', async () => {
    // Set up some test screens
    const testScreens: ScreenConfig[] = [
      {
        id: 'test-1',
        name: 'Test Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
      {
        id: 'test-2',
        name: 'Test Screen 2',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];

    // Reset store
    dashboardActions.resetState();
    
    // Add screens
    testScreens.forEach(screen => dashboardActions.addScreen(screen));
    dashboardActions.setCurrentScreen('test-1');

    // Create router with test setup
    const router = createRouter({
      routeTree,
      history: {
        initialEntries: ['/'],
      },
    });

    // Render with router context
    const { container } = render(
      <RouterProvider router={router}>
        <ViewTabs />
      </RouterProvider>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Test Screen 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Test Screen 2' })).toBeInTheDocument();
    });

    // Get current location before click
    const locationBefore = router.state.location.pathname;
    console.log('Location before click:', locationBefore);

    // Click on second tab
    const tab2 = screen.getByRole('tab', { name: 'Test Screen 2' });
    fireEvent.click(tab2);

    // Wait for navigation
    await waitFor(() => {
      const locationAfter = router.state.location.pathname;
      console.log('Location after click:', locationAfter);
      expect(locationAfter).toBe('/screen/test-2');
    }, { timeout: 3000 });
  });
});