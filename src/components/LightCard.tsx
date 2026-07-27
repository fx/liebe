import { SunIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { Slider } from './anatomy'
import { useDashboardStore, dashboardActions } from '~/store'
import { readShowBrightnessSlider } from '~/store/lightOptions'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import {
  HA_BRIGHTNESS_MAX,
  haBrightnessToPercent,
  percentToHaBrightness,
} from '~/utils/lightBrightness'

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

/** The `supported_color_modes` values Home Assistant treats as dimmable. */
const BRIGHTNESS_COLOR_MODES = [
  'brightness',
  'white',
  'color_temp',
  'hs',
  'xy',
  'rgb',
  'rgbw',
  'rgbww',
]
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
      // Only a slider dropped at 0 turns the light off; the conversion never
      // rounds a nonzero position down into that (docs/specs/entity-cards/
      // options/light.md — "Brightness").
      const brightness = percentToHaBrightness(value)

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
    // Modern Home Assistant uses supported_color_modes. Every mode HA itself
    // treats as brightness-capable counts — `white` included, whose entities
    // may carry no legacy feature flag at all, so omitting it leaves them with
    // no way to be dimmed (docs/specs/entity-cards/options/light.md).
    if (supportedColorModes) {
      return supportedColorModes.some((mode) => BRIGHTNESS_COLOR_MODES.includes(mode))
    }
    // Fallback to old supported_features check. Coerced here, not where it is
    // read: the masked bits are a number, and React prints a `0` as the text
    // "0" the moment one gates JSX with `&&`.
    return (supportedFeatures & SUPPORT_BRIGHTNESS) !== 0
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
    return haBrightnessToPercent(lightAttributes?.brightness ?? HA_BRIGHTNESS_MAX)
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

  // Apply configuration. The loader has already rewritten the legacy
  // `enableBrightness` key, so only the current one is ever read here.
  const showBrightnessSlider = readShowBrightnessSlider(config)

  /*
   * What each tier carries (docs/specs/entity-cards/options/light.md — "Tier
   * layouts"). Content that does not fit a tier is omitted, never clipped or
   * scaled down (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  icon over name/state; no embedded control — the whole tile
   *           toggles, and hold opens the detail dialog (change 0014), which is
   *           what makes dropping the slider here not an operability regression.
   *   row     icon + meta in a row, plus the horizontal brightness slider.
   *   tall    icon on top, vertical slider filling the middle, meta at the
   *           bottom.
   *   full    row content plus colour temperature, colour and brightness-preset
   *           controls — none of which exist yet, so `full` renders the row
   *           content and those slots arrive with change 0016.
   */
  const isTall = tier === 'tall'
  const showBrightness =
    tier !== 'glance' && !isEditMode && isOn && supportsBrightness && showBrightnessSlider

  const icon = (
    <GridCard.Icon>
      <SunIcon width={20} height={20} />
    </GridCard.Icon>
  )

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status>
        {error
          ? 'ERROR'
          : isOn && displayBrightness < 100 && supportsBrightness
            ? `${displayBrightness}%`
            : entity.state.toUpperCase()}
      </GridCard.Status>
    </GridCard.Meta>
  )

  const brightnessSlider = showBrightness ? (
    <GridCard.Controls>
      <Slider
        domain="light"
        color="light"
        active={isOn}
        label="Brightness"
        // `tall` is the tier that gives a control its own axis; every other one
        // runs it along the row.
        orientation={isTall ? 'vertical' : 'horizontal'}
        value={displayBrightness}
        readout={`${displayBrightness}%`}
        onValueChange={handleBrightnessChange}
        onValueCommit={handleBrightnessCommit}
      />
    </GridCard.Controls>
  ) : undefined

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
        {/* The slider takes the room its tier leaves over rather than being
            sized by its content — the width the icon and the meta do not use
            on a row, the height they do not use in `tall`. That is the tier's
            whole point: a taller tile gives the control more travel rather
            than more whitespace. */}
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          controlSize="fill"
          lead={icon}
          meta={meta}
          control={brightnessSlider}
        />
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
