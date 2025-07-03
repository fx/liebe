import { Card, Flex, Text, Spinner, Box, IconButton, Select } from '@radix-ui/themes'
import { Cross2Icon } from '@radix-ui/react-icons'
import { Fan, Wind } from 'lucide-react'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback } from 'react'
import { useDashboardStore } from '~/store'
import { SkeletonCard, ErrorDisplay } from './ui'
import './FanCard.css'

interface FanCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

// Fan supported features bit flags from Home Assistant
const SUPPORT_SET_SPEED = 1
const SUPPORT_PRESET_MODE = 8

interface FanAttributes {
  speed_list?: string[]
  preset_modes?: string[]
  percentage?: number
  preset_mode?: string
  oscillating?: boolean
  direction?: string
  supported_features?: number
  percentage_step?: number
  friendly_name?: string
}

function FanCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: FanCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, turnOn, turnOff, callService, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  // Local state for speed selection
  const [isChangingSpeed, setIsChangingSpeed] = useState(false)

  const handleSpeedChange = useCallback(
    async (percentage: string) => {
      if (!entity) return

      setIsChangingSpeed(true)
      if (error) clearError()

      const percentageNum = parseInt(percentage, 10)
      if (percentageNum === 0) {
        await turnOff(entity.entity_id)
      } else {
        await callService({
          domain: 'fan',
          service: 'set_percentage',
          data: {
            entity_id: entity.entity_id,
            percentage: percentageNum,
          },
        })
      }
      setIsChangingSpeed(false)
    },
    [entity, callService, turnOff, error, clearError]
  )

  const handlePresetModeChange = useCallback(
    async (presetMode: string) => {
      if (!entity) return

      setIsChangingSpeed(true)
      if (error) clearError()

      await callService({
        domain: 'fan',
        service: 'set_preset_mode',
        data: {
          entity_id: entity.entity_id,
          preset_mode: presetMode,
        },
      })
      setIsChangingSpeed(false)
    },
    [entity, callService, error, clearError]
  )

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
    small: { p: '2', iconSize: '20', fontSize: '1' },
    medium: { p: '3', iconSize: '28', fontSize: '2' },
    large: { p: '4', iconSize: '36', fontSize: '3' },
  }[size]

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <Card variant="classic" style={{ opacity: 0.6, borderStyle: 'dotted' }}>
        <Flex p={cardSize.p} direction="column" align="center" justify="center" gap="2">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
            <Fan size={cardSize.iconSize} />
          </Box>
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
  const fanAttributes = entity.attributes as FanAttributes

  // Check supported features
  const supportsSpeed = (fanAttributes.supported_features ?? 0) & SUPPORT_SET_SPEED
  const supportsPresetMode = (fanAttributes.supported_features ?? 0) & SUPPORT_PRESET_MODE

  // Get current speed/percentage info
  const currentPercentage = fanAttributes.percentage ?? 0
  const currentPresetMode = fanAttributes.preset_mode

  // Determine animation speed class based on percentage
  const getAnimationClass = () => {
    if (!isOn) return ''
    if (currentPercentage >= 66) return 'fan-spin-fast'
    if (currentPercentage >= 33) return 'fan-spin-medium'
    return 'fan-spin-slow'
  }

  const handleToggle = async () => {
    if (isLoading) return
    if (error) clearError()

    if (isOn) {
      await turnOff(entity.entity_id)
    } else {
      // Turn on at medium speed (66%) by default
      await turnOn(entity.entity_id, supportsSpeed ? { percentage: 66 } : undefined)
    }
  }

  return (
    <Card
      variant="classic"
      style={{
        cursor: isLoading ? 'wait' : 'pointer',
        backgroundColor: isSelected ? 'var(--blue-3)' : isOn ? 'var(--cyan-3)' : undefined,
        borderColor: isSelected
          ? 'var(--blue-6)'
          : error
            ? 'var(--red-6)'
            : isStale
              ? 'var(--orange-6)'
              : isOn
                ? 'var(--cyan-6)'
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
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : handleToggle}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
    >
      {/* Drag handle in edit mode */}
      {isEditMode && <div className="grid-item-drag-handle" />}

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
        style={{ minHeight: size === 'large' ? '140px' : size === 'medium' ? '120px' : '100px' }}
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
            className={getAnimationClass()}
            style={{
              color: isStale ? 'var(--orange-9)' : isOn ? 'var(--cyan-9)' : 'var(--gray-9)',
              opacity: isLoading || isChangingSpeed ? 0.3 : isStale ? 0.6 : 1,
              transition: 'opacity 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Fan size={parseInt(cardSize.iconSize)} />
          </Box>
          {(isLoading || isChangingSpeed) && (
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
                    '--spinner-fill-color': isOn ? 'var(--cyan-9)' : 'var(--gray-9)',
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
            color: isOn ? 'var(--cyan-11)' : undefined,
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

        {/* Speed controls when on and supports speed */}
        {isOn && !isEditMode && (supportsSpeed || supportsPresetMode) && (
          <Box style={{ width: '100%', maxWidth: '200px' }} onClick={(e) => e.stopPropagation()}>
            {supportsPresetMode &&
            fanAttributes.preset_modes &&
            fanAttributes.preset_modes.length > 0 ? (
              <Select.Root
                value={currentPresetMode || fanAttributes.preset_modes[0]}
                onValueChange={handlePresetModeChange}
                disabled={isLoading || isChangingSpeed}
              >
                <Select.Trigger style={{ width: '100%' }} aria-label="Select fan preset mode" />
                <Select.Content>
                  {fanAttributes.preset_modes.map((mode) => (
                    <Select.Item key={mode} value={mode}>
                      {mode}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            ) : (
              supportsSpeed && (
                <Flex gap="1" align="center" justify="center">
                  <IconButton
                    size="2"
                    variant={currentPercentage === 0 ? 'solid' : 'soft'}
                    color={currentPercentage === 0 ? 'gray' : 'cyan'}
                    onClick={() => handleSpeedChange('0')}
                    disabled={isLoading || isChangingSpeed}
                    aria-label="Turn off"
                  >
                    <Wind size="14" style={{ opacity: 0.5 }} />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={currentPercentage > 0 && currentPercentage <= 33 ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={() => handleSpeedChange('33')}
                    disabled={isLoading || isChangingSpeed}
                    aria-label="Low speed"
                  >
                    <Wind size="14" />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={currentPercentage > 33 && currentPercentage <= 66 ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={() => handleSpeedChange('66')}
                    disabled={isLoading || isChangingSpeed}
                    aria-label="Medium speed"
                  >
                    <Wind size="16" />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={currentPercentage > 66 ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={() => handleSpeedChange('100')}
                    disabled={isLoading || isChangingSpeed}
                    aria-label="High speed"
                  >
                    <Wind size="18" />
                  </IconButton>
                </Flex>
              )
            )}
          </Box>
        )}

        {/* Status text */}
        <Text
          size="1"
          color={error ? 'red' : isOn ? 'cyan' : 'gray'}
          weight="medium"
          style={{
            opacity: isLoading ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {error
            ? 'ERROR'
            : isOn
              ? currentPresetMode || (currentPercentage > 0 ? `${currentPercentage}%` : 'ON')
              : 'OFF'}
        </Text>
      </Flex>
    </Card>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const FanCard = memo(FanCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
