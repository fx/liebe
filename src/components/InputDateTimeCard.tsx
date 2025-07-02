import React, { memo, useCallback, useState, useEffect } from 'react'
import { Box, Card, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Calendar, Check, Clock, Edit2, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import { SkeletonCard, ErrorDisplay } from './ui'

interface InputDateTimeCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
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
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputDateTimeCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const [localValue, setLocalValue] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)

  // Update local value when entity changes
  useEffect(() => {
    if (entity && !isEditing) {
      setLocalValue(entity.state)
    }
  }, [entity, isEditing])

  const handleClick = useCallback(() => {
    if (isEditMode && onSelect) {
      onSelect(!isSelected)
    } else if (!isEditMode && !isEditing) {
      setIsEditing(true)
    }
  }, [isEditMode, onSelect, isSelected, isEditing])

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete?.()
    },
    [onDelete]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity || isEditMode) return

      // Validate the datetime format
      if (!localValue) {
        setLocalValue(entity.state)
        setIsEditing(false)
        return
      }

      setValue(entity.entity_id, localValue)
      setIsEditing(false)
    },
    [entity, isEditMode, localValue, setValue]
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
    small: { p: '2', iconSize: '16', fontSize: '1', buttonSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2', buttonSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3', buttonSize: '3' },
  }[size]

  // Handle unavailable entities
  if (entity.state === 'unavailable') {
    return (
      <Card
        className={`
          relative
          ${isEditMode ? 'cursor-move' : 'cursor-not-allowed'}
          ${isSelected ? 'ring-2 ring-blue-500' : ''}
        `}
        style={{
          borderStyle: 'dotted',
          borderColor: 'var(--gray-7)',
          backgroundColor: isSelected ? 'var(--blue-2)' : undefined,
          padding: `var(--space-${cardSize.p})`,
        }}
        onClick={handleClick}
      >
        {isEditMode && (
          <>
            <Box
              className="absolute inset-x-0 top-0 h-6 cursor-move"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)',
              }}
            />
            <IconButton
              size="1"
              variant="ghost"
              className="absolute top-1 right-1"
              onClick={handleDelete}
              style={{ cursor: 'pointer' }}
            >
              <X size={12} />
            </IconButton>
          </>
        )}
        <Flex direction="column" align="center" gap="2">
          <Archive size={cardSize.iconSize} style={{ color: 'var(--gray-9)' }} />
          <Text size={cardSize.fontSize as '1' | '2' | '3'} color="gray">
            {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
          </Text>
          <Text size="1" color="gray">
            Unavailable
          </Text>
        </Flex>
      </Card>
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
    <Card
      className={`
        relative transition-all duration-200
        ${isEditMode ? 'cursor-move' : 'cursor-pointer'}
        ${isSelected ? 'ring-2 ring-blue-500' : ''}
        ${isStale ? 'border-2 border-orange-400' : ''}
        ${error ? 'border-2 border-red-500' : ''}
      `}
      style={{
        backgroundColor: isSelected ? 'var(--blue-2)' : undefined,
        borderStyle: isStale ? 'dashed' : error ? 'solid' : undefined,
        borderColor: isStale ? 'var(--orange-8)' : error ? 'var(--red-8)' : undefined,
        padding: `var(--space-${cardSize.p})`,
        animation: error ? 'pulse-border 2s ease-in-out infinite' : undefined,
      }}
      onClick={handleClick}
    >
      {isEditMode && (
        <>
          <Box
            className="absolute inset-x-0 top-0 h-6 cursor-move"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)',
            }}
          />
          <IconButton
            size="1"
            variant="ghost"
            className="absolute top-1 right-1"
            onClick={handleDelete}
            style={{ cursor: 'pointer' }}
          >
            <X size={12} />
          </IconButton>
        </>
      )}

      {loading && (
        <Box
          className="absolute inset-0 flex items-center justify-center bg-black/10"
          style={{ borderRadius: 'var(--radius-2)' }}
        >
          <Box
            className="h-4 w-4 rounded-full border-2 border-gray-600 border-t-transparent"
            style={{ animation: 'spin 1s linear infinite' }}
          />
        </Box>
      )}

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes pulse-border {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>

      <Flex direction="column" align="center" gap="2">
        <Icon size={cardSize.iconSize} style={{ color: 'var(--gray-9)' }} />
        <Text size={cardSize.fontSize as '1' | '2' | '3'} weight="medium">
          {attributes.friendly_name || entity.entity_id.split('.')[1]}
        </Text>

        {!isEditMode ? (
          <>
            {isEditing ? (
              <form onSubmit={handleSubmit} onClick={handleFieldClick}>
                <Flex align="center" gap="2">
                  <TextField.Root
                    size={cardSize.buttonSize as '1' | '2' | '3'}
                    type={inputType}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    autoFocus
                    style={{ minWidth: '200px' }}
                  />
                  <IconButton
                    size={cardSize.buttonSize as '1' | '2' | '3'}
                    type="submit"
                    variant="soft"
                    color="green"
                    disabled={loading}
                  >
                    <Check size={parseInt(cardSize.iconSize) - 4} />
                  </IconButton>
                  <IconButton
                    size={cardSize.buttonSize as '1' | '2' | '3'}
                    type="button"
                    variant="soft"
                    color="red"
                    onClick={handleCancel}
                  >
                    <X size={parseInt(cardSize.iconSize) - 4} />
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
                  <Text size={cardSize.fontSize as '1' | '2' | '3'}>{displayValue}</Text>
                </Box>
                <IconButton
                  size={cardSize.buttonSize as '1' | '2' | '3'}
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                >
                  <Edit2 size={parseInt(cardSize.iconSize) - 4} />
                </IconButton>
              </Flex>
            )}
          </>
        ) : (
          <Text size={cardSize.fontSize as '1' | '2' | '3'} color="gray">
            {displayValue}
          </Text>
        )}

        {hasDate && hasTime && (
          <Text size="1" color="gray">
            Date & Time
          </Text>
        )}
        {hasDate && !hasTime && (
          <Text size="1" color="gray">
            Date Only
          </Text>
        )}
        {!hasDate && hasTime && (
          <Text size="1" color="gray">
            Time Only
          </Text>
        )}
      </Flex>

      {error && (
        <Text size="1" color="red" className="absolute bottom-1 left-1 right-1 text-center">
          {error}
        </Text>
      )}
    </Card>
  )
})
