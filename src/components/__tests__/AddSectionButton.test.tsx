import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddSectionButton } from '../AddSectionButton';
import { dashboardActions } from '../../store';

describe('AddSectionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render add section button', () => {
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={0} />);
    
    const button = screen.getByRole('button', { name: /add section/i });
    expect(button).toBeInTheDocument();
  });

  it('should open dialog when button is clicked', async () => {
    const user = userEvent.setup();
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={0} />);
    
    const button = screen.getByRole('button', { name: /add section/i });
    await user.click(button);
    
    expect(screen.getByText('Add New Section')).toBeInTheDocument();
    expect(screen.getByText('Create a section to organize your entities')).toBeInTheDocument();
  });

  it('should close dialog when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={0} />);
    
    // Open dialog
    await user.click(screen.getByRole('button', { name: /add section/i }));
    expect(screen.getByText('Add New Section')).toBeInTheDocument();
    
    // Click cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    
    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByText('Add New Section')).not.toBeInTheDocument();
    });
  });

  it('should create section with title', async () => {
    const addSectionSpy = vi.spyOn(dashboardActions, 'addSection');
    const user = userEvent.setup();
    
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={2} />);
    
    // Open dialog
    await user.click(screen.getByRole('button', { name: /add section/i }));
    
    // Enter section title
    const titleInput = screen.getByPlaceholderText('Living Room Lights');
    await user.type(titleInput, 'Test Section');
    
    // Submit (skipping width selection due to Select component issues in tests)
    await user.click(screen.getByRole('button', { name: 'Add Section' }));
    
    // Check that addSection was called with correct parameters
    expect(addSectionSpy).toHaveBeenCalledWith('screen-1', expect.objectContaining({
      title: 'Test Section',
      order: 2, // existingSectionsCount was 2
      collapsed: false,
      items: [],
    }));
  });

  it('should disable submit button when title is empty', async () => {
    const user = userEvent.setup();
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={0} />);
    
    // Open dialog
    await user.click(screen.getByRole('button', { name: /add section/i }));
    
    const submitButton = screen.getByRole('button', { name: 'Add Section' });
    expect(submitButton).toBeDisabled();
    
    // Type in title
    const titleInput = screen.getByPlaceholderText('Living Room Lights');
    await user.type(titleInput, 'Test');
    
    expect(submitButton).not.toBeDisabled();
    
    // Clear title
    await user.clear(titleInput);
    expect(submitButton).toBeDisabled();
  });

  it('should reset form after submission', async () => {
    const user = userEvent.setup();
    render(<AddSectionButton screenId="screen-1" existingSectionsCount={0} />);
    
    // Open dialog and fill form
    await user.click(screen.getByRole('button', { name: /add section/i }));
    const titleInput = screen.getByPlaceholderText('Living Room Lights');
    await user.type(titleInput, 'Test Section');
    
    // Submit
    await user.click(screen.getByRole('button', { name: 'Add Section' }));
    
    // Open dialog again
    await user.click(screen.getByRole('button', { name: /add section/i }));
    
    // Title should be empty
    const newTitleInput = screen.getByPlaceholderText('Living Room Lights');
    expect(newTitleInput).toHaveValue('');
    
    // Width select should be present (not testing value due to Select component issues)
  });
});