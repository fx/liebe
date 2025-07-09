import { useState, useMemo, useCallback, useRef, memo, useEffect } from 'react'
import {
  Flex,
  TextField,
  Checkbox,
  Button,
  Text,
  Box,
  IconButton,
  Badge,
  Card,
  Link,
  ScrollArea,
} from '@radix-ui/themes'
import {
  Cross2Icon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@radix-ui/react-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntities } from '~/hooks'
import { dashboardActions, dashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { findOptimalPositionsForBatch } from '~/utils/gridPositioning'
import { getDefaultCardDimensions } from '~/utils/cardDimensions'

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

// Domain info for legend
interface DomainInfo {
  domain: string
  friendlyName: string
  count: number
  entities: HassEntity[]
}

// Domains that are supported with custom cards
const SUPPORTED_DOMAINS = [
  'light',
  'switch',
  'cover',
  'climate',
  'sensor',
  'binary_sensor',
  'weather',
  'fan',
  'camera',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'input_datetime',
]

export function EntitiesBrowserTab({ screenId, onClose }: EntitiesBrowserTabProps) {
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [excludedDomains, setExcludedDomains] = useState<Set<string>>(new Set())
  const [excludedInitialized, setExcludedInitialized] = useState(false)
  const { entities, isLoading } = useEntities()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Initialize excluded domains with unsupported ones when entities are loaded
  useEffect(() => {
    if (!excludedInitialized && Object.keys(entities).length > 0) {
      const allDomains = new Set<string>()
      Object.values(entities).forEach((entity) => {
        const domain = getDomain(entity.entity_id)
        if (!SYSTEM_DOMAINS.includes(domain)) {
          allDomains.add(domain)
        }
      })

      // Exclude domains that aren't supported
      const unsupported = new Set<string>()
      allDomains.forEach((domain) => {
        if (!SUPPORTED_DOMAINS.includes(domain)) {
          unsupported.add(domain)
        }
      })

      if (unsupported.size > 0) {
        setExcludedDomains(unsupported)
      }
      setExcludedInitialized(true)
    }
  }, [entities, excludedInitialized])

  // Debounce search term updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchTerm(searchInput)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchInput])

  // Filter and sort entities
  const { filteredEntities, allDomainInfo, excludedDomainInfo } = useMemo(() => {
    // First, get all domains from all entities (for the filter menu)
    const allDomainMap: Record<string, number> = {}
    Object.values(entities).forEach((entity) => {
      const domain = getDomain(entity.entity_id)
      if (!SYSTEM_DOMAINS.includes(domain)) {
        allDomainMap[domain] = (allDomainMap[domain] || 0) + 1
      }
    })

    // Separate excluded and visible domains
    const visibleDomains: DomainInfo[] = []
    const excluded: DomainInfo[] = []

    Object.entries(allDomainMap).forEach(([domain, count]) => {
      const info = {
        domain,
        friendlyName: getFriendlyDomain(domain),
        count,
        entities: [], // We don't need entities for the filter menu
      }

      if (excludedDomains.has(domain)) {
        excluded.push(info)
      } else {
        visibleDomains.push(info)
      }
    })

    // Sort both arrays
    visibleDomains.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
    excluded.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))

    // Now filter entities based on selected domains and search
    const filtered = Object.values(entities).filter((entity) => {
      // Filter out system domains
      const domain = getDomain(entity.entity_id)
      if (SYSTEM_DOMAINS.includes(domain)) return false

      // Exclude domains that are in the excluded list
      if (excludedDomains.has(domain)) {
        return false
      }

      // Domain filter - if domains are selected, only show entities from those domains
      if (selectedDomains.size > 0 && !selectedDomains.has(domain)) {
        return false
      }

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

    // Sort entities by friendly name only
    const sorted = filtered.sort((a, b) => {
      return (a.attributes.friendly_name || a.entity_id).localeCompare(
        b.attributes.friendly_name || b.entity_id
      )
    })

    return { filteredEntities: sorted, allDomainInfo: visibleDomains, excludedDomainInfo: excluded }
  }, [entities, searchTerm, selectedDomains, excludedDomains])

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

  const handleSelectAllVisible = useCallback(() => {
    const allVisible = filteredEntities.every((entity) => selectedEntityIds.has(entity.entity_id))
    setSelectedEntityIds((prev) => {
      const next = new Set(prev)
      filteredEntities.forEach((entity) => {
        if (allVisible) {
          next.delete(entity.entity_id)
        } else {
          next.add(entity.entity_id)
        }
      })
      return next
    })
  }, [filteredEntities, selectedEntityIds])

  const handleToggleDomain = useCallback((domain: string) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) {
        next.delete(domain)
      } else {
        next.add(domain)
      }
      return next
    })
  }, [])

  const handleExcludeDomain = useCallback((domain: string) => {
    setExcludedDomains((prev) => {
      const next = new Set(prev)
      next.add(domain)
      return next
    })
    // Also remove from selected if it was selected
    setSelectedDomains((prev) => {
      const next = new Set(prev)
      next.delete(domain)
      return next
    })
  }, [])

  const handleUnexcludeDomain = useCallback((domain: string) => {
    setExcludedDomains((prev) => {
      const next = new Set(prev)
      next.delete(domain)
      return next
    })
  }, [])

  const handleClearExclusions = useCallback(() => {
    setExcludedDomains(new Set())
  }, [])

  const handleAddSelected = useCallback(() => {
    if (screenId) {
      // Get current screen configuration to access existing items
      const state = dashboardStore.state
      const findScreen = (
        screens: typeof state.screens,
        id: string
      ): (typeof state.screens)[0] | null => {
        for (const screen of screens) {
          if (screen.id === id) return screen
          if (screen.children) {
            const found = findScreen(screen.children, id)
            if (found) return found
          }
        }
        return null
      }

      const currentScreen = findScreen(state.screens, screenId)
      if (!currentScreen?.grid) return

      // Prepare new items data with entity-specific dimensions
      const entityIds = Array.from(selectedEntityIds)
      const newItemsData = entityIds.map((entityId) => {
        const dimensions = getDefaultCardDimensions(entityId)
        return {
          width: dimensions.width,
          height: dimensions.height,
        }
      })

      // Find optimal positions for all items at once
      const positions = findOptimalPositionsForBatch(
        currentScreen.grid.items,
        newItemsData,
        currentScreen.grid.resolution
      )

      // Create GridItem for each entity with optimal position and dimensions
      entityIds.forEach((entityId, index) => {
        const dimensions = getDefaultCardDimensions(entityId)
        const newItem: GridItem = {
          id: `${Date.now()}-${index}`,
          type: 'entity',
          entityId,
          x: positions[index].x,
          y: positions[index].y,
          width: dimensions.width,
          height: dimensions.height,
        }
        dashboardActions.addGridItem(screenId, newItem)
      })
    }
    setSelectedEntityIds(new Set())
    setSelectedDomains(new Set())
    // Don't reset excluded domains - they should persist for the session
    setSearchInput('')
    setSearchTerm('')
    onClose()
  }, [selectedEntityIds, screenId, onClose])

  const totalEntities = filteredEntities.length

  // Initialize virtualizer
  const virtualizer = useVirtualizer({
    count: filteredEntities.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => 64, // Fixed height matching EntityItem
    overscan: 5,
  })

  return (
    <Flex direction="column" gap="3">
      {/* Search bar */}
      <TextField.Root
        placeholder="Search entities..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
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
          {totalEntities} entities
          {selectedDomains.size > 0 &&
            ` in ${selectedDomains.size} domain${selectedDomains.size > 1 ? 's' : ''}`}
          {searchTerm && ` matching "${searchTerm}"`}
        </Text>
        {selectedEntityIds.size > 0 && <Badge>{selectedEntityIds.size} selected</Badge>}
      </Flex>

      {/* Main content area with legend and entity list */}
      <Flex gap="3" style={{ height: '400px' }}>
        {/* Entity Filter sidebar */}
        <Card
          size="1"
          style={{ width: '240px', padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          {selectedDomains.size > 0 && (
            <Flex align="center" justify="end" p="3" pb="0">
              <Link
                size="1"
                onClick={() => setSelectedDomains(new Set())}
                style={{ cursor: 'pointer' }}
              >
                Clear filters
              </Link>
            </Flex>
          )}

          <ScrollArea style={{ flex: 1 }}>
            <Flex direction="column">
              {allDomainInfo.map((info) => {
                const isDomainSelected = selectedDomains.has(info.domain)

                return (
                  <Box key={info.domain}>
                    <Flex
                      direction="column"
                      gap="1"
                      px="3"
                      py="2"
                      style={{
                        backgroundColor: isDomainSelected ? 'var(--accent-a3)' : 'transparent',
                        borderLeft: '3px solid',
                        borderColor: isDomainSelected ? 'var(--accent-9)' : 'transparent',
                        transition: 'all 0.15s',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleDomain(info.domain)}
                      onMouseEnter={(e) => {
                        if (!isDomainSelected) {
                          e.currentTarget.style.backgroundColor = 'var(--gray-a2)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDomainSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <Flex align="center" justify="between">
                        <Flex align="center" gap="2">
                          <Checkbox
                            size="1"
                            checked={isDomainSelected}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => handleToggleDomain(info.domain)}
                          />
                          <Text size="2" weight="medium">
                            {info.friendlyName}
                          </Text>
                        </Flex>
                        <Flex align="center" gap="2">
                          <Badge size="1" variant="soft">
                            {info.count}
                          </Badge>
                          <IconButton
                            size="1"
                            variant="ghost"
                            color="gray"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExcludeDomain(info.domain)
                            }}
                            title="Exclude this domain"
                          >
                            <Cross2Icon width="12" height="12" />
                          </IconButton>
                        </Flex>
                      </Flex>
                    </Flex>
                  </Box>
                )
              })}
            </Flex>
          </ScrollArea>

          {/* Excluded domains section */}
          {excludedDomainInfo.length > 0 && (
            <Box px="3" py="2" style={{ borderTop: '1px solid var(--gray-a3)' }}>
              <Flex align="center" justify="between">
                <Link
                  size="2"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  {excludedDomainInfo.length} excluded
                </Link>
                {showAdvanced && (
                  <Link size="1" onClick={handleClearExclusions} style={{ cursor: 'pointer' }}>
                    Clear all
                  </Link>
                )}
              </Flex>

              {showAdvanced && (
                <Box mt="2">
                  <ScrollArea style={{ maxHeight: '120px' }} scrollbars="vertical">
                    <Flex direction="column" gap="1">
                      {excludedDomainInfo.map((info) => (
                        <Flex
                          key={info.domain}
                          align="center"
                          justify="between"
                          px="2"
                          py="1"
                          style={{
                            backgroundColor: 'var(--gray-a2)',
                            borderRadius: 'var(--radius-2)',
                            fontSize: '12px',
                          }}
                        >
                          <Text size="1" color="gray">
                            {info.friendlyName}
                          </Text>
                          <Flex align="center" gap="2">
                            <Badge size="1" variant="soft" color="gray">
                              {info.count}
                            </Badge>
                            <Link
                              size="1"
                              onClick={() => handleUnexcludeDomain(info.domain)}
                              style={{ cursor: 'pointer' }}
                            >
                              Include
                            </Link>
                          </Flex>
                        </Flex>
                      ))}
                    </Flex>
                  </ScrollArea>
                </Box>
              )}
            </Box>
          )}
        </Card>

        {/* Virtualized Entity list */}
        <Box style={{ flex: 1 }}>
          <Card size="1" style={{ height: '100%', padding: 0 }}>
            {filteredEntities.length > 0 && (
              <Flex
                align="center"
                justify="end"
                p="2"
                style={{ borderBottom: '1px solid var(--gray-a3)' }}
              >
                <Link
                  size="2"
                  onClick={handleSelectAllVisible}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {filteredEntities.every((e) => selectedEntityIds.has(e.entity_id)) ? (
                    <Cross2Icon width="12" height="12" />
                  ) : (
                    <CheckIcon width="15" height="15" />
                  )}
                  {filteredEntities.every((e) => selectedEntityIds.has(e.entity_id))
                    ? 'Deselect all'
                    : 'Select all'}
                </Link>
              </Flex>
            )}
            <div
              ref={scrollAreaRef}
              style={{
                height: filteredEntities.length > 0 ? 'calc(100% - 41px)' : '100%',
                overflow: 'auto',
                position: 'relative',
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
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const entity = filteredEntities[virtualRow.index]

                    return (
                      <div
                        key={virtualRow.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '64px',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <EntityItem
                          entity={entity}
                          checked={selectedEntityIds.has(entity.entity_id)}
                          onCheckedChange={(checked) =>
                            handleToggleEntity(entity.entity_id, checked)
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </Box>
      </Flex>

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
    <Box asChild>
      <label style={{ display: 'block', cursor: 'pointer' }}>
        <Flex
          p="3"
          align="center"
          gap="2"
          style={{
            height: '64px',
            borderBottom: '1px solid var(--gray-a3)',
          }}
        >
          <Checkbox
            size="1"
            checked={checked}
            onCheckedChange={onCheckedChange as (checked: boolean | 'indeterminate') => void}
          />
          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
            <Text
              size="2"
              weight="medium"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {friendlyName}
            </Text>
            <Text
              size="1"
              color="gray"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entity.entity_id} • {stateDisplay}
            </Text>
          </Flex>
        </Flex>
      </label>
    </Box>
  )
})
