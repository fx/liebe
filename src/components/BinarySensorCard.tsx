import { Flex, Text } from '@radix-ui/themes'
import {
  CheckCircledIcon,
  CrossCircledIcon,
  PersonIcon,
  ExitIcon,
  LightningBoltIcon,
  CircleIcon,
} from '@radix-ui/react-icons'
import { useEntity } from '~/hooks'
import { memo, useState } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore, dashboardStore, dashboardActions } from '~/store'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'

interface BinarySensorCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
}

// Preset icon mappings for common binary sensor types
export const BINARY_SENSOR_PRESETS = {
  presence: {
    on: <PersonIcon width="20" height="20" />,
    off: <PersonIcon width="20" height="20" style={{ opacity: 0.3 }} />,
    name: 'Presence Detection',
  },
  door: {
    on: <ExitIcon width="20" height="20" style={{ transform: 'rotate(180deg)' }} />,
    off: <ExitIcon width="20" height="20" />,
    name: 'Door/Window',
  },
  window: {
    on: <ExitIcon width="20" height="20" style={{ transform: 'rotate(180deg)' }} />,
    off: <ExitIcon width="20" height="20" />,
    name: 'Door/Window',
  },
  motion: {
    on: <LightningBoltIcon width="20" height="20" />,
    off: <LightningBoltIcon width="20" height="20" style={{ opacity: 0.3 }} />,
    name: 'Motion',
  },
  moisture: {
    on: <CircleIcon width="20" height="20" style={{ fill: 'var(--blue-9)' }} />,
    off: <CircleIcon width="20" height="20" style={{ opacity: 0.3 }} />,
    name: 'Moisture',
  },
  default: {
    on: <CheckCircledIcon width="20" height="20" />,
    off: <CrossCircledIcon width="20" height="20" />,
    name: 'Binary Sensor',
  },
}

// Get preset based on device class
const getPresetForDeviceClass = (deviceClass?: string): keyof typeof BINARY_SENSOR_PRESETS => {
  if (!deviceClass) return 'default'

  // Map device classes to presets
  const deviceClassMap: Record<string, keyof typeof BINARY_SENSOR_PRESETS> = {
    occupancy: 'presence',
    presence: 'presence',
    door: 'door',
    window: 'window',
    motion: 'motion',
    moisture: 'moisture',
    water: 'moisture',
  }

  return deviceClassMap[deviceClass] || 'default'
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
  const config =
    (item?.config as { preset?: string; customOnIcon?: string; customOffIcon?: string }) || {}

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

  // Get device class and preset
  const deviceClass = entity.attributes.device_class as string | undefined
  const presetKey = config.preset || getPresetForDeviceClass(deviceClass)
  const preset =
    BINARY_SENSOR_PRESETS[presetKey as keyof typeof BINARY_SENSOR_PRESETS] ||
    BINARY_SENSOR_PRESETS.default

  // Get icon to display
  const icon = isOn ? preset.on : preset.off

  const iconScale = size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8

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
        title={isStale ? 'Entity data may be outdated' : undefined}
        style={{
          backgroundColor: isOn && !isSelected ? 'var(--amber-3)' : undefined,
          borderColor: isOn && !isSelected && !isStale ? 'var(--amber-6)' : undefined,
          borderWidth: isSelected || isOn || isStale ? '2px' : '1px',
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
                opacity: isStale ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {icon}
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
export const BinarySensorCard = memo(BinarySensorCardComponent, (prevProps, nextProps) => {
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
