import { Check, Plug, Power, Sun, Zap } from 'lucide-react'
import { retainedRetryAction } from '~/store/cardActions'
import { memo, useState } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore, dashboardActions } from '~/store'
import { readSwitchOptions, resolveSwitchStateLabel } from '~/store/switchOptions'
import type { GridItem } from '~/store/types'
import { renderCardLifecycle } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { CardConfig } from '../CardConfig'
import { useCardItem } from '../cardItemContext'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import { resolveSwitchIconName, type SwitchIconName } from './icon'
import { useRelativeSince } from './lastChanged'
import { withCardErrorBoundary } from '../cardErrorBoundary'

interface ButtonCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines, and because the tier alone is lossy —
   * see `~/utils/cardTier`.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /**
   * The placed item. Read for its stored options, and needed by the
   * configuration modal — which is also what makes this card configurable at
   * all, including for the unmapped domains it renders as the fallback.
   */
  item?: GridItem
  config?: Record<string, unknown>
}

const ICON_GLYPHS: Readonly<Record<SwitchIconName, typeof Zap>> = {
  outlet: Plug,
  power: Power,
  light: Sun,
  boolean: Check,
  generic: Zap,
}

function ButtonCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
  item,
  config,
}: ButtonCardProps) {
  const {
    entity,
    isConnected,
    isStale,
    isMissing,
    isLoading: isEntityLoading,
  } = useEntity(entityId)
  const { loading: isLoading, error, failedCommand, dispatchGuarded, clearError } = useServiceCall()
  const screens = useDashboardStore((state) => state.screens)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const [configOpen, setConfigOpen] = useState(false)

  /*
   * The same stored options the shell reads, from the same place: the grid
   * publishes a placed item's config on this context, and the shell resolves
   * the universal half of it off there. A card reading a *different* source
   * could disagree with the shell about its own configuration — the props are
   * simply what the grid also passes directly, and win when present.
   */
  const publishedItem = useCardItem()
  const options = readSwitchOptions(config ?? item?.config ?? publishedItem.config)
  /*
   * `glance` has no room for a secondary line beside a name and a state, so the
   * option degrades by omission there rather than shrinking the tile's content
   * (docs/specs/design-system — "Size-adaptive layouts"). Resolved before the
   * early returns so the hook order never depends on which state the card is in.
   */
  const showSince = options.showLastChanged && tier !== 'glance'
  const since = useRelativeSince(entity?.last_changed, showSince)

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

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'
  const isUnavailable = entity.state === 'unavailable'
  const domain = entity.entity_id.split('.')[0]

  const Glyph =
    ICON_GLYPHS[resolveSwitchIconName(domain, entity.attributes, options.deviceClassIcon)]
  const stateText = error ? 'ERROR' : resolveSwitchStateLabel(entity.state, options.stateLabels)

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && currentScreenId && screens.some((screen) => screen.id === currentScreenId)) {
      dashboardActions.updateGridItem(currentScreenId, item.id, updates)
    }
  }

  const handleClick = async () => {
    if (isLoading || isUnavailable) return

    // Clear any previous errors
    if (error) {
      clearError()
    }

    /*
     * Guarded rather than the plain toggle: this card fronts `button`, `scene`
     * and `script` as well as switches, and a retried or repeated
     * `button.press` fires whatever the button is wired to twice
     * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
     */
    await dispatchGuarded({
      domain: entity.entity_id.split('.')[0],
      service: 'toggle',
      entityId: entity.entity_id,
    })
  }

  return (
    <>
      <GridCard
        // A light reads as a light even through the generic button card; every
        // other domain this card serves (switch, outlet, input helper) is what
        // the `default` triplet is for.
        domain={domain}
        color={domain === 'light' ? 'light' : 'default'}
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isOn}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onClick={handleClick}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={error || undefined}
        failureMessage={error || undefined}
        canRetry={failedCommand?.retryable ?? false}
        retryAction={retainedRetryAction(failedCommand)}
        onDismiss={clearError}
      >
        {/*
         * The switch card (and the generic fallback it doubles as) embeds no
         * control at any tier — the whole tile is the touch target, so the tiers
         * differ only in arrangement (docs/specs/entity-cards/options/switch.md,
         * "Tier layouts"). `full` gets the row shape with the extra area as
         * breathing room; the card declares no secondary content for it.
         *
         * `showLastChanged` is what the option doc adds to `row`/`tall`/`full`,
         * as the state line's muted secondary text — the shell's `detail` slot,
         * which stays muted while the state beside it goes active.
         */}
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          lead={
            <GridCard.Icon>
              <Glyph size={20} />
            </GridCard.Icon>
          }
          meta={
            <GridCard.Meta>
              <GridCard.Title>{friendlyName}</GridCard.Title>
              <GridCard.Status detail={since ?? undefined}>{stateText}</GridCard.Status>
            </GridCard.Meta>
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
const MemoizedButtonCard = memo(ButtonCardComponent, (prevProps, nextProps) => {
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
    prevProps.onSelect === nextProps.onSelect &&
    // The card now reads its own options off these two, so a comparator that
    // ignored them would pin a reconfigured card to the options it started with.
    prevProps.item === nextProps.item &&
    prevProps.config === nextProps.config
  )
})

export const ButtonCard = Object.assign(withCardErrorBoundary(MemoizedButtonCard), {
  defaultDimensions: { width: 2, height: 1 },
})
