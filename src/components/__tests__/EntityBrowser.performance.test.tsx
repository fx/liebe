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

describe('EntityBrowser Performance', () => {
  const mockOnOpenChange = vi.fn()
  const mockOnEntitiesSelected = vi.fn()

  // Generate mock entities with realistic data
  function generateMockEntities(count: number): Record<string, HassEntity> {
    const domains = [
      'light',
      'switch',
      'sensor',
      'binary_sensor',
      'climate',
      'cover',
      'fan',
      'lock',
      'camera',
      'media_player',
    ]
    const rooms = [
      'living_room',
      'kitchen',
      'bedroom',
      'bathroom',
      'office',
      'garage',
      'hallway',
      'basement',
      'attic',
      'outdoor',
    ]
    const entities: Record<string, HassEntity> = {}

    for (let i = 0; i < count; i++) {
      const domain = domains[i % domains.length]
      const room = rooms[Math.floor(i / domains.length) % rooms.length]
      const number = Math.floor(i / (domains.length * rooms.length)) + 1
      const suffix = number > 1 ? `_${number}` : ''
      const entityId = `${domain}.${room}${suffix}`

      entities[entityId] = {
        entity_id: entityId,
        state: domain === 'sensor' ? `${Math.random() * 100}` : Math.random() > 0.5 ? 'on' : 'off',
        attributes: {
          friendly_name: `${room.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())} ${domain.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}${suffix.replace('_', ' ')}`,
          ...(domain === 'sensor' && { unit_of_measurement: '°C' }),
          ...(domain === 'light' && { brightness: Math.floor(Math.random() * 255) }),
        },
        last_changed: '2023-01-01T00:00:00Z',
        last_updated: '2023-01-01T00:00:00Z',
        context: { id: `id-${i}`, parent_id: null, user_id: null },
      }
    }

    return entities
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render and search through 1500 entities efficiently', { timeout: 30000 }, async () => {
    const mockEntities = generateMockEntities(1500)

    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: Object.values(mockEntities),
      isConnected: true,
      isLoading: false,
    })

    // Measure initial render time
    const startTime = performance.now()

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    const renderTime = performance.now() - startTime
    console.log(`Initial render with 1500 entities took: ${renderTime.toFixed(2)}ms`)

    // Verify all domains are rendered
    expect(screen.getByText('Lights')).toBeInTheDocument()
    expect(screen.getByText('Sensors')).toBeInTheDocument()

    // Measure search performance
    const user = userEvent.setup()
    const searchInput = screen.getByPlaceholderText('Search entities...')

    const searchStartTime = performance.now()
    await user.type(searchInput, 'bedroom_4')
    const searchTime = performance.now() - searchStartTime

    console.log(`Search operation took: ${searchTime.toFixed(2)}ms`)

    // Verify search results - looking for sensor.bedroom_4
    expect(screen.getByText('sensor.bedroom_4')).toBeInTheDocument()

    // Check that entities are filtered properly
    const totalEntitiesText = screen.getByText(/entities found matching/)
    expect(totalEntitiesText).toBeInTheDocument()

    // Performance assertions - these are baseline measurements
    expect(renderTime).toBeLessThan(5000) // Initial render should be under 5 seconds
    expect(searchTime).toBeLessThan(3000) // Search should be under 3 seconds
  })

  it('should handle scrolling through large entity lists', { timeout: 30000 }, async () => {
    const mockEntities = generateMockEntities(1500)

    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: Object.values(mockEntities),
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

    // Find the scrollable area - ScrollArea doesn't have region role, find by class
    const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement

    // Measure scroll performance
    const scrollStartTime = performance.now()

    // Simulate scrolling
    scrollArea.scrollTop = 1000
    scrollArea.dispatchEvent(new Event('scroll'))

    const scrollTime = performance.now() - scrollStartTime
    console.log(`Scroll operation took: ${scrollTime.toFixed(2)}ms`)

    expect(scrollTime).toBeLessThan(100) // Scrolling should be smooth
    expect(scrollArea).toBeTruthy()
  })

  it('should handle selection of multiple entities efficiently', { timeout: 30000 }, async () => {
    const mockEntities = generateMockEntities(1500)

    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: Object.values(mockEntities),
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

    const user = userEvent.setup()

    // Find and click a domain checkbox to select all entities in that domain
    const checkboxes = screen.getAllByRole('checkbox')
    const lightsCheckbox = checkboxes[0] // First checkbox should be for Lights domain

    const selectionStartTime = performance.now()
    await user.click(lightsCheckbox)
    const selectionTime = performance.now() - selectionStartTime

    console.log(`Bulk selection took: ${selectionTime.toFixed(2)}ms`)

    // Verify selection badge appears
    expect(screen.getByText(/selected/)).toBeInTheDocument()

    expect(selectionTime).toBeLessThan(1000) // Bulk selection should be under 1 second
  })
})
