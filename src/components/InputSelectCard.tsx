import React, { memo, useCallback } from 'react'
import { Box, Flex, Select, Text } from '@radix-ui/themes'
import { Archive, ChevronDown, List } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'

interface InputSelectCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputSelectAttributes {
  friendly_name?: string
  options?: string[]
  _stale?: boolean
}

export const InputSelectCard = memo(function InputSelectCard({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputSelectCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  const handleClick = useCallback(() => {
    // Card click is handled by GridCard
  }, [])

  const handleValueChange = useCallback(
    (value: string) => {
      if (!entity) return
      setValue(entity.entity_id, value)
    },
    [entity, setValue]
  )

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={2} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        title={!isConnected ? 'Disconnected' : 'Entity Not Found'}
        onRetry={!isConnected ? () => window.location.reload() : undefined}
      />
    )
  }

  // Handle unavailable entities
  if (entity.state === 'unavailable') {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={onSelect}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" gap="2">
          <GridCard.Icon>
            <Archive size={20} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
          <GridCard.Title>
            {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
          </GridCard.Title>
          <GridCard.Status>Unavailable</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const attributes = entity.attributes as InputSelectAttributes
  const isStale = attributes._stale === true
  const options = attributes.options || []
  const currentValue = entity.state

  return (
    <GridCard
      size={size}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={onSelect}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || undefined}
    >
      <Flex direction="column" align="center" gap="2">
        <GridCard.Icon>
          <List size={24} style={{ color: 'var(--gray-9)' }} />
        </GridCard.Icon>
        <GridCard.Title>
          {attributes.friendly_name || entity.entity_id.split('.')[1]}
        </GridCard.Title>
        <GridCard.Controls>
          <Box onClick={(e) => e.stopPropagation()} style={{ minWidth: '120px' }}>
            <Select.Root
              value={currentValue}
              onValueChange={handleValueChange}
              disabled={loading || options.length === 0}
            >
              <Select.Trigger variant="soft" style={{ width: '100%' }}>
                <Flex align="center" justify="between" style={{ width: '100%' }}>
                  <Text size={size === 'small' ? '1' : size === 'large' ? '3' : '2'}>{currentValue}</Text>
                  <ChevronDown size={16} />
                </Flex>
              </Select.Trigger>
              <Select.Content>
                {options.map((option) => (
                  <Select.Item key={option} value={option}>
                    {option}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>
        </GridCard.Controls>
        {options.length > 0 && (
          <GridCard.Status>
            {options.length} option{options.length !== 1 ? 's' : ''}
          </GridCard.Status>
        )}
      </Flex>
    </GridCard>
  )
})
