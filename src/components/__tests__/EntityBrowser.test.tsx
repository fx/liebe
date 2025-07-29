import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityBrowser } from '../EntityBrowser'
import type { HassEntity } from '../../store/entityTypes'

// Mock the dependencies
vi.mock('~/hooks', () => ({
  useEntities: vi.fn(),
}))

// Mock the virtualizer to render all items in tests
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn((options: { count: number; estimateSize: (index: number) => number }) => {
    // Create virtual items based on count
    const items: Array<{ index: number; start: number; size: number; key: number }> = []
    let offset = 0
    for (let i = 0; i < options.count; i++) {
      const size = options.estimateSize(i)
      items.push({ index: i, start: offset, size, key: i })
      offset += size
    }
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset,
    }
  }),
}))

vi.mock('~/store', () => ({
  dashboardActions: {
    addGridItem: vi.fn(),
  },
  dashboardStore: {
    state: {
      screens: [
        {
          id: 'test-screen-id',
          name: 'Test Screen',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            items: [],
          },
        },
      ],
    },
  },
}))

import { useEntities } from '~/hooks'
import { dashboardActions } from '~/store'

describe('EntityBrowser', () => {
  const mockOnOpenChange = vi.fn()
  const mockScreenId = 'test-screen-id'

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
    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.getByText('Add Items')).toBeInTheDocument()
    expect(screen.getByText('Select items to add to your dashboard')).toBeInTheDocument()
  })

  it('should not render dialog when closed', () => {
    render(<EntityBrowser open={false} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.queryByText('Add Items')).not.toBeInTheDocument()
  })

  it('should display tabs for entities and cards', () => {
    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.getByRole('tab', { name: /Entities/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Cards/i })).toBeInTheDocument()
  })

  it('should display entities grouped by domain in entities tab', () => {
    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    // Entities tab should be default
    expect(screen.getByText('Lights')).toBeInTheDocument()
    expect(screen.getByText('Switches')).toBeInTheDocument()
    expect(screen.getByText('Sensors')).toBeInTheDocument()

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
    expect(screen.getByText('Kitchen Switch')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })

  it('should filter out system domains', () => {
    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.queryByText('persistent_notification.test')).not.toBeInTheDocument()
  })

  it('should filter entities based on search term', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    const searchInput = screen.getByPlaceholderText('Search entities...')
    await user.type(searchInput, 'light')

    // Wait for debounce and re-render
    await waitFor(
      () => {
        expect(screen.getByText('Living Room Light')).toBeInTheDocument()
      },
      { timeout: 1000 }
    )

    // After filtering, these should not be visible
    await waitFor(() => {
      expect(screen.queryByText('Kitchen Switch')).not.toBeInTheDocument()
      expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    })
  })

  it('should add selected entities to grid', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    // Find and click the checkbox for Living Room Light
    const checkboxes = screen.getAllByRole('checkbox')
    const lightCheckbox = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('Living Room Light')
    )
    await user.click(lightCheckbox!)

    // Should show selected count
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    // Click Add button
    const addButton = screen.getByRole('button', { name: /Add \(1\)/ })
    await user.click(addButton)

    // Should have called addGridItem
    expect(dashboardActions.addGridItem).toHaveBeenCalledWith(
      mockScreenId,
      expect.objectContaining({
        type: 'entity',
        entityId: 'light.living_room',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      })
    )

    // Should have closed the dialog
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should show cards tab content', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    // Click on Cards tab
    const cardsTab = screen.getByRole('tab', { name: /Cards/i })
    await user.click(cardsTab)

    expect(screen.getByText('Add special cards to your dashboard')).toBeInTheDocument()
    expect(screen.getByTitle(/Text Card/)).toBeInTheDocument()
    expect(screen.getByTitle(/Separator/)).toBeInTheDocument()
  })

  it('should add text card', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    // Click on Cards tab
    const cardsTab = screen.getByRole('tab', { name: /Cards/i })
    await user.click(cardsTab)

    // Click text card button
    const textButton = screen.getByTitle(/Text Card/)
    await user.click(textButton)

    // Should have called addGridItem with text card
    expect(dashboardActions.addGridItem).toHaveBeenCalledWith(
      mockScreenId,
      expect.objectContaining({
        type: 'text',
        content: '# Text Card\n\nDouble-click to edit this text.',
        x: 0,
        y: 0,
        width: 3,
        height: 2,
      })
    )
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should show loading state', () => {
    vi.mocked(useEntities).mockReturnValue({
      entities: {},
      filteredEntities: [],
      isConnected: true,
      isLoading: true,
    })

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.getByText('Loading entities...')).toBeInTheDocument()
  })

  it('should show empty state when no entities found', () => {
    vi.mocked(useEntities).mockReturnValue({
      entities: {},
      filteredEntities: [],
      isConnected: true,
      isLoading: false,
    })

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    expect(screen.getByText('No entities found')).toBeInTheDocument()
  })

  it('should handle escape key to close', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={mockScreenId} />)

    // Press ESC key to close the drawer
    await user.keyboard('{Escape}')

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should not add items when screenId is null', async () => {
    const user = userEvent.setup()

    render(<EntityBrowser open={true} onOpenChange={mockOnOpenChange} screenId={null} />)

    // Select an entity
    const checkboxes = screen.getAllByRole('checkbox')
    const lightCheckbox = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('Living Room Light')
    )
    await user.click(lightCheckbox!)

    // Click Add button
    const addButton = screen.getByRole('button', { name: /Add \(1\)/ })
    await user.click(addButton)

    // Should not have called addGridItem
    expect(dashboardActions.addGridItem).not.toHaveBeenCalled()
    // But should still close
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })
})
