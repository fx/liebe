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
  })

  /**
   * The contract the E2E helper reads, since it can no longer read a switch:
   * the shell stamps the domain on the card and marks the active state with
   * `data-active`, present only when the helper is on. A poll comparing against
   * `'true'` depends on the inactive case *omitting* the attribute rather than
   * spelling `false`.
   */
  it('stamps the domain, and marks the active state by presence', () => {
    // `isSelected` is toggled to force the memoized card to re-render, the way
    // a store update would — identical props would otherwise bail out.
    const { container, rerender } = render(
      <InputBooleanCard entityId="input_boolean.test_toggle" isSelected={false} />
    )
    const card = () => container.querySelector('[data-domain="input_boolean"]')

    expect(card()).not.toBeNull()
    expect(card()).not.toHaveAttribute('data-active')

    vi.mocked(useEntity).mockReturnValue({
      entity: { ...defaultEntity, state: 'on' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    } as unknown as ReturnType<typeof useEntity>)
    rerender(<InputBooleanCard entityId="input_boolean.test_toggle" isSelected />)

    expect(card()).toHaveAttribute('data-active', 'true')
  })

  it('renders no discrete control by default — the tile is the toggle', () => {
    // `controlStyle: 'tile'` (docs/specs/entity-cards/options/input-helpers.md).
    // Existing placed cards keep their switch through the loader's pinning; a
    // card rendered with no stored options follows the new default.
    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('renders the discrete switch when the card asks for one', () => {
    render(
      <InputBooleanCard entityId="input_boolean.test_toggle" config={{ controlStyle: 'switch' }} />
    )

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

    const { container } = render(
      <InputBooleanCard entityId="input_boolean.test_toggle" config={{ controlStyle: 'switch' }} />
    )
    const card = container.querySelector('.liebe-card')

    // The `on` state no longer tints the tile: the design system keeps the
    // card flat and puts the hue in the icon circle, so what the shell carries
    // is the state attribute the anatomy and any theme key off.
    expect(card).toHaveAttribute('data-active', 'true')
    expect(document.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('switch')).toBeChecked()

    // The shell metadata the anatomy and the stable selector contract both key
    // off. Input helpers have no domain row of their own, so they resolve
    // through the `default` triplet — a wrong mapping here would repaint every
    // hue-carrying part of the card and nothing else would catch it.
    expect(card).toHaveAttribute('data-domain', 'input_boolean')
    expect(card).toHaveAttribute('data-color', 'default')
  })

  it('toggles on click in view mode', async () => {
    render(<InputBooleanCard entityId="input_boolean.test_toggle" />)

    const card = screen.getByText('Test Toggle').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('input_boolean.test_toggle')
    })
  })

  it('toggles on switch change', async () => {
    render(
      <InputBooleanCard entityId="input_boolean.test_toggle" config={{ controlStyle: 'switch' }} />
    )

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

    const card = screen.getByText('Test Toggle').closest('.liebe-card')!
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

    // Selection tint and outline are `.liebe-card[data-selected]` in the
    // layered shell sheet now, so they stay themable.
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-selected', 'true')
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

    const { container } = render(
      <InputBooleanCard entityId="input_boolean.test_toggle" config={{ controlStyle: 'switch' }} />
    )

    // Check for loading class and disabled switch
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-loading', 'true')
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

    const card = container.querySelector('.liebe-card')
    // The error outline and its one-shot pulse are `.liebe-card[data-error]`
    // in the layered shell sheet now, rather than an inline border plus a
    // `grid-card-error` class — inline declarations outrank every cascade
    // layer, so a theme could never have restyled them.
    expect(card).toHaveAttribute('data-error', 'true')
    expect(card).toHaveAttribute('title', 'Failed to toggle')
  })

  it('does not show stale data indicator (stale display removed)', () => {
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

    const card = container.querySelector('.liebe-card')
    // Stale state no longer shows visual indication
    expect(card).not.toHaveStyle({
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

    const { container } = render(<InputBooleanCard entityId="input_boolean.test_toggle" />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()

    // The unavailable branch is a second, separate `GridCard` — it keeps the
    // domain, so a theme's `input_boolean` rules still reach a card that has
    // dropped offline.
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-unavailable', 'true')
    expect(card).toHaveAttribute('data-domain', 'input_boolean')
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
