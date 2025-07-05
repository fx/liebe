import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputTextCard } from './InputTextCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputTextCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_text.test_text',
    state: 'Hello World',
    attributes: {
      friendly_name: 'Test Text',
      min: 3,
      max: 20,
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

  it('renders input text with friendly name and value', () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    expect(screen.getByText('Test Text')).toBeInTheDocument()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
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

    render(<InputTextCard entityId="input_text.test_text" />)
    expect(screen.getByText('test_text')).toBeInTheDocument()
  })

  it('shows character limits when min and max are defined', () => {
    render(<InputTextCard entityId="input_text.test_text" />)
    expect(screen.getByText('3 - 20 chars')).toBeInTheDocument()
  })

  it('enters edit mode on click in view mode', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('Hello World')
    })
  })

  it('submits new value on form submit', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Value' } })

    const buttons = screen.getAllByRole('button')
    const submitButton = buttons[0] // Submit button is first
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_text.test_text', 'New Value')
    })
  })

  it('cancels edit on cancel button click', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Changed Value' } })

    const buttons = screen.getAllByRole('button')
    const cancelButton = buttons[1] // Cancel button is second
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByText('Hello World')).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('validates min length constraint', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Hi' } }) // Too short

    const form = input.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('enforces max length in input field', () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('maxLength', '20')
  })

  it('validates pattern constraint', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          pattern: '^[A-Z]+$', // Only uppercase letters
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.rt-Card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'lowercase' } })

    const form = input.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('shows password field for password mode', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'secret123',
        attributes: {
          ...defaultEntity.attributes,
          mode: 'password',
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)

    // Should show masked value
    expect(screen.getByText('••••••••')).toBeInTheDocument()

    // Click the edit button to enter edit mode
    const editButton = screen.getByRole('button')
    fireEvent.click(editButton)

    // Wait for edit mode and check the password input
    await waitFor(() => {
      // Password inputs don't have role="textbox", find by type
      const input = screen.getByDisplayValue('secret123')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'password')
    })
  })

  it('shows empty state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('shows edit button that enters edit mode', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    const editButton = screen.getAllByRole('button')[0]
    fireEvent.click(editButton)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(
      <InputTextCard entityId="input_text.test_text" onSelect={mockOnSelect} isSelected={false} />
    )

    // Input field should not be visible in edit mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    const card = screen.getByText('Test Text').closest('.rt-Card')!
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

    const { container } = render(<InputTextCard entityId="input_text.test_text" />)

    // Check for loading class
    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('grid-card-loading')
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

    const { container } = render(<InputTextCard entityId="input_text.test_text" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('grid-card-error')
    expect(card).toHaveStyle({
      borderColor: 'var(--red-6)',
      borderWidth: '2px',
    })
    expect(card).toHaveAttribute('title', 'Failed to set value')
  })

  describe('size variants', () => {
    it('renders small size', () => {
      const { container } = render(<InputTextCard entityId="input_text.test_text" size="small" />)

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '60px' })
    })

    it('renders medium size', () => {
      const { container } = render(<InputTextCard entityId="input_text.test_text" size="medium" />)

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '80px' })
    })

    it('renders large size', () => {
      const { container } = render(<InputTextCard entityId="input_text.test_text" size="large" />)

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '100px' })
    })
  })
})
