import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputDateTimeCard } from './InputDateTimeCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputDateTimeCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_datetime.test_datetime',
    state: '2024-01-15T14:30:00',
    attributes: {
      friendly_name: 'Test DateTime',
      has_date: true,
      has_time: true,
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

  it('renders input datetime with friendly name and formatted value', () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    expect(screen.getByText('Test DateTime')).toBeInTheDocument()
    // The exact format will depend on locale, just check that a formatted date is displayed
    // The component shows the date in a Box element
    const dateDisplay = screen
      .getByText('Test DateTime')
      .parentElement?.querySelector('.rt-Box span')
    expect(dateDisplay).toBeInTheDocument()
    // The text content should include some part of the date
    expect(dateDisplay?.textContent).toMatch(/2024|15|30|PM|AM/)
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

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('test_datetime')).toBeInTheDocument()
  })

  it('shows date and time indicator', () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('Date & Time')).toBeInTheDocument()
  })

  it('shows date only indicator when has_time is false', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '2024-01-15',
        attributes: {
          ...defaultEntity.attributes,
          has_date: true,
          has_time: false,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('Date Only')).toBeInTheDocument()
  })

  it('shows time only indicator when has_date is false', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '14:30:00',
        attributes: {
          ...defaultEntity.attributes,
          has_date: false,
          has_time: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('Time Only')).toBeInTheDocument()
  })

  it('enters edit mode on click in view mode', async () => {
    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Initially should show the formatted date, not input
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // Click the edit button to enter edit mode
    const buttons = container.querySelectorAll('.rt-IconButton')
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0])

    // Wait for the input to appear
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.type).toBe('datetime-local')
    expect(input.value).toBe('2024-01-15T14:30:00')
  })

  it('uses date input type for date only', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '2024-01-15',
        attributes: {
          ...defaultEntity.attributes,
          has_date: true,
          has_time: false,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = screen.getByText('Test DateTime').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.type).toBe('date')
  })

  it('uses time input type for time only', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '14:30:00',
        attributes: {
          ...defaultEntity.attributes,
          has_date: false,
          has_time: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = screen.getByText('Test DateTime').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.type).toBe('time')
  })

  it('submits new value on form submit', async () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Enter edit mode by clicking the edit button
    const buttons = screen.getAllByRole('button')
    const editButton = buttons.find((btn) => btn.querySelector('.lucide-pen'))
    expect(editButton).toBeDefined()
    fireEvent.click(editButton!)

    // Wait for edit mode to activate
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2024-02-20T16:45:00' } })

    const submitButtons = screen.getAllByRole('button')
    const submitButton = submitButtons[0] // Submit button is first
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(
        'input_datetime.test_datetime',
        '2024-02-20T16:45:00'
      )
    })
  })

  it('cancels edit on cancel button click', async () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Enter edit mode by clicking the edit button
    const buttons = screen.getAllByRole('button')
    const editButton = buttons.find((btn) => btn.querySelector('.lucide-pen'))
    expect(editButton).toBeDefined()
    fireEvent.click(editButton!)

    // Wait for edit mode to activate
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2024-02-20T16:45:00' } })

    const cancelButtons = screen.getAllByRole('button')
    const cancelButton = cancelButtons[cancelButtons.length - 1] // Cancel button is last
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows not set for unknown value', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'unknown',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('(not set)')).toBeInTheDocument()
  })

  it('shows not set for empty value', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('(not set)')).toBeInTheDocument()
  })

  it('handles invalid date format gracefully', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'invalid-date',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('invalid-date')).toBeInTheDocument()
  })

  it('shows edit button that enters edit mode', async () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const editButton = screen.getAllByRole('button')[0]
    fireEvent.click(editButton)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue('edit')

    render(
      <InputDateTimeCard
        entityId="input_datetime.test_datetime"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Input field should not be visible in edit mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    const card = screen.getByText('Test DateTime').closest('.rt-Card')!
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

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Check for spinner
    const spinner = container.querySelector('[style*="animation: spin"]')
    expect(spinner).toBeInTheDocument()
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

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('border-2', 'border-red-500')
    expect(screen.getByText('Failed to set value')).toBeInTheDocument()
  })

  describe('size variants', () => {
    it('renders small size', () => {
      render(<InputDateTimeCard entityId="input_datetime.test_datetime" size="small" />)

      const text = screen.getByText('Test DateTime')
      expect(text).toHaveClass('rt-r-size-1')
    })

    it('renders medium size', () => {
      render(<InputDateTimeCard entityId="input_datetime.test_datetime" size="medium" />)

      const text = screen.getByText('Test DateTime')
      expect(text).toHaveClass('rt-r-size-2')
    })

    it('renders large size', () => {
      render(<InputDateTimeCard entityId="input_datetime.test_datetime" size="large" />)

      const text = screen.getByText('Test DateTime')
      expect(text).toHaveClass('rt-r-size-3')
    })
  })
})
