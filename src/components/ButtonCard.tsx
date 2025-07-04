import { Flex, Text } from '@radix-ui/themes'
import { LightningBoltIcon, SunIcon, CheckIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'
import { memo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'

interface ButtonCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

const getEntityIcon = (entity: HassEntity) => {
  const domain = entity.entity_id.split('.')[0]

  switch (domain) {
    case 'light':
      return <SunIcon width="20" height="20" />
    case 'switch':
      return <LightningBoltIcon width="20" height="20" />
    case 'input_boolean':
      return <CheckIcon width="20" height="20" />
    default:
      return <LightningBoltIcon width="20" height="20" />
  }
}

function ButtonCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: ButtonCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, toggle, clearError } = useServiceCall()

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

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'
  const isUnavailable = entity.state === 'unavailable'

  const handleClick = async () => {
    if (isLoading || isUnavailable) return

    // Clear any previous errors
    if (error) {
      clearError()
    }

    await toggle(entity.entity_id)
  }

  const iconScale = size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8

  return (
    <GridCard
      size={size}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      isUnavailable={isUnavailable}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
      style={{
        backgroundColor: isOn && !isSelected ? 'var(--amber-3)' : undefined,
        borderColor: isOn && !isSelected && !error && !isStale ? 'var(--amber-6)' : undefined,
      }}
    >
      <Flex direction="column" align="center" justify="center" gap="2">
        <GridCard.Icon>
          <span
            style={{
              color: isStale ? 'var(--orange-9)' : isOn ? 'var(--amber-9)' : 'var(--gray-9)',
              transform: `scale(${iconScale})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getEntityIcon(entity)}
          </span>
        </GridCard.Icon>

        <GridCard.Title>
          <Text
            weight={isOn ? 'medium' : 'regular'}
            style={{
              color: isOn ? 'var(--amber-11)' : undefined,
            }}
          >
            {friendlyName}
          </Text>
        </GridCard.Title>

        <GridCard.Status>
          <Text size="1" color={error ? 'red' : isOn ? 'amber' : 'gray'} weight="medium">
            {error ? 'ERROR' : entity.state.toUpperCase()}
          </Text>
        </GridCard.Status>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const ButtonCard = memo(ButtonCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
