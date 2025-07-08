import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityBrowser } from '../EntityBrowser'
import type { HassEntity } from '../../store/entityTypes'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntities: vi.fn(),
  useEntitySearch: vi.fn(),
}))

// Don't mock TanStack Virtual for performance tests - we want real virtualization
import { useEntities, useEntitySearch } from '~/hooks'

describe('EntityBrowser Performance', () => {
  const mockOnOpenChange = vi.fn()
  const mockOnEntitiesSelected = vi.fn()

  // Generate random entities for testing
  function generateRandomEntities(count: number): Record<string, HassEntity> {
    const entities: Record<string, HassEntity> = {}
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
      'basement',
      'attic',
      'hallway',
      'outdoor',
    ]

    for (let i = 0; i < count; i++) {
      const domain = domains[Math.floor(Math.random() * domains.length)]
      const room = rooms[Math.floor(Math.random() * rooms.length)]
      const entityId = `${domain}.${room}_${i}`

      entities[entityId] = {
        entity_id: entityId,
        state: Math.random() > 0.5 ? 'on' : 'off',
        attributes: {
          friendly_name: `${room.replace('_', ' ')} ${domain} ${i}`,
          ...(domain === 'sensor' ? { unit_of_measurement: '°C' } : {}),
          ...(domain === 'light' ? { brightness: Math.floor(Math.random() * 255) } : {}),
        },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        context: { id: String(i), parent_id: null, user_id: null },
      }
    }

    return entities
  }

  // Helper to create mock search results
  function createSearchResults(
    entities: HassEntity[],
    searchTerm = ''
  ): ReturnType<typeof useEntitySearch> {
    const filteredEntities = entities.filter((entity) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        return (
          entity.entity_id.toLowerCase().includes(search) ||
          entity.attributes.friendly_name?.toLowerCase().includes(search)
        )
      }
      return true
    })

    const groupedByDomain: Record<string, HassEntity[]> = {}
    filteredEntities.forEach((entity) => {
      const domain = entity.entity_id.split('.')[0]
      if (!groupedByDomain[domain]) {
        groupedByDomain[domain] = []
      }
      groupedByDomain[domain].push(entity)
    })

    return {
      isIndexing: false,
      search: vi.fn().mockImplementation(async (term: string) => {
        const filtered = entities.filter((entity) => {
          if (term) {
            const search = term.toLowerCase()
            return (
              entity.entity_id.toLowerCase().includes(search) ||
              entity.attributes.friendly_name?.toLowerCase().includes(search)
            )
          }
          return true
        })

        const grouped: Record<string, HassEntity[]> = {}
        filtered.forEach((entity) => {
          const domain = entity.entity_id.split('.')[0]
          if (!grouped[domain]) {
            grouped[domain] = []
          }
          grouped[domain].push(entity)
        })

        return {
          results: filtered,
          totalCount: filtered.length,
          groupedByDomain: grouped,
        }
      }),
      searchResults: {
        results: filteredEntities,
        totalCount: filteredEntities.length,
        groupedByDomain,
      },
      getEntitiesByDomain: vi.fn(),
      updateEntity: vi.fn(),
      removeEntity: vi.fn(),
      indexStats: {
        totalEntities: entities.length,
        domains: Object.keys(groupedByDomain),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render and search 1500 entities efficiently', async () => {
    const entityCount = 1500
    const mockEntities = generateRandomEntities(entityCount)
    const entityArray = Object.values(mockEntities)

    // Track render performance
    const renderStartTime = performance.now()

    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: entityArray,
      isConnected: true,
      isLoading: false,
    })

    vi.mocked(useEntitySearch).mockReturnValue(createSearchResults(entityArray))

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Add Entities')).toBeInTheDocument()
    })

    const renderEndTime = performance.now()
    const initialRenderTime = renderEndTime - renderStartTime

    console.log(
      `Initial render time with ${entityCount} entities: ${initialRenderTime.toFixed(2)}ms`
    )

    // Test search performance
    const user = userEvent.setup()
    const searchInput = screen.getByPlaceholderText('Search entities...')

    // Search for a specific entity
    const targetEntity = entityArray[Math.floor(entityCount / 2)]
    const searchStartTime = performance.now()

    await user.type(searchInput, targetEntity.attributes.friendly_name || '')

    // Wait for search results to update
    await waitFor(
      () => {
        expect(searchInput).toHaveValue(targetEntity.attributes.friendly_name || '')
      },
      { timeout: 5000 }
    )

    const searchEndTime = performance.now()
    const searchTime = searchEndTime - searchStartTime

    console.log(`Search time: ${searchTime.toFixed(2)}ms`)

    // Performance benchmarks
    expect(initialRenderTime).toBeLessThan(2000) // Initial render should be under 2 seconds
    expect(searchTime).toBeLessThan(3000) // Search should complete under 3 seconds

    // Store baseline performance for comparison
    console.log('\n=== BASELINE PERFORMANCE ===')
    console.log(`Initial render: ${initialRenderTime.toFixed(2)}ms`)
    console.log(`Search operation: ${searchTime.toFixed(2)}ms`)
    console.log(`Total time: ${(initialRenderTime + searchTime).toFixed(2)}ms`)
    console.log('===========================\n')
  })

  it('should handle scrolling through 1500 entities efficiently', async () => {
    const entityCount = 1500
    const mockEntities = generateRandomEntities(entityCount)
    const entityArray = Object.values(mockEntities)

    vi.mocked(useEntities).mockReturnValue({
      entities: mockEntities,
      filteredEntities: entityArray,
      isConnected: true,
      isLoading: false,
    })

    vi.mocked(useEntitySearch).mockReturnValue(createSearchResults(entityArray))

    render(
      <EntityBrowser
        open={true}
        onOpenChange={mockOnOpenChange}
        onEntitiesSelected={mockOnEntitiesSelected}
      />
    )

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Add Entities')).toBeInTheDocument()
    })

    // Find the scrollable container
    const scrollContainer = screen
      .getByText('Add Entities')
      .closest('[role="dialog"]')
      ?.querySelector('[style*="overflow"]')

    if (scrollContainer) {
      // Measure scroll performance
      const scrollStartTime = performance.now()

      // Simulate scrolling to bottom
      scrollContainer.scrollTop = scrollContainer.scrollHeight

      // Wait a bit for any rendering
      await new Promise((resolve) => setTimeout(resolve, 100))

      const scrollEndTime = performance.now()
      const scrollTime = scrollEndTime - scrollStartTime

      console.log(`Scroll to bottom time: ${scrollTime.toFixed(2)}ms`)

      // Scrolling should be very fast with virtualization
      expect(scrollTime).toBeLessThan(200)
    }
  })
})
