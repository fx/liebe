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
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { useCardItem } from './cardItemContext'
import { readCardDisplay } from '~/store/cardDisplay'
import { CardValue } from './anatomy'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'

interface SensorCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no sensor layout keys on width past the
   * tier boundary, so nothing here reads it.
   */
  span?: CardSpan
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
const getSensorIcon = (entity: HassEntity) => {
  const attributes = entity.attributes as SensorAttributes
  const deviceClass = attributes.device_class
  // One glyph size at every tier. Tiers adapt what they contain, not how large
  // they draw it (docs/specs/design-system — "Size-adaptive layouts").
  const iconSize = '20'

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
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: SensorCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * `hideState` is the one universal option this card cannot leave to the
   * shell. Everywhere else the state line goes through `GridCard.Status`, which
   * honours the option without the card knowing it exists — but in `glance` the
   * big value *is* the state line, and it is rendered as a `liebe-value`
   * anchor rather than through that slot. So the option doc spells out the
   * fallback, and the card has to read the option to apply it
   * (docs/specs/entity-cards/options/sensor.md — the `glance` row's
   * "Fallbacks").
   */
  const { config } = useCardItem()
  const { hideState } = readCardDisplay(config)

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

  const attributes = entity.attributes as SensorAttributes
  const friendlyName = attributes.friendly_name || entity.entity_id
  const formattedValue = formatSensorValue(entity)
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  const icon = <GridCard.Icon>{getSensorIcon(entity)}</GridCard.Icon>
  /*
   * The anatomy's big readout, so the figure is `tabular-nums` and does not
   * jitter as its digits change. The unit stays part of the formatted string
   * rather than moving to `unit`: `formatSensorValue` owns the spacing, and
   * splitting it would change what the card reads out.
   */
  const value = <CardValue domain="sensor" color="default" value={formattedValue} />
  const name = <GridCard.Title>{friendlyName}</GridCard.Title>

  /*
   * What each tier holds, from the tier table in
   * docs/specs/entity-cards/options/sensor.md.
   *
   * The graph is absent from all four on purpose: the sparkline and the `full`
   * tier's window graph are fed by entity history, and `showGraph`/`graphHours`
   * are options that do not exist yet — this change is content placement, and a
   * control with no data source renders nothing rather than an empty frame
   * (0018 wires them).
   *
   *  - `glance` anchors on the value, which replaces the icon circle: at one
   *    cell there is room for a figure and a name, and the reading is what the
   *    tile is for. With `hideState` the value has nowhere to go — it *is* the
   *    state — so the tile falls back to the standard icon-and-name form, and
   *    to icon-only when `hideName` joins it (the shell drops the emptied meta).
   *  - `row` reads the value out on the state line instead, leaving the icon as
   *    the anchor; the big figure would crowd the line it shares.
   *  - `tall` has room for both, with the value in the vertical control slot
   *    between icon and name.
   *  - `full` is the row shape with the value alongside — the "meta plus value"
   *    arrangement the option doc falls back to when no graph renders.
   */
  const showsValue = !hideState
  const isGlance = tier === 'glance'
  const isBigValueTier = tier === 'tall' || tier === 'full'

  return (
    <GridCard
      // Sensors have no domain row of their own, so they take the generic
      // active colour — and only while they are actually reporting.
      domain="sensor"
      color="default"
      isOn={!isUnavailable}
      tier={tier}
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
      {/* No inner height floor: the shell owns it, keyed on the tier
          (`GridCard.css`), so a `glance` tile can actually be one cell tall
          instead of being propped open from the inside. */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={isGlance && showsValue ? value : icon}
        meta={
          <GridCard.Meta>
            {name}
            {/* The state line carries the reading only where the big value does
                not — otherwise the tile would say the same number twice. The
                shell drops this line entirely under `hideState`. */}
            {tier === 'row' ? <GridCard.Status>{formattedValue}</GridCard.Status> : null}
          </GridCard.Meta>
        }
        control={isBigValueTier && showsValue ? value : undefined}
      />
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedSensorCard = memo(SensorCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    // The span as well as the tier: the tier is lossy — a `row` 3×1 and a
    // `row` 4×1 are the same tier — and this card accepts the span, so its
    // comparator may not be the thing that pins it to a stale one.
    isSameSpan(prevProps.span, nextProps.span) &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const SensorCard = Object.assign(MemoizedSensorCard, {
  defaultDimensions: { width: 2, height: 2 },
})
