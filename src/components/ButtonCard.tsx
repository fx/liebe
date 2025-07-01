import { Card, Flex, Text, Spinner, Box, IconButton } from '@radix-ui/themes'
import { LightningBoltIcon, SunIcon, CheckIcon, Cross2Icon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'
import { memo } from 'react'
import { useDashboardStore } from '~/store'
import './ButtonCard.css'

interface ButtonCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

const getEntityIcon = (entity: HassEntity) => {
  const domain = entity.entity_id.split('.')[0]

  switch (domain) {
    case 'light':
      return <SunIcon width="20" height="20" />
    case 'switch':
      return <LightningBoltIcon width="20" height="20" />
    case 'input_boolean':
      return <CheckIcon width="20" height="20" />
    default:
      return <LightningBoltIcon width="20" height="20" />
  }
}

function ButtonCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: ButtonCardProps) {
  const { entity, isConnected, isStale } = useEntity(entityId)
  const { loading: isLoading, error, toggle, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  if (!entity || !isConnected) {
    return (
      <Card variant="classic" style={{ opacity: 0.5 }}>
        <Flex p="3" align="center" justify="center">
          <Text size="2" color="gray">
            {!isConnected ? 'Disconnected' : 'Entity not found'}
          </Text>
        </Flex>
      </Card>
    )
  }

  const cardSize = {
    small: { p: '2', iconSize: '16', fontSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3' },
  }[size]

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <Card variant="classic" style={{ opacity: 0.6, borderStyle: 'dotted' }}>
        <Flex p={cardSize.p} direction="column" align="center" justify="center" gap="2">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>{getEntityIcon(entity)}</Box>
          <Text size={cardSize.fontSize as '1' | '2' | '3'} color="gray" align="center">
            {entity.attributes.friendly_name || entity.entity_id}
          </Text>
          <Text size="1" color="gray" weight="medium">
            UNAVAILABLE
          </Text>
        </Flex>
      </Card>
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'

  const handleClick = async () => {
    if (isLoading) return

    // Clear any previous errors
    if (error) {
      clearError()
    }

    await toggle(entity.entity_id)
  }

  return (
    <Card
      variant="classic"
      style={{
        cursor: isLoading ? 'wait' : 'pointer',
        backgroundColor: isSelected ? 'var(--blue-3)' : isOn ? 'var(--amber-3)' : undefined,
        borderColor: isSelected
          ? 'var(--blue-6)'
          : error
            ? 'var(--red-6)'
            : isStale
              ? 'var(--orange-6)'
              : isOn
                ? 'var(--amber-6)'
                : undefined,
        borderWidth: isSelected || error || isOn || isStale ? '2px' : '1px',
        borderStyle: isStale ? 'dashed' : 'solid',
        transition: 'all 0.2s ease',
        transform: isLoading ? 'scale(0.98)' : undefined,
        animation: isLoading
          ? (error ? 'pulse-border-error' : 'pulse-border') + ' 1.5s ease-in-out infinite'
          : undefined,
        opacity: isStale ? 0.8 : 1,
        position: 'relative',
      }}
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : handleClick}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
    >
      {/* Delete button in edit mode */}
      {isEditMode && onDelete && (
        <IconButton
          size="1"
          variant="soft"
          color="red"
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            opacity: isSelected ? 1 : 0.7,
            transition: 'opacity 0.2s ease',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete entity"
        >
          <Cross2Icon />
        </IconButton>
      )}

      <Flex
        p={cardSize.p}
        direction="column"
        align="center"
        justify="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '120px' : size === 'medium' ? '100px' : '80px' }}
      >
        <Box
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            style={{
              color: isStale ? 'var(--orange-9)' : isOn ? 'var(--amber-9)' : 'var(--gray-9)',
              transform: `scale(${size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8})`,
              opacity: isLoading ? 0.3 : isStale ? 0.6 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {getEntityIcon(entity)}
          </Box>
          {isLoading && (
            <Box
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Spinner
                size={cardSize.fontSize as '1' | '2' | '3'}
                style={
                  {
                    '--spinner-track-color': 'var(--gray-a6)',
                    '--spinner-fill-color': isOn ? 'var(--amber-9)' : 'var(--gray-9)',
                  } as React.CSSProperties
                }
              />
            </Box>
          )}
        </Box>

        <Text
          size={cardSize.fontSize as '1' | '2' | '3'}
          weight={isOn ? 'medium' : 'regular'}
          align="center"
          style={{
            color: isOn ? 'var(--amber-11)' : undefined,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: isLoading ? 0.7 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {friendlyName}
        </Text>

        <Text
          size="1"
          color={error ? 'red' : isOn ? 'amber' : 'gray'}
          weight="medium"
          style={{
            opacity: isLoading ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {error ? 'ERROR' : entity.state.toUpperCase()}
        </Text>
      </Flex>
    </Card>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const ButtonCard = memo(ButtonCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
