import React, { memo, useCallback } from 'react'
import { Box, Flex, Select, Text } from '@radix-ui/themes'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { Archive, ChevronDown, List } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'
import { Pill, PillGroup } from './anatomy'
import {
  readSelectControlStyle,
  readSelectOptions,
  resolveSelectPresentation,
} from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { CardSpan, CardTier } from '~/utils/cardTier'

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

export const InputSelectCard = memo(function InputSelectCard({
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
  /*
   * The helper's own list, read defensively: `options` is user-defined and can
   * arrive absent, empty, or not a list at all from a hand-edited helper, and
   * the pill gating below counts it.
   */
  const options = readSelectOptions(attributes)
  const currentValue = entity.state

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

  const dropdown = (
    <GridCard.Controls>
      <Box onClick={(e) => e.stopPropagation()} style={{ minWidth: '120px' }}>
        <Select.Root
          value={currentValue}
          onValueChange={handleValueChange}
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
    </GridCard.Controls>
  )

  const pills = (
    <GridCard.Controls>
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
            onClick={() => handleValueChange(option)}
            domain="input_select"
            color="default"
          />
        ))}
      </PillGroup>
    </GridCard.Controls>
  )

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
      title={error || undefined}
    >
      {/*
       * The dropdown renders at every tier, `glance` included.
       *
       * The option doc's `glance` row is control-free ("Icon + name + current
       * option as state; tap → more-info"), but its replacement — an
       * `input_select` control registered into the detail dialog — does not
       * arrive until 0022. Removing the dropdown here would leave a 1×1 select
       * helper with no way to change the option at all, which is exactly the
       * regression docs/changes/0011 forbids at a merge point. The trigger
       * doubles as the state the doc asks for: it reads out the current option.
       *
       * What `glance` and the middle tiers do omit is the option-count line.
       * It is secondary text about the helper rather than its state, so it
       * renders only in `full`, the one tier with a line past the meta.
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
            {tier === 'full' && options.length > 0 ? (
              <GridCard.Status>
                {options.length} option{options.length !== 1 ? 's' : ''}
              </GridCard.Status>
            ) : null}
          </GridCard.Meta>
        }
        control={presentation === 'pills' ? pills : dropdown}
      />
    </GridCard>
  )
})
