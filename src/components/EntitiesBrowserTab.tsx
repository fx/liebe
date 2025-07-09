import { useState, useMemo, useCallback, useRef, memo, useEffect } from 'react'
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
  Link,
  ScrollArea,
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

// Domain info for legend
interface DomainInfo {
  domain: string
  friendlyName: string
  count: number
  entities: HassEntity[]
}

export function EntitiesBrowserTab({ screenId, onClose }: EntitiesBrowserTabProps) {
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const { entities, isLoading } = useEntities()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Debounce search term updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchTerm(searchInput)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchInput])

  // Filter and sort entities
  const { filteredEntities, domainInfo } = useMemo(() => {
    const filtered = Object.values(entities).filter((entity) => {
      // Filter out system domains
      const domain = getDomain(entity.entity_id)
      if (SYSTEM_DOMAINS.includes(domain)) return false

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

    // Build domain info for legend
    const domainMap: Record<string, HassEntity[]> = {}
    sorted.forEach((entity) => {
      const domain = getDomain(entity.entity_id)
      if (!domainMap[domain]) {
        domainMap[domain] = []
      }
      domainMap[domain].push(entity)
    })

    const domains: DomainInfo[] = Object.entries(domainMap)
      .map(([domain, entities]) => ({
        domain,
        friendlyName: getFriendlyDomain(domain),
        count: entities.length,
        entities
      }))
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))

    return { filteredEntities: sorted, domainInfo: domains }
  }, [entities, searchTerm, selectedDomains])

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
      const domainEntities = domainInfo.find((d) => d.domain === domain)?.entities || []
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
    [domainInfo]
  )

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

  const handleSelectAllInDomain = useCallback(
    (domain: string) => {
      const domainEntities = domainInfo.find((d) => d.domain === domain)?.entities || []
      const visibleDomainEntities = domainEntities.filter((entity) => {
        // Apply same filter logic as main filter
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
      const allSelected = visibleDomainEntities.every((e) => selectedEntityIds.has(e.entity_id))
      handleToggleAll(domain, !allSelected)
    },
    [domainInfo, searchTerm, selectedEntityIds, handleToggleAll]
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
    setSelectedDomains(new Set())
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
          {selectedDomains.size > 0 && ` in ${selectedDomains.size} domain${selectedDomains.size > 1 ? 's' : ''}`}
          {searchTerm && ` matching "${searchTerm}"`}
        </Text>
        {selectedEntityIds.size > 0 && <Badge>{selectedEntityIds.size} selected</Badge>}
      </Flex>

      {/* Main content area with legend and entity list */}
      <Flex gap="3" style={{ height: '400px' }}>
        {/* Domain filter sidebar */}
        <Card size="1" style={{ width: '240px', padding: 0, display: 'flex', flexDirection: 'column' }}>
          <Flex align="center" justify="between" p="3" pb="2">
            <Text size="2" weight="bold">Filter by Domain</Text>
            {selectedDomains.size > 0 && (
              <Link 
                size="1" 
                onClick={() => setSelectedDomains(new Set())}
                style={{ cursor: 'pointer' }}
              >
                Clear
              </Link>
            )}
          </Flex>
          
          <ScrollArea style={{ flex: 1 }}>
            <Flex direction="column">
              {domainInfo.map((info) => {
              const isDomainSelected = selectedDomains.has(info.domain)
              const visibleDomainEntities = info.entities.filter((entity) => {
                if (searchTerm) {
                  const search = searchTerm.toLowerCase()
                  return (
                    entity.entity_id.toLowerCase().includes(search) ||
                    entity.attributes.friendly_name?.toLowerCase().includes(search) ||
                    info.domain.toLowerCase().includes(search)
                  )
                }
                return true
              })
              const isAllSelected = visibleDomainEntities.length > 0 && 
                visibleDomainEntities.every((e) => selectedEntityIds.has(e.entity_id))
              const isSomeSelected = visibleDomainEntities.some((e) => selectedEntityIds.has(e.entity_id))
              
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
                      <Badge size="1" variant="soft">
                        {visibleDomainEntities.length}
                      </Badge>
                    </Flex>
                    
                      {isDomainSelected && (
                        <Flex align="center" gap="2" ml="5">
                          <Checkbox
                            size="1"
                            checked={isAllSelected}
                            indeterminate={isSomeSelected && !isAllSelected}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => handleSelectAllInDomain(info.domain)}
                          />
                          <Link 
                            size="1" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectAllInDomain(info.domain)
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            Select all
                          </Link>
                        </Flex>
                      )}
                    </Flex>
                  </Box>
                )
              })}
            </Flex>
          </ScrollArea>
        </Card>

        {/* Virtualized Entity list */}
        <Box style={{ flex: 1 }}>
          <Card size="1" style={{ height: '100%', padding: 0 }}>
            <div
              ref={scrollAreaRef}
              style={{
                height: '100%',
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
                whiteSpace: 'nowrap'
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
                whiteSpace: 'nowrap'
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
