import { Flex } from '@radix-ui/themes'
import { useEntity } from '~/hooks'
import type { DomainColorName } from '~/theme/tokens'
import { createElement, memo, useState, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore, dashboardStore, dashboardActions } from '~/store'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'
import { getTablerIcon } from '~/utils/icons'
import { getIcon } from '~/utils/iconList'
import { IconCircle, IconCircleCheck } from '@tabler/icons-react'

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

/**
 * Which `--liebe-c-*` triplet an active binary sensor resolves to.
 *
 * The design system resolves binary sensors by `device_class` rather than by
 * domain (docs/specs/design-system — "Domain color discipline"), so a smoke
 * detector that has tripped reads as an alert and a leak sensor reads as water,
 * while the classes that carry no urgency fall through to the generic active
 * colour. Off is never coloured at all, so this is only ever asked about `on`.
 */
const getActiveColor = (deviceClass?: string): DomainColorName => {
  switch (deviceClass) {
    // Home Assistant's danger classes, in full — a tripped CO detector reading
    // the same as a doorbell is the exact failure this mapping exists to
    // prevent.
    case 'carbon_monoxide':
    case 'gas':
    case 'heat':
    case 'problem':
    case 'safety':
    case 'smoke':
    case 'tamper':
      return 'alert'
    case 'moisture':
    case 'water':
      return 'water'
    default:
      return 'default'
  }
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
  const deviceClass = entity?.attributes?.device_class as string | undefined

  // Memoize icon computation based on primitive values - must be before early returns
  const IconComponent = useMemo(() => {
    const isOn = entity?.state === 'on'
    const defaults = getDefaultIcons(deviceClass)
    const onIconName = config.onIcon || defaults.onIcon
    const offIconName = config.offIcon || defaults.offIcon
    const iconName = isOn ? onIconName : offIconName
    return getTablerIcon(iconName) || getIcon(iconName) || (isOn ? IconCircleCheck : IconCircle)
  }, [entity?.state, config.onIcon, config.offIcon, deviceClass])

  // Compute isOn for use in rendering (after useMemo to follow rules of hooks)
  const isOn = entity?.state === 'on'

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
  const isUnavailable = entity.state === 'unavailable'

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
        domain="binary_sensor"
        color={getActiveColor(deviceClass)}
        size={size}
        isLoading={false}
        isError={false}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isOn}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        // Read-only card: `tapAction: default` resolves to `more-info` rather
        // than to a control action (docs/specs/entity-cards/options/sensor.md).
        defaultAction="more-info"
        onConfigure={isEditMode && item ? () => setConfigOpen(true) : undefined}
        hasConfiguration={!!item}
        title={undefined}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>{createElement(IconComponent, { size: iconSize })}</GridCard.Icon>

          <GridCard.Title>{friendlyName}</GridCard.Title>

          <GridCard.Status>{entity.state.toUpperCase()}</GridCard.Status>
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
