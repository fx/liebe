import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from '@tanstack/react-router';
import { Route as SlugRoute } from '../$slug';
import { Route as RootRoute } from '../__root';
import { dashboardStore, dashboardActions } from '~/store/dashboardStore';
import { createTestScreen } from '~/test-utils/screen-helpers';

// Mock the Dashboard component
vi.mock('~/components/Dashboard', () => ({
  Dashboard: () => <div>Dashboard Component</div>
}));

// We need to mock useNavigate but not the entire router module
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Create a test router with our routes
function createTestRouter(initialPath = '/') {
  const rootRoute = RootRoute;
  const slugRoute = SlugRoute;
  
  const routeTree = rootRoute.addChildren([slugRoute]);
  
  return createMemoryRouter({
    routeTree,
    basepath: '',
    defaultPreload: 'intent',
    history: {
      initialEntries: [initialPath],
    },
  });
}

describe('Slug Route', () => {
  beforeEach(() => {
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

    const router = createTestRouter('/living-room');
    render(<RouterProvider router={router} />);

    // Should render the Dashboard component
    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    
    // Should set the current screen ID
    expect(dashboardStore.getState().currentScreenId).toBe('screen-1');
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

    const router = createTestRouter('/bedroom');
    render(<RouterProvider router={router} />);

    // Should find and render nested screen
    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    expect(dashboardStore.getState().currentScreenId).toBe('child-2');
  });

  it('should show error when screen with slug does not exist', async () => {
    const screen1 = createTestScreen({ 
      id: 'screen-1', 
      name: 'Living Room',
      slug: 'living-room' 
    });
    
    dashboardStore.setState({ screens: [screen1] });

    const router = createTestRouter('/non-existent-slug');
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Screen Not Found')).toBeInTheDocument();
    expect(screen.getByText(/The screen with slug "non-existent-slug" does not exist/)).toBeInTheDocument();
  });

  it('should redirect to home when no screens exist', async () => {
    const navigateMock = vi.fn();
    
    // Mock useNavigate
    vi.mock('@tanstack/react-router', async () => {
      const actual = await vi.importActual('@tanstack/react-router');
      return {
        ...actual,
        useNavigate: () => navigateMock,
      };
    });

    dashboardStore.setState({ screens: [] });

    const router = createTestRouter('/some-slug');
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('No screens found. Redirecting to home...')).toBeInTheDocument();
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
      currentScreenId: 'screen-1' 
    });

    // Start at living-room
    const router = createTestRouter('/living-room');
    const { rerender } = render(<RouterProvider router={router} />);

    expect(dashboardStore.getState().currentScreenId).toBe('screen-1');

    // Navigate to kitchen
    await router.navigate({ to: '/kitchen' });
    rerender(<RouterProvider router={router} />);

    expect(dashboardStore.getState().currentScreenId).toBe('screen-2');
  });

  it('should handle special characters in slugs', async () => {
    const screen = createTestScreen({ 
      id: 'screen-1', 
      name: 'Test & Demo',
      slug: 'test-demo' 
    });
    
    dashboardStore.setState({ screens: [screen] });

    const router = createTestRouter('/test-demo');
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Dashboard Component')).toBeInTheDocument();
    expect(dashboardStore.getState().currentScreenId).toBe('screen-1');
  });
});