import React, { memo, useCallback, useState } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Calendar, Check, Clock, Edit2, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'
import type { CardTier } from '~/utils/cardTier'

interface InputDateTimeCardProps {
  entityId: string
  tier?: CardTier
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

  const [localValue, setLocalValue] = useState<string>(entity?.state ?? '')
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
      setLocalValue(entity.state)
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
        setLocalValue(entity.state)
        setIsEditing(false)
        return
      }

      setValue(entity.entity_id, localValue)
      setIsEditing(false)
    },
    [entity, localValue, setValue]
  )

  const handleCancel = useCallback(() => {
    if (entity) {
      setLocalValue(entity.state)
      setIsEditing(false)
    }
  }, [entity])

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
        <Flex direction="column" align="center" gap="2">
          <GridCard.Icon>
            <Archive size={20} />
          </GridCard.Icon>
          <GridCard.Title>
            {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
          </GridCard.Title>
          <GridCard.Status>Unavailable</GridCard.Status>
        </Flex>
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
      <Flex direction="column" align="center" gap="2">
        <GridCard.Icon>
          <Icon size={24} style={{ color: 'var(--gray-9)' }} />
        </GridCard.Icon>
        <GridCard.Title>
          {attributes.friendly_name || entity.entity_id.split('.')[1]}
        </GridCard.Title>
        <GridCard.Controls>
          {isEditing ? (
            <form onSubmit={handleSubmit} onClick={handleFieldClick}>
              <Flex align="center" gap="2">
                <TextField.Root
                  size="2"
                  type={inputType}
                  value={localValue}
                  onChange={(e) => setLocalValue(e.target.value)}
                  autoFocus
                  style={{ minWidth: '200px' }}
                />
                <IconButton size="2" type="submit" variant="soft" color="green" disabled={loading}>
                  <Check size={16} />
                </IconButton>
                <IconButton
                  size="2"
                  type="button"
                  variant="soft"
                  color="red"
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
              <IconButton
                size="2"
                variant="ghost"
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
        {hasDate && hasTime && <GridCard.Status>Date & Time</GridCard.Status>}
        {hasDate && !hasTime && <GridCard.Status>Date Only</GridCard.Status>}
        {!hasDate && hasTime && <GridCard.Status>Time Only</GridCard.Status>}
      </Flex>
    </GridCard>
  )
})
