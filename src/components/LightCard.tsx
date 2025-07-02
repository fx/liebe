import { Card, Flex, Text, Spinner, Box, IconButton } from '@radix-ui/themes'
import * as Slider from '@radix-ui/react-slider'
import { SunIcon, Cross2Icon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { useDashboardStore } from '~/store'
import { SkeletonCard, ErrorDisplay } from './ui'
import './LightCard.css'

interface LightCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

// Light supported features bit flags from Home Assistant
const SUPPORT_BRIGHTNESS = 1
// const SUPPORT_COLOR_TEMP = 2
// const SUPPORT_COLOR = 16

interface LightAttributes {
  brightness?: number
  color_temp?: number
  rgb_color?: [number, number, number]
  hs_color?: [number, number]
  xy_color?: [number, number]
  min_mireds?: number
  max_mireds?: number
  effect_list?: string[]
  effect?: string
  supported_features?: number
  supported_color_modes?: string[]
  color_mode?: string
}

function LightCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: LightCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, turnOn, turnOff, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  // Local state for slider while dragging
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleBrightnessChange = useCallback((value: number[]) => {
    setLocalBrightness(value[0])
  }, [])

  const handleBrightnessCommit = useCallback(
    async (value: number[]) => {
      setIsDragging(false)
      const brightness = Math.round((value[0] / 100) * 255)

      // If setting to 0, turn off the light
      if (brightness === 0) {
        await turnOff(entityId)
      } else {
        await turnOn(entityId, { brightness })
      }

      setLocalBrightness(null)
    },
    [entityId, turnOn, turnOff]
  )

  const lightAttributes = entity?.attributes as LightAttributes | undefined
  const supportsBrightness = useMemo(() => {
    // Modern Home Assistant uses supported_color_modes
    if (lightAttributes?.supported_color_modes) {
      return (
        lightAttributes.supported_color_modes.includes('brightness') ||
        lightAttributes.supported_color_modes.includes('color_temp') ||
        lightAttributes.supported_color_modes.includes('hs') ||
        lightAttributes.supported_color_modes.includes('xy') ||
        lightAttributes.supported_color_modes.includes('rgb') ||
        lightAttributes.supported_color_modes.includes('rgbw') ||
        lightAttributes.supported_color_modes.includes('rgbww')
      )
    }
    // Fallback to old supported_features check
    return (lightAttributes?.supported_features ?? 0) & SUPPORT_BRIGHTNESS
  }, [lightAttributes?.supported_features, lightAttributes?.supported_color_modes])

  // These will be used for color picker implementation
  // const supportsColor = useMemo(() => {
  //   return (lightAttributes?.supported_features ?? 0) & SUPPORT_COLOR
  // }, [lightAttributes?.supported_features])

  // const supportsColorTemp = useMemo(() => {
  //   return (lightAttributes?.supported_features ?? 0) & SUPPORT_COLOR_TEMP
  // }, [lightAttributes?.supported_features])

  // Get current brightness (0-255 scale from HA, convert to 0-100 for UI)
  const currentBrightness = useMemo(() => {
    if (!entity || entity.state === 'off') return 0
    const brightness = lightAttributes?.brightness ?? 255
    return Math.round((brightness / 255) * 100)
  }, [entity, lightAttributes?.brightness])

  const displayBrightness =
    isDragging && localBrightness !== null ? localBrightness : currentBrightness

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

  const cardSize = {
    small: { p: '2', iconSize: '16', fontSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3' },
  }[size]

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <Card variant="classic" style={{ opacity: 0.6, borderStyle: 'dotted' }}>
        <Flex p={cardSize.p} direction="column" align="center" justify="center" gap="2">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
            <SunIcon width={cardSize.iconSize} height={cardSize.iconSize} />
          </Box>
          <Text size={cardSize.fontSize as '1' | '2' | '3'} color="gray" align="center">
            {entity.attributes.friendly_name || entity.entity_id}
          </Text>
          <Text size="1" color="gray" weight="medium">
            UNAVAILABLE
          </Text>
        </Flex>
      </Card>
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'

  const handleToggle = async () => {
    if (isLoading || isDragging) return

    // Clear any previous errors
    if (error) {
      clearError()
    }

    if (isOn) {
      await turnOff(entity.entity_id)
    } else {
      await turnOn(entity.entity_id)
    }
  }

  return (
    <Card
      variant="classic"
      className="light-card"
      style={{
        cursor: isEditMode ? 'move' : isLoading ? 'wait' : 'pointer',
        backgroundColor: isSelected ? 'var(--blue-3)' : isOn ? 'var(--amber-3)' : undefined,
        borderColor: isSelected
          ? 'var(--blue-6)'
          : error
            ? 'var(--red-6)'
            : isStale
              ? 'var(--orange-6)'
              : isOn
                ? 'var(--amber-6)'
                : undefined,
        borderWidth: isSelected || error || isOn || isStale ? '2px' : '1px',
        borderStyle: isStale ? 'dashed' : 'solid',
        transition: 'all 0.2s ease',
        transform: isLoading ? 'scale(0.98)' : undefined,
        animation: isLoading
          ? (error ? 'pulse-border-error' : 'pulse-border') + ' 1.5s ease-in-out infinite'
          : undefined,
        opacity: isStale ? 0.8 : 1,
        position: 'relative',
      }}
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : undefined}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
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
        gap="3"
        style={{ minHeight: size === 'large' ? '160px' : size === 'medium' ? '140px' : '120px' }}
      >
        {/* Icon and toggle button */}
        <Box
          onClick={!isEditMode ? handleToggle : undefined}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: !isEditMode && !isDragging ? 'pointer' : undefined,
            padding: '8px',
            borderRadius: '8px',
            transition: 'background-color 0.2s ease',
          }}
          className="light-toggle-area"
        >
          <Box
            style={{
              color: isStale ? 'var(--orange-9)' : isOn ? 'var(--amber-9)' : 'var(--gray-9)',
              transform: `scale(${size === 'large' ? 1.4 : size === 'medium' ? 1.2 : 1})`,
              opacity: isLoading ? 0.3 : isStale ? 0.6 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <SunIcon width={cardSize.iconSize} height={cardSize.iconSize} />
          </Box>
          {isLoading && (
            <Box
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Spinner
                size={cardSize.fontSize as '1' | '2' | '3'}
                style={
                  {
                    '--spinner-track-color': 'var(--gray-a6)',
                    '--spinner-fill-color': isOn ? 'var(--amber-9)' : 'var(--gray-9)',
                  } as React.CSSProperties
                }
              />
            </Box>
          )}
        </Box>

        {/* Name */}
        <Text
          size={cardSize.fontSize as '1' | '2' | '3'}
          weight={isOn ? 'medium' : 'regular'}
          align="center"
          style={{
            color: isOn ? 'var(--amber-11)' : undefined,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: isLoading ? 0.7 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {friendlyName}
        </Text>

        {/* Brightness slider */}
        {isOn && supportsBrightness && !isEditMode && (
          <Box style={{ width: '100%', paddingTop: '4px' }}>
            <Flex align="center" gap="2">
              <Text size="1" color="gray" style={{ minWidth: '35px' }}>
                {displayBrightness}%
              </Text>
              <Slider.Root
                className="SliderRoot"
                value={[displayBrightness]}
                onValueChange={handleBrightnessChange}
                onValueCommit={handleBrightnessCommit}
                onPointerDown={() => setIsDragging(true)}
                onPointerUp={() => setIsDragging(false)}
                max={100}
                step={1}
                aria-label="Brightness"
                style={{ flex: 1 }}
              >
                <Slider.Track className="SliderTrack">
                  <Slider.Range className="SliderRange" />
                </Slider.Track>
                <Slider.Thumb className="SliderThumb" />
              </Slider.Root>
            </Flex>
          </Box>
        )}

        {/* Status */}
        <Text
          size="1"
          color={error ? 'red' : isOn ? 'amber' : 'gray'}
          weight="medium"
          style={{
            opacity: isLoading ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {error
            ? 'ERROR'
            : isOn && displayBrightness < 100 && supportsBrightness
              ? `${displayBrightness}%`
              : entity.state.toUpperCase()}
        </Text>
      </Flex>
    </Card>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const LightCard = memo(LightCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
