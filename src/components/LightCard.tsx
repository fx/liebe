import { Flex, Text } from '@radix-ui/themes'
import * as Slider from '@radix-ui/react-slider'
import { SunIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore, dashboardActions } from '~/store'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'

interface LightCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
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
  item,
}: LightCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, turnOn, turnOff, clearError } = useServiceCall()
  const { mode, screens, currentScreenId } = useDashboardStore()
  const isEditMode = mode === 'edit'

  // Local state for slider while dragging
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  // Get config from item
  const config = item?.config || {}

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

  const isUnavailable = entity.state === 'unavailable'

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

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && currentScreenId) {
      const screen = screens.find((s) => s.id === currentScreenId)
      if (screen) {
        dashboardActions.updateGridItem(currentScreenId, item.id, updates)
      }
    }
  }

  // Apply configuration
  const enableBrightness = config.enableBrightness !== false
  // const showColorPicker = config.showColorPicker !== false // TODO: implement color picker

  return (
    <>
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
        onClick={isDragging ? undefined : handleToggle}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={error || (isStale ? 'Entity data may be outdated' : undefined)}
        className="light-card"
        style={{
          backgroundColor: isOn && !isSelected && !error ? 'var(--amber-3)' : undefined,
          borderColor: isOn && !isSelected && !error && !isStale ? 'var(--amber-6)' : undefined,
          borderWidth: isSelected || error || isOn || isStale ? '2px' : '1px',
        }}
      >
        <Flex direction="column" align="center" justify="center" gap="3">
          <GridCard.Icon>
            <SunIcon
              style={{
                color: isStale ? 'var(--orange-9)' : isOn ? 'var(--amber-9)' : 'var(--gray-9)',
                opacity: isLoading ? 0.3 : isStale ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
                width: 20,
                height: 20,
              }}
            />
          </GridCard.Icon>

          <GridCard.Title>
            <Text
              weight={isOn ? 'medium' : 'regular'}
              style={{
                color: isOn ? 'var(--amber-11)' : undefined,
                opacity: isLoading ? 0.7 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {friendlyName}
            </Text>
          </GridCard.Title>

          {!isEditMode && isOn && supportsBrightness && enableBrightness && (
            <GridCard.Controls>
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
                style={{ flex: '1' }}
              >
                <Slider.Track className="SliderTrack">
                  <Slider.Range className="SliderRange" />
                </Slider.Track>
                <Slider.Thumb className="SliderThumb" />
              </Slider.Root>
            </GridCard.Controls>
          )}

          <GridCard.Status>
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
export const LightCard = memo(LightCardComponent, (prevProps, nextProps) => {
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
