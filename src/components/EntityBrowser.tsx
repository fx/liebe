import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Dialog,
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
  Spinner,
} from '@radix-ui/themes'
import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntities, useEntitySearch } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'

interface EntityBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEntitiesSelected: (entityIds: string[]) => void
  currentEntityIds?: string[]
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
    camera: 'Cameras',
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

// Types for flattened list items
type FlattenedItem =
  | { type: 'header'; domain: string; entityCount: number }
  | { type: 'entity'; entity: HassEntity; domain: string }
  | { type: 'separator' }

export function EntityBrowser({
  open,
  onOpenChange,
  onEntitiesSelected,
  currentEntityIds = [],
}: EntityBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)
  const { entities, isLoading } = useEntities()
  const { isIndexing, search, searchResults, indexStats } = useEntitySearch(entities)
  const parentRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // Use search results when available
  const entityGroups = useMemo(() => {
    if (!hasSearched || isIndexing) {
      return []
    }

    // Convert grouped results to our format
    return Object.entries(searchResults.groupedByDomain)
      .map(([domain, entities]) => ({
        domain,
        entities,
      }))
      .sort((a, b) => getFriendlyDomain(a.domain).localeCompare(getFriendlyDomain(b.domain)))
  }, [searchResults, hasSearched, isIndexing])

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
    onEntitiesSelected(Array.from(selectedEntityIds))
    // Clear search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    setSelectedEntityIds(new Set())
    setSearchTerm('')
    setSearchInput('')
    setHasSearched(false)
    onOpenChange(false)
  }, [selectedEntityIds, onEntitiesSelected, onOpenChange])

  const handleClose = useCallback(() => {
    // Clear search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    setSelectedEntityIds(new Set())
    setSearchTerm('')
    setSearchInput('')
    setHasSearched(false)
    onOpenChange(false)
  }, [onOpenChange])

  const totalEntities = hasSearched ? searchResults.totalCount : 0

  // Initial search when dialog opens or indexing completes
  useEffect(() => {
    if (open && !isIndexing && !hasSearched) {
      search('', currentEntityIds).then(() => {
        setHasSearched(true)
      })
    }
  }, [open, isIndexing, hasSearched, search, currentEntityIds])

  // Flatten entity groups for virtualization
  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = []
    entityGroups.forEach((group, groupIndex) => {
      // Add group header
      items.push({
        type: 'header',
        domain: group.domain,
        entityCount: group.entities.length,
      })
      // Add entities
      group.entities.forEach((entity) => {
        items.push({
          type: 'entity',
          entity,
          domain: group.domain,
        })
      })
      // Add separator (except after last group)
      if (groupIndex < entityGroups.length - 1) {
        items.push({ type: 'separator' })
      }
    })
    return items
  }, [entityGroups])

  // Set up virtualizer
  const virtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flattenedItems[index]
      if (item.type === 'header') return 40
      if (item.type === 'entity') return 56 // Height of entity card
      return 24 // separator height
    },
    overscan: 5, // Render 5 items outside viewport for smooth scrolling
  })

  // Debounced search handler
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      // Set new timeout for debounced search
      searchTimeoutRef.current = setTimeout(async () => {
        setSearchTerm(value)
        if (!isIndexing) {
          await search(value, currentEntityIds)
          setHasSearched(true)
        }
      }, 300)
    },
    [search, currentEntityIds, isIndexing]
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="600px" style={{ maxHeight: '90vh' }}>
        <Dialog.Title>Add Entities</Dialog.Title>
        <Dialog.Description>Select entities to add to your dashboard</Dialog.Description>

        <Flex direction="column" gap="3" mt="4">
          {/* Search bar */}
          <TextField.Root
            placeholder="Search entities..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
            {searchInput && (
              <TextField.Slot>
                <IconButton
                  size="1"
                  variant="ghost"
                  onClick={() => {
                    setSearchInput('')
                    setSearchTerm('')
                  }}
                >
                  <Cross2Icon height="14" width="14" />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>

          {/* Results summary */}
          <Flex justify="between" align="center">
            <Text size="2" color="gray">
              {!searchTerm && hasSearched ? (
                <>Showing sample entities. Type to search all {indexStats.totalEntities} entities</>
              ) : (
                <>
                  {totalEntities} entities found
                  {searchTerm && ` matching "${searchTerm}"`}
                </>
              )}
            </Text>
            {selectedEntityIds.size > 0 && <Badge>{selectedEntityIds.size} selected</Badge>}
          </Flex>

          {/* Entity list */}
          <Box
            ref={parentRef}
            style={{
              height: '400px',
              overflow: 'auto',
              border: '1px solid var(--gray-6)',
              borderRadius: 'var(--radius-2)',
            }}
          >
            {isLoading || isIndexing ? (
              <Flex align="center" justify="center" p="6" direction="column" gap="3">
                <Spinner size="3" />
                <Text color="gray">
                  {isIndexing ? 'Indexing entities for fast search...' : 'Loading entities...'}
                </Text>
              </Flex>
            ) : !hasSearched ? (
              <Flex align="center" justify="center" p="6">
                <Text color="gray">Initializing search...</Text>
              </Flex>
            ) : flattenedItems.length === 0 ? (
              <Flex align="center" justify="center" p="6">
                <Text color="gray">
                  {searchTerm ? 'No entities found matching your search' : 'No entities available'}
                </Text>
              </Flex>
            ) : (
              <>
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = flattenedItems[virtualItem.index]
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
                        }}
                      >
                        {item.type === 'header' && (
                          <Flex align="center" justify="between" p="2" style={{ height: '100%' }}>
                            <Text size="2" weight="bold">
                              {getFriendlyDomain(item.domain)}
                            </Text>
                            <Checkbox
                              size="1"
                              checked={
                                entityGroups
                                  .find((g) => g.domain === item.domain)
                                  ?.entities.every((e) => selectedEntityIds.has(e.entity_id)) ||
                                false
                              }
                              onCheckedChange={(checked) =>
                                handleToggleAll(item.domain, checked as boolean)
                              }
                            />
                          </Flex>
                        )}
                        {item.type === 'entity' && (
                          <Box px="2">
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
                          <Box px="2" py="1">
                            <Separator size="4" />
                          </Box>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!searchTerm && hasSearched && (
                  <Flex justify="center" p="3">
                    <Text size="2" color="gray">
                      Start typing to search all {indexStats.totalEntities} entities
                    </Text>
                  </Flex>
                )}
              </>
            )}
          </Box>
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
