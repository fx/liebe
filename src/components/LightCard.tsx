import { Flex } from '@radix-ui/themes'
import { SunIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { Slider } from './anatomy'
import { useDashboardStore, dashboardActions } from '~/store'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'

interface LightCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. This card owns its own
   * configuration modal, so it is also what the modal's preview renders at —
   * the preview must show the tier the card behind it is rendering
   * (docs/changes/0011-layout-tiers.md).
   */
  span?: CardSpan
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
  tier = 'row',
  span,
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

  const handleBrightnessChange = useCallback((value: number) => {
    // The anatomy slider reports every value the control passes through, which
    // is also the signal that a drag is under way: the card must not toggle the
    // light the finger is dimming.
    setIsDragging(true)
    setLocalBrightness(value)
  }, [])

  const handleBrightnessCommit = useCallback(
    async (value: number) => {
      setIsDragging(false)
      const brightness = Math.round((value / 100) * 255)

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
  // Check if light supports brightness control
  const supportedColorModes = lightAttributes?.supported_color_modes
  const supportedFeatures = lightAttributes?.supported_features ?? 0
  const supportsBrightness = useMemo(() => {
    // Modern Home Assistant uses supported_color_modes
    if (supportedColorModes) {
      return (
        supportedColorModes.includes('brightness') ||
        supportedColorModes.includes('color_temp') ||
        supportedColorModes.includes('hs') ||
        supportedColorModes.includes('xy') ||
        supportedColorModes.includes('rgb') ||
        supportedColorModes.includes('rgbw') ||
        supportedColorModes.includes('rgbww')
      )
    }
    // Fallback to old supported_features check
    return supportedFeatures & SUPPORT_BRIGHTNESS
  }, [supportedColorModes, supportedFeatures])

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
        domain="light"
        color="light"
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isOn}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        /*
         * Passed unconditionally, and `handleToggle` declines while a drag is
         * in flight. Withholding it instead would tell the shell this card has
         * no toggle semantics at all, and `toggle` would fall through to
         * `homeassistant.toggle` on the entity — toggling the very light the
         * finger was dimming, which is the case the guard exists to prevent.
         */
        onClick={handleToggle}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={error || undefined}
        className="light-card"
      >
        <Flex direction="column" align="center" justify="center" gap="3">
          <GridCard.Icon>
            <SunIcon width={20} height={20} />
          </GridCard.Icon>

          <GridCard.Title>{friendlyName}</GridCard.Title>

          {!isEditMode && isOn && supportsBrightness && enableBrightness && (
            <GridCard.Controls>
              <Slider
                domain="light"
                color="light"
                active={isOn}
                label="Brightness"
                value={displayBrightness}
                readout={`${displayBrightness}%`}
                onValueChange={handleBrightnessChange}
                onValueCommit={handleBrightnessCommit}
              />
            </GridCard.Controls>
          )}

          <GridCard.Status>
            {error
              ? 'ERROR'
              : isOn && displayBrightness < 100 && supportsBrightness
                ? `${displayBrightness}%`
                : entity.state.toUpperCase()}
          </GridCard.Status>
        </Flex>
      </GridCard>

      {item && (
        <CardConfig.Modal
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          span={span}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedLightCard = memo(LightCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    // The span as well as the tier: the tier is lossy, so a `row` 3×1 becoming
    // a `row` 4×1 changes nothing here — and this card's own configuration
    // modal previews at the span it was handed, so it would open stale.
    isSameSpan(prevProps.span, nextProps.span) &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.item === nextProps.item
  )
})

export const LightCard = Object.assign(MemoizedLightCard, {
  defaultDimensions: { width: 2, height: 2 },
})
