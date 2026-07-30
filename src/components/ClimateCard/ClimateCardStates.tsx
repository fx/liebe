import { Flex } from '@radix-ui/themes'
import type { ReactElement } from 'react'
import type { CardTier } from '~/utils/cardTier'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { renderCardLifecycle } from '../ui'
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
  const { entity, entityId, isConnected, isLoading, isMissing, isInoperable } = model

  // Pending, missing and disconnected are the shared treatment's to tell apart
  // — a thermostat has no better view of the connection than any other card.
  if (!entity || !isConnected) {
    return renderCardLifecycle({
      entityId,
      entity,
      isConnected,
      isLoading,
      isMissing,
      tier,
      lines: 3,
      showButton: true,
    })
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
