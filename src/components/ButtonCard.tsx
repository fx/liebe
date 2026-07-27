import { Flex } from '@radix-ui/themes'
import { LightningBoltIcon, SunIcon, CheckIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'
import { memo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'

interface ButtonCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines, and because the tier alone is lossy —
   * see `~/utils/cardTier`.
   */
  span?: CardSpan
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
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: ButtonCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, toggle, clearError } = useServiceCall()

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        tier={tier}
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

  return (
    <GridCard
      // A light reads as a light even through the generic button card; every
      // other domain this card serves (switch, outlet, input helper) is what
      // the `default` triplet is for.
      domain={entity.entity_id.split('.')[0]}
      color={entity.entity_id.startsWith('light.') ? 'light' : 'default'}
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      isUnavailable={isUnavailable}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || undefined}
    >
      <Flex direction="column" align="center" justify="center" gap="2">
        <GridCard.Icon>{getEntityIcon(entity)}</GridCard.Icon>

        <GridCard.Title>{friendlyName}</GridCard.Title>

        <GridCard.Status>{error ? 'ERROR' : entity.state.toUpperCase()}</GridCard.Status>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedButtonCard = memo(ButtonCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    // The span as well as the tier: the tier is lossy — a `row` 3×1 and a
    // `row` 4×1 are the same tier — and this card accepts the span, so its
    // comparator may not be the thing that pins it to a stale one.
    isSameSpan(prevProps.span, nextProps.span) &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const ButtonCard = Object.assign(MemoizedButtonCard, {
  defaultDimensions: { width: 2, height: 1 },
})
