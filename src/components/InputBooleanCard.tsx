import React, { memo, useCallback } from 'react'
import { retainedRetryAction } from '~/store/cardActions'
import { Switch } from '@radix-ui/themes'
import { Archive, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { renderCardLifecycle } from './ui'
import { useDashboardStore } from '../store'
import { DetailControlSection } from './EntityDetailDialog/DetailControlSection'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from './EntityDetailDialog/detailControls'
import { readBooleanControlStyle } from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

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

/**
 * States that make a toggle inert. The direction is indeterminate — a helper
 * Home Assistant has not restored yet is neither on nor off — and a card must
 * never actuate what it cannot read (docs/specs/entity-cards/options/
 * input-helpers.md — "suppress it when `unavailable` or `unknown`").
 */
const INDETERMINATE_STATES = new Set(['unavailable', 'unknown'])

/**
 * The `input_boolean` control the detail dialog mounts.
 *
 * The card's own operability at `glance` comes from the whole-tile toggle, so
 * unlike the other four helpers this one is not what makes a control-free tier
 * legal. It is registered for the surface's sake instead: the dialog has no
 * tile to tap, so without a control here a boolean helper would be the one
 * helper whose detail dialog cannot operate it. The control is the discrete
 * `Switch` the `controlStyle: switch` tiers render.
 */
export function InputBooleanDetailControls({ entity }: EntityDetailControlsProps) {
  const { toggle, loading, error } = useServiceCall()
  const indeterminate = INDETERMINATE_STATES.has(entity.state)

  return (
    <DetailControlSection error={error}>
      <Switch
        size="3"
        checked={entity.state === 'on'}
        onCheckedChange={() => toggle(entity.entity_id)}
        disabled={loading || indeterminate}
        aria-label={`Toggle ${entity.attributes.friendly_name || entity.entity_id}`}
        style={{ cursor: 'pointer' }}
      />
    </DetailControlSection>
  )
}

// Registered by the card family that owns the control; see the note on
// `registerDetailControls` in `InputNumberCard.tsx` for why the edge runs this
// way round and why it is safe.
registerDetailControls('input_boolean', InputBooleanDetailControls)

function InputBooleanCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config,
}: InputBooleanCardProps) {
  const { entity, isConnected, isMissing, isLoading: isEntityLoading } = useEntity(entityId)
  const { toggle, loading, error, failedCommand, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
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

  if (!entity || !isConnected) {
    return renderCardLifecycle({
      entityId,
      entity,
      isConnected,
      isLoading: isEntityLoading,
      isMissing,
      tier,
    })
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
      failureMessage={error || undefined}
      canRetry={failedCommand?.retryable ?? false}
      retryAction={retainedRetryAction(failedCommand)}
onRetrySettled={(result) => {
  if (result?.success) clearError()
}}
      onDismiss={clearError}
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
                /*
                 * The switch renders as a `<button role="switch">` whose only
                 * content is the thumb, so it takes no name from the tile it
                 * sits on — the same `button-name` violation the dialog's copy
                 * above was already named against, and named the same way
                 * (docs/changes/0035-light-appearance-contrast.md).
                 */
                aria-label={`Toggle ${entity.attributes.friendly_name || entity.entity_id}`}
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

export const InputBooleanCard = Object.assign(withCardErrorBoundary(MemoizedInputBooleanCard), {
  defaultDimensions: { width: 2, height: 1 },
})
