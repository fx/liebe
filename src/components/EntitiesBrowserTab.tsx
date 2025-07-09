import { useState, useMemo, useCallback, useRef, memo } from 'react'
import {
  Flex,
  TextField,
  Checkbox,
  Button,
  Separator,
  Text,
  Box,
  IconButton,
  Badge,
  Card,
} from '@radix-ui/themes'
import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntities } from '~/hooks'
import { dashboardActions } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'

interface EntitiesBrowserTabProps {
  screenId: string | null
  onClose: () => void
}

// Helper to get domain from entity_id
const getDomain = (entityId: string): string => {
  return entityId.split('.')[0]
}

// Helper to get friendly domain name
const getFriendlyDomain = (domain: string): string => {
  const domainMap: Record<string, string> = {
    light: 'Lights',
    switch: 'Switches',
    sensor: 'Sensors',
    binary_sensor: 'Binary Sensors',
    climate: 'Climate',
    cover: 'Covers',
    fan: 'Fans',
    lock: 'Locks',
    media_player: 'Media Players',
    scene: 'Scenes',
    script: 'Scripts',
    automation: 'Automations',
    input_boolean: 'Input Booleans',
    input_number: 'Input Numbers',
    input_text: 'Input Text',
    input_select: 'Input Select',
    input_datetime: 'Input DateTime',
    weather: 'Weather',
  }
  return domainMap[domain] || domain.charAt(0).toUpperCase() + domain.slice(1)
}

// Domains to filter out by default
const SYSTEM_DOMAINS = ['persistent_notification', 'person', 'sun', 'zone']

// Types for virtualization
type VirtualItem =
  | { type: 'header'; domain: string; entities: HassEntity[] }
  | { type: 'entity'; entity: HassEntity }
  | { type: 'separator' }

export function EntitiesBrowserTab({ screenId, onClose }: EntitiesBrowserTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const { entities, isLoading } = useEntities()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Filter and flatten entities for virtualization
  const virtualItems = useMemo(() => {
    const filtered = Object.values(entities).filter((entity) => {
      // Filter out system domains
      const domain = getDomain(entity.entity_id)
      if (SYSTEM_DOMAINS.includes(domain)) return false

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        return (
          entity.entity_id.toLowerCase().includes(search) ||
          entity.attributes.friendly_name?.toLowerCase().includes(search) ||
          domain.toLowerCase().includes(search)
        )
      }

      return true
    })

    // Group by domain
    const groups: Record<string, HassEntity[]> = {}
    filtered.forEach((entity) => {
      const domain = getDomain(entity.entity_id)
      if (!groups[domain]) {
        groups[domain] = []
      }
      groups[domain].push(entity)
    })

    // Convert to flattened array for virtualization
    const items: VirtualItem[] = []
    const sortedDomains = Object.keys(groups).sort((a, b) =>
      getFriendlyDomain(a).localeCompare(getFriendlyDomain(b))
    )

    sortedDomains.forEach((domain, index) => {
      const domainEntities = groups[domain].sort((a, b) =>
        (a.attributes.friendly_name || a.entity_id).localeCompare(
          b.attributes.friendly_name || b.entity_id
        )
      )

      // Add header
      items.push({ type: 'header', domain, entities: domainEntities })

      // Add entities
      domainEntities.forEach((entity) => {
        items.push({ type: 'entity', entity })
      })

      // Add separator (except for last group)
      if (index < sortedDomains.length - 1) {
        items.push({ type: 'separator' })
      }
    })

    return items
  }, [entities, searchTerm])

  // Keep entityGroups for compatibility with other functions
  const entityGroups = useMemo(() => {
    return virtualItems
      .filter((item) => item.type === 'header')
      .map((item) => ({
        domain: (item as { type: 'header'; domain: string }).domain,
        entities: (item as { type: 'header'; domain: string; entities: HassEntity[] }).entities,
      }))
  }, [virtualItems])

  const handleToggleEntity = useCallback((entityId: string, checked: boolean) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(entityId)
      } else {
        next.delete(entityId)
      }
      return next
    })
  }, [])

  const handleToggleAll = useCallback(
    (domain: string, checked: boolean) => {
      const domainEntities = entityGroups.find((g) => g.domain === domain)?.entities || []
      setSelectedEntityIds((prev) => {
        const next = new Set(prev)
        domainEntities.forEach((entity) => {
          if (checked) {
            next.add(entity.entity_id)
          } else {
            next.delete(entity.entity_id)
          }
        })
        return next
      })
    },
    [entityGroups]
  )

  const handleAddSelected = useCallback(() => {
    if (screenId) {
      // Create GridItem for each entity
      Array.from(selectedEntityIds).forEach((entityId, index) => {
        const newItem: GridItem = {
          id: `${Date.now()}-${index}`,
          type: 'entity',
          entityId,
          x: 0,
          y: 0,
          width: 2,
          height: 2,
        }
        dashboardActions.addGridItem(screenId, newItem)
      })
    }
    setSelectedEntityIds(new Set())
    setSearchTerm('')
    onClose()
  }, [selectedEntityIds, screenId, onClose])

  const totalEntities = useMemo(
    () => entityGroups.reduce((sum, group) => sum + group.entities.length, 0),
    [entityGroups]
  )

  // Initialize virtualizer
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index]
      if (item.type === 'header') return 40
      if (item.type === 'entity') return 60
      if (item.type === 'separator') return 24
      return 50
    },
    overscan: 5,
  })

  return (
    <Flex direction="column" gap="3">
      {/* Search bar */}
      <TextField.Root
        placeholder="Search entities..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlassIcon height="16" width="16" />
        </TextField.Slot>
        {searchTerm && (
          <TextField.Slot>
            <IconButton size="1" variant="ghost" onClick={() => setSearchTerm('')}>
              <Cross2Icon height="14" width="14" />
            </IconButton>
          </TextField.Slot>
        )}
      </TextField.Root>

      {/* Results summary */}
      <Flex justify="between" align="center">
        <Text size="2" color="gray">
          {totalEntities} entities found
          {searchTerm && ` matching "${searchTerm}"`}
        </Text>
        {selectedEntityIds.size > 0 && <Badge>{selectedEntityIds.size} selected</Badge>}
      </Flex>

      {/* Virtualized Entity list */}
      <div
        ref={scrollAreaRef}
        style={{
          height: '400px',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {isLoading ? (
          <Flex align="center" justify="center" p="6">
            <Text color="gray">Loading entities...</Text>
          </Flex>
        ) : virtualItems.length === 0 ? (
          <Flex align="center" justify="center" p="6">
            <Text color="gray">No entities found</Text>
          </Flex>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = virtualItems[virtualRow.index]

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.type === 'header' && (
                    <Flex align="center" justify="between" mb="2" pr="3">
                      <Text size="2" weight="bold">
                        {getFriendlyDomain(item.domain)}
                      </Text>
                      <Checkbox
                        size="1"
                        checked={item.entities.every((e) => selectedEntityIds.has(e.entity_id))}
                        onCheckedChange={(checked) =>
                          handleToggleAll(item.domain, checked as boolean)
                        }
                      />
                    </Flex>
                  )}

                  {item.type === 'entity' && (
                    <Box pr="3">
                      <EntityItem
                        entity={item.entity}
                        checked={selectedEntityIds.has(item.entity.entity_id)}
                        onCheckedChange={(checked) =>
                          handleToggleEntity(item.entity.entity_id, checked)
                        }
                      />
                    </Box>
                  )}

                  {item.type === 'separator' && (
                    <Box pr="3">
                      <Separator size="4" my="3" />
                    </Box>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add button for entities */}
      <Flex gap="3" justify="end">
        <Button onClick={handleAddSelected} disabled={selectedEntityIds.size === 0}>
          Add {selectedEntityIds.size > 0 && `(${selectedEntityIds.size})`}
        </Button>
      </Flex>
    </Flex>
  )
}

interface EntityItemProps {
  entity: HassEntity
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const EntityItem = memo(function EntityItem({ entity, checked, onCheckedChange }: EntityItemProps) {
  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const stateDisplay =
    entity.state +
    (entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : '')

  return (
    <Card asChild>
      <label style={{ cursor: 'pointer' }}>
        <Flex align="center" gap="3" p="2">
          <Checkbox
            size="2"
            checked={checked}
            onCheckedChange={onCheckedChange as (checked: boolean | 'indeterminate') => void}
          />
          <Flex direction="column" style={{ flex: 1 }}>
            <Text size="2" weight="medium">
              {friendlyName}
            </Text>
            <Flex gap="2" align="center">
              <Text size="1" color="gray">
                {entity.entity_id}
              </Text>
              <Text size="1" color="gray">
                •
              </Text>
              <Text size="1" color="gray">
                {stateDisplay}
              </Text>
            </Flex>
          </Flex>
        </Flex>
      </label>
    </Card>
  )
})
