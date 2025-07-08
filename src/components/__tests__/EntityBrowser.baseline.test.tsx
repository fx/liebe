import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EntityBrowser } from '../EntityBrowser'
import type { HassEntity } from '../../store/entityTypes'

// Mock the useEntities hook
vi.mock('~/hooks', () => ({
  useEntities: vi.fn(),
}))

import { useEntities } from '~/hooks'

describe('EntityBrowser Baseline Performance', () => {
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

  it(
    'should measure baseline render performance with 1500 entities',
    { timeout: 60000 },
    async () => {
      const mockEntities = generateMockEntities(1500)

      vi.mocked(useEntities).mockReturnValue({
        entities: mockEntities,
        filteredEntities: Object.values(mockEntities),
        isConnected: true,
        isLoading: false,
      })

      console.log('\n=== BASELINE PERFORMANCE MEASUREMENT ===')
      console.log(`Total entities: 1500`)
      console.log(
        `Domains: ${Object.keys(mockEntities).reduce(
          (acc, id) => {
            const domain = id.split('.')[0]
            acc[domain] = (acc[domain] || 0) + 1
            return acc
          },
          {} as Record<string, number>
        )}`
      )

      // Measure initial render time
      const startTime = performance.now()

      const { container } = render(
        <EntityBrowser
          open={true}
          onOpenChange={mockOnOpenChange}
          onEntitiesSelected={mockOnEntitiesSelected}
        />
      )

      const renderTime = performance.now() - startTime
      console.log(`\nInitial render time: ${renderTime.toFixed(2)}ms`)

      // Verify dialog is rendered
      expect(screen.getByText('Add Entities')).toBeInTheDocument()

      // Count how many entity items are actually rendered in the viewport
      const entityCards = container.querySelectorAll('.rt-Card')
      console.log(`Entity cards rendered in viewport: ${entityCards.length}`)

      // Look for signs of virtualization
      const allDivs = container.querySelectorAll('div')
      let virtualizedItemsFound = 0
      allDivs.forEach((div) => {
        if (div.style.transform && div.style.transform.includes('translateY')) {
          virtualizedItemsFound++
        }
      })
      console.log(`Virtualized items found: ${virtualizedItemsFound}`)

      // Compare to baseline
      console.log(`\nPERFORMANCE COMPARISON:`)
      console.log(`Baseline render time: 3528.08ms`)
      console.log(`Optimized render time: ${renderTime.toFixed(2)}ms`)
      console.log(`Improvement: ${(3528.08 / renderTime).toFixed(1)}x faster`)

      // Verify the massive performance improvement
      expect(renderTime).toBeLessThan(1000) // Should be under 1 second now

      // Check memory usage if available
      if ('memory' in performance) {
        const memInfo = (
          performance as Performance & {
            memory: { usedJSHeapSize: number; totalJSHeapSize: number }
          }
        ).memory
        console.log(`\nMemory usage:`)
        console.log(`- Used JS Heap: ${(memInfo.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`)
        console.log(`- Total JS Heap: ${(memInfo.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`)
      }

      console.log('\n=== END BASELINE MEASUREMENT ===\n')
    }
  )
})
