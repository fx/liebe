import { useState, useMemo, useCallback } from 'react'
import {
  Flex,
  TextField,
  ScrollArea,
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

export function EntitiesBrowserTab({ screenId, onClose }: EntitiesBrowserTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const { entities, isLoading } = useEntities()

  // Filter and group entities
  const entityGroups = useMemo(() => {
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

    // Convert to array and sort
    return Object.entries(groups)
      .map(([domain, entities]) => ({
        domain,
        entities: entities.sort((a, b) =>
          (a.attributes.friendly_name || a.entity_id).localeCompare(
            b.attributes.friendly_name || b.entity_id
          )
        ),
      }))
      .sort((a, b) => getFriendlyDomain(a.domain).localeCompare(getFriendlyDomain(b.domain)))
  }, [entities, searchTerm])

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

      {/* Entity list */}
      <ScrollArea style={{ height: '400px' }}>
        {isLoading ? (
          <Flex align="center" justify="center" p="6">
            <Text color="gray">Loading entities...</Text>
          </Flex>
        ) : entityGroups.length === 0 ? (
          <Flex align="center" justify="center" p="6">
            <Text color="gray">No entities found</Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="4" pr="3">
            {entityGroups.map((group) => (
              <Box key={group.domain}>
                <Flex align="center" justify="between" mb="2">
                  <Text size="2" weight="bold">
                    {getFriendlyDomain(group.domain)}
                  </Text>
                  <Checkbox
                    size="1"
                    checked={group.entities.every((e) => selectedEntityIds.has(e.entity_id))}
                    onCheckedChange={(checked) => handleToggleAll(group.domain, checked as boolean)}
                  />
                </Flex>
                <Flex direction="column" gap="1">
                  {group.entities.map((entity) => (
                    <EntityItem
                      key={entity.entity_id}
                      entity={entity}
                      checked={selectedEntityIds.has(entity.entity_id)}
                      onCheckedChange={(checked) => handleToggleEntity(entity.entity_id, checked)}
                    />
                  ))}
                </Flex>
                <Separator size="4" my="3" />
              </Box>
            ))}
          </Flex>
        )}
      </ScrollArea>

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

function EntityItem({ entity, checked, onCheckedChange }: EntityItemProps) {
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
}
