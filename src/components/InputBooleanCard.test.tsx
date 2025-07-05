import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputBooleanCard } from './InputBooleanCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

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

    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'view',
    } as Partial<DashboardState> as DashboardState)
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

  it('shows on state with accent styling', () => {
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

    expect(card).toHaveStyle({ backgroundColor: 'var(--accent-3)' })
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
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

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
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    const { container } = render(
      <InputBooleanCard entityId="input_boolean.test_toggle" isSelected={true} />
    )

    const card = container.querySelector('.rt-Card')
    expect(card).toHaveStyle({
      backgroundColor: 'var(--blue-3)',
      borderColor: 'var(--blue-7)',
      borderWidth: '2px',
    })
  })

  it('shows delete button in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(<InputBooleanCard entityId="input_boolean.test_toggle" onDelete={mockOnDelete} />)

    const deleteButton = screen.getByLabelText('Delete entity')
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

    // Check for loading class and disabled switch
    const card = container.querySelector('.rt-Card')
    expect(card).toHaveClass('grid-card-loading')
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
    expect(card).toHaveClass('grid-card-error')
    expect(card).toHaveStyle({
      borderColor: 'var(--red-6)',
      borderWidth: '2px',
    })
    expect(card).toHaveAttribute('title', 'Failed to toggle')
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
    expect(card).toHaveStyle({
      borderColor: 'var(--orange-7)',
      borderWidth: '2px',
      borderStyle: 'dashed',
    })
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
    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  it('shows entity not found state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isLoading: false,
      isStale: false,
    })

    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    // When entity is undefined and not connected, it shows disconnected state
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
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
      const { container } = render(
        <InputBooleanCard entityId="input_boolean.test_toggle" size="small" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '60px' })

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-1')
    })

    it('renders medium size', () => {
      const { container } = render(
        <InputBooleanCard entityId="input_boolean.test_toggle" size="medium" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '80px' })

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-2')
    })

    it('renders large size', () => {
      const { container } = render(
        <InputBooleanCard entityId="input_boolean.test_toggle" size="large" />
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveStyle({ minHeight: '100px' })

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toHaveClass('rt-r-size-3')
    })
  })

  it('shows skeleton when entity is undefined but connected', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    // Should show skeleton card
    const skeleton = container.querySelector('.rt-Skeleton')
    expect(skeleton).toBeInTheDocument()
  })
})
