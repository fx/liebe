import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../Dashboard';
import { dashboardActions } from '../../store';

describe('Dashboard - Nested Views', () => {
  beforeEach(() => {
    dashboardActions.resetState();
  });

  it('should display nested view content when selected', () => {
    // Create parent view
    dashboardActions.addScreen({
      id: 'parent-1',
      name: 'Main Floor',
      type: 'grid',
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [],
      },
    });
    
    // Create nested view
    dashboardActions.addScreen({
      id: 'child-1',
      name: 'Living Room',
      type: 'grid',
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [],
      },
    }, 'parent-1');
    
    // Select the nested view
    dashboardActions.setCurrentScreen('child-1');
    
    render(<Dashboard />);
    
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
    dashboardActions.addScreen({
      id: 'floor-1',
      name: 'First Floor',
      type: 'grid',
      grid: { resolution: { columns: 12, rows: 8 }, items: [] },
    });
    
    // Create child
    dashboardActions.addScreen({
      id: 'area-1',
      name: 'Living Area',
      type: 'grid',
      grid: { resolution: { columns: 12, rows: 8 }, items: [] },
    }, 'floor-1');
    
    // Create grandchild
    dashboardActions.addScreen({
      id: 'room-1',
      name: 'TV Room',
      type: 'grid',
      grid: { resolution: { columns: 10, rows: 6 }, items: [] },
    }, 'area-1');
    
    // Select the grandchild
    dashboardActions.setCurrentScreen('room-1');
    
    render(<Dashboard />);
    
    // Should show the grandchild view content
    expect(screen.getByText('TV Room')).toBeInTheDocument();
    expect(screen.getByText('Grid: 10 × 6')).toBeInTheDocument();
  });

  it('should handle switching between nested and top-level views', () => {
    // Create views
    dashboardActions.addScreen({
      id: 'top-1',
      name: 'Overview',
      type: 'grid',
      grid: { resolution: { columns: 12, rows: 8 }, items: [] },
    });
    
    dashboardActions.addScreen({
      id: 'nested-1',
      name: 'Kitchen',
      type: 'grid',
      grid: { resolution: { columns: 8, rows: 6 }, items: [] },
    }, 'top-1');
    
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