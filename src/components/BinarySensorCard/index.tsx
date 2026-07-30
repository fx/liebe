import { useEntity } from '~/hooks'
import { createElement, memo, useState, useMemo } from 'react'
import { Text } from '@radix-ui/themes'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, type CardArrangement } from '../CardBody'
import { useDashboardStore, dashboardStore, dashboardActions } from '~/store'
import { CardConfig } from '../CardConfig'
import { useCardItem } from '../cardItemContext'
import { readBinarySensorOptions } from '~/store/binarySensorOptions'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import { getIcon } from '~/utils/iconList'
import { IconCircle, IconCircleCheck } from '@tabler/icons-react'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import { useRelativeSince } from '../ButtonCard/lastChanged'
import { resolveBinarySensorPresentation } from './presentation'
import { withCardErrorBoundary } from '../cardErrorBoundary'

interface BinarySensorCardProps {
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

/**
 * How each tier lays the card out, per the tier table in
 * docs/specs/entity-cards/options/sensor.md ("Binary sensor").
 *
 * `tall` deliberately takes the **row** shape rather than the default vertical
 * one: the option doc specifies "row arrangement, vertically centred" for both
 * `tall` and `full`, because this card has no control to put between the icon
 * and the meta — the vertical shape exists to hold one.
 */
const arrangementForTier: Readonly<Record<CardTier, CardArrangement>> = {
  glance: 'stack',
  row: 'row',
  tall: 'row',
  full: 'row',
}

/**
 * A string attribute, or nothing.
 *
 * The attribute map is `Record<string, unknown>` on the wire whatever the local
 * type says: a template binary sensor can publish a numeric `friendly_name`,
 * and an entity can arrive carrying no attributes at all. Reading through here
 * is what keeps the first from rendering as a name and the second from throwing.
 */
function readStringAttribute(entity: HassEntity | undefined, key: string): string | undefined {
  const value = entity?.attributes?.[key]
  return typeof value === 'string' ? value : undefined
}

function BinarySensorCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
  item,
}: BinarySensorCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'
  const [configOpen, setConfigOpen] = useState(false)

  /*
   * Options come off the placed-item context — the same surface the shell reads
   * the universal options from — rather than off the `item` prop, which is here
   * for this card's own configuration modal. One source per card, so a
   * configured `onLabel` cannot reach the state line by a different route than
   * a configured `hideState`.
   */
  const { config } = useCardItem()
  const options = useMemo(() => readBinarySensorOptions(config), [config])
  const deviceClass = readStringAttribute(entity, 'device_class')
  const state = entity?.state

  const presentation = useMemo(
    () =>
      resolveBinarySensorPresentation({
        state: state ?? '',
        deviceClass,
        options,
      }),
    [state, deviceClass, options]
  )

  /*
   * The glyph, with the generic pair behind it for a name this build has no
   * icon for — a configured `onIcon` from a newer Liebe, or a hand-edited YAML.
   *
   * One lookup, not two: this used to try `getTablerIcon` and then `getIcon`,
   * but the former is a one-line alias of the latter, so the second call could
   * only ever repeat the first one's answer.
   */
  const IconComponent = useMemo(() => {
    const { iconName, presentedOn } = presentation
    return getIcon(iconName) || (presentedOn ? IconCircleCheck : IconCircle)
  }, [presentation])

  /*
   * The `full` tier's "since" line, from `last_changed` — the one thing the
   * option doc offers that tier, as a MAY, and this change takes it.
   *
   * Same phrasing and same per-minute refresh as the switch card's recency
   * line, from the same helper: two cards inventing two wordings for "how long
   * has it been like this" would read as two different facts. The timer runs
   * only on the tier that shows it.
   */
  const since = useRelativeSince(entity?.last_changed, tier === 'full')

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  /*
   * The one error state this read-only card can reach: a missing entity on a
   * live connection returns at the skeleton above, so everything that reaches
   * here is a disconnection.
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

  const friendlyName = readStringAttribute(entity, 'friendly_name') || entity.entity_id
  const isUnavailable = entity.state === 'unavailable'

  // One glyph size at every tier; the per-tier layout is 0011 PR 2's.
  const iconSize = 20

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
        color={presentation.color}
        tier={tier}
        isLoading={false}
        isError={false}
        isStale={isStale}
        isSelected={isSelected}
        isOn={presentation.presentedOn}
        isUnavailable={isUnavailable}
        /*
         * The other half of the hazard rule. This card resolves glyph, label
         * and tint past every option of its own; the shell's danger floor does
         * the same for the universal ones, taking back `icon`, `hideName`,
         * `hideState` and `color` while keeping `name` (`readCardDisplay`).
         * Both halves are driven from this one flag, so "is this dangerous" is
         * decided in exactly one place.
         */
        danger={presentation.danger}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        // Read-only card: `tapAction: default` resolves to `more-info` rather
        // than to a control action (docs/specs/entity-cards/options/sensor.md).
        defaultAction="more-info"
        onConfigure={isEditMode && item ? () => setConfigOpen(true) : undefined}
        hasConfiguration={!!item}
        title={undefined}
      >
        {/*
         * Every tier carries the same three parts — icon circle, name, state
         * label — and differs only in how they are arranged. Nothing is
         * omitted because nothing has to be: a binary sensor's whole content
         * fits one cell.
         *
         * `full` adds the one thing the option doc offers it and nothing else.
         * A binary sensor has no numeric history to graph and no control to
         * operate, so the extra real estate "stays calm rather than inventing
         * content".
         */}
        <CardBody
          arrangement={arrangementForTier[tier]}
          lead={<GridCard.Icon>{createElement(IconComponent, { size: iconSize })}</GridCard.Icon>}
          meta={
            <GridCard.Meta>
              <GridCard.Title>{friendlyName}</GridCard.Title>
              <GridCard.Status>{presentation.label}</GridCard.Status>
            </GridCard.Meta>
          }
          /* One tier gate, not two: `useRelativeSince` is asked for the line
             only at `full`, so it answers `null` everywhere else and a second
             check here would be unreachable — and unreachable guards are the
             ones that rot, because nothing fails when they stop being true. */
          extra={
            since ? (
              <Text size="1" color="gray" data-testid="binary-sensor-since">
                {since}
              </Text>
            ) : undefined
          }
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
const MemoizedBinarySensorCard = memo(BinarySensorCardComponent, (prevProps, nextProps) => {
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

export const BinarySensorCard = Object.assign(withCardErrorBoundary(MemoizedBinarySensorCard), {
  defaultDimensions: { width: 2, height: 2 },
})
