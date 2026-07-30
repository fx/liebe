import { memo, useCallback } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'
import { Select } from '~/components/ui/portals'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { Archive, ChevronDown, List } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'
import { Pill, PillGroup } from './anatomy'
import { DetailControlSection } from './EntityDetailDialog/DetailControlSection'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from './EntityDetailDialog/detailControls'
import {
  readSelectControlStyle,
  readSelectOptions,
  resolveSelectPresentation,
  type SelectControlStyle,
} from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

interface InputSelectCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no select-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /** The placed item's stored options, when the renderer passes them directly. */
  config?: Record<string, unknown>
}

interface InputSelectAttributes {
  friendly_name?: string
  /** Whatever the helper published — validated at the read, not at the type. */
  options?: unknown
  _stale?: boolean
}

interface SelectHelperControlProps {
  entity: HassEntity
  /** Which presentation renders, already degraded for tier and option count. */
  presentation: SelectControlStyle
  /** A dispatch is in flight, so every commit route is held shut. */
  loading?: boolean
  /** Select one of the helper's own options. */
  onCommit: (option: string) => void
}

/**
 * The select helper's embedded control — the dropdown or the pill group.
 *
 * Rendered bare so the card can wrap it in `GridCard.Controls` and the detail
 * dialog in `DetailControlSection`, which is what lets the dialog mount the
 * same control the card's `full` tier renders rather than a second one that
 * drifts from it (docs/specs/entity-cards/options/input-helpers.md).
 */
export function SelectHelperControl({
  entity,
  presentation,
  loading = false,
  onCommit,
}: SelectHelperControlProps) {
  const attributes = entity.attributes as InputSelectAttributes
  /*
   * The helper's own list, read defensively: `options` is user-defined and can
   * arrive absent, empty, or not a list at all from a hand-edited helper.
   */
  const options = readSelectOptions(attributes)
  const currentValue = entity.state

  if (presentation === 'pills') {
    return (
      <PillGroup label={attributes.friendly_name || entity.entity_id.split('.')[1]}>
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            active={option === currentValue}
            // The current option is not a command: pressing it would send a
            // `select_option` that changes nothing, and a control that does
            // nothing must say so rather than look live.
            disabled={loading || option === currentValue}
            onClick={() => onCommit(option)}
            domain="input_select"
            color="default"
          />
        ))}
      </PillGroup>
    )
  }

  return (
    <Box onClick={(e) => e.stopPropagation()} style={{ minWidth: '120px' }}>
      <Select.Root
        value={currentValue}
        onValueChange={onCommit}
        disabled={loading || options.length === 0}
      >
        <Select.Trigger variant="soft" style={{ width: '100%' }}>
          <Flex align="center" justify="between" style={{ width: '100%' }}>
            <Text size="2">{currentValue}</Text>
            <ChevronDown size={16} />
          </Flex>
        </Select.Trigger>
        <Select.Content>
          {options.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Box>
  )
}

/**
 * The `input_select` control the detail dialog mounts — what a control-free
 * `glance` tile defers to through its `more-info` tap
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * The dropdown, not the pills: pills are a `full`-tier presentation an
 * individual *card* opts into, and the dialog is opened for an entity rather
 * than for a card, so it has no card's `controlStyle` to read. The dropdown is
 * also the presentation that holds every option list — the one the pills
 * themselves degrade to when there are too many.
 */
export function InputSelectDetailControls({ entity }: EntityDetailControlsProps) {
  const { setValue, loading, error } = useServiceCall()

  return (
    <DetailControlSection error={error}>
      <SelectHelperControl
        entity={entity}
        presentation="dropdown"
        loading={loading}
        onCommit={(option) => setValue(entity.entity_id, option)}
      />
    </DetailControlSection>
  )
}

// Registered by the card family that owns the control; see the note on
// `registerDetailControls` in `InputNumberCard.tsx` for why the edge runs this
// way round and why it is safe.
registerDetailControls('input_select', InputSelectDetailControls)

const MemoizedInputSelectCard = memo(function InputSelectCardContent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config,
}: InputSelectCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()
  const publishedItem = useCardItem()

  const handleClick = useCallback(() => {
    // Card click is handled by GridCard
  }, [])

  const handleValueChange = useCallback(
    (value: string) => {
      if (!entity) return
      setValue(entity.entity_id, value)
    },
    [entity, setValue]
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
        domain="input_select"
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

  const attributes = entity.attributes as InputSelectAttributes
  const isStale = attributes._stale === true
  const options = readSelectOptions(attributes)

  const isGlance = tier === 'glance'

  /*
   * `controlStyle` chooses the presentation, and the tier and the option count
   * decide whether it fits (docs/specs/entity-cards/options/input-helpers.md).
   * Pills need `full` and at most five options; anywhere else the stored value
   * degrades to the dropdown rather than clipping a row that cannot fit —
   * degrade, never scroll. Nothing is rewritten, so a card re-engages its pills
   * when it is resized or the helper loses an option.
   */
  const controlStyle = readSelectControlStyle(config ?? publishedItem.config)
  const presentation = resolveSelectPresentation(controlStyle, tier, options.length)

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_select"
      color="default"
      tier={tier}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      /*
       * One cell holds no dropdown, so `default` resolves to `more-info` and
       * the dialog's `input_select` control is what changes the option
       * (docs/specs/entity-cards/options/input-helpers.md — "In `glance`, fall
       * back to `more-info`").
       */
      defaultAction={isGlance ? 'more-info' : undefined}
      title={error || undefined}
    >
      {/*
       * `glance` reads the current option out as the tile's state line and
       * carries no control, which is what the option doc's tier table asks for
       * ("Icon + name + **current option as state**; tap → more-info").
       *
       * The option-count line is what the middle tiers omit instead: it is
       * secondary text about the helper rather than its state, so it renders
       * only in `full`, the one tier with a line past the meta — and at
       * `glance` the state line is already spoken for by the option itself.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <List size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {isGlance ? <GridCard.Status>{entity.state}</GridCard.Status> : null}
            {tier === 'full' && options.length > 0 ? (
              <GridCard.Status>
                {options.length} option{options.length !== 1 ? 's' : ''}
              </GridCard.Status>
            ) : null}
          </GridCard.Meta>
        }
        control={
          isGlance ? undefined : (
            <GridCard.Controls>
              <SelectHelperControl
                entity={entity}
                presentation={presentation}
                loading={loading}
                onCommit={handleValueChange}
              />
            </GridCard.Controls>
          )
        }
      />
    </GridCard>
  )
})

export const InputSelectCard = withCardErrorBoundary(MemoizedInputSelectCard)
