import { useEntity } from '~/hooks'
import { memo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SimpleCameraCard } from './SimpleCameraCard'

interface CameraCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

function CameraCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: CameraCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)

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

  const isUnavailable = entity.state === 'unavailable'

  return (
    <GridCard
      size={size}
      isLoading={false}
      isError={false}
      isStale={isStale}
      isSelected={isSelected}
      isOn={false}
      isUnavailable={isUnavailable}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      title={isStale ? 'Entity data may be outdated' : undefined}
      className="camera-card"
      style={{
        borderWidth: isSelected || isStale ? '2px' : '1px',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <SimpleCameraCard entity={entity} entityId={entityId} />
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const CameraCard = memo(CameraCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
