import React, { memo, useCallback } from 'react'
import { Flex, Switch } from '@radix-ui/themes'
import { Archive, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'
import { useDashboardStore } from '../store'

interface InputBooleanCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

const MemoizedInputBooleanCard = memo(function InputBooleanCard({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputBooleanCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { toggle, loading, error } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const handleClick = useCallback(() => {
    if (entity) {
      toggle(entity.entity_id)
    }
  }, [entity, toggle])

  const handleSwitchChange = useCallback(
    (_checked: boolean) => {
      if (entity) {
        toggle(entity.entity_id)
      }
    },
    [entity, toggle]
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
        onSelect={() => onSelect?.(!isSelected)}
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

  const isOn = entity.state === 'on'
  const Icon = isOn ? ToggleRight : ToggleLeft
  const iconColor = isOn ? 'var(--amber-9)' : 'var(--gray-9)'

  const isStale = entity.attributes._stale === true

  return (
    <GridCard
      size={size}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || undefined}
    >
      <Flex direction="column" align="center" gap="2">
        <GridCard.Icon>
          <Icon size={24} style={{ color: iconColor }} />
        </GridCard.Icon>
        <GridCard.Title>
          {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
        </GridCard.Title>
        {!isEditMode && (
          <GridCard.Controls>
            <Switch
              size={size === 'small' ? '1' : size === 'large' ? '3' : '2'}
              checked={isOn}
              onCheckedChange={handleSwitchChange}
              disabled={loading}
              style={{ cursor: 'pointer' }}
            />
          </GridCard.Controls>
        )}
        {isEditMode && <GridCard.Status>{isOn ? 'ON' : 'OFF'}</GridCard.Status>}
      </Flex>
    </GridCard>
  )
})

export const InputBooleanCard = Object.assign(MemoizedInputBooleanCard, {
  defaultDimensions: { width: 2, height: 1 },
})
