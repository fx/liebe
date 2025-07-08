import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityBrowser } from '../EntityBrowser'
import type { HassEntity } from '../../store/entityTypes'

// Mock the useEntities hook
vi.mock('~/hooks', () => ({
  useEntities: vi.fn(),
}))

import { useEntities } from '~/hooks'

describe('EntityBrowser', () => {
  const mockOnOpenChange = vi.fn()
  const mockOnEntitiesSelected = vi.fn()

  const mockEntities: Record<string, HassEntity> = {
    'light.living_room': {
      entity_id: 'light.living_room',
      state: 'on',
      attributes: {
        friendly_name: 'Living Room Light',
        brightness: 255,
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: { id: '123', parent_id: null, user_id: null },
    },
    'switch.kitchen': {
      entity_id: 'switch.kitchen',
      state: 'off',
      attributes: {
        friendly_name: 'Kitchen Switch',
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: { id: '456', parent_id: null, user_id: null },
    },
    'sensor.temperature': {
      entity_id: 'sensor.temperature',
      state: '22.5',
      attributes: {
        friendly_name: 'Temperature',
        unit_of_measurement: '°C',
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: { id: '789', parent_id: null, user_id: null },
    },
    'persistent_notification.test': {
      entity_id: 'persistent_notification.test',
      state: 'notifying',
      attributes: {},
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: { id: '999', parent_id: null, user_id: null },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: Object.values(mockEntities),
      isConnected: true,
      isLoading: false,
    })
  })

  it('should render dialog when open', () => {
    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    expect(screen.getByText('Add Entities')).toBeInTheDocument()
    expect(screen.getByText('Select entities to add to your dashboard')).toBeInTheDocument()
  })

  it('should not render dialog when closed', () => {
    render(
      <EntityBrowser
        open={false}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    expect(screen.queryByText('Add Entities')).not.toBeInTheDocument()
  })

  it('should display entities count and virtual scroll container', () => {
    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    // Check that the entity count is displayed
    expect(screen.getByText('3 entities found')).toBeInTheDocument()

    // Check that virtual scroll container is present
    const container = screen.getByText('Add Entities').closest('[role="dialog"]')
    const virtualContainer = container?.querySelector('[style*="height: 400px"]')
    expect(virtualContainer).toBeInTheDocument()
  })

  it('should filter out system domains', () => {
    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    expect(screen.queryByText('persistent_notification.test')).not.toBeInTheDocument()
  })

  it('should filter entities based on search term', async () => {
    const user = userEvent.setup()

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search entities...')
    await user.type(searchInput, 'light')

    // After searching for 'light', only 1 entity should be found
    expect(screen.getByText('1 entities found matching "light"')).toBeInTheDocument()
  })

  it('should handle entity selection', async () => {
    const user = userEvent.setup()

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    // Click the select all checkbox
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
    await user.click(selectAllCheckbox)

    // Should show all 3 entities selected
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    // Click Add button
    const addButton = screen.getByRole('button', { name: /Add \(3\)/ })
    await user.click(addButton)

    // Should have selected all 3 entities
    expect(mockOnEntitiesSelected).toHaveBeenCalledWith(
      expect.arrayContaining(['light.living_room', 'switch.kitchen', 'sensor.temperature'])
    )
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should handle select all entities', async () => {
    const user = userEvent.setup()

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    // Find the select all checkbox (it's the first checkbox)
    const checkboxes = screen.getAllByRole('checkbox')
    const selectAllCheckbox = checkboxes[0]
    await user.click(selectAllCheckbox)

    // Should select all 3 entities (light, switch, sensor)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('should exclude already added entities', () => {
    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
        currentEntityIds={['light.living_room']}
      />
    )

    // Only 2 entities should be shown (light.living_room is excluded)
    expect(screen.getByText('2 entities found')).toBeInTheDocument()
  })

  it('should show loading state', () => {
    vi.mocked(useEntities).mockReturnValue({
      entities: {},
      filteredEntities: [],
      isConnected: true,
      isLoading: true,
    })

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    expect(screen.getByText('Loading entities...')).toBeInTheDocument()
  })

  it('should show empty state when no entities found', () => {
    vi.mocked(useEntities).mockReturnValue({
      entities: {},
      filteredEntities: [],
      isConnected: true,
      isLoading: false,
    })

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    expect(screen.getByText('No entities found')).toBeInTheDocument()
  })

  it('should handle cancel action', async () => {
    const user = userEvent.setup()

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    expect(mockOnEntitiesSelected).not.toHaveBeenCalled()
  })
})
