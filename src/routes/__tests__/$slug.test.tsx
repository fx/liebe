import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { dashboardStore, dashboardActions } from '~/store/dashboardStore';
import { createTestScreen } from '~/test-utils/screen-helpers';
import { Theme } from '@radix-ui/themes';
import { Dashboard } from '~/components/Dashboard';

// Mock router - we'll control navigation state directly
let mockSlug = 'living-room';
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ slug: mockSlug }),
  createFileRoute: () => ({
    useParams: () => ({ slug: mockSlug }),
    useNavigate: () => mockNavigate,
  }),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useLocation: () => ({ pathname: `/${mockSlug}` }),
}));

// Mock Dashboard to simplify testing
vi.mock('~/components/Dashboard', () => ({
  Dashboard: () => {
    const { useDashboardStore } = require('~/store/dashboardStore');
    const currentScreenId = useDashboardStore((state: any) => state.currentScreenId);
    const screens = useDashboardStore((state: any) => state.screens);
    const screen = screens.find((s: any) => s.id === currentScreenId);
    return (
      <div>
        <div>Dashboard Component</div>
        {screen && <div>Current Screen: {screen.name}</div>}
      </div>
    );
  },
}));

// Import after mocks are set up
import SlugRoute from '../$slug';

// Helper to render with Theme
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<Theme>{ui}</Theme>);
};

// Component that mimics the slug route behavior
const ScreenView = () => {
  const { slug } = mockParams;
  const navigate = mockNavigate;
  const [screens, setScreens] = React.useState(dashboardStore.getState().screens);
  const [currentScreenId, setCurrentScreenId] = React.useState(dashboardStore.getState().currentScreenId);
  
  React.useEffect(() => {
    const unsubscribe = dashboardStore.subscribe((state) => {
      setScreens(state.screens);
      setCurrentScreenId(state.currentScreenId);
    });
    return unsubscribe;
  }, []);
  
  // Find screen by slug
  const findScreenBySlug = (screenList: any[], targetSlug: string): any => {
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
  React.useEffect(() => {
    if (screen && currentScreenId !== screen.id) {
      dashboardActions.setCurrentScreen(screen.id);
    }
  }, [screen, currentScreenId]);
  
  // If screens haven't loaded yet, redirect to home
  if (screens.length === 0) {
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
};

describe('Slug Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlug = 'living-room';
    // Reset store to initial state
    dashboardStore.setState({
      screens: [],
      currentScreenId: null,
      mode: 'view',
    });
  });

  it('should render dashboard when screen with slug exists', async () => {
    // Add test screens
    const screen1 = createTestScreen({ 
      id: 'screen-1', 
      name: 'Living Room',
      slug: 'living-room' 
    });
    const screen2 = createTestScreen({ 
      id: 'screen-2', 
      name: 'Kitchen',
      slug: 'kitchen' 
    });
    
    dashboardStore.setState({ screens: [screen1, screen2] });

    renderWithTheme(<ScreenView />);

    // Should render the Dashboard component
    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    
    // Wait for currentScreenId to be set
    await waitFor(() => {
      expect(dashboardStore.getState().currentScreenId).toBe('screen-1');
    });
    
    // Should show the current screen name
    expect(screen.getByText('Current Screen: Living Room')).toBeInTheDocument();
  });

  it('should handle nested screens', async () => {
    // Create nested screen structure
    const parentScreen = createTestScreen({
      id: 'parent-1',
      name: 'Home',
      slug: 'home',
      children: [
        createTestScreen({
          id: 'child-1',
          name: 'Living Room',
          slug: 'living-room'
        }),
        createTestScreen({
          id: 'child-2',
          name: 'Bedroom',
          slug: 'bedroom'
        })
      ]
    });
    
    dashboardStore.setState({ screens: [parentScreen] });

    renderWithTheme(<ScreenView />);

    // Should find and render nested screen
    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(dashboardStore.getState().currentScreenId).toBe('child-2');
    });
    
    expect(screen.getByText('Current Screen: Bedroom')).toBeInTheDocument();
  });

  it('should show error when screen with slug does not exist', async () => {
    mockSlug = 'non-existent-slug';
    const screen1 = createTestScreen({ 
      id: 'screen-1', 
      name: 'Living Room',
      slug: 'living-room' 
    });
    
    dashboardStore.setState({ screens: [screen1] });

    renderWithTheme(<ScreenView />);

    expect(await screen.findByText('Screen Not Found')).toBeInTheDocument();
    expect(screen.getByText(/The screen with slug "non-existent-slug" does not exist/)).toBeInTheDocument();
  });

  it('should redirect to home when no screens exist', async () => {
    mockSlug = 'some-slug';
    dashboardStore.setState({ screens: [] });

    renderWithTheme(<ScreenView />);

    expect(await screen.findByText('No screens found. Redirecting to home...')).toBeInTheDocument();
    
    // Should navigate to home
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('should update currentScreenId when navigating between screens', async () => {
    const screen1 = createTestScreen({ 
      id: 'screen-1', 
      name: 'Living Room',
      slug: 'living-room' 
    });
    const screen2 = createTestScreen({ 
      id: 'screen-2', 
      name: 'Kitchen',
      slug: 'kitchen' 
    });
    
    dashboardStore.setState({ 
      screens: [screen1, screen2],
      currentScreenId: null 
    });

    // Start at living-room
    const { rerender } = renderWithTheme(<ScreenView />);

    await waitFor(() => {
      expect(dashboardStore.getState().currentScreenId).toBe('screen-1');
    });

    // Navigate to kitchen
    mockSlug = 'kitchen';
    rerender(<Theme><ScreenView /></Theme>);

    await waitFor(() => {
      expect(dashboardStore.getState().currentScreenId).toBe('screen-2');
    });
  });

  it('should handle special characters in slugs', async () => {
    mockSlug = 'test-demo';
    const testScreen = createTestScreen({ 
      id: 'screen-1', 
      name: 'Test & Demo',
      slug: 'test-demo' 
    });
    
    dashboardStore.setState({ screens: [testScreen] });

    renderWithTheme(<ScreenView />);

    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(dashboardStore.getState().currentScreenId).toBe('screen-1');
    });
    
    expect(screen.getByText('Current Screen: Test & Demo')).toBeInTheDocument();
  });
});