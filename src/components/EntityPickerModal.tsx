import { useState, useMemo, useCallback } from 'react'
import {
  Flex,
  TextField,
  ScrollArea,
  Checkbox,
  Separator,
  Text,
  Box,
  IconButton,
  Badge,
  Card,
} from '@radix-ui/themes'
import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useEntities } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'
import { Modal } from './Modal'

interface EntityPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEntitiesSelected: (entityIds: string[]) => void
  currentEntityIds?: string[]
  title?: string
  description?: string
  multiSelect?: boolean
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
  }
  return domainMap[domain] || domain.charAt(0).toUpperCase() + domain.slice(1)
}

// Domains to filter out by default
const SYSTEM_DOMAINS = ['persistent_notification', 'person', 'sun', 'weather', 'zone']

export function EntityPickerModal({
  open,
  onOpenChange,
  onEntitiesSelected,
  currentEntityIds = [],
  title = 'Select Entities',
  description = 'Choose entities from your Home Assistant',
  multiSelect = true,
}: EntityPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const { entities, isLoading } = useEntities()

  // Filter and group entities
  const entityGroups = useMemo(() => {
    const filtered = Object.values(entities).filter((entity: HassEntity) => {
      // Filter out system domains
      const domain = getDomain(entity.entity_id)
      if (SYSTEM_DOMAINS.includes(domain)) return false

      // Filter out already added entities (only in multi-select mode)
      if (multiSelect && currentEntityIds.includes(entity.entity_id)) return false

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
  }, [entities, searchTerm, currentEntityIds, multiSelect])

  const handleToggleEntity = useCallback(
    (entityId: string, checked: boolean) => {
      if (!multiSelect) {
        // Single select mode
        setSelectedEntityIds(checked ? new Set([entityId]) : new Set())
        return
      }

      // Multi-select mode
      setSelectedEntityIds((prev) => {
        const next = new Set(prev)
        if (checked) {
          next.add(entityId)
        } else {
          next.delete(entityId)
        }
        return next
      })
    },
    [multiSelect]
  )

  const handleToggleAll = useCallback(
    (domain: string, checked: boolean) => {
      if (!multiSelect) return // Disable toggle all in single select mode

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
    [entityGroups, multiSelect]
  )

  const handleConfirm = useCallback(() => {
    onEntitiesSelected(Array.from(selectedEntityIds))
    setSelectedEntityIds(new Set())
    setSearchTerm('')
    onOpenChange(false)
  }, [selectedEntityIds, onEntitiesSelected, onOpenChange])

  const handleClose = useCallback(() => {
    setSelectedEntityIds(new Set())
    setSearchTerm('')
    onOpenChange(false)
  }, [onOpenChange])

  const totalEntities = useMemo(
    () => entityGroups.reduce((sum, group) => sum + group.entities.length, 0),
    [entityGroups]
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="medium"
      primaryAction={{
        label: multiSelect
          ? `Add${selectedEntityIds.size > 0 ? ` (${selectedEntityIds.size})` : ''}`
          : 'Select',
        onClick: handleConfirm,
        disabled: selectedEntityIds.size === 0,
      }}
      secondaryAction={{
        label: 'Cancel',
        onClick: handleClose,
      }}
    >
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
                    {multiSelect && (
                      <Checkbox
                        size="1"
                        checked={group.entities.every((e) => selectedEntityIds.has(e.entity_id))}
                        onCheckedChange={(checked) =>
                          handleToggleAll(group.domain, checked as boolean)
                        }
                      />
                    )}
                  </Flex>
                  <Flex direction="column" gap="1">
                    {group.entities.map((entity) => (
                      <EntityItem
                        key={entity.entity_id}
                        entity={entity}
                        checked={selectedEntityIds.has(entity.entity_id)}
                        onCheckedChange={(checked) => handleToggleEntity(entity.entity_id, checked)}
                        multiSelect={multiSelect}
                      />
                    ))}
                  </Flex>
                  <Separator size="4" my="3" />
                </Box>
              ))}
            </Flex>
          )}
        </ScrollArea>
      </Flex>
    </Modal>
  )
}

interface EntityItemProps {
  entity: HassEntity
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  multiSelect: boolean
}

function EntityItem({ entity, checked, onCheckedChange, multiSelect }: EntityItemProps) {
  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const stateDisplay =
    entity.state +
    (entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : '')

  return (
    <Card asChild>
      <label style={{ cursor: 'pointer' }}>
        <Flex align="center" gap="3" p="2">
          {multiSelect ? (
            <Checkbox
              size="2"
              checked={checked}
              onCheckedChange={onCheckedChange as (checked: boolean | 'indeterminate') => void}
            />
          ) : (
            <input
              type="radio"
              checked={checked}
              onChange={(e) => onCheckedChange(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
          )}
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
