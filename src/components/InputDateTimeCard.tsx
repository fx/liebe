import React, { memo, useCallback, useState } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Calendar, Check, Clock, Edit2, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { SkeletonCard, ErrorDisplay } from './ui'
import { toDatetimeInputValue } from '~/utils/inputDatetime'
import type { CardSpan, CardTier } from '~/utils/cardTier'

interface InputDateTimeCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no datetime-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputDateTimeAttributes {
  friendly_name?: string
  has_date?: boolean
  has_time?: boolean
  _stale?: boolean
}

export const InputDateTimeCard = memo(function InputDateTimeCard({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: InputDateTimeCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  /*
   * The state Home Assistant publishes is not what the native inputs accept —
   * `2024-01-15 06:30:00` leaves a `datetime-local` field blank, and its seconds
   * leave a `time` field blank (docs/changes/0022-switch-input-helpers-to-spec.md).
   * Every seed of the field goes through the translation, so what the user edits
   * is always the value the card is showing.
   */
  const inputValue = toDatetimeInputValue(entity?.state ?? '', entity?.attributes)
  const [localValue, setLocalValue] = useState<string>(inputValue)
  const [isEditing, setIsEditing] = useState(false)

  // Sync the local value from the entity while the user is not editing. Done
  // during render (not in an effect) per react-hooks/set-state-in-effect; the
  // previous-value guards reproduce the old effect's [entity, isEditing] triggers.
  const [prevEntity, setPrevEntity] = useState(entity)
  const [prevIsEditing, setPrevIsEditing] = useState(isEditing)
  if (entity !== prevEntity || isEditing !== prevIsEditing) {
    setPrevEntity(entity)
    setPrevIsEditing(isEditing)
    if (entity && !isEditing) {
      setLocalValue(inputValue)
    }
  }

  const handleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true)
    }
  }, [isEditing])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity) return

      // Validate the datetime format
      if (!localValue) {
        setLocalValue(inputValue)
        setIsEditing(false)
        return
      }

      setValue(entity.entity_id, localValue)
      setIsEditing(false)
    },
    [entity, inputValue, localValue, setValue]
  )

  const handleCancel = useCallback(() => {
    if (entity) {
      setLocalValue(inputValue)
      setIsEditing(false)
    }
  }, [entity, inputValue])

  const handleFieldClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Format display value
  const formatDisplayValue = (value: string, attributes: InputDateTimeAttributes) => {
    if (!value || value === 'unknown') return '(not set)'

    try {
      const date = new Date(value)
      if (isNaN(date.getTime())) return value

      const hasDate = attributes.has_date !== false
      const hasTime = attributes.has_time !== false

      if (hasDate && hasTime) {
        return date.toLocaleString()
      } else if (hasDate) {
        return date.toLocaleDateString()
      } else if (hasTime) {
        return date.toLocaleTimeString()
      }
      return value
    } catch {
      return value
    }
  }

  // Get input type based on entity attributes
  const getInputType = (attributes: InputDateTimeAttributes) => {
    const hasDate = attributes.has_date !== false
    const hasTime = attributes.has_time !== false

    if (hasDate && hasTime) return 'datetime-local'
    if (hasDate) return 'date'
    if (hasTime) return 'time'
    return 'datetime-local'
  }

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
        domain="input_datetime"
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

  const attributes = entity.attributes as InputDateTimeAttributes
  const isStale = attributes._stale === true
  const hasDate = attributes.has_date !== false
  const hasTime = attributes.has_time !== false
  const Icon = hasDate ? Calendar : Clock

  const displayValue = formatDisplayValue(entity.state, attributes)
  const inputType = getInputType(attributes)
  /*
   * Which halves of a datetime the helper actually carries. Secondary text, so
   * only `full` renders it — see the layout note below. A helper with neither
   * half is nonsense Home Assistant does not produce, but it has always
   * rendered no line at all rather than a wrong one, and that stays true.
   */
  const modeLabel = hasDate
    ? hasTime
      ? 'Date & Time'
      : 'Date Only'
    : hasTime
      ? 'Time Only'
      : undefined

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_datetime"
      color="default"
      tier={tier}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Unconditional, with `handleClick` declining while the field is open: an
      // absent handler tells the shell the card has no toggle of its own, which
      // would route `toggle` to `homeassistant.toggle` on an `input_datetime`.
      onClick={handleClick}
      title={error || undefined}
    >
      {/*
       * The picker renders at every tier, `glance` included.
       *
       * The option doc's `glance` row is control-free ("Icon + name + formatted
       * value; tap → more-info"), but the `input_datetime` control it defers to
       * is registered into the detail dialog by 0022. Dropping the picker here
       * would leave a 1×1 datetime helper with no way to set it at all — the
       * regression docs/changes/0011 forbids at a merge point. The field
       * doubles as the state the doc asks for: it reads out the formatted
       * value, or `(not set)`.
       *
       * The has-date/has-time line is what the smaller tiers omit: it describes
       * the helper rather than reporting its state, so it renders only in
       * `full`, the one tier with a line past the meta.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <Icon size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {tier === 'full' && modeLabel ? <GridCard.Status>{modeLabel}</GridCard.Status> : null}
          </GridCard.Meta>
        }
        control={
          <GridCard.Controls>
            {isEditing ? (
              <form onSubmit={handleSubmit} onClick={handleFieldClick}>
                <Flex align="center" gap="2">
                  <TextField.Root
                    size="3"
                    aria-label="Value"
                    type={inputType}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    autoFocus
                    style={{ minWidth: '200px' }}
                  />
                  <IconButton
                    size="3"
                    type="submit"
                    variant="soft"
                    color="green"
                    aria-label="Save value"
                    disabled={loading}
                  >
                    <Check size={16} />
                  </IconButton>
                  <IconButton
                    size="3"
                    type="button"
                    variant="soft"
                    color="red"
                    aria-label="Cancel editing"
                    onClick={handleCancel}
                  >
                    <X size={16} />
                  </IconButton>
                </Flex>
              </form>
            ) : (
              <Flex align="center" gap="2">
                <Box
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-2)',
                    backgroundColor: 'var(--gray-2)',
                    minWidth: '120px',
                    textAlign: 'center',
                  }}
                >
                  <Text size="2">{displayValue}</Text>
                </Box>
                {/*
                 * As in `InputTextCard`: the `Box` beside it only reports the
                 * value, and this real `<button>` is what operates the helper,
                 * so the control `glance` retains is focusable and
                 * Enter/Space-operable rather than pointer-only
                 * (docs/changes/0011 — "no operability regression"). Icon-only,
                 * so it carries its name explicitly.
                 */}
                <IconButton
                  size="3"
                  variant="ghost"
                  aria-label="Edit value"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                >
                  <Edit2 size={16} />
                </IconButton>
              </Flex>
            )}
          </GridCard.Controls>
        }
      />
    </GridCard>
  )
})
