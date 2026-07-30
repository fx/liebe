import { memo } from 'react'
import { isSameSpan } from '~/utils/cardTier'
import type { CardProps } from '../cardRegistry'
import { ClimateCompactContent } from './ClimateCompact'
import { ClimateDialContent } from './ClimateDial'
import { withCardErrorBoundary } from '../cardErrorBoundary'

/**
 * The climate card, in two presentations that share everything except how a
 * temperature is set.
 *
 * `compact` — the stepper/pills layout in `ClimateCompact.tsx` — is the default
 * and the component the registry dispatches to for a card with no `variant`.
 * `dial` is the arc thermostat in `ClimateDial.tsx`, resolved through the
 * registry's variant mechanism, and is what the loader pins every climate card
 * placed before change 0017 onto (`store/climateOptions.ts`).
 *
 * Both read the entity through `climateModel.ts` and command it through
 * `useClimateControl.ts`, which is what makes the option doc's "changing
 * `variant` MUST NOT change behavior" true by construction rather than by
 * review (docs/specs/entity-cards/options/climate.md).
 */

/**
 * The span as well as the tier: `row` covers 2×1 through N×1, and this card
 * renders a different range control on either side of three columns.
 *
 * And the config, which a comparator that lists props has to keep listing:
 * both layouts resolve their options from the prop before the published item,
 * and the `dial` variant decides from `iconOnly` whether it renders its arc at
 * all — so a comparator that ignored the prop would hold a card on the
 * presentation the previous configuration asked for. Identity, not a deep
 * compare: the grid hands down the placed item's stored object, which is the
 * same reference until the item itself changes.
 */
const sameCardProps = (prev: CardProps, next: CardProps) =>
  prev.entityId === next.entityId &&
  prev.tier === next.tier &&
  isSameSpan(prev.span, next.span) &&
  prev.onDelete === next.onDelete &&
  prev.isSelected === next.isSelected &&
  prev.onSelect === next.onSelect &&
  prev.config === next.config

/*
 * The variants are attached statically rather than pushed into the registry via
 * `registerCardVariant`: importing `cardRegistry` from a card makes the module
 * graph circular (`cardRegistry` → every card → `CardConfig` → this card →
 * `cardRegistry`), which crashes with a temporal-dead-zone error in any bundle
 * whose entry reaches a card before the registry. `getCardVariant` reads
 * `card.variants`, so the dispatch is unchanged — and the variant is registered
 * before the first render instead of after it (AGENTS.md — "Entity Card
 * Registration").
 */
/*
 * The variant carries its own boundary as well as the default presentation.
 * `getCardVariant` dispatches to it directly, so it is never rendered through
 * the component above — and `dial` is what the loader pins every climate card
 * placed before change 0017 onto, which makes it the presentation most climate
 * cards actually render.
 */
export const ClimateCard = Object.assign(
  withCardErrorBoundary(memo(ClimateCompactContent, sameCardProps)),
  {
    defaultDimensions: { width: 3, height: 3 },
    variants: {
      dial: withCardErrorBoundary(memo(ClimateDialContent, sameCardProps)),
    },
  }
)
