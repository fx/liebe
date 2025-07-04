import React, { memo, useCallback, useState, useEffect } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Hash, Minus, Plus } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'

interface InputNumberCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputNumberAttributes {
  friendly_name?: string
  min?: number
  max?: number
  step?: number
  unit_of_measurement?: string
  mode?: 'slider' | 'box'
  _stale?: boolean
}

export const InputNumberCard = memo(function InputNumberCard({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputNumberCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  const [localValue, setLocalValue] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)

  // Update local value when entity changes
  useEffect(() => {
    if (entity && !isEditing) {
      setLocalValue(entity.state)
    }
  }, [entity, isEditing])

  const handleClick = useCallback(() => {
    // Card click is handled by GridCard
  }, [])

  const handleIncrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const currentValue = parseFloat(entity.state)
      const step = attributes.step || 1
      const max = attributes.max

      const newValue = currentValue + step
      const finalValue = max !== undefined ? Math.min(newValue, max) : newValue

      setValue(entity.entity_id, finalValue)
    },
    [entity, setValue]
  )

  const handleDecrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const currentValue = parseFloat(entity.state)
      const step = attributes.step || 1
      const min = attributes.min

      const newValue = currentValue - step
      const finalValue = min !== undefined ? Math.max(newValue, min) : newValue

      setValue(entity.entity_id, finalValue)
    },
    [entity, setValue]
  )

  const handleValueSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const value = parseFloat(localValue)

      if (isNaN(value)) {
        setLocalValue(entity.state)
        setIsEditing(false)
        return
      }

      const min = attributes.min
      const max = attributes.max

      let finalValue = value
      if (min !== undefined) finalValue = Math.max(finalValue, min)
      if (max !== undefined) finalValue = Math.min(finalValue, max)

      setValue(entity.entity_id, finalValue)
      setIsEditing(false)
    },
    [entity, localValue, setValue]
  )

  const handleFieldClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsEditing(true)
    },
    []
  )

  const handleFieldBlur = useCallback(() => {
    if (entity) {
      setLocalValue(entity.state)
      setIsEditing(false)
    }
  }, [entity])

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={2} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        title={!isConnected ? 'Disconnected' : 'Entity Not Found'}
        onRetry={!isConnected ? () => window.location.reload() : undefined}
      />
    )
  }

  const cardSize = {
    small: { buttonSize: '1' },
    medium: { buttonSize: '2' },
    large: { buttonSize: '3' },
  }[size]

  // Handle unavailable entities
  if (entity.state === 'unavailable') {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={onSelect}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" gap="2">
          <GridCard.Icon>
            <Archive size={20} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
          <GridCard.Title>
            {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
          </GridCard.Title>
          <GridCard.Status>Unavailable</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const attributes = entity.attributes as InputNumberAttributes
  const isStale = attributes._stale === true
  const unit = attributes.unit_of_measurement || ''

  // Format display value
  const displayValue = parseFloat(entity.state).toFixed(
    attributes.step && attributes.step < 1 ? 1 : 0
  )

  return (
    <GridCard
      size={size}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={onSelect}
      onDelete={onDelete}
      onClick={handleClick}
      title={error || undefined}
    >
      <Flex direction="column" align="center" gap="2">
        <GridCard.Icon>
          <Hash size={24} style={{ color: 'var(--gray-9)' }} />
        </GridCard.Icon>
        <GridCard.Title>
          {attributes.friendly_name || entity.entity_id.split('.')[1]}
        </GridCard.Title>
        <GridCard.Controls>
          <IconButton
            size={cardSize.buttonSize as '1' | '2' | '3'}
            variant="soft"
            onClick={handleDecrement}
            disabled={
              loading ||
              (attributes.min !== undefined && parseFloat(entity.state) <= attributes.min)
            }
            style={{ cursor: 'pointer' }}
          >
            <Minus size={16} />
          </IconButton>

          {isEditing ? (
            <form onSubmit={handleValueSubmit}>
              <TextField.Root
                size={cardSize.buttonSize as '1' | '2' | '3'}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleFieldBlur}
                autoFocus
                style={{ width: '80px', textAlign: 'center' }}
              />
            </form>
          ) : (
            <Box
              onClick={handleFieldClick}
              style={{
                cursor: 'text',
                padding: '4px 8px',
                borderRadius: 'var(--radius-2)',
                backgroundColor: 'var(--gray-2)',
                minWidth: '60px',
                textAlign: 'center',
              }}
            >
              <Text size={size === 'small' ? '1' : size === 'large' ? '3' : '2'} weight="bold">
                {displayValue}
                {unit && ` ${unit}`}
              </Text>
            </Box>
          )}

          <IconButton
            size={cardSize.buttonSize as '1' | '2' | '3'}
            variant="soft"
            onClick={handleIncrement}
            disabled={
              loading ||
              (attributes.max !== undefined && parseFloat(entity.state) >= attributes.max)
            }
            style={{ cursor: 'pointer' }}
          >
            <Plus size={16} />
          </IconButton>
        </GridCard.Controls>
        {attributes.min !== undefined && attributes.max !== undefined && (
          <GridCard.Status>
            {attributes.min} - {attributes.max}
          </GridCard.Status>
        )}
      </Flex>
    </GridCard>
  )
})
