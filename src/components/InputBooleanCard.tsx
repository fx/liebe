import React, { memo, useCallback } from 'react'
import { Switch } from '@radix-ui/themes'
import { Archive, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { SkeletonCard, ErrorDisplay } from './ui'
import { useDashboardStore } from '../store'
import { readBooleanControlStyle } from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { CardSpan, CardTier } from '~/utils/cardTier'

interface InputBooleanCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no boolean-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /** The placed item's stored options, when the renderer passes them directly. */
  config?: Record<string, unknown>
}

function InputBooleanCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config,
}: InputBooleanCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { toggle, loading, error } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'
  // The same stored options the shell reads, from the same place the grid
  // publishes them (see `ButtonCard`); the prop is what the grid also passes
  // directly, and wins when present.
  const publishedItem = useCardItem()
  const controlStyle = readBooleanControlStyle(config ?? publishedItem.config)

  const handleClick = useCallback(() => {
    if (entity) {
      toggle(entity.entity_id)
    }
  }, [entity, toggle])

  const handleSwitchChange = useCallback(
    (_checked: boolean) => {
      if (entity) {
        toggle(entity.entity_id)
      }
    },
    [entity, toggle]
  )

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

  // Handle unavailable entities
  if (entity.state === 'unavailable') {
    return (
      <GridCard
        domain="input_boolean"
        tier={tier}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          lead={
            <GridCard.Icon>
              <Archive size={20} />
            </GridCard.Icon>
          }
          meta={
            <GridCard.Meta>
              <GridCard.Title>
                {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
              </GridCard.Title>
              <GridCard.Status>Unavailable</GridCard.Status>
            </GridCard.Meta>
          }
        />
      </GridCard>
    )
  }

  const isOn = entity.state === 'on'
  const Icon = isOn ? ToggleRight : ToggleLeft

  const isStale = entity.attributes._stale === true

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_boolean"
      color="default"
      tier={tier}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || undefined}
    >
      {/*
       * Whether a discrete switch renders at all is `controlStyle`
       * (docs/specs/entity-cards/options/input-helpers.md):
       *
       *   tile (default)  the whole tile is the toggle and no control renders —
       *                   the active tint carries the state, as on a switch card.
       *   switch          the discrete control returns, in the tiers with room
       *                   for it.
       *
       * `glance` never renders it either way: a 1×1 tile holding an icon, a
       * name, a state line and a 44px control would clip one of them, so the
       * option degrades by omission and the tile tap still toggles
       * (docs/changes/0011 — "no operability regression").
       *
       * Existing cards were built with the switch, so the loader pins
       * `controlStyle: 'switch'` onto items from documents that predate the
       * option — the tile default reaches new cards only (common contract,
       * convention 7).
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <Icon size={24} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            <GridCard.Status>{isOn ? 'ON' : 'OFF'}</GridCard.Status>
          </GridCard.Meta>
        }
        control={
          !isEditMode && tier !== 'glance' && controlStyle === 'switch' ? (
            <GridCard.Controls>
              <Switch
                size="3"
                checked={isOn}
                onCheckedChange={handleSwitchChange}
                disabled={loading}
                style={{ cursor: 'pointer' }}
              />
            </GridCard.Controls>
          ) : undefined
        }
      />
    </GridCard>
  )
}

/*
 * The default shallow comparator, deliberately: the grid builds a fresh
 * `{width, height}` for every item on every render, so an unwritten comparator
 * re-renders on a span change rather than holding the card at a stale one. The
 * hand-written comparators elsewhere exist to *skip* that work and therefore
 * have to name `span` themselves; this card has none to skip.
 */
const MemoizedInputBooleanCard = memo(InputBooleanCardComponent)

export const InputBooleanCard = Object.assign(MemoizedInputBooleanCard, {
  defaultDimensions: { width: 2, height: 1 },
})
