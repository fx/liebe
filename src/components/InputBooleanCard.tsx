import React, { memo, useCallback } from 'react'
import { Box, Card, Flex, IconButton, Switch, Text } from '@radix-ui/themes'
import { Archive, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'

interface InputBooleanCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

export const InputBooleanCard = memo(function InputBooleanCard({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: InputBooleanCardProps) {
  const { entity, isConnected } = useEntity(entityId)
  const { toggle, loading, error } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const handleClick = useCallback(() => {
    if (isEditMode && onSelect) {
      onSelect(!isSelected)
    } else if (!isEditMode && entity) {
      toggle(entity.entity_id)
    }
  }, [isEditMode, onSelect, isSelected, entity, toggle])

  const handleSwitchChange = useCallback(
    (_checked: boolean) => {
      if (!isEditMode && entity) {
        toggle(entity.entity_id)
      }
    },
    [isEditMode, entity, toggle]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete?.()
    },
    [onDelete]
  )

  // Handle loading/error states
  if (!isConnected || !entity) {
    return (
      <Card
        className={`
          relative flex items-center justify-center
          ${isEditMode ? 'cursor-move' : 'cursor-pointer'}
          border-2 border-dashed border-red-500
          ${size === 'small' ? 'p-2' : size === 'large' ? 'p-4' : 'p-3'}
        `}
        style={{
          borderStyle: 'dashed',
          borderColor: 'var(--red-8)',
          animation: 'pulse-border 2s ease-in-out infinite',
        }}
      >
        <style>{`
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
        <Text size="1" color="red">
          {!isConnected ? 'Disconnected' : 'Entity not found'}
        </Text>
      </Card>
    )
  }

  const cardSize = {
    small: { p: '2', iconSize: '16', fontSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3' },
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

  const isOn = entity.state === 'on'
  const Icon = isOn ? ToggleRight : ToggleLeft
  const iconColor = isOn ? 'var(--amber-9)' : 'var(--gray-9)'

  const isStale = entity.attributes._stale === true

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
        backgroundColor: isSelected ? 'var(--blue-2)' : isOn ? 'var(--amber-3)' : undefined,
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
        <Icon size={cardSize.iconSize} style={{ color: iconColor }} />
        <Text size={cardSize.fontSize as '1' | '2' | '3'} weight="medium">
          {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
        </Text>
        {!isEditMode && (
          <Switch
            size={size === 'small' ? '1' : size === 'large' ? '3' : '2'}
            checked={isOn}
            onCheckedChange={handleSwitchChange}
            disabled={loading}
            style={{ cursor: 'pointer' }}
          />
        )}
        {isEditMode && (
          <Text size="1" color={isOn ? 'amber' : 'gray'}>
            {isOn ? 'ON' : 'OFF'}
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
