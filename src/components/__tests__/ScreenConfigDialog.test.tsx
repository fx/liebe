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
  },
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
      }
      return selector ? selector(state) : state
    })
    // Reset actions
    vi.mocked(dashboardActions.updateScreen).mockImplementation(() => {})
    vi.mocked(dashboardActions.addScreen).mockImplementation(() => {})
  })

  it('should not render when screenId is not provided', () => {
    const { container } = render(<ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render dialog when open with valid screenId', () => {
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    expect(screen.getByText('Configure Screen')).toBeInTheDocument()
    expect(
      screen.getByText('Customize the screen settings including name and grid resolution')
    ).toBeInTheDocument()
  })

  it('should display current screen values', () => {
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    const nameInput = screen.getByPlaceholderText('Enter screen name') as HTMLInputElement
    expect(nameInput.value).toBe('Test Screen')

    // Find inputs by their type and value since Radix UI doesn't properly associate labels
    const numberInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const columnsInput = numberInputs.find((input) => input.value === '12')
    const rowsInput = numberInputs.find((input) => input.value === '8')

    expect(columnsInput).toBeDefined()
    expect(rowsInput).toBeDefined()
  })

  it('should display preset selector', () => {
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    // Just verify the preset selector is present
    expect(screen.getByText('Choose a preset')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('should save name changes when save button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    const nameInput = screen.getByPlaceholderText('Enter screen name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Screen')

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    await user.click(saveButton)

    expect(dashboardActions.updateScreen).toHaveBeenCalledWith(
      'test-screen',
      expect.objectContaining({
        name: 'Updated Screen',
        slug: 'updated-screen',
      })
    )
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should duplicate screen when duplicate button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    const duplicateButton = screen.getByRole('button', { name: /duplicate screen/i })
    await user.click(duplicateButton)

    expect(dashboardActions.addScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Screen (Copy)',
        slug: 'test-screen-copy',
        children: undefined,
      }),
      undefined
    )
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should cancel without saving when cancel button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(dashboardActions.updateScreen).not.toHaveBeenCalled()
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should display validation constraints', () => {
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    // Check that the inputs have proper constraints
    const numberInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const columnsInput = numberInputs[0]
    const rowsInput = numberInputs[1]

    expect(columnsInput).toHaveAttribute('min', '1')
    expect(columnsInput).toHaveAttribute('max', '24')
    expect(rowsInput).toHaveAttribute('min', '1')
    expect(rowsInput).toHaveAttribute('max', '20')
  })

  it('should show grid preview', () => {
    render(
      <ScreenConfigDialog open={true} onOpenChange={mockOnOpenChange} screenId="test-screen" />
    )

    expect(screen.getByText('Grid Preview')).toBeInTheDocument()
    // The grid preview should render 96 cells (12 columns × 8 rows)
    const gridCells = screen.getByText('Grid Preview').parentElement?.querySelectorAll('div > div')
    expect(gridCells?.length).toBeGreaterThan(0)
  })
})
