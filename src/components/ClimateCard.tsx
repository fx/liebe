import { Card, Flex, Text, Spinner, Box, IconButton, Select } from '@radix-ui/themes'
import { Cross2Icon, ChevronUpIcon, ChevronDownIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useCallback, useMemo } from 'react'
import { useDashboardStore } from '~/store'
import './ClimateCard.css'

interface ClimateCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

// Climate supported features bit flags from Home Assistant
const SUPPORT_TARGET_TEMPERATURE = 1
const SUPPORT_TARGET_TEMPERATURE_RANGE = 2
const SUPPORT_TARGET_HUMIDITY = 4
const SUPPORT_FAN_MODE = 8
const SUPPORT_PRESET_MODE = 16
const SUPPORT_SWING_MODE = 32
const SUPPORT_AUX_HEAT = 64

// HVAC modes
const HVAC_MODES = {
  off: { label: 'Off', color: 'gray' },
  heat: { label: 'Heat', color: 'orange' },
  cool: { label: 'Cool', color: 'blue' },
  heat_cool: { label: 'Heat/Cool', color: 'green' },
  auto: { label: 'Auto', color: 'indigo' },
  dry: { label: 'Dry', color: 'yellow' },
  fan_only: { label: 'Fan', color: 'cyan' },
} as const

interface ClimateAttributes {
  current_temperature?: number
  temperature?: number
  target_temp_high?: number
  target_temp_low?: number
  current_humidity?: number
  target_humidity?: number
  hvac_modes?: string[]
  hvac_mode?: string
  hvac_action?: string
  fan_modes?: string[]
  fan_mode?: string
  preset_modes?: string[]
  preset_mode?: string
  swing_modes?: string[]
  swing_mode?: string
  aux_heat?: boolean
  min_temp?: number
  max_temp?: number
  min_humidity?: number
  max_humidity?: number
  target_temp_step?: number
  supported_features?: number
  temperature_unit?: string
}

function ClimateCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: ClimateCardProps) {
  const { entity, isConnected, isStale } = useEntity(entityId)
  const { loading: isLoading, error, callService, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const climateAttributes = entity?.attributes as ClimateAttributes | undefined
  const supportedFeatures = climateAttributes?.supported_features ?? 0

  // Check supported features
  const supportsTargetTemp = supportedFeatures & SUPPORT_TARGET_TEMPERATURE
  const supportsTargetTempRange = supportedFeatures & SUPPORT_TARGET_TEMPERATURE_RANGE
  const supportsFanMode = supportedFeatures & SUPPORT_FAN_MODE
  const supportsPresetMode = supportedFeatures & SUPPORT_PRESET_MODE
  const supportsSwingMode = supportedFeatures & SUPPORT_SWING_MODE
  const supportsAuxHeat = supportedFeatures & SUPPORT_AUX_HEAT

  // Get temperature settings
  const currentTemp = climateAttributes?.current_temperature
  const targetTemp = climateAttributes?.temperature
  const targetTempHigh = climateAttributes?.target_temp_high
  const targetTempLow = climateAttributes?.target_temp_low
  const minTemp = climateAttributes?.min_temp ?? 7
  const maxTemp = climateAttributes?.max_temp ?? 35
  const tempStep = climateAttributes?.target_temp_step ?? 0.5
  const tempUnit = climateAttributes?.temperature_unit ?? '°C'

  // Get current state
  const hvacMode = climateAttributes?.hvac_mode ?? 'off'
  const hvacAction = climateAttributes?.hvac_action
  const fanMode = climateAttributes?.fan_mode
  const presetMode = climateAttributes?.preset_mode

  const handleHvacModeChange = useCallback(
    async (newMode: string) => {
      if (isLoading) return
      if (error) clearError()
      await callService('climate', 'set_hvac_mode', {
        entity_id: entityId,
        hvac_mode: newMode,
      })
    },
    [entityId, callService, isLoading, error, clearError]
  )

  const handleTemperatureChange = useCallback(
    async (newTemp: number) => {
      if (isLoading) return
      if (error) clearError()
      
      const clampedTemp = Math.max(minTemp, Math.min(maxTemp, newTemp))
      
      if (supportsTargetTempRange && hvacMode === 'heat_cool') {
        // For heat_cool mode, adjust the appropriate temperature
        const midpoint = targetTempLow && targetTempHigh 
          ? (targetTempLow + targetTempHigh) / 2 
          : clampedTemp
        
        await callService('climate', 'set_temperature', {
          entity_id: entityId,
          target_temp_low: Math.min(clampedTemp, midpoint),
          target_temp_high: Math.max(clampedTemp, midpoint),
        })
      } else {
        await callService('climate', 'set_temperature', {
          entity_id: entityId,
          temperature: clampedTemp,
        })
      }
    },
    [entityId, callService, isLoading, error, clearError, minTemp, maxTemp, supportsTargetTempRange, hvacMode, targetTempLow, targetTempHigh]
  )

  const handleFanModeChange = useCallback(
    async (newMode: string) => {
      if (isLoading) return
      if (error) clearError()
      await callService('climate', 'set_fan_mode', {
        entity_id: entityId,
        fan_mode: newMode,
      })
    },
    [entityId, callService, isLoading, error, clearError]
  )

  const getStatusColor = useMemo(() => {
    if (hvacAction === 'heating') return 'orange'
    if (hvacAction === 'cooling') return 'blue'
    if (hvacAction === 'drying') return 'yellow'
    if (hvacAction === 'fan') return 'cyan'
    if (hvacMode !== 'off') return HVAC_MODES[hvacMode as keyof typeof HVAC_MODES]?.color ?? 'gray'
    return 'gray'
  }, [hvacMode, hvacAction])

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

  return (
    <Card
      variant="classic"
      className="climate-card"
      style={{
        cursor: isEditMode ? 'move' : 'default',
        backgroundColor: isSelected ? 'var(--blue-3)' : undefined,
        borderColor: isSelected
          ? 'var(--blue-6)'
          : error
            ? 'var(--red-6)'
            : isStale
              ? 'var(--orange-6)'
              : `var(--${getStatusColor}-6)`,
        borderWidth: isSelected || error || isStale || hvacMode !== 'off' ? '2px' : '1px',
        borderStyle: isStale ? 'dashed' : 'solid',
        transition: 'all 0.2s ease',
        opacity: isStale ? 0.8 : 1,
        position: 'relative',
      }}
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : undefined}
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
        gap="3"
        style={{ minHeight: size === 'large' ? '200px' : size === 'medium' ? '180px' : '160px' }}
      >
        {/* Name */}
        <Text
          size={cardSize.fontSize as '1' | '2' | '3'}
          weight="medium"
          align="center"
          style={{
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {friendlyName}
        </Text>

        {/* Temperature display */}
        <Flex direction="column" align="center" gap="2">
          {currentTemp !== undefined && (
            <Text size="5" weight="bold" color={getStatusColor as any}>
              {currentTemp.toFixed(1)}{tempUnit}
            </Text>
          )}
          
          {/* Target temperature display and controls */}
          {!isEditMode && supportsTargetTemp && hvacMode !== 'off' && (
            <Flex align="center" gap="3">
              <IconButton
                size="2"
                variant="soft"
                onClick={() => handleTemperatureChange((targetTemp ?? 20) - tempStep)}
                disabled={isLoading || (targetTemp ?? 20) <= minTemp}
              >
                <ChevronDownIcon />
              </IconButton>
              
              <Text size="3" color="gray">
                {supportsTargetTempRange && hvacMode === 'heat_cool' 
                  ? `${targetTempLow?.toFixed(1)} - ${targetTempHigh?.toFixed(1)}${tempUnit}`
                  : `${targetTemp?.toFixed(1)}${tempUnit}`
                }
              </Text>
              
              <IconButton
                size="2"
                variant="soft"
                onClick={() => handleTemperatureChange((targetTemp ?? 20) + tempStep)}
                disabled={isLoading || (targetTemp ?? 20) >= maxTemp}
              >
                <ChevronUpIcon />
              </IconButton>
            </Flex>
          )}
        </Flex>

        {/* HVAC mode selector */}
        {!isEditMode && climateAttributes?.hvac_modes && (
          <Select.Root value={hvacMode} onValueChange={handleHvacModeChange} disabled={isLoading}>
            <Select.Trigger style={{ width: '100%' }} />
            <Select.Content>
              {climateAttributes.hvac_modes.map((mode) => (
                <Select.Item key={mode} value={mode}>
                  {HVAC_MODES[mode as keyof typeof HVAC_MODES]?.label ?? mode}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}

        {/* Fan mode selector */}
        {!isEditMode && supportsFanMode && climateAttributes?.fan_modes && fanMode && (
          <Select.Root value={fanMode} onValueChange={handleFanModeChange} disabled={isLoading}>
            <Select.Trigger style={{ width: '100%' }} />
            <Select.Content>
              {climateAttributes.fan_modes.map((mode) => (
                <Select.Item key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1).replace(/_/g, ' ')}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}

        {/* Status */}
        {hvacAction && (
          <Text
            size="1"
            color={getStatusColor as any}
            weight="medium"
            align="center"
            style={{
              textTransform: 'uppercase',
            }}
          >
            {hvacAction.replace(/_/g, ' ')}
          </Text>
        )}

        {/* Loading indicator */}
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
                  '--spinner-fill-color': `var(--${getStatusColor}-9)`,
                } as React.CSSProperties
              }
            />
          </Box>
        )}
      </Flex>
    </Card>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const ClimateCard = memo(ClimateCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})