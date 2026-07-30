import {
  ValueIcon,
  CircleIcon,
  ActivityLogIcon,
  LightningBoltIcon,
  HomeIcon,
  ClockIcon,
  MixIcon,
} from '@radix-ui/react-icons'
import { Flex, Text } from '@radix-ui/themes'
import { useEntity } from '~/hooks'
import { useEntityHistory } from '~/hooks/useEntityHistory'
import { memo } from 'react'
import type { HassEntity } from '~/store/entityTypes'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { useCardItem } from '../cardItemContext'
import { readCardDisplay, resolveCardColor } from '~/store/cardDisplay'
import { readSensorOptions, resolveSensorGraphMode } from '~/store/sensorOptions'
import { CardValue } from '../anatomy'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import { formatSensorState, formatSensorNumber, formatSensorTrend, TREND_ARROWS } from './format'
import { SensorGraph, historyExtremes, sensorGraphState } from './SensorGraph'
import './SensorCard.css'

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

/**
 * Buckets for a bar graph.
 *
 * Far fewer than the pipeline's default hundred: a card is a few hundred CSS
 * pixels wide, and a hundred bars across it are sub-pixel slivers with gaps
 * between them. A day at this count is roughly hourly, which is the resolution
 * a counter's per-interval consumption is actually read at.
 */
const BAR_GRAPH_POINTS = 24

/**
 * Buckets for the trend delta: one, so the single point the projection returns
 * IS the movement across the whole window. The alternative — summing a hundred
 * buckets in the card — would recompute what `delta` mode already computes, and
 * would get the window's leading edge subtly wrong: the projection measures its
 * first bucket against the last sample BEFORE the window, which is movement a
 * card adding up points inside the window never sees.
 */
const TREND_POINTS = 1

// Get appropriate icon based on device class or entity domain
const getSensorIcon = (deviceClass: string | undefined) => {
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

/**
 * A string attribute, or nothing.
 *
 * Every attribute this card reads goes through here, and none of them is read
 * off the cast `SensorAttributes` directly. The interface describes what Home
 * Assistant normally sends, not what arrives: an attribute map is
 * `Record<string, unknown>` on the wire, a custom template sensor can publish
 * `unit_of_measurement: 5`, and an entity can carry no attributes at all. A
 * card that trusted the cast would render `21.4 5` for the first and throw on
 * the second.
 */
function readStringAttribute(entity: HassEntity | undefined, key: string): string | undefined {
  const value = (entity?.attributes as SensorAttributes | undefined)?.[key]
  return typeof value === 'string' ? value : undefined
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
  const { hideState, color: storedColor } = readCardDisplay(config)
  const options = readSensorOptions(config)

  const isGlance = tier === 'glance'
  const showsValue = !hideState

  /*
   * Which history surfaces this tier asks for, and therefore which projections
   * of the window it needs. The mode is chosen per rendering surface rather
   * than per entity (docs/changes/0018 — "History aggregation mode is selected
   * per consuming surface"): a `line` graph and the min/max footer read the
   * readings themselves, a `bar` graph and the trend arrow read differences.
   * Choosing from `state_class` instead would make a default `line` graph on a
   * counter draw per-bucket increments instead of its cumulative curve.
   *
   * The option doc puts the graph in `row`/`tall`/`full` and the trend in
   * `glance` only, so no tier asks for both — except `full` with `bar`, which
   * draws differences and reports extremes of the readings underneath them.
   */
  const graphMode = resolveSensorGraphMode(
    options.graphMode,
    readStringAttribute(entity, 'state_class')
  )
  const wantsGraph = !isGlance && options.showGraph
  const wantsBars = wantsGraph && graphMode === 'bar'
  const wantsTrend = isGlance && options.showTrend && showsValue
  const wantsSamples = wantsGraph && (!wantsBars || tier === 'full')
  const wantsDeltas = wantsBars || wantsTrend

  /*
   * Both projections are requested unconditionally — a hook cannot be called
   * conditionally — and the one this tier has no use for is asked for the empty
   * entity id, which the hook answers without subscribing or fetching. That is
   * what keeps `showGraph: false` from costing a recorder request per card.
   */
  const samples = useEntityHistory(wantsSamples ? entityId : '', {
    hours: options.graphHours,
    mode: 'sample',
  })
  const deltas = useEntityHistory(wantsDeltas ? entityId : '', {
    hours: options.graphHours,
    mode: 'delta',
    points: wantsBars ? BAR_GRAPH_POINTS : TREND_POINTS,
  })

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  /*
   * The one error state this read-only card can reach.
   *
   * The three-way version this replaces — "Entity Not Found" when the entity is
   * missing but the connection is up — was unreachable, and had been since the
   * skeleton above it: a missing entity on a live connection returns there, so
   * every path that gets this far has `isConnected === false`. `useEntity`
   * cannot tell "not loaded yet" from "does not exist" either way, which is why
   * a card pointed at an entity this Home Assistant does not have holds its
   * skeleton (the `UnknownEntity` story says so).
   */
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error="Disconnected from Home Assistant"
        variant="card"
        tier={tier}
        title="Disconnected"
        onRetry={() => window.location.reload()}
      />
    )
  }

  const deviceClass = readStringAttribute(entity, 'device_class')
  const friendlyName = readStringAttribute(entity, 'friendly_name') || entity.entity_id
  const format = { deviceClass, unit: readStringAttribute(entity, 'unit_of_measurement') }
  const formattedValue = formatSensorState(entity.state, format, options)
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'
  // Sensors have no domain row of their own, so they take the generic colour
  // unless the user pinned one (options/common.md — `color`).
  const color = resolveCardColor(storedColor, 'default')

  const icon = <GridCard.Icon>{getSensorIcon(deviceClass)}</GridCard.Icon>
  /*
   * The anatomy's big readout, so the figure is `tabular-nums` and does not
   * jitter as its digits change. The unit stays part of the formatted string
   * rather than moving to `unit`: the formatting pipeline owns the spacing, and
   * splitting it would change what the card reads out.
   */
  const value = <CardValue domain="sensor" color={color} value={formattedValue} />
  const name = <GridCard.Title>{friendlyName}</GridCard.Title>

  const graphHistory = wantsBars ? deltas : samples
  const graph = (region: 'inline' | 'band' | 'full') => (
    <SensorGraph
      history={graphHistory}
      region={region}
      mode={graphMode}
      color={color}
      label={`${friendlyName}, ${options.graphHours}-hour history`}
    />
  )

  /*
   * The trend arrow: the movement across the window, beside the reading at the
   * end of it. The delta goes through the same pipeline as the value — one
   * function for value, delta and footer alike — so a card showing `1.3 kW`
   * cannot report its change in watts.
   *
   * Absent rather than flat when there is nothing to compare against: an arrow
   * is a claim about history, and a sensor whose history has not arrived (or
   * cannot exist) has not made one.
   */
  const trend =
    wantsTrend && !deltas.unsupported && deltas.error === null && deltas.points.length > 0
      ? formatSensorTrend(deltas.points[0].value, format, options)
      : undefined

  /*
   * The `full` footer's slot: present exactly while the graph it describes is on
   * screen — a footer standing under no graph is a window nothing else names —
   * and therefore present while that graph is still loading, empty. The empty
   * line is the point: the extremes exist only once the series lands, and the
   * graph above is flexible, so a footer that arrived with its text would take
   * its line out of the graph and shrink it. Reserving the line here is what the
   * tier rule means by the placeholder holding the graph AND its footer
   * (docs/specs/entity-cards/options/sensor.md — "the graph claims the tile").
   */
  const footerState = tier === 'full' ? sensorGraphState(samples) : 'none'
  /* The extremes themselves, through the same pipeline as the value. */
  const extremes = footerState === 'graph' ? historyExtremes(samples.points) : null

  /*
   * What each tier holds, from the tier table in
   * docs/specs/entity-cards/options/sensor.md.
   *
   *  - `glance` anchors on the value, which replaces the icon circle: at one
   *    cell there is room for a figure and a name, and the reading is what the
   *    tile is for. The trend sits beside it; the graph never renders here.
   *    With `hideState` the value has nowhere to go — it *is* the state — so
   *    the tile falls back to the standard icon-and-name form, and to icon-only
   *    when `hideName` joins it (the shell drops the emptied meta).
   *  - `row` reads the value out on the state line instead, leaving the icon as
   *    the anchor and the width they do not use to the sparkline.
   *  - `tall` stacks the big value and the sparkline in the band between the
   *    icon and the name.
   *  - `full` is the row shape with the value alongside, and the graph plus its
   *    min/max footer underneath.
   */
  const isBigValueTier = tier === 'tall' || tier === 'full'

  return (
    <GridCard
      domain="sensor"
      color="default"
      // Only while the sensor is actually reporting.
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
        /* `fill` on the two tiers whose graph takes the room the rest of the
           tier leaves. It also stops the meta competing for that room, which is
           why it is set even on a `row` whose graph is switched off: the flag
           describes the slot, and the slot is empty then. */
        controlSize={tier === 'row' || tier === 'tall' ? 'fill' : 'content'}
        lead={
          isGlance && showsValue ? (
            trend ? (
              <Flex align="baseline" gap="1" justify="center" wrap="wrap">
                {value}
                <Text size="1" color="gray" data-testid="sensor-trend">
                  {TREND_ARROWS[trend.direction]} {trend.text}
                </Text>
              </Flex>
            ) : (
              value
            )
          ) : (
            icon
          )
        }
        meta={
          <GridCard.Meta>
            {name}
            {/* The state line carries the reading only where the big value does
                not — otherwise the tile would say the same number twice. The
                shell drops this line entirely under `hideState`. */}
            {tier === 'row' ? <GridCard.Status>{formattedValue}</GridCard.Status> : null}
          </GridCard.Meta>
        }
        control={
          tier === 'row' ? (
            wantsGraph ? (
              graph('inline')
            ) : undefined
          ) : tier === 'tall' ? (
            // Value above graph, both in the vertical band: the tier table's
            // "big value centered, vertical-space sparkline beneath". The class
            // is what lets `SensorCard.css` widen the box `CardBody` puts this
            // band in — see the `liebe-sensor-band` rule there.
            <Flex
              className="liebe-sensor-band"
              direction="column"
              align="center"
              gap="2"
              width="100%"
              height="100%"
            >
              {showsValue ? value : null}
              {wantsGraph ? graph('band') : null}
            </Flex>
          ) : isBigValueTier && showsValue ? (
            value
          ) : undefined
        }
        extra={
          tier === 'full' ? (
            <>
              {wantsGraph ? graph('full') : null}
              {footerState === 'none' ? null : (
                <Text
                  size="1"
                  color="gray"
                  align="center"
                  className="liebe-sensor-graph-footer"
                  data-testid="sensor-history-range"
                >
                  {extremes
                    ? `Min ${formatSensorNumber(extremes.min, format, options).text} · Max ${
                        formatSensorNumber(extremes.max, format, options).text
                      }`
                    : null}
                </Text>
              )}
            </>
          ) : undefined
        }
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
