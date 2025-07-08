import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Dialog,
  Flex,
  TextField,
  Checkbox,
  Button,
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

// Track render performance
let renderStartTime: number | null = null

export function EntityBrowser({
  open,
  onOpenChange,
  onEntitiesSelected,
  currentEntityIds = [],
}: EntityBrowserProps) {
  if (open && !renderStartTime) {
    renderStartTime = performance.now()
  }
  console.log('[EntityBrowser] Rendering, open:', open)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)
  const { entities, isLoading } = useEntities()
  // Only initialize search when dialog is actually open
  const { isIndexing, search, searchResults, indexStats } = useEntitySearch(open ? entities : {})

  console.log('[EntityBrowser] State:', {
    entitiesCount: Object.keys(entities).length,
    isLoading,
    isIndexing,
    searchResultsCount: searchResults.results.length,
    indexStats,
    hasSearched,
    searchTerm,
  })
  const parentRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // Use search results when available - now just a flat list
  const entityList = useMemo(() => {
    console.log(
      '[EntityBrowser] Computing entityList, hasSearched:',
      hasSearched,
      'isIndexing:',
      isIndexing
    )
    if (!hasSearched || isIndexing) {
      return []
    }

    // Sort entities by friendly name for easier browsing
    const sorted = [...searchResults.results].sort((a, b) => {
      const nameA = a.attributes.friendly_name || a.entity_id
      const nameB = b.attributes.friendly_name || b.entity_id
      return nameA.localeCompare(nameB)
    })

    console.log('[EntityBrowser] entityList computed:', sorted.length, 'entities')
    return sorted
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

  // Removed handleToggleAll - no longer needed without grouping

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
    console.log(
      '[EntityBrowser] useEffect - open:',
      open,
      'isIndexing:',
      isIndexing,
      'hasSearched:',
      hasSearched
    )
    if (open && !isIndexing && !hasSearched) {
      console.log('[EntityBrowser] Triggering initial search...')
      const startTime = performance.now()
      search('', currentEntityIds).then((results) => {
        const duration = performance.now() - startTime
        console.log(
          '[EntityBrowser] Initial search completed in',
          duration.toFixed(2),
          'ms, results:',
          results
        )
        setHasSearched(true)
      })
    }
  }, [open, isIndexing, hasSearched, search, currentEntityIds])

  // Direct entity list for virtualization - no flattening needed
  const flattenedItems = useMemo(() => {
    const startTime = performance.now()
    const duration = performance.now() - startTime
    console.log(
      '[EntityBrowser] Entity list ready in',
      duration.toFixed(2),
      'ms, count:',
      entityList.length
    )
    return entityList
  }, [entityList])

  // Set up virtualizer with aggressive optimization
  const virtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // All items are entity cards now
    overscan: 3, // Slightly increased for smoother scrolling
    scrollMargin: 0,
    // Additional performance optimizations
    measureElement: undefined, // Disable dynamic measurements
  })

  console.log('[EntityBrowser] Virtualizer:', {
    totalItems: flattenedItems.length,
    virtualItems: virtualizer.getVirtualItems().length,
    totalSize: virtualizer.getTotalSize(),
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

  // Log render completion time
  useEffect(() => {
    if (open && renderStartTime && flattenedItems.length > 0) {
      const duration = performance.now() - renderStartTime
      console.log('[EntityBrowser] Total time from open to items ready:', duration.toFixed(2), 'ms')
      renderStartTime = null
    }
  }, [open, flattenedItems.length])

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
                <>
                  Showing {totalEntities} sample entities. Type to search all{' '}
                  {indexStats.totalEntities} entities
                </>
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
                    const entity = flattenedItems[virtualItem.index]
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
                        <Box px="2">
                          <EntityItem
                            entity={entity}
                            checked={selectedEntityIds.has(entity.entity_id)}
                            onCheckedChange={(checked) =>
                              handleToggleEntity(entity.entity_id, checked)
                            }
                          />
                        </Box>
                      </div>
                    )
                  })}
                </div>
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
