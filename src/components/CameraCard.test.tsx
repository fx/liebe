import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CameraCard } from './CameraCard'
import { useEntity, useRemoteHass } from '~/hooks'
import { useDashboardStore } from '~/store'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useRemoteHass: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

// Mock the SimpleCameraCard
vi.mock('./SimpleCameraCard', () => ({
  SimpleCameraCard: ({ entityId }: { entityId: string }) => (
    <div data-testid="simple-camera-card" data-entity-id={entityId}>
      Simple Camera Card Mock
    </div>
  ),
}))

describe('CameraCard', () => {
  const mockEntity = {
    entity_id: 'camera.front_door',
    state: 'idle',
    attributes: {
      friendly_name: 'Front Door Camera',
      supported_features: 2, // Stream support
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: {
      id: '123',
      parent_id: null,
      user_id: null,
    },
  }

  const mockStreamEntity = {
    ...mockEntity,
    attributes: {
      ...mockEntity.attributes,
      frontend_stream_type: 'hls',
    },
  }

  const mockHass = {
    states: {
      'camera.front_door': mockEntity,
    },
    services: {},
    config: {
      latitude: 0,
      longitude: 0,
      elevation: 0,
      unit_system: {
        length: 'km',
        mass: 'kg',
        pressure: 'Pa',
        temperature: 'C',
        volume: 'L',
      },
      location_name: 'Home',
      time_zone: 'UTC',
      components: [],
      version: '2024.1.0',
    },
  }

  const defaultProps = {
    entityId: 'camera.front_door',
    size: 'medium' as const,
    onDelete: vi.fn(),
    isSelected: false,
    onSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })
    vi.mocked(useRemoteHass).mockReturnValue(mockHass as unknown as HomeAssistant)
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'view' })
  })

  it('renders camera with Simple Camera Card', () => {
    render(<CameraCard {...defaultProps} />)

    const simpleCard = screen.getByTestId('simple-camera-card')
    expect(simpleCard).toBeInTheDocument()
  })

  it('shows loading skeleton while entity is loading', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isStale: false,
      isLoading: true,
    })

    render(<CameraCard {...defaultProps} />)

    // SkeletonCard is rendered, check for skeleton elements
    expect(document.querySelector('[data-inline-skeleton]')).toBeInTheDocument()
  })

  it('shows skeleton when entity is being loaded', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    // SkeletonCard is rendered for undefined entity when connected
    expect(document.querySelector('[data-inline-skeleton]')).toBeInTheDocument()
  })

  it('shows error when disconnected', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    // ErrorDisplay is rendered for disconnected state
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  it('shows unavailable state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'unavailable' },
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    // The card is rendered but with unavailable state styling
    const card = document.querySelector('.grid-card')
    expect(card).toHaveStyle({ borderStyle: 'dotted' })
  })

  it('shows advanced camera card for stream-capable cameras', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockStreamEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    const advancedCard = screen.getByTestId('simple-camera-card')
    expect(advancedCard).toBeInTheDocument()
  })

  it('renders advanced camera card for all sizes', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockStreamEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    const { rerender } = render(<CameraCard {...defaultProps} size="small" />)
    expect(screen.getByTestId('simple-camera-card')).toBeInTheDocument()

    rerender(<CameraCard {...defaultProps} size="medium" />)
    expect(screen.getByTestId('simple-camera-card')).toBeInTheDocument()

    rerender(<CameraCard {...defaultProps} size="large" />)
    expect(screen.getByTestId('simple-camera-card')).toBeInTheDocument()
  })

  it('passes correct config to advanced camera card', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockStreamEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    const advancedCard = screen.getByTestId('simple-camera-card')
    expect(advancedCard).toHaveAttribute('data-entity-id', 'camera.front_door')
  })

  it('renders in edit mode', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockStreamEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<CameraCard {...defaultProps} />)

    // Advanced camera card is still rendered in edit mode
    expect(screen.getByTestId('simple-camera-card')).toBeInTheDocument()
  })

  it('renders advanced camera card wrapper', () => {
    render(<CameraCard {...defaultProps} />)

    // Verify the advanced camera card is rendered
    const advancedCard = screen.getByTestId('simple-camera-card')
    expect(advancedCard).toBeInTheDocument()
  })

  it('handles entity with custom attributes', () => {
    const entityWithPicture = {
      ...mockEntity,
      attributes: {
        ...mockEntity.attributes,
        entity_picture: '/local/custom-camera.jpg',
      },
    }

    vi.mocked(useEntity).mockReturnValue({
      entity: entityWithPicture,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    // The advanced camera card handles all entity attributes
    const advancedCard = screen.getByTestId('simple-camera-card')
    expect(advancedCard).toBeInTheDocument()
  })

  it('shows stale indicator when entity data is stale', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isStale: true,
      isLoading: false,
    })

    render(<CameraCard {...defaultProps} />)

    // Check that the card has stale styling
    const card = document.querySelector('.grid-card')
    expect(card).toHaveStyle({ borderWidth: '2px' })
  })

  it('calls onDelete when delete button is clicked', () => {
    // Set to edit mode to show delete button
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<CameraCard {...defaultProps} />)

    const deleteButton = screen.getByLabelText('Delete entity')
    fireEvent.click(deleteButton)

    expect(defaultProps.onDelete).toHaveBeenCalled()
  })

  it('calls onSelect when selection changes', () => {
    const onSelect = vi.fn()
    // Set to edit mode to enable selection
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<CameraCard {...defaultProps} onSelect={onSelect} />)

    const card = document.querySelector('.grid-card')
    fireEvent.click(card!)

    expect(onSelect).toHaveBeenCalledWith(true)
  })
})
