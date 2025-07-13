import { Flex, Text } from '@radix-ui/themes'
import { useEntity } from '~/hooks'
import { memo, useState } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore, dashboardStore, dashboardActions } from '~/store'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'
import { getTablerIcon } from '~/utils/icons'
import { getIcon } from '~/utils/iconList'

interface BinarySensorCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
}

// Get default icons based on device class
const getDefaultIcons = (deviceClass?: string): { onIcon: string; offIcon: string } => {
  if (!deviceClass) return { onIcon: 'CircleCheck', offIcon: 'Circle' }

  // Map device classes to icon names from our curated list
  const deviceClassMap: Record<string, { onIcon: string; offIcon: string }> = {
    occupancy: { onIcon: 'User', offIcon: 'UserOff' },
    presence: { onIcon: 'User', offIcon: 'UserOff' },
    door: { onIcon: 'Door', offIcon: 'DoorOff' },
    window: { onIcon: 'Door', offIcon: 'DoorOff' }, // Using door icons for windows
    motion: { onIcon: 'MotionSensor', offIcon: 'UserOff' },
    moisture: { onIcon: 'Droplet', offIcon: 'DropletOff' },
    water: { onIcon: 'Droplet', offIcon: 'DropletOff' },
    lock: { onIcon: 'Lock', offIcon: 'LockOpen' },
    safety: { onIcon: 'ShieldCheck', offIcon: 'Shield' },
    smoke: { onIcon: 'Flame', offIcon: 'FlameOff' },
    sound: { onIcon: 'Volume', offIcon: 'VolumeOff' },
    vibration: { onIcon: 'Bell', offIcon: 'BellOff' },
    light: { onIcon: 'Bulb', offIcon: 'BulbOff' },
  }

  return deviceClassMap[deviceClass] || { onIcon: 'CircleCheck', offIcon: 'Circle' }
}

function BinarySensorCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
  item,
}: BinarySensorCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'
  const [configOpen, setConfigOpen] = useState(false)

  // Get config from item
  const config = (item?.config as { onIcon?: string; offIcon?: string }) || {}

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

  // Get device class and default icons
  const deviceClass = entity.attributes.device_class as string | undefined
  const defaults = getDefaultIcons(deviceClass)

  // Get configured icons or use defaults
  const onIconName = config.onIcon || defaults.onIcon
  const offIconName = config.offIcon || defaults.offIcon

  // Get the icon component
  const iconName = isOn ? onIconName : offIconName
  const IconComponent =
    getTablerIcon(iconName) || (isOn ? getIcon('CircleCheck') : getIcon('Circle')) || (() => null)

  // Get icon size based on card size
  const iconSize = size === 'large' ? 24 : size === 'medium' ? 20 : 16

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && item.id) {
      const { currentScreenId } = dashboardStore.state
      if (currentScreenId) {
        dashboardActions.updateGridItem(currentScreenId, item.id, updates)
      }
    }
  }

  return (
    <>
      <GridCard
        size={size}
        isLoading={false}
        isError={false}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isOn}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={isEditMode && item ? () => setConfigOpen(true) : undefined}
        hasConfiguration={!!item}
        title={undefined}
        style={{
          backgroundColor: isOn && !isSelected ? 'var(--amber-3)' : undefined,
          borderColor: isOn && !isSelected ? 'var(--amber-6)' : undefined,
          borderWidth: isSelected || isOn ? '2px' : '1px',
        }}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <span
              style={{
                color: isStale ? 'var(--orange-9)' : isOn ? 'var(--amber-9)' : 'var(--gray-9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isStale ? 0.6 : isOn ? 1 : 0.5,
                transition: 'opacity 0.2s ease',
              }}
            >
              <IconComponent size={iconSize} />
            </span>
          </GridCard.Icon>

          <GridCard.Title>
            <Text
              weight={isOn ? 'medium' : 'regular'}
              style={{
                color: isOn ? 'var(--amber-11)' : undefined,
                transition: 'opacity 0.2s ease',
              }}
            >
              {friendlyName}
            </Text>
          </GridCard.Title>

          <GridCard.Status>
            <Text
              size="1"
              color={isOn ? 'amber' : 'gray'}
              weight="medium"
              style={{
                transition: 'opacity 0.2s ease',
              }}
            >
              {entity.state.toUpperCase()}
            </Text>
          </GridCard.Status>
        </Flex>
      </GridCard>

      {item && (
        <CardConfig.Modal
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedBinarySensorCard = memo(BinarySensorCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.item === nextProps.item
  )
})

export const BinarySensorCard = Object.assign(MemoizedBinarySensorCard, {
  defaultDimensions: { width: 2, height: 2 },
})
