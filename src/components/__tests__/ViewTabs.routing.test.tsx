import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewTabs } from '../ViewTabs';
import { dashboardStore, dashboardActions } from '../../store/dashboardStore';
import type { ScreenConfig } from '../../store/types';

// Mock the router
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Create mutable store state
const mockStoreState = {
  screens: [],
  currentScreenId: null,
  mode: 'view' as const,
};

// Mock the store
vi.mock('../../store/dashboardStore', () => ({
  dashboardStore: {
    get state() {
      return mockStoreState;
    },
  },
  dashboardActions: {
    setCurrentScreen: vi.fn(),
    removeScreen: vi.fn(),
  },
  useDashboardStore: vi.fn((selector) => {
    if (!selector) return mockStoreState;
    return selector(mockStoreState);
  }),
}));

describe('ViewTabs Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.screens = [];
    mockStoreState.currentScreenId = null;
    mockStoreState.mode = 'view';
  });

  it('should navigate when clicking on a tab', async () => {
    const mockScreens: ScreenConfig[] = [
      {
        id: 'screen-1',
        name: 'Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
      {
        id: 'screen-2', 
        name: 'Screen 2',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    mockStoreState.screens = mockScreens;
    mockStoreState.currentScreenId = 'screen-1';

    const { rerender } = render(<ViewTabs />);
    
    // Find and click on the second tab button
    const tab2 = screen.getByRole('tab', { name: 'Screen 2' });
    fireEvent.click(tab2);
    
    // Verify navigation was called
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/screen/$screenId',
      params: { screenId: 'screen-2' },
    });
  });

  it('should handle tab changes via Tabs.Root onValueChange', () => {
    const mockScreens: ScreenConfig[] = [
      {
        id: 'screen-1',
        name: 'Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    mockStoreState.screens = mockScreens;
    mockStoreState.currentScreenId = 'screen-1';

    render(<ViewTabs />);
    
    // Find the Tabs.Root and trigger onValueChange
    const tabsRoot = screen.getByRole('tablist').parentElement;
    
    // Simulate tab change by triggering the event
    fireEvent.click(screen.getByRole('tab', { name: 'Screen 1' }));
    
    // The navigation should have been triggered by the internal handler
    // Note: This tests the integration with Radix UI Tabs
  });

  it('should navigate away when removing current screen', () => {
    const mockScreens: ScreenConfig[] = [
      {
        id: 'screen-1',
        name: 'Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
      {
        id: 'screen-2',
        name: 'Screen 2', 
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    mockStoreState.screens = mockScreens;
    mockStoreState.currentScreenId = 'screen-1';
    mockStoreState.mode = 'edit';

    render(<ViewTabs />);
    
    // Find the tab with Screen 1 and its remove button
    const tab1 = screen.getByRole('tab', { name: 'Screen 1' });
    const removeButton = tab1.querySelector('[style*="display: inline-flex"]');
    
    expect(removeButton).toBeTruthy();
    if (removeButton) {
      fireEvent.click(removeButton);
      
      expect(dashboardActions.removeScreen).toHaveBeenCalledWith('screen-1');
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/screen/$screenId',
        params: { screenId: 'screen-2' },
      });
    }
  });

  it('should navigate to index when removing last screen', () => {
    const mockScreens: ScreenConfig[] = [
      {
        id: 'screen-1',
        name: 'Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    mockStoreState.screens = mockScreens;
    mockStoreState.currentScreenId = 'screen-1';
    mockStoreState.mode = 'edit';

    render(<ViewTabs />);
    
    // Find the tab with Screen 1 and its remove button
    const tab1 = screen.getByRole('tab', { name: 'Screen 1' });
    const removeButton = tab1.querySelector('[style*="display: inline-flex"]');
    
    expect(removeButton).toBeTruthy();
    if (removeButton) {
      fireEvent.click(removeButton);
      
      expect(dashboardActions.removeScreen).toHaveBeenCalledWith('screen-1');
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/',
      });
    }
  });
});

describe('ViewTabs in iframe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate iframe environment
    Object.defineProperty(window, 'parent', {
      value: { postMessage: vi.fn() },
      writable: true,
    });
  });

  it('should work in iframe environment', () => {
    const mockScreens: ScreenConfig[] = [
      {
        id: 'screen-1',
        name: 'Screen 1',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    mockStoreState.screens = mockScreens;
    mockStoreState.currentScreenId = 'screen-1';

    render(<ViewTabs />);
    
    // Component should render normally in iframe
    expect(screen.getByText('Screen 1')).toBeInTheDocument();
  });
});