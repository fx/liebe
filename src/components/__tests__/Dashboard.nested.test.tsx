import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Dashboard } from '../Dashboard';
import { dashboardActions } from '../../store';
import { createTestScreen } from '../../test-utils/screen-helpers';

// Helper function to render with Theme
const renderWithTheme = (component: React.ReactElement) => {
  return render(<Theme>{component}</Theme>);
};

describe('Dashboard - Nested Views', () => {
  beforeEach(() => {
    dashboardActions.resetState();
  });

  it('should display nested view content when selected', () => {
    // Create parent view
    dashboardActions.addScreen(createTestScreen({
      id: 'parent-1',
      name: 'Main Floor',
    }));
    
    // Create nested view
    dashboardActions.addScreen(createTestScreen({
      id: 'child-1',
      name: 'Living Room',
    }), 'parent-1');
    
    // Select the nested view
    dashboardActions.setCurrentScreen('child-1');
    
    renderWithTheme(<Dashboard />);
    
    // Should show the nested view content, not "Create Your First View"
    expect(screen.queryByText('No views created yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Create Your First View')).not.toBeInTheDocument();
    
    // Should show the nested view information
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Grid: 12 × 8')).toBeInTheDocument();
    expect(screen.getByText(/No entities added yet/)).toBeInTheDocument();
  });

  it('should handle deeply nested views', () => {
    // Create parent
    dashboardActions.addScreen(createTestScreen({
      id: 'floor-1',
      name: 'First Floor',
    }));
    
    // Create child
    dashboardActions.addScreen(createTestScreen({
      id: 'area-1',
      name: 'Living Area',
    }), 'floor-1');
    
    // Create grandchild
    dashboardActions.addScreen(createTestScreen({
      id: 'room-1',
      name: 'TV Room',
      grid: { resolution: { columns: 10, rows: 6 }, sections: [] },
    }), 'area-1');
    
    // Select the grandchild
    dashboardActions.setCurrentScreen('room-1');
    
    renderWithTheme(<Dashboard />);
    
    // Should show the grandchild view content
    expect(screen.getByText('TV Room')).toBeInTheDocument();
    expect(screen.getByText('Grid: 10 × 6')).toBeInTheDocument();
  });

  it('should handle switching between nested and top-level views', () => {
    // Create views
    dashboardActions.addScreen(createTestScreen({
      id: 'top-1',
      name: 'Overview',
    }));
    
    dashboardActions.addScreen(createTestScreen({
      id: 'nested-1',
      name: 'Kitchen',
      grid: { resolution: { columns: 8, rows: 6 }, sections: [] },
    }), 'top-1');
    
    const { rerender } = render(<Dashboard />);
    
    // First select nested view
    dashboardActions.setCurrentScreen('nested-1');
    rerender(<Dashboard />);
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Grid: 8 × 6')).toBeInTheDocument();
    
    // Then switch to top-level view
    dashboardActions.setCurrentScreen('top-1');
    rerender(<Dashboard />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Grid: 12 × 8')).toBeInTheDocument();
  });
});