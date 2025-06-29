import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';
import { dashboardActions } from '../../store';

describe('Dashboard', () => {
  beforeEach(() => {
    dashboardActions.resetState();
  });

  describe('Initial State', () => {
    it('should show "No views created yet" when there are no screens', () => {
      render(<Dashboard />);
      expect(screen.getByText('No views created yet')).toBeInTheDocument();
    });

    it('should show "Create Your First View" button when no screens exist', () => {
      render(<Dashboard />);
      expect(screen.getByText('Create Your First View')).toBeInTheDocument();
    });

    it('should start in view mode', () => {
      render(<Dashboard />);
      expect(screen.getByText('view mode')).toBeInTheDocument();
    });
  });

  describe('Mode Toggle', () => {
    it('should toggle between view and edit mode', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      const editButton = screen.getByText('Edit');
      expect(editButton).toBeInTheDocument();
      
      await user.click(editButton);
      expect(screen.getByText('edit mode')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
      
      await user.click(screen.getByText('Done'));
      expect(screen.getByText('view mode')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  describe('View Creation', () => {
    it('should open AddViewDialog when clicking "Create Your First View"', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      const createButton = screen.getByText('Create Your First View');
      await user.click(createButton);
      
      // Check if dialog is opened
      await waitFor(() => {
        expect(screen.getByText('Add New View')).toBeInTheDocument();
        expect(screen.getByText('Create a new view to organize your dashboard')).toBeInTheDocument();
      });
    });

    it('should open AddViewDialog when clicking + button in edit mode', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      // Switch to edit mode
      await user.click(screen.getByText('Edit'));
      
      // There should be an "Add First View" button since no views exist
      const addButton = screen.getByText('Add First View');
      await user.click(addButton);
      
      await waitFor(() => {
        expect(screen.getByText('Add New View')).toBeInTheDocument();
      });
    });

    it('should create a new view and display it', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      // Open dialog
      await user.click(screen.getByText('Create Your First View'));
      
      // Fill in view name
      const input = screen.getByPlaceholderText('Living Room');
      await user.type(input, 'Test View');
      
      // Submit
      const addButton = screen.getByRole('button', { name: 'Add View' });
      await user.click(addButton);
      
      // Check if view was created
      await waitFor(() => {
        expect(screen.getByText('Test View')).toBeInTheDocument();
        expect(screen.queryByText('No views created yet')).not.toBeInTheDocument();
      });
    });

    it('should not create a view with empty name', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      // Open dialog
      await user.click(screen.getByText('Create Your First View'));
      
      // Try to submit without entering a name
      const addButton = screen.getByRole('button', { name: 'Add View' });
      expect(addButton).toBeDisabled();
    });
  });

  describe('With Existing Views', () => {
    beforeEach(() => {
      // Add a test view
      dashboardActions.addScreen({
        id: 'test-1',
        name: 'Living Room',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [],
        },
      });
      dashboardActions.setCurrentScreen('test-1');
    });

    it('should display current view information', () => {
      render(<Dashboard />);
      
      expect(screen.getByText('Living Room')).toBeInTheDocument();
      expect(screen.getByText('Grid: 12 × 8')).toBeInTheDocument();
      expect(screen.getByText(/No entities added yet/)).toBeInTheDocument();
    });

    it('should show entity message in edit mode', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);
      
      await user.click(screen.getByText('Edit'));
      
      expect(screen.getByText('No entities added yet. Add entities to start building your dashboard.')).toBeInTheDocument();
    });
  });
});