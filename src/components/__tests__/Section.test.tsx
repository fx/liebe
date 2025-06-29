import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Section } from '../Section';
import type { SectionConfig } from '../../store/types';
import { dashboardStore } from '../../store';

describe('Section', () => {
  const mockSection: SectionConfig = {
    id: 'section-1',
    title: 'Test Section',
    order: 0,
    width: 'full',
    collapsed: false,
    items: [],
  };

  const mockOnUpdate = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: { version: '1.0.0', screens: [], theme: 'auto' },
      gridResolution: { columns: 12, rows: 8 },
      theme: 'auto',
      isDirty: false,
    }));
  });

  it('should render section with title', () => {
    render(<Section section={mockSection} />);
    expect(screen.getByText('Test Section')).toBeInTheDocument();
  });

  it('should toggle collapse state when header is clicked', async () => {
    const user = userEvent.setup();
    render(<Section section={mockSection} onUpdate={mockOnUpdate} />);
    
    // Initially expanded
    expect(screen.getByText('No entities in this section')).toBeInTheDocument();
    
    // Click header to collapse
    const header = screen.getByText('Test Section').closest('div[style*="cursor: pointer"]');
    await user.click(header!);
    
    // Should be collapsed
    expect(screen.queryByText('No entities in this section')).not.toBeInTheDocument();
    expect(mockOnUpdate).toHaveBeenCalledWith({ collapsed: true });
  });

  it('should show delete button in edit mode', () => {
    dashboardStore.setState((state) => ({ ...state, mode: 'edit' }));
    
    render(<Section section={mockSection} onDelete={mockOnDelete} />);
    
    const deleteButton = screen.getByRole('button', { name: 'Delete section' });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should not show delete button in view mode', () => {
    render(<Section section={mockSection} onDelete={mockOnDelete} />);
    
    const deleteButton = screen.queryByRole('button', { name: 'Delete section' });
    expect(deleteButton).not.toBeInTheDocument();
  });

  it('should call onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    dashboardStore.setState((state) => ({ ...state, mode: 'edit' }));
    
    render(<Section section={mockSection} onDelete={mockOnDelete} />);
    
    const deleteButton = screen.getByRole('button', { name: 'Delete section' });
    await user.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalled();
  });

  it('should render with collapsed state', () => {
    const collapsedSection = { ...mockSection, collapsed: true };
    render(<Section section={collapsedSection} />);
    
    // Should not show content when collapsed
    expect(screen.queryByText('No entities in this section')).not.toBeInTheDocument();
  });

  it('should render children when provided', () => {
    render(
      <Section section={mockSection}>
        <div>Custom content</div>
      </Section>
    );
    
    expect(screen.getByText('Custom content')).toBeInTheDocument();
    expect(screen.queryByText('No entities in this section')).not.toBeInTheDocument();
  });

  it('should show drag handle in edit mode', () => {
    dashboardStore.setState((state) => ({ ...state, mode: 'edit' }));
    
    render(<Section section={mockSection} />);
    
    // Check for drag handle icon (DragHandleDots2Icon)
    const header = screen.getByText('Test Section').closest('div');
    const svgIcon = header?.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();
  });
});