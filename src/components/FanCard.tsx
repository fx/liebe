import { Flex, Text, Box, IconButton, Select } from '@radix-ui/themes'
import { Fan, Wind } from 'lucide-react'
import { useEntity, useServiceCall } from '~/hooks'
import React, { memo, useCallback, useEffect, useRef } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore } from '~/store'

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
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  // Only track display state on significant changes (not every render)
  const prevDisplayRef = useRef({ displayPercentage: 0, selectedButton: '0' })

  // No separate loading state - use main card loading

  const handleSpeedChange = useCallback(
    async (percentage: string) => {
      if (!entity || isLoading) return

      const percentageNum = parseInt(percentage, 10)

      if (error) clearError()

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
      console.log('🔥 Service call completed')
    },
    [entity, callService, turnOff, error, clearError, isLoading]
  )

  const handlePresetModeChange = useCallback(
    async (presetMode: string) => {
      if (!entity) return

      if (error) clearError()

      await callService({
        domain: 'fan',
        service: 'set_preset_mode',
        data: {
          entity_id: entity.entity_id,
          preset_mode: presetMode,
        },
      })
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

  const iconScale = size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <span
              style={{
                color: 'var(--gray-9)',
                opacity: 0.5,
                transform: `scale(${iconScale})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Fan size={24} />
            </span>
          </GridCard.Icon>
          <GridCard.Title>
            <Text color="gray">{entity.attributes.friendly_name || entity.entity_id}</Text>
          </GridCard.Title>
          <GridCard.Status>
            <Text size="1" color="gray" weight="medium">
              UNAVAILABLE
            </Text>
          </GridCard.Status>
        </Flex>
      </GridCard>
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

  // Use actual speed from entity
  const displayPercentage = currentPercentage

  // Map actual percentage to our button values based on what the fan actually returns
  const getSelectedButton = (percentage: number) => {
    if (percentage === 0) return '0' // Off state (handled by card toggle)
    // Based on your fan's actual behavior:
    if (percentage <= 37) return '25' // Low: 25% and below
    if (percentage <= 62) return '50' // Medium-Low: 50%
    if (percentage <= 87) return '75' // Medium-High: 75%
    return '100' // High: 100%
  }

  const selectedButton = getSelectedButton(displayPercentage)
  if (
    prevDisplayRef.current.displayPercentage !== displayPercentage ||
    prevDisplayRef.current.selectedButton !== selectedButton
  ) {
    prevDisplayRef.current = { displayPercentage, selectedButton }
  }

  // Determine animation speed class based on percentage
  const getAnimationClass = () => {
    if (!isOn) return ''
    const speed = displayPercentage
    if (speed === 0) return ''
    if (speed >= 66) return 'fan-spin-fast'
    if (speed >= 33) return 'fan-spin-medium'
    return 'fan-spin-slow'
  }

  const handleToggle = async () => {
    if (isLoading) return
    if (error) clearError()

    if (isOn) {
      await turnOff(entity.entity_id)
    } else {
      // Turn on at medium speed (50%) by default
      await turnOn(entity.entity_id, supportsSpeed ? { percentage: 50 } : undefined)
    }
  }

  return (
    <GridCard
      size={size}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleToggle}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
      style={{
        backgroundColor: isOn && !isSelected && !error ? 'var(--cyan-3)' : undefined,
        borderColor: isOn && !isSelected && !error && !isStale ? 'var(--cyan-6)' : undefined,
        borderWidth: isSelected || error || isOn || isStale ? '2px' : '1px',
      }}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '140px' : size === 'medium' ? '120px' : '100px' }}
      >
        <GridCard.Icon>
          <span
            className={getAnimationClass()}
            style={{
              color: isStale ? 'var(--orange-9)' : isOn ? 'var(--cyan-9)' : 'var(--gray-9)',
              opacity: isLoading ? 0.3 : isStale ? 0.6 : 1,
              transform: `scale(${iconScale})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity 0.2s ease',
            }}
          >
            <Fan size={24} />
          </span>
        </GridCard.Icon>

        <GridCard.Title>
          <Text
            weight={isOn ? 'medium' : 'regular'}
            style={{
              color: isOn ? 'var(--cyan-11)' : undefined,
              opacity: isLoading ? 0.7 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {friendlyName}
          </Text>
        </GridCard.Title>

        {/* Speed controls when on and supports speed */}
        {!isEditMode && isOn && (supportsSpeed || supportsPresetMode) && (
          <Box style={{ width: '100%', maxWidth: '200px' }} onClick={(e) => e.stopPropagation()}>
            {supportsPresetMode &&
            fanAttributes.preset_modes &&
            fanAttributes.preset_modes.length > 0 ? (
              <Select.Root
                value={currentPresetMode || fanAttributes.preset_modes[0]}
                onValueChange={handlePresetModeChange}
                disabled={isLoading}
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
                <Flex
                  gap="1"
                  align="center"
                  justify="center"
                  style={{ position: 'relative' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconButton
                    size="2"
                    variant={selectedButton === '25' ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSpeedChange('25')
                    }}
                    disabled={isLoading}
                    aria-label="Low speed (25%)"
                    style={{ opacity: isLoading ? 0.7 : 1 }}
                  >
                    <Wind size="12" />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={selectedButton === '50' ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSpeedChange('50')
                    }}
                    disabled={isLoading}
                    aria-label="Medium-low speed (50%)"
                    style={{ opacity: isLoading ? 0.7 : 1 }}
                  >
                    <Wind size="14" />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={selectedButton === '75' ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSpeedChange('75')
                    }}
                    disabled={isLoading}
                    aria-label="Medium-high speed (75%)"
                    style={{ opacity: isLoading ? 0.7 : 1 }}
                  >
                    <Wind size="16" />
                  </IconButton>
                  <IconButton
                    size="2"
                    variant={selectedButton === '100' ? 'solid' : 'soft'}
                    color="cyan"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSpeedChange('100')
                    }}
                    disabled={isLoading}
                    aria-label="High speed (100%)"
                    style={{ opacity: isLoading ? 0.7 : 1 }}
                  >
                    <Wind size="18" />
                  </IconButton>
                </Flex>
              )
            )}
          </Box>
        )}

        {/* Status text */}
        <GridCard.Status>
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
                ? currentPresetMode || (displayPercentage > 0 ? `${displayPercentage}%` : 'ON')
                : 'OFF'}
          </Text>
        </GridCard.Status>
      </Flex>
    </GridCard>
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
