import React, { memo, useCallback, useState } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Check, Edit2, Type, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { SkeletonCard, ErrorDisplay } from './ui'
import type { CardSpan, CardTier } from '~/utils/cardTier'

interface InputTextCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no text-helper layout keys on width past
   * the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputTextAttributes {
  friendly_name?: string
  min?: number
  max?: number
  pattern?: string
  mode?: 'text' | 'password'
  _stale?: boolean
}

export const InputTextCard = memo(function InputTextCard({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: InputTextCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  const [isEditing, setIsEditing] = useState(false)
  // Local value for editing - initialized when entering edit mode
  const [localValue, setLocalValue] = useState<string>('')

  // Computed display value - entity state when not editing, local value when editing
  const displayValue = isEditing ? localValue : (entity?.state ?? '')

  const enterEditMode = useCallback(() => {
    if (entity) {
      setLocalValue(entity.state)
      setIsEditing(true)
    }
  }, [entity])

  const handleClick = useCallback(() => {
    if (!isEditing) {
      enterEditMode()
    }
  }, [isEditing, enterEditMode])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity) return

      const attributes = entity.attributes as InputTextAttributes

      // Validate length constraints
      if (attributes.min && localValue.length < attributes.min) {
        // Invalid - exit edit mode, displayValue reverts to entity.state
        setIsEditing(false)
        return
      }

      if (attributes.max && localValue.length > attributes.max) {
        // Truncate value
        const truncated = localValue.substring(0, attributes.max)
        setLocalValue(truncated)
        return
      }

      // Validate pattern if provided
      if (attributes.pattern) {
        const regex = new RegExp(attributes.pattern)
        if (!regex.test(localValue)) {
          // Invalid - exit edit mode, displayValue reverts to entity.state
          setIsEditing(false)
          return
        }
      }

      setValue(entity.entity_id, localValue)
      setIsEditing(false)
    },
    [entity, localValue, setValue]
  )

  const handleCancel = useCallback(() => {
    // Just exit editing mode - displayValue will show entity.state again
    setIsEditing(false)
  }, [])

  const handleFieldClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

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
        domain="input_text"
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

  const attributes = entity.attributes as InputTextAttributes
  const isStale = attributes._stale === true
  const isPassword = attributes.mode === 'password'

  // For display: mask if password and not editing, otherwise show displayValue (computed at top)
  const shownValue = isPassword && !isEditing ? '••••••••' : displayValue

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_text"
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
      // would route `toggle` to `homeassistant.toggle` on an `input_text`.
      onClick={handleClick}
      title={error || undefined}
    >
      {/*
       * The value field renders at every tier, `glance` included.
       *
       * The option doc's `glance` row is control-free ("Icon + name + value as
       * state; tap → more-info"), but the `input_text` control it defers to is
       * registered into the detail dialog by 0022. Dropping the field here
       * would leave a 1×1 text helper with no way to set its value at all —
       * the regression docs/changes/0011 forbids at a merge point. The field
       * doubles as the state the doc asks for: it reads the value out, masked
       * when the helper's `mode` is `password`.
       *
       * The length-constraint line is what the smaller tiers omit: it describes
       * the helper rather than reporting its state, so it renders only in
       * `full`, the one tier with a line past the meta.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <Type size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {tier === 'full' && attributes.min !== undefined && attributes.max !== undefined ? (
              <GridCard.Status>
                {attributes.min} - {attributes.max} chars
              </GridCard.Status>
            ) : null}
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
                    type={isPassword ? 'password' : 'text'}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    autoFocus
                    style={{ minWidth: '150px' }}
                    maxLength={attributes.max}
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
                    minWidth: '100px',
                    textAlign: 'center',
                  }}
                >
                  <Text size="2" style={{ fontFamily: isPassword ? 'monospace' : undefined }}>
                    {shownValue || '(empty)'}
                  </Text>
                </Box>
                {/*
                 * The readout beside it is a plain `Box`, and stays one: it
                 * reports the value, it does not operate the helper. The edit
                 * affordance is this button — a real `<button>`, focusable and
                 * Enter/Space-operable — so the control `glance` retains is
                 * reachable without a pointer (docs/changes/0011 — "no
                 * operability regression"). An icon-only button has no text to
                 * name it, so the name is spelled out here rather than left to
                 * an `<svg>`.
                 */}
                <IconButton
                  size="3"
                  variant="ghost"
                  aria-label="Edit value"
                  onClick={(e) => {
                    e.stopPropagation()
                    enterEditMode()
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
