import { Flex } from '@radix-ui/themes'
import {
  ValueIcon,
  CircleIcon,
  ActivityLogIcon,
  LightningBoltIcon,
  HomeIcon,
  ClockIcon,
  MixIcon,
} from '@radix-ui/react-icons'
import { useEntity } from '~/hooks'
import { memo } from 'react'
import type { HassEntity } from '~/store/entityTypes'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardValue } from './anatomy'

interface SensorCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface SensorAttributes {
  device_class?: string
  unit_of_measurement?: string
  state_class?: string
  friendly_name?: string
  icon?: string
  [key: string]: unknown
}

// Get appropriate icon based on device class or entity domain
const getSensorIcon = (entity: HassEntity, size: string) => {
  const attributes = entity.attributes as SensorAttributes
  const deviceClass = attributes.device_class
  const iconSize = size === 'large' ? '24' : size === 'medium' ? '20' : '16'

  // Check device class first
  switch (deviceClass) {
    case 'temperature':
      return <ValueIcon width={iconSize} height={iconSize} />
    case 'humidity':
      return <CircleIcon width={iconSize} height={iconSize} />
    case 'motion':
    case 'occupancy':
    case 'moving':
      return <ActivityLogIcon width={iconSize} height={iconSize} />
    case 'power':
    case 'energy':
    case 'current':
    case 'voltage':
      return <LightningBoltIcon width={iconSize} height={iconSize} />
    case 'pressure':
    case 'atmospheric_pressure':
      return <MixIcon width={iconSize} height={iconSize} />
    case 'timestamp':
    case 'duration':
      return <ClockIcon width={iconSize} height={iconSize} />
    default:
      // Default icon for generic sensors
      return <HomeIcon width={iconSize} height={iconSize} />
  }
}

// Format sensor value with appropriate precision and units
const formatSensorValue = (entity: HassEntity): string => {
  const state = entity.state
  const attributes = entity.attributes as SensorAttributes
  const unit = attributes.unit_of_measurement || ''

  // Handle special states
  if (state === 'unavailable' || state === 'unknown') {
    return state.toUpperCase()
  }

  // For binary sensors or non-numeric values
  if (isNaN(Number(state))) {
    return state.toUpperCase()
  }

  // Format numeric values
  const numericValue = parseFloat(state)
  let formattedValue: string

  // Determine decimal places based on device class or value magnitude
  switch (attributes.device_class) {
    case 'temperature':
      formattedValue = numericValue.toFixed(1)
      break
    case 'humidity':
    case 'battery':
      formattedValue = Math.round(numericValue).toString()
      break
    case 'energy':
    case 'power':
      if (numericValue >= 1000) {
        formattedValue = (numericValue / 1000).toFixed(1)
        return `${formattedValue} k${unit}`
      }
      formattedValue = numericValue.toFixed(0)
      break
    default:
      // Use sensible defaults based on value magnitude
      if (numericValue % 1 === 0) {
        formattedValue = numericValue.toString()
      } else if (numericValue < 10) {
        formattedValue = numericValue.toFixed(2)
      } else if (numericValue < 100) {
        formattedValue = numericValue.toFixed(1)
      } else {
        formattedValue = Math.round(numericValue).toString()
      }
  }

  return unit ? `${formattedValue} ${unit}` : formattedValue
}

function SensorCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: SensorCardProps) {
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

  const attributes = entity.attributes as SensorAttributes
  const friendlyName = attributes.friendly_name || entity.entity_id
  const formattedValue = formatSensorValue(entity)
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  return (
    <GridCard
      // Sensors have no domain row of their own, so they take the generic
      // active colour — and only while they are actually reporting.
      domain="sensor"
      color="default"
      isOn={!isUnavailable}
      size={size}
      isStale={isStale}
      isSelected={isSelected}
      isUnavailable={isUnavailable}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Read-only card: `tapAction: default` resolves to `more-info` rather than
      // to a control action (docs/specs/entity-cards/options/sensor.md).
      defaultAction="more-info"
      title={undefined}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '120px' : size === 'medium' ? '100px' : '80px' }}
      >
        {/* Icon */}
        <GridCard.Icon>{getSensorIcon(entity, size)}</GridCard.Icon>

        {/* Value — the anatomy's big readout, so the figure is `tabular-nums`
            and does not jitter as its digits change. The unit stays part of the
            formatted string rather than moving to `unit`: `formatSensorValue`
            owns the spacing, and splitting it would change what the card reads
            out. */}
        <CardValue domain="sensor" color="default" value={formattedValue} />

        {/* Name */}
        <GridCard.Title>{friendlyName}</GridCard.Title>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedSensorCard = memo(SensorCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const SensorCard = Object.assign(MemoizedSensorCard, {
  defaultDimensions: { width: 2, height: 2 },
})
