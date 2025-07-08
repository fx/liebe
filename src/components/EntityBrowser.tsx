import { useState, useMemo, useCallback, useRef } from 'react'
import {
  Dialog,
  Flex,
  TextField,
  Checkbox,
  Button,
  Text,
  IconButton,
  Badge,
  Card,
} from '@radix-ui/themes'
import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntities } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'

interface EntityBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEntitiesSelected: (entityIds: string[]) => void
  currentEntityIds?: string[]
}

// Helper to get domain from entity_id
const getDomain = (entityId: string): string => {
  return entityId.split('.')[0]
}

// Domains to filter out by default
const SYSTEM_DOMAINS = ['persistent_notification', 'person', 'sun', 'zone']

export function EntityBrowser({
  open,
  onOpenChange,
  onEntitiesSelected,
  currentEntityIds = [],
}: EntityBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const { entities, isLoading } = useEntities()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Filter entities into a flat list
  const filteredEntities = useMemo(() => {
    return Object.values(entities)
      .filter((entity) => {
        // Filter out system domains
        const domain = getDomain(entity.entity_id)
        if (SYSTEM_DOMAINS.includes(domain)) return false

        // Filter out already added entities
        if (currentEntityIds.includes(entity.entity_id)) return false

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
      .sort((a, b) =>
        (a.attributes.friendly_name || a.entity_id).localeCompare(
          b.attributes.friendly_name || b.entity_id
        )
      )
  }, [entities, searchTerm, currentEntityIds])

  // Create virtualizer
  const virtualizer = useVirtualizer({
    count: filteredEntities.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => 64, // Estimated height of each entity item
    overscan: 5, // Render 5 items above and below the visible area
  })

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

  const handleAddSelected = useCallback(() => {
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

  const handleSelectAll = useCallback(() => {
    if (selectedEntityIds.size === filteredEntities.length) {
      // Deselect all
      setSelectedEntityIds(new Set())
    } else {
      // Select all visible entities
      setSelectedEntityIds(new Set(filteredEntities.map((e) => e.entity_id)))
    }
  }, [filteredEntities, selectedEntityIds.size])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="600px" style={{ maxHeight: '90vh' }}>
        <Dialog.Title>Add Entities</Dialog.Title>
        <Dialog.Description>Select entities to add to your dashboard</Dialog.Description>

        <Flex direction="column" gap="3" mt="4">
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

          {/* Results summary with select all */}
          <Flex justify="between" align="center">
            <Text size="2" color="gray">
              {filteredEntities.length} entities found
              {searchTerm && ` matching "${searchTerm}"`}
            </Text>
            <Flex gap="2" align="center">
              {filteredEntities.length > 0 && (
                <Checkbox
                  size="1"
                  checked={selectedEntityIds.size === filteredEntities.length}
                  onCheckedChange={handleSelectAll}
                />
              )}
              {selectedEntityIds.size > 0 && <Badge>{selectedEntityIds.size} selected</Badge>}
            </Flex>
          </Flex>

          {/* Virtual entity list */}
          <div
            ref={scrollAreaRef}
            style={{
              height: '400px',
              overflow: 'auto',
              borderRadius: 'var(--radius-2)',
              backgroundColor: 'var(--gray-a2)',
            }}
          >
            {isLoading ? (
              <Flex align="center" justify="center" p="6">
                <Text color="gray">Loading entities...</Text>
              </Flex>
            ) : filteredEntities.length === 0 ? (
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
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const entity = filteredEntities[virtualItem.index]
                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                        padding: '0 var(--space-2)',
                      }}
                    >
                      <EntityItem
                        entity={entity}
                        checked={selectedEntityIds.has(entity.entity_id)}
                        onCheckedChange={(checked) => handleToggleEntity(entity.entity_id, checked)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Flex>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" onClick={handleClose}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleAddSelected} disabled={selectedEntityIds.size === 0}>
            Add {selectedEntityIds.size > 0 && `(${selectedEntityIds.size})`}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
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
  const domain = getDomain(entity.entity_id)

  return (
    <Card asChild>
      <label style={{ cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center' }}>
        <Flex align="center" gap="3" p="2" style={{ width: '100%' }}>
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
              <Badge size="1" variant="soft">
                {domain}
              </Badge>
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
