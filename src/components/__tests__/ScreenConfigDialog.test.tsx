import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenConfigDialog } from '../ScreenConfigDialog'
import { useDashboardStore, dashboardActions } from '../../store'
import { createTestScreen } from '../../test-utils/screen-helpers'
import type { DashboardState } from '../../store/types'

vi.mock('../../store', () => ({
  useDashboardStore: vi.fn(),
  dashboardActions: {
    updateScreen: vi.fn(),
    addScreen: vi.fn(),
    reorderGrid: vi.fn(),
    clearScreen: vi.fn(),
    removeScreen: vi.fn(),
  },
}))

// Mock useNavigate hook
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('ScreenConfigDialog', () => {
  const mockOnOpenChange = vi.fn()

  const testScreen = createTestScreen({
    id: 'test-screen',
    name: 'Test Screen',
    slug: 'test-screen',
    grid: {
      resolution: { columns: 12, rows: 8 },
      items: [],
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state: DashboardState = {
        mode: 'edit',
        screens: [testScreen],
        currentScreenId: 'test-screen',
        configuration: {
          version: '1.0.0',
          screens: [testScreen],
          theme: 'auto',
        },
        gridResolution: { columns: 12, rows: 8 },
        theme: 'auto',
        isDirty: false,
        sidebarOpen: false,
        tabsExpanded: false,
        sidebarWidgets: [],
      }
      return selector ? selector(state) : state
    })
    // Reset actions
    vi.mocked(dashboardActions.updateScreen).mockImplementation(() => {})
    vi.mocked(dashboardActions.addScreen).mockImplementation(() => {})
    vi.mocked(dashboardActions.reorderGrid).mockImplementation(() => {})
    vi.mocked(dashboardActions.clearScreen).mockImplementation(() => {})
    vi.mocked(dashboardActions.removeScreen).mockImplementation(() => {})
  })

  it('should not render when closed', () => {
    render(<ScreenConfigDialog open={false} onOpenChange={mockOnOpenChange} />)
    expect(screen.queryByText('Add New View')).not.toBeInTheDocument()
  })

  it('should render add dialog when open without screen', () => {
    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} />)

    expect(screen.getByText('Add New View')).toBeInTheDocument()
    expect(screen.getByText('Create a new view to organize your dashboard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add View' })).toBeInTheDocument()
  })

  it('should render edit dialog when open with screen', () => {
    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    expect(screen.getByText('Edit View')).toBeInTheDocument()
    expect(screen.getByText('Update your view settings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })

  it('should display current screen values', () => {
    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const nameInput = screen.getByPlaceholderText('Living Room') as HTMLInputElement
    expect(nameInput.value).toBe('Test Screen')

    const slugInput = screen.getByPlaceholderText('living-room') as HTMLInputElement
    expect(slugInput.value).toBe('test-screen')
  })

  it('should display reorder grid button when screen has items', () => {
    const screenWithItems = {
      ...testScreen,
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [
          {
            id: 'item1',
            type: 'entity' as const,
            entityId: 'light.test',
            x: 0,
            y: 0,
            width: 2,
            height: 2,
          },
        ],
      },
    }
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={screenWithItems} />
    )

    expect(screen.getByText('Screen Management')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorder Grid (Pack Items)' })).toBeInTheDocument()
  })

  it('should save name changes when save button is clicked', async () => {
    const user = userEvent.setup()

    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const nameInput = screen.getByPlaceholderText('Living Room')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Screen')

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    await user.click(saveButton)

    expect(dashboardActions.updateScreen).toHaveBeenCalledWith(
      'test-screen',
      expect.objectContaining({
        name: 'Updated Screen',
      })
    )
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should handle reorder grid button click', async () => {
    const user = userEvent.setup()
    const screenWithItems = {
      ...testScreen,
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [
          {
            id: 'item1',
            type: 'entity' as const,
            entityId: 'light.test',
            x: 0,
            y: 0,
            width: 2,
            height: 2,
          },
        ],
      },
    }

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={screenWithItems} />
    )

    const reorderButton = screen.getByRole('button', { name: 'Reorder Grid (Pack Items)' })
    await user.click(reorderButton)

    expect(dashboardActions.reorderGrid).toHaveBeenCalledWith('test-screen')
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should cancel without saving when cancel button is clicked', async () => {
    const user = userEvent.setup()

    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(dashboardActions.updateScreen).not.toHaveBeenCalled()
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should display validation for name field', async () => {
    const user = userEvent.setup()
    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const nameInput = screen.getByPlaceholderText('Living Room')
    await user.clear(nameInput)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    expect(saveButton).toBeDisabled()
  })

  it('should display clear and delete buttons in edit mode', () => {
    const screenWithItems = {
      ...testScreen,
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [
          {
            id: 'item1',
            type: 'entity' as const,
            entityId: 'light.test',
            x: 0,
            y: 0,
            width: 2,
            height: 2,
          },
        ],
      },
    }

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={screenWithItems} />
    )

    expect(screen.getByRole('button', { name: 'Clear Screen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Screen' })).toBeInTheDocument()
  })

  it('should disable clear button when screen has no items', () => {
    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const clearButton = screen.getByRole('button', { name: 'Clear Screen' })
    expect(clearButton).toBeDisabled()
  })

  it('should handle clear screen action with confirmation', async () => {
    const user = userEvent.setup()
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)

    const screenWithItems = {
      ...testScreen,
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [
          {
            id: 'item1',
            type: 'entity' as const,
            entityId: 'light.test',
            x: 0,
            y: 0,
            width: 2,
            height: 2,
          },
        ],
      },
    }

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={screenWithItems} />
    )

    const clearButton = screen.getByRole('button', { name: 'Clear Screen' })
    await user.click(clearButton)

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove all items from this screen?'
    )
    expect(dashboardActions.clearScreen).toHaveBeenCalledWith('test-screen')
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)

    window.confirm = originalConfirm
  })

  it('should handle delete screen action with confirmation', async () => {
    const user = userEvent.setup()
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)

    render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screen={testScreen} />)

    const deleteButton = screen.getByRole('button', { name: 'Delete Screen' })
    await user.click(deleteButton)

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete "Test Screen"? This action cannot be undone.'
    )
    expect(dashboardActions.removeScreen).toHaveBeenCalledWith('test-screen')
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)

    window.confirm = originalConfirm
  })
})
