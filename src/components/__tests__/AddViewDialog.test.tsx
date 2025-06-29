import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddViewDialog } from '../AddViewDialog';
import { dashboardActions, dashboardStore } from '../../store';

describe('AddViewDialog', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    dashboardActions.resetState();
    mockOnOpenChange.mockClear();
  });

  it('should render when open is true', () => {
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    expect(screen.getByText('Add New View')).toBeInTheDocument();
    expect(screen.getByText('Create a new view to organize your dashboard')).toBeInTheDocument();
  });

  it('should not render when open is false', () => {
    render(<AddViewDialog open={false} onOpenChange={mockOnOpenChange} />);
    
    expect(screen.queryByText('Add New View')).not.toBeInTheDocument();
  });

  it('should have a disabled submit button when name is empty', () => {
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    const addButton = screen.getByRole('button', { name: 'Add View' });
    expect(addButton).toBeDisabled();
  });

  it('should enable submit button when name is entered', async () => {
    const user = userEvent.setup();
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    const input = screen.getByPlaceholderText('Living Room');
    await user.type(input, 'Test View');
    
    const addButton = screen.getByRole('button', { name: 'Add View' });
    expect(addButton).not.toBeDisabled();
  });

  it('should create a new view when form is submitted', async () => {
    const user = userEvent.setup();
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    // Enter view name
    const input = screen.getByPlaceholderText('Living Room');
    await user.type(input, 'Kitchen');
    
    // Submit form
    const addButton = screen.getByRole('button', { name: 'Add View' });
    await user.click(addButton);
    
    // Check if view was added to store
    await waitFor(() => {
      const state = dashboardStore.state;
      expect(state.screens).toHaveLength(1);
      expect(state.screens[0].name).toBe('Kitchen');
      expect(state.currentScreenId).toBe(state.screens[0].id);
    });
    
    // Check if dialog was closed
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should handle cancel button', async () => {
    const user = userEvent.setup();
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);
    
    // Dialog should request to close
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show parent view selector when views exist', () => {
    // Add some existing views
    dashboardActions.addScreen({
      id: 'parent-1',
      name: 'Main Floor',
      type: 'grid',
      grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
    });
    
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    expect(screen.getByText('Parent View (Optional)')).toBeInTheDocument();
    expect(screen.getByText('Select parent view...')).toBeInTheDocument();
  });

  it('should create a nested view when parent is selected', async () => {
    const user = userEvent.setup();
    
    // Add parent view
    dashboardActions.addScreen({
      id: 'parent-1',
      name: 'Main Floor',
      type: 'grid',
      grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
    });
    
    render(<AddViewDialog open={true} onOpenChange={mockOnOpenChange} />);
    
    // Enter view name
    const input = screen.getByPlaceholderText('Living Room');
    await user.type(input, 'Living Room');
    
    // Select parent
    const selectTrigger = screen.getByText('Select parent view...');
    await user.click(selectTrigger);
    
    const parentOption = screen.getByText('Main Floor');
    await user.click(parentOption);
    
    // Submit
    const addButton = screen.getByRole('button', { name: 'Add View' });
    await user.click(addButton);
    
    // Check if view was added as child
    await waitFor(() => {
      const state = dashboardStore.state;
      const parentScreen = state.screens[0];
      expect(parentScreen.children).toHaveLength(1);
      expect(parentScreen.children![0].name).toBe('Living Room');
    });
  });
});