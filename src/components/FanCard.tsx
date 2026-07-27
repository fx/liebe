import { Flex, Box, Select } from '@radix-ui/themes'
import { Fan, Wind } from 'lucide-react'
import { useEntity, useServiceCall } from '~/hooks'
import React, { memo, useCallback } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { Pill, PillGroup } from './anatomy'
import { useDashboardStore } from '~/store'
import type { CardTier } from '~/utils/cardTier'

interface FanCardProps {
  entityId: string
  tier?: CardTier
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
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: FanCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, turnOn, turnOff, callService, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

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

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <GridCard
        domain="fan"
        color="ok"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <Fan size={24} />
          </GridCard.Icon>
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
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
      // Fans take the `ok` triplet in the design system's default mapping
      // ("Locked, home, secure, fan").
      domain="fan"
      color="ok"
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleToggle}
      title={error || undefined}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        // No inner height floor: the shell owns it now, keyed on the tier
        // (`GridCard.css`), so a `glance` tile can actually be one cell tall
        // instead of being propped open from the inside.
      >
        <GridCard.Icon>
          <span className={getAnimationClass()}>
            <Fan size={24} />
          </span>
        </GridCard.Icon>

        <GridCard.Title>{friendlyName}</GridCard.Title>

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
                <PillGroup label="Fan speed">
                  {(
                    [
                      { value: '25', label: 'Low speed (25%)', glyph: 12 },
                      { value: '50', label: 'Medium-low speed (50%)', glyph: 14 },
                      { value: '75', label: 'Medium-high speed (75%)', glyph: 16 },
                      { value: '100', label: 'High speed (100%)', glyph: 18 },
                    ] as const
                  ).map(({ value, label, glyph }) => (
                    <Pill
                      key={value}
                      domain="fan"
                      color="ok"
                      active={selectedButton === value}
                      label={label}
                      hideLabel
                      icon={<Wind size={glyph} />}
                      disabled={isLoading}
                      onClick={() => handleSpeedChange(value)}
                    />
                  ))}
                </PillGroup>
              )
            )}
          </Box>
        )}

        {/* Status text */}
        <GridCard.Status>
          {error
            ? 'ERROR'
            : isOn
              ? currentPresetMode || (displayPercentage > 0 ? `${displayPercentage}%` : 'ON')
              : 'OFF'}
        </GridCard.Status>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedFanCard = memo(FanCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const FanCard = Object.assign(MemoizedFanCard, {
  defaultDimensions: { width: 2, height: 2 },
})
