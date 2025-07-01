import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputNumberCard } from './InputNumberCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputNumberCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_number.test_number',
    state: '50',
    attributes: {
      friendly_name: 'Test Number',
      min: 0,
      max: 100,
      step: 1,
      unit_of_measurement: '%',
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

    vi.mocked(useDashboardStore).mockReturnValue('view')
  })

  it('renders input number with friendly name and value', () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    expect(screen.getByText('Test Number')).toBeInTheDocument()
    expect(screen.getByText('50 %')).toBeInTheDocument()
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

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('test_number')).toBeInTheDocument()
  })

  it('shows min and max range', () => {
    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('0 - 100')).toBeInTheDocument()
  })

  it('increments value on plus button click', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const buttons = screen.getAllByRole('button')
    const plusButton = buttons[buttons.length - 1] // Plus button is last
    fireEvent.click(plusButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 51)
    })
  })

  it('decrements value on minus button click', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const buttons = screen.getAllByRole('button')
    const minusButton = buttons[buttons.length - 2] // Minus button is second to last
    fireEvent.click(minusButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 49)
    })
  })

  it('respects max value limit', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '100',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    const buttons = screen.getAllByRole('button')
    const plusButton = buttons[buttons.length - 1] // Plus button is last
    expect(plusButton).toBeDisabled()
  })

  it('respects min value limit', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '0',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    const buttons = screen.getAllByRole('button')
    const minusButton = buttons[buttons.length - 2] // Minus button is second to last
    expect(minusButton).toBeDisabled()
  })

  it('uses step value for increment/decrement', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '50',
        attributes: {
          ...defaultEntity.attributes,
          step: 5,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    const buttons = screen.getAllByRole('button')
    const plusButton = buttons[buttons.length - 1] // Plus button is last
    fireEvent.click(plusButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 55)
    })
  })

  it('allows direct value editing', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    // Click on the value display to edit
    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    // Should show input field
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('50')

    // Change value and submit
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 75)
    })
  })

  it('validates input within min/max range', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    const input = screen.getByRole('textbox')

    // Try to set value above max
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 100) // Clamped to max
    })
  })

  it('handles invalid input', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    const input = screen.getByRole('textbox')

    // Enter invalid value
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      // Value should revert to original
      expect(screen.getByText('50 %')).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue('edit')

    render(
      <InputNumberCard
        entityId="input_number.test_number"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Controls should not be visible in edit mode
    expect(screen.queryByRole('button', { name: /plus/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minus/i })).not.toBeInTheDocument()

    const card = screen.getByText('Test Number').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockSetValue).not.toHaveBeenCalled()
    })
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

    const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

    // Check for spinner
    const spinner = container.querySelector('[style*="animation: spin"]')
    expect(spinner).toBeInTheDocument()

    // Buttons should be disabled during loading
    const buttons = screen.getAllByRole('button')
    expect(buttons[buttons.length - 2]).toBeDisabled() // Minus button
    expect(buttons[buttons.length - 1]).toBeDisabled() // Plus button
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

    const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('border-2', 'border-red-500')
    expect(screen.getByText('Failed to set value')).toBeInTheDocument()
  })

  it('handles no unit of measurement', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          unit_of_measurement: undefined,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('50')).toBeInTheDocument() // No unit shown
  })

  it('formats decimal values based on step', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '50.5',
        attributes: {
          ...defaultEntity.attributes,
          step: 0.1,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('50.5 %')).toBeInTheDocument()
  })

  describe('size variants', () => {
    it('renders small size', () => {
      render(<InputNumberCard entityId="input_number.test_number" size="small" />)

      const text = screen.getByText('Test Number')
      expect(text).toHaveClass('rt-r-size-1')
    })

    it('renders medium size', () => {
      render(<InputNumberCard entityId="input_number.test_number" size="medium" />)

      const text = screen.getByText('Test Number')
      expect(text).toHaveClass('rt-r-size-2')
    })

    it('renders large size', () => {
      render(<InputNumberCard entityId="input_number.test_number" size="large" />)

      const text = screen.getByText('Test Number')
      expect(text).toHaveClass('rt-r-size-3')
    })
  })
})
