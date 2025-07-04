import React, { memo, useCallback, useState, useEffect } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Check, Edit2, Type, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'

interface InputTextCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
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
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputTextCardProps) {
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
    if (!isEditing) {
      setIsEditing(true)
    }
  }, [isEditing])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity) return

      const attributes = entity.attributes as InputTextAttributes

      // Validate length constraints
      if (attributes.min && localValue.length < attributes.min) {
        setLocalValue(entity.state)
        setIsEditing(false)
        return
      }

      if (attributes.max && localValue.length > attributes.max) {
        setLocalValue(localValue.substring(0, attributes.max))
        return
      }

      // Validate pattern if provided
      if (attributes.pattern) {
        const regex = new RegExp(attributes.pattern)
        if (!regex.test(localValue)) {
          setLocalValue(entity.state)
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
    if (entity) {
      setLocalValue(entity.state)
      setIsEditing(false)
    }
  }, [entity])

  const handleFieldClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

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
        onSelect={() => onSelect?.(!isSelected)}
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

  const attributes = entity.attributes as InputTextAttributes
  const isStale = attributes._stale === true
  const isPassword = attributes.mode === 'password'

  // Display value (mask if password and not editing)
  const displayValue = isPassword && !isEditing ? '••••••••' : entity.state

  return (
    <GridCard
      size={size}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={!isEditing ? handleClick : undefined}
      title={error || undefined}
    >
      <Flex direction="column" align="center" gap="2">
        <GridCard.Icon>
          <Type size={24} style={{ color: 'var(--gray-9)' }} />
        </GridCard.Icon>
        <GridCard.Title>
          {attributes.friendly_name || entity.entity_id.split('.')[1]}
        </GridCard.Title>
        <GridCard.Controls>
          {isEditing ? (
            <form onSubmit={handleSubmit} onClick={handleFieldClick}>
              <Flex align="center" gap="2">
                <TextField.Root
                  size={cardSize.buttonSize as '1' | '2' | '3'}
                  type={isPassword ? 'password' : 'text'}
                  value={localValue}
                  onChange={(e) => setLocalValue(e.target.value)}
                  autoFocus
                  style={{ minWidth: '150px' }}
                  maxLength={attributes.max}
                />
                <IconButton
                  size={cardSize.buttonSize as '1' | '2' | '3'}
                  type="submit"
                  variant="soft"
                  color="green"
                  disabled={loading}
                >
                  <Check size={16} />
                </IconButton>
                <IconButton
                  size={cardSize.buttonSize as '1' | '2' | '3'}
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
                  minWidth: '100px',
                  textAlign: 'center',
                }}
              >
                <Text
                  size={size === 'small' ? '1' : size === 'large' ? '3' : '2'}
                  style={{ fontFamily: isPassword ? 'monospace' : undefined }}
                >
                  {displayValue || '(empty)'}
                </Text>
              </Box>
              <IconButton
                size={cardSize.buttonSize as '1' | '2' | '3'}
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
        {attributes.min !== undefined && attributes.max !== undefined && (
          <GridCard.Status>
            {attributes.min} - {attributes.max} chars
          </GridCard.Status>
        )}
      </Flex>
    </GridCard>
  )
})
