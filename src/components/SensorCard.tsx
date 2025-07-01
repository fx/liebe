import { Card, Flex, Text, Box, IconButton } from '@radix-ui/themes'
import {
  ValueIcon,
  CircleIcon,
  ActivityLogIcon,
  LightningBoltIcon,
  HomeIcon,
  ClockIcon,
  MixIcon,
  Cross2Icon,
} from '@radix-ui/react-icons'
import { useEntity } from '~/hooks'
import { memo } from 'react'
import { useDashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import './ButtonCard.css'

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
  const { entity, isConnected, isStale } = useEntity(entityId)
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  if (!entity || !isConnected) {
    return (
      <Card variant="classic" style={{ opacity: 0.5 }}>
        <Flex p="3" align="center" justify="center">
          <Text size="2" color="gray">
            {!isConnected ? 'Disconnected' : 'Entity not found'}
          </Text>
        </Flex>
      </Card>
    )
  }

  const cardSize = {
    small: { p: '2', iconSize: '16', fontSize: '1', valueFontSize: '2' },
    medium: { p: '3', iconSize: '20', fontSize: '2', valueFontSize: '3' },
    large: { p: '4', iconSize: '24', fontSize: '3', valueFontSize: '4' },
  }[size]

  const attributes = entity.attributes as SensorAttributes
  const friendlyName = attributes.friendly_name || entity.entity_id
  const formattedValue = formatSensorValue(entity)
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  return (
    <Card
      variant="classic"
      style={{
        cursor: isEditMode ? 'move' : 'default',
        backgroundColor: isSelected ? 'var(--blue-3)' : undefined,
        borderColor: isSelected
          ? 'var(--blue-6)'
          : isStale
            ? 'var(--orange-6)'
            : isUnavailable
              ? 'var(--gray-6)'
              : undefined,
        borderWidth: isSelected || isStale ? '2px' : '1px',
        borderStyle: isStale || isUnavailable ? 'dashed' : 'solid',
        transition: 'all 0.2s ease',
        opacity: isStale || isUnavailable ? 0.7 : 1,
        position: 'relative',
      }}
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : undefined}
      title={isStale ? 'Sensor data may be outdated' : undefined}
    >
      {/* Drag handle in edit mode */}
      {isEditMode && <div className="grid-item-drag-handle" />}

      {/* Delete button in edit mode */}
      {isEditMode && onDelete && (
        <IconButton
          size="1"
          variant="soft"
          color="red"
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            opacity: isSelected ? 1 : 0.7,
            transition: 'opacity 0.2s ease',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete entity"
        >
          <Cross2Icon />
        </IconButton>
      )}

      <Flex
        p={cardSize.p}
        direction="column"
        align="center"
        justify="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '120px' : size === 'medium' ? '100px' : '80px' }}
      >
        {/* Icon */}
        <Box
          style={{
            color: isStale
              ? 'var(--orange-9)'
              : isUnavailable
                ? 'var(--gray-9)'
                : 'var(--accent-9)',
            opacity: isStale ? 0.6 : 1,
          }}
        >
          {getSensorIcon(entity, size)}
        </Box>

        {/* Value */}
        <Text
          size={cardSize.valueFontSize as '2' | '3' | '4'}
          weight="medium"
          align="center"
          style={{
            color: isUnavailable ? 'var(--gray-9)' : 'var(--gray-12)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formattedValue}
        </Text>

        {/* Name */}
        <Text
          size={cardSize.fontSize as '1' | '2' | '3'}
          color="gray"
          align="center"
          style={{
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {friendlyName}
        </Text>
      </Flex>
    </Card>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const SensorCard = memo(SensorCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
