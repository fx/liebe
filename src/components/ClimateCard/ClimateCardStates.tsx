import { Flex } from '@radix-ui/themes'
import type { ReactElement } from 'react'
import type { CardTier } from '~/utils/cardTier'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { SkeletonCard, ErrorDisplay } from '../ui'
import type { ClimateModel } from './climateModel'

export interface ClimateFallbackProps {
  model: ClimateModel
  tier: CardTier
  isSelected: boolean
  onSelect?: (selected: boolean) => void
  onDelete?: () => void
}

/**
 * The states in which a thermostat renders something other than a thermostat —
 * loading, disconnected, missing, or carrying no usable state at all.
 *
 * A plain function rather than a component because the caller needs it *instead
 * of* its own body, and a component can only be rendered beside one. It holds
 * no hooks, so calling it after the card's own hooks is safe at any point in
 * the render.
 *
 * Shared by both variants: which presentation a card was configured with says
 * nothing about what to do with an entity that is not answering, and the
 * `unknown` handling below is a fixed bug (change 0011) that must not come back
 * on one variant only.
 */
export function climateCardFallback({
  model,
  tier,
  isSelected,
  onSelect,
  onDelete,
}: ClimateFallbackProps): ReactElement | null {
  const { entity, isConnected, isLoading, isInoperable } = model

  // Show skeleton while loading initial data.
  if (isLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={3} showButton={true} />
  }

  /*
   * No thermostat to render, and the connection is why. An entity that has not
   * arrived over a live connection is the skeleton above, so an
   * entity-not-found message here would be a case this branch cannot reach —
   * the pre-split card carried one, and it was unreachable there too.
   */
  if (!isConnected || !entity) {
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

  /*
   * The two states that carry no HVAC mode. Both resolve to the shell's
   * neutral, inert treatment with every control gone — an `unknown` thermostat
   * must never render an enabled control that dispatches
   * `climate.set_temperature` against a state nobody knows
   * (docs/specs/entity-cards/options/climate.md — "showModePills and state
   * colors").
   */
  if (isInoperable) {
    return (
      <GridCard
        domain="climate"
        tier={tier}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>{entity.state.toUpperCase()}</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  return null
}
