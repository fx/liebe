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

    // Click on the icon area to toggle
    const toggleArea = container.querySelector('.light-toggle-area')
    expect(toggleArea).toBeInTheDocument()

    if (toggleArea) {
      await user.click(toggleArea)
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
    const { container } = render(<LightCard entityId="light.living_room" isSelected={true} />)

    const card = container.querySelector('.light-card')
    expect(card).toHaveStyle('background-color: var(--blue-3)')
    expect(card).toHaveStyle('border-color: var(--blue-6)')
  })

  it('respects different sizes', () => {
    const { rerender } = render(<LightCard entityId="light.living_room" size="small" />)
    const nameElement = screen.getByText('Living Room Light')
    expect(nameElement).toHaveClass('rt-r-size-1')

    rerender(<LightCard entityId="light.living_room" size="medium" />)
    expect(screen.getByText('Living Room Light')).toHaveClass('rt-r-size-2')

    rerender(<LightCard entityId="light.living_room" size="large" />)
    expect(screen.getByText('Living Room Light')).toHaveClass('rt-r-size-3')
  })
})
