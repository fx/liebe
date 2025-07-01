import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputBooleanCard } from './InputBooleanCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputBooleanCard', () => {
  const mockToggle = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_boolean.test_toggle',
    state: 'off',
    attributes: {
      friendly_name: 'Test Toggle',
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
      toggle: mockToggle,
      setValue: vi.fn(),
      loading: false,
      error: null,
      clearError: vi.fn(),
    })

    vi.mocked(useDashboardStore).mockReturnValue('view')
  })

  it('renders input boolean with friendly name', () => {
    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    expect(screen.getByText('Test Toggle')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('shows entity id when no friendly name', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {},
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    expect(screen.getByText('test_toggle')).toBeInTheDocument()
  })

  it('shows on state with amber styling', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'on',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    const card = container.querySelector('.rt-Card')

    expect(card).toHaveStyle({ backgroundColor: 'var(--amber-3)' })
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('toggles on click in view mode', async () => {
    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    const card = screen.getByText('Test Toggle').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('input_boolean.test_toggle')
    })
  })

  it('toggles on switch change', async () => {
    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    const switchElement = screen.getByRole('switch')
    fireEvent.click(switchElement)

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('input_boolean.test_toggle')
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue('edit')

    render(
      <InputBooleanCard
        entityId="input_boolean.test_toggle"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Switch should not be visible in edit mode
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText('OFF')).toBeInTheDocument()

    const card = screen.getByText('Test Toggle').closest('.rt-Card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockToggle).not.toHaveBeenCalled()
    })
  })

  it('shows selected state styling', () => {
    const { container } = render(
      <InputBooleanCard entityId="input_boolean.test_toggle" isSelected={true} />
    )

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('ring-2', 'ring-blue-500')
    expect(card).toHaveStyle({ backgroundColor: 'var(--blue-2)' })
  })

  it('shows delete button in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue('edit')

    render(<InputBooleanCard entityId="input_boolean.test_toggle" onDelete={mockOnDelete} />)

    const deleteButton = screen.getByRole('button')
    fireEvent.click(deleteButton)

    expect(mockOnDelete).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      loading: true,
      error: null,
      clearError: vi.fn(),
    })

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    // Check for spinner
    const spinner = container.querySelector('[style*="animation: spin"]')
    expect(spinner).toBeInTheDocument()

    // Switch should be disabled during loading
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('shows error state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      loading: false,
      error: 'Failed to toggle',
      clearError: vi.fn(),
    })

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('border-2', 'border-red-500')
    expect(screen.getByText('Failed to toggle')).toBeInTheDocument()
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
      isStale: true,
    })

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('border-2', 'border-orange-400')
    expect(card).toHaveStyle({ borderStyle: 'dashed' })
  })

  it('shows disconnected state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isLoading: false,
      isStale: false,
    })

    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows entity not found state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    expect(screen.getByText('Entity not found')).toBeInTheDocument()
  })

  it('shows unavailable state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'unavailable',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  describe('size variants', () => {
    it('renders small size', () => {
      render(<InputBooleanCard entityId="input_boolean.test_toggle" size="small" />)

      const text = screen.getByText('Test Toggle')
      expect(text).toHaveClass('rt-r-size-1')

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-1')
    })

    it('renders medium size', () => {
      render(<InputBooleanCard entityId="input_boolean.test_toggle" size="medium" />)

      const text = screen.getByText('Test Toggle')
      expect(text).toHaveClass('rt-r-size-2')

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-2')
    })

    it('renders large size', () => {
      render(<InputBooleanCard entityId="input_boolean.test_toggle" size="large" />)

      const text = screen.getByText('Test Toggle')
      expect(text).toHaveClass('rt-r-size-3')

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-3')
    })
  })
})
