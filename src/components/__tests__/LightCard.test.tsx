import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LightCard } from '../LightCard'
import * as hooks from '~/hooks'
import { useDashboardStore } from '~/store'
import { HassEntity } from '~/store/entityTypes'
import type { DashboardState } from '~/store/types'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

// Mock the store
vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

describe('LightCard', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.living_room',
    state: 'on',
    attributes: {
      friendly_name: 'Living Room Light',
      brightness: 255,
      supported_features: 1, // SUPPORT_BRIGHTNESS
    },
    last_changed: '2023-01-01T00:00:00Z',
    last_updated: '2023-01-01T00:00:00Z',
    context: {
      id: 'test-context',
      parent_id: null,
      user_id: null,
    },
  }

  const mockServiceCallHandlers = {
    loading: false,
    error: null,
    turnOn: vi.fn(),
    turnOff: vi.fn(),
    toggle: vi.fn(),
    callService: vi.fn(),
    setValue: vi.fn(),
    clearError: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementation for useDashboardStore
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })

    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })
    vi.mocked(hooks.useServiceCall).mockReturnValue(mockServiceCallHandlers)
  })

  it('renders light entity with brightness slider', () => {
    render(<LightCard entityId="light.living_room" />)

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument() // Shows percentage when on
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('renders light entity without brightness slider when off', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'off' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.living_room" />)

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
    expect(screen.getByText('OFF')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('renders brightness slider for supported lights', () => {
    render(<LightCard entityId="light.living_room" />)

    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuenow', '100')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
  })

  it('shows different brightness levels', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: { ...mockEntity.attributes, brightness: 128 }, // 50%
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.living_room" />)

    // Status should show percentage (there are two 50% texts - one in slider, one in status)
    const allPercentageTexts = screen.getAllByText('50%')
    expect(allPercentageTexts).toHaveLength(2) // One in slider label, one in status

    // The status element is the one with weight-medium class
    const statusElement = allPercentageTexts.find((el) =>
      el.classList.contains('rt-r-weight-medium')
    )
    expect(statusElement).toBeInTheDocument()
  })

  it('hides brightness slider for lights without brightness support', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: { ...mockEntity.attributes, supported_features: 0 }, // No brightness support
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.living_room" />)

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('toggles light on click', async () => {
    const user = userEvent.setup()
    const { container } = render(<LightCard entityId="light.living_room" />)

    // Click on the card to toggle
    const card = container.querySelector('.grid-card')
    expect(card).toBeInTheDocument()

    if (card) {
      await user.click(card)
    }

    expect(mockServiceCallHandlers.turnOff).toHaveBeenCalledWith('light.living_room')
  })

  it('shows unavailable state', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'unavailable' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.living_room" />)

    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('shows disconnected state', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.living_room" />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.mocked(hooks.useServiceCall).mockReturnValue({
      ...mockServiceCallHandlers,
      loading: true,
    })

    const { container } = render(<LightCard entityId="light.living_room" />)

    // Check for spinner element
    expect(container.querySelector('.rt-Spinner')).toBeInTheDocument()

    // Card should have loading cursor
    const card = container.querySelector('.light-card')
    expect(card).toHaveStyle('cursor: wait')
  })

  it('shows error state', () => {
    vi.mocked(hooks.useServiceCall).mockReturnValue({
      ...mockServiceCallHandlers,
      error: 'Failed to toggle light',
    })

    render(<LightCard entityId="light.living_room" />)

    expect(screen.getByText('ERROR')).toBeInTheDocument()
  })

  it('shows stale data indicator', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isStale: true,
    })

    const { container } = render(<LightCard entityId="light.living_room" />)

    const card = container.querySelector('.light-card')
    expect(card).toHaveStyle('border-style: dashed')
  })

  it('handles edit mode interactions', () => {
    const onDelete = vi.fn()
    const onSelect = vi.fn()

    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'edit' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })

    render(
      <LightCard
        entityId="light.living_room"
        onDelete={onDelete}
        onSelect={onSelect}
        isSelected={false}
      />
    )

    // Should show delete button
    const deleteButton = screen.getByRole('button', { name: 'Delete entity' })
    expect(deleteButton).toBeInTheDocument()

    // Should show drag handle
    expect(document.querySelector('.grid-item-drag-handle')).toBeInTheDocument()

    // Clicking delete button
    fireEvent.click(deleteButton)
    expect(onDelete).toHaveBeenCalled()

    // Clicking card should select it
    const card = screen.getByText('Living Room Light').closest('.light-card')
    if (card) {
      fireEvent.click(card)
      expect(onSelect).toHaveBeenCalledWith(true)
    }
  })

  it('shows selected state', () => {
    // Mock edit mode to see selection styling
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'edit' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })

    const { container } = render(<LightCard entityId="light.living_room" isSelected={true} />)

    const card = container.querySelector('.grid-card')

    // Check that the card shows selection styling (blue border in edit mode)
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('grid-card')
    expect(card).toHaveStyle('border-color: var(--blue-7)')
    expect(card).toHaveStyle('border-width: 2px')
    // Background color is applied but CSS variables don't resolve in tests
  })

  it('respects different sizes', () => {
    const { rerender, container } = render(<LightCard entityId="light.living_room" size="small" />)

    // Check if the card has the correct minimum height based on size
    let card = container.querySelector('.grid-card')
    expect(card).toHaveStyle('min-height: 60px') // small size
    expect(card).toHaveStyle('padding: var(--space-2)') // small padding

    rerender(<LightCard entityId="light.living_room" size="medium" />)
    card = container.querySelector('.grid-card')
    expect(card).toHaveStyle('min-height: 80px') // medium size
    expect(card).toHaveStyle('padding: var(--space-3)') // medium padding

    rerender(<LightCard entityId="light.living_room" size="large" />)
    card = container.querySelector('.grid-card')
    expect(card).toHaveStyle('min-height: 100px') // large size
    expect(card).toHaveStyle('padding: var(--space-4)') // large padding
  })
})
