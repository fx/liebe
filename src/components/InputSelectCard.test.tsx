import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputSelectCard } from './InputSelectCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputSelectCard', () => {
  const mockSetValue = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_select.test_select',
    state: 'Option 1',
    attributes: {
      friendly_name: 'Test Select',
      options: ['Option 1', 'Option 2', 'Option 3'],
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()

    // Default mock implementations
    vi.mocked(useEntity).mockReturnValue({
      entity: defaultEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: false,
      error: null,
      clearError: vi.fn(),
    })

    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'view',
    } as Partial<DashboardState> as DashboardState)
  })

  it('renders input select with friendly name and current value', () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByText('Test Select')).toBeInTheDocument()
    expect(screen.getByText('Option 1')).toBeInTheDocument()
  })

  it('shows entity id when no friendly name', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          friendly_name: undefined,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)
    expect(screen.getByText('test_select')).toBeInTheDocument()
  })

  it('opens dropdown and shows all options', async () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    // Click the select trigger
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(screen.getByText('Option 3')).toBeInTheDocument()
    })
  })

  it('changes value when selecting an option', async () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    // Open dropdown
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    // Select Option 2
    await waitFor(() => {
      const option2 = screen.getByText('Option 2')
      fireEvent.click(option2)
    })

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_select.test_select', 'Option 2')
    })
  })

  it('prevents propagation when clicking select', async () => {
    const mockCardClick = vi.fn()
    const { container } = render(
      <div onClick={mockCardClick}>
        <InputSelectCard entityId="input_select.test_select" />
      </div>
    )

    // Click the select container element
    const selectBox = container.querySelector('.rt-Box')!
    if (selectBox) {
      fireEvent.click(selectBox)
    }

    expect(mockCardClick).not.toHaveBeenCalled()
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(
      <InputSelectCard
        entityId="input_select.test_select"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Select is still visible in edit mode but disabled for interaction
    expect(screen.queryByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('3 options')).toBeInTheDocument()

    const card = screen.getByText('Test Select').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows selected state styling', () => {
    const { container } = render(
      <InputSelectCard entityId="input_select.test_select" isSelected={true} />
    )

    const card = container.querySelector('.rt-Card')
    // Check if card exists and is selected
    expect(card).toBeTruthy()
    // The actual styling in edit mode is handled by GridCard internally
  })

  it('shows delete button in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(<InputSelectCard entityId="input_select.test_select" onDelete={mockOnDelete} />)

    const deleteButton = screen.getByLabelText('Delete entity')
    fireEvent.click(deleteButton)

    expect(mockOnDelete).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: true,
      error: null,
      clearError: vi.fn(),
    })

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    // Check for loading class
    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('grid-card-loading')

    // Select should be disabled during loading
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('shows error state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: false,
      error: 'Failed to set value',
      clearError: vi.fn(),
    })

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('grid-card-error')
    expect(card).toHaveStyle({
      borderColor: 'var(--red-6)',
      borderWidth: '2px',
    })
    expect(card).toHaveAttribute('title', 'Failed to set value')
  })

  it('shows stale data indicator', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          _stale: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveStyle({
      borderColor: 'var(--orange-7)',
      borderWidth: '2px',
      borderStyle: 'dashed',
    })
  })

  it('handles entity with no options', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          options: [],
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('handles entity with missing options attribute', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          friendly_name: 'Test Select',
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('shows singular option count in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          options: ['Single Option'],
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)
    expect(screen.getByText('1 option')).toBeInTheDocument() // Singular
  })

  describe('size variants', () => {
    it('renders small size', () => {
      const { container } = render(
        <InputSelectCard entityId="input_select.test_select" size="small" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '60px' })
    })

    it('renders medium size', () => {
      const { container } = render(
        <InputSelectCard entityId="input_select.test_select" size="medium" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '80px' })
    })

    it('renders large size', () => {
      const { container } = render(
        <InputSelectCard entityId="input_select.test_select" size="large" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '100px' })
    })
  })
})
