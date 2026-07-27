import React, { memo, useCallback } from 'react'
import { Switch } from '@radix-ui/themes'
import { Archive, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { SkeletonCard, ErrorDisplay } from './ui'
import { useDashboardStore } from '../store'
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
}

function InputBooleanCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: InputBooleanCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { toggle, loading, error } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

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
       * `glance` drops the switch; every other tier keeps it.
       *
       * This is the one card in the simple set that may lose a control here,
       * and only at one cell: its operability comes from the whole-tile tap,
       * which 0014 shipped along with the more-info dialog, so a `glance`
       * boolean is still toggled by pressing it (docs/changes/0011 — "no
       * operability regression"; docs/specs/entity-cards/options/input-helpers.md
       * — "In `glance` the switch is omitted and the card behaves as `tile`").
       * The switch is omitted rather than shrunk: a 1×1 tile holding an icon, a
       * name, a state line and a 44px control would clip one of them.
       *
       * The other tiers keep today's switch because `controlStyle` does not
       * exist yet (0022 adds it, with `tile` as the default that removes the
       * discrete control everywhere). Anticipating that default here would drop
       * a working control a change early.
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
          !isEditMode && tier !== 'glance' ? (
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
