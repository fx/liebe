import { Flex, Text, Box, IconButton } from '@radix-ui/themes'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { GridCardWithComponents as GridCard } from './GridCard'
import { SkeletonCard, ErrorDisplay } from './ui'
import { useDashboardStore } from '~/store'

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
// const SUPPORT_TARGET_HUMIDITY = 4
// const SUPPORT_FAN_MODE = 8
// const SUPPORT_PRESET_MODE = 16
// const SUPPORT_SWING_MODE = 32
// const SUPPORT_AUX_HEAT = 64

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

// Helper function to create SVG arc path
function createArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180

  const x1 = centerX + radius * Math.cos(startRad)
  const y1 = centerY + radius * Math.sin(startRad)
  const x2 = centerX + radius * Math.cos(endRad)
  const y2 = centerY + radius * Math.sin(endRad)

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`
}

function ClimateCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: ClimateCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, callService, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  // Drag state for temperature control
  const [isDragging, setIsDragging] = useState<'heat' | 'cool' | null>(null)
  const [dragTempLow, setDragTempLow] = useState<number | null>(null)
  const [dragTempHigh, setDragTempHigh] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const climateAttributes = entity?.attributes as ClimateAttributes | undefined
  const supportedFeatures = climateAttributes?.supported_features ?? 0

  // Check supported features
  const supportsTargetTemp = supportedFeatures & SUPPORT_TARGET_TEMPERATURE
  const supportsTargetTempRange = supportedFeatures & SUPPORT_TARGET_TEMPERATURE_RANGE
  // const supportsFanMode = supportedFeatures & SUPPORT_FAN_MODE
  // const supportsPresetMode = supportedFeatures & SUPPORT_PRESET_MODE
  // const supportsSwingMode = supportedFeatures & SUPPORT_SWING_MODE
  // const supportsAuxHeat = supportedFeatures & SUPPORT_AUX_HEAT

  // Get current state - Home Assistant stores HVAC mode in entity.state
  const hvacMode = entity?.state ?? 'off'
  const hvacAction = climateAttributes?.hvac_action

  // Get temperature settings
  const currentTemp = climateAttributes?.current_temperature
  const targetTemp = climateAttributes?.temperature
  const targetTempHigh = climateAttributes?.target_temp_high
  const targetTempLow = climateAttributes?.target_temp_low
  const minTemp = climateAttributes?.min_temp ?? 7
  const maxTemp = climateAttributes?.max_temp ?? 35
  const tempStep = climateAttributes?.target_temp_step ?? 0.5
  const tempUnit = climateAttributes?.temperature_unit ?? '°C'

  // const fanMode = climateAttributes?.fan_mode
  // const presetMode = climateAttributes?.preset_mode

  const handleHvacModeChange = useCallback(
    async (newMode: string) => {
      if (isLoading) return
      if (error) clearError()
      await callService({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId,
        data: {
          hvac_mode: newMode,
        },
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
        // For heat_cool mode, this shouldn't be called directly
        // Use the separate heat/cool controls instead
        return
      } else {
        await callService({
          domain: 'climate',
          service: 'set_temperature',
          entityId,
          data: {
            temperature: clampedTemp,
          },
        })
      }
    },
    [
      entityId,
      callService,
      isLoading,
      error,
      clearError,
      minTemp,
      maxTemp,
      supportsTargetTempRange,
      hvacMode,
    ]
  )

  const handleHeatCoolTemperatureChange = useCallback(
    async (newLow?: number, newHigh?: number) => {
      if (isLoading) return
      if (error) clearError()

      const clampedLow =
        newLow !== undefined ? Math.max(minTemp, Math.min(maxTemp, newLow)) : (targetTempLow ?? 20)
      const clampedHigh =
        newHigh !== undefined
          ? Math.max(minTemp, Math.min(maxTemp, newHigh))
          : (targetTempHigh ?? 24)

      // Ensure low is less than high
      if (clampedLow >= clampedHigh) return

      await callService({
        domain: 'climate',
        service: 'set_temperature',
        entityId,
        data: {
          target_temp_low: clampedLow,
          target_temp_high: clampedHigh,
        },
      })
    },
    [
      entityId,
      callService,
      isLoading,
      error,
      clearError,
      minTemp,
      maxTemp,
      targetTempLow,
      targetTempHigh,
    ]
  )

  // const handleFanModeChange = useCallback(
  //   async (newMode: string) => {
  //     if (isLoading) return
  //     if (error) clearError()
  //     await callService({
  //       domain: 'climate',
  //       service: 'set_fan_mode',
  //       entityId,
  //       data: {
  //         fan_mode: newMode,
  //       },
  //     })
  //   },
  //   [entityId, callService, isLoading, error, clearError]
  // )

  const getStatusColor = useMemo(() => {
    if (hvacAction === 'heating') return 'orange'
    if (hvacAction === 'cooling') return 'blue'
    if (hvacAction === 'drying') return 'yellow'
    if (hvacAction === 'fan') return 'cyan'
    if (hvacMode !== 'off') return HVAC_MODES[hvacMode as keyof typeof HVAC_MODES]?.color ?? 'gray'
    return 'gray'
  }, [hvacMode, hvacAction])

  // Calculate temperature percentages for arc display
  const tempPercentages = useMemo(() => {
    const range = maxTemp - minTemp

    if (hvacMode === 'off') return { heat: 0, cool: 0 }

    if (hvacMode === 'heat_cool') {
      const lowTemp = dragTempLow ?? targetTempLow
      const highTemp = dragTempHigh ?? targetTempHigh
      if (lowTemp && highTemp) {
        return {
          heat: ((lowTemp - minTemp) / range) * 100,
          cool: ((highTemp - minTemp) / range) * 100,
        }
      }
    }

    if (targetTemp) {
      const percentage = ((targetTemp - minTemp) / range) * 100
      return {
        heat: hvacMode === 'heat' ? percentage : 0,
        cool: hvacMode === 'cool' ? percentage : 0,
      }
    }

    return { heat: 0, cool: 0 }
  }, [
    targetTemp,
    targetTempLow,
    targetTempHigh,
    minTemp,
    maxTemp,
    hvacMode,
    dragTempLow,
    dragTempHigh,
  ])

  // Arc parameters
  const arcRadius = size === 'large' ? 90 : size === 'medium' ? 70 : 50
  const strokeWidth = 8
  const centerX = arcRadius + strokeWidth
  const centerY = arcRadius + strokeWidth
  const svgSize = (arcRadius + strokeWidth) * 2

  // Convert percentages to angles
  const arcStartAngle = 130
  const arcEndAngle = 410
  const arcRange = arcEndAngle - arcStartAngle

  // For heat/cool mode: heat goes from left (130°), cool goes from right (410°)
  const heatAngle = arcStartAngle + (tempPercentages.heat / 100) * arcRange
  const coolAngle = arcEndAngle - ((100 - tempPercentages.cool) / 100) * arcRange

  // Convert angle to temperature
  const angleToTemp = useCallback(
    (angle: number): number => {
      const normalizedAngle = angle - arcStartAngle
      const percentage = normalizedAngle / arcRange
      return minTemp + percentage * (maxTemp - minTemp)
    },
    [arcStartAngle, arcRange, minTemp, maxTemp]
  )

  // Get angle from mouse/touch position
  const getAngleFromPosition = useCallback(
    (clientX: number, clientY: number): number => {
      if (!svgRef.current) return 0

      const rect = svgRef.current.getBoundingClientRect()
      const x = clientX - rect.left - centerX
      const y = clientY - rect.top - centerY

      let angle = Math.atan2(y, x) * (180 / Math.PI)
      // Convert to 0-360 range
      if (angle < 0) angle += 360

      // Our arc goes from 130° to 410° (which is 50° in the next rotation)
      // Handle the wraparound
      if (angle < 90) angle += 360 // Convert angles like 50° to 410°

      // Clamp to our arc range
      angle = Math.max(arcStartAngle, Math.min(arcEndAngle, angle))

      return angle
    },
    [centerX, centerY, arcStartAngle, arcEndAngle]
  )

  // Handle drag start
  const handleDragStart = useCallback(
    (type: 'heat' | 'cool', event: React.MouseEvent | React.TouchEvent) => {
      if (hvacMode !== 'heat_cool') return
      event.preventDefault()
      setIsDragging(type)
      // Initialize drag temperatures
      setDragTempLow(targetTempLow ?? 20)
      setDragTempHigh(targetTempHigh ?? 24)
    },
    [hvacMode, targetTempLow, targetTempHigh]
  )

  // Handle drag move
  const handleDragMove = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!isDragging || hvacMode !== 'heat_cool') return

      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
      const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

      const angle = getAngleFromPosition(clientX, clientY)
      const temp = angleToTemp(angle)

      if (isDragging === 'heat') {
        const newLow = Math.round(temp / tempStep) * tempStep
        const currentHigh = dragTempHigh ?? targetTempHigh ?? 24
        if (newLow < currentHigh - tempStep) {
          setDragTempLow(newLow)
        }
      } else if (isDragging === 'cool') {
        const newHigh = Math.round(temp / tempStep) * tempStep
        const currentLow = dragTempLow ?? targetTempLow ?? 20
        if (newHigh > currentLow + tempStep) {
          setDragTempHigh(newHigh)
        }
      }
    },
    [
      isDragging,
      hvacMode,
      getAngleFromPosition,
      angleToTemp,
      tempStep,
      targetTempHigh,
      targetTempLow,
      dragTempLow,
      dragTempHigh,
    ]
  )

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (isDragging && (dragTempLow !== null || dragTempHigh !== null)) {
      // Call the API with the final temperatures
      handleHeatCoolTemperatureChange(dragTempLow ?? targetTempLow, dragTempHigh ?? targetTempHigh)
    }
    setIsDragging(null)
    setDragTempLow(null)
    setDragTempHigh(null)
  }, [
    isDragging,
    dragTempLow,
    dragTempHigh,
    targetTempLow,
    targetTempHigh,
    handleHeatCoolTemperatureChange,
  ])

  // Set up drag event listeners
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
      const handleTouchMove = (e: TouchEvent) => handleDragMove(e)
      const handleEnd = () => handleDragEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('mouseup', handleEnd)
      document.addEventListener('touchend', handleEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('mouseup', handleEnd)
        document.removeEventListener('touchend', handleEnd)
      }
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={3} showButton={true} />
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
    small: { p: '2', iconSize: '16', fontSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3' },
  }[size]

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id

  return (
    <GridCard
      size={size}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
      className="climate-card"
    >
      <Flex
        direction="column"
        align="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '320px' : size === 'medium' ? '280px' : '220px' }}
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
            marginBottom: '8px',
          }}
        >
          {friendlyName}
        </Text>

        {/* Circular temperature display */}
        <Box style={{ position: 'relative', width: `${svgSize}px`, height: `${svgSize}px` }}>
          {/* SVG Arc */}
          <svg
            ref={svgRef}
            width={svgSize}
            height={svgSize}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Background arc */}
            <path
              d={createArcPath(centerX, centerY, arcRadius, arcStartAngle, arcEndAngle)}
              fill="none"
              stroke="var(--gray-6)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Temperature arcs */}
            {hvacMode === 'heat_cool' && targetTempLow && targetTempHigh ? (
              <>
                {/* Heat arc (from left) */}
                <path
                  d={createArcPath(centerX, centerY, arcRadius, arcStartAngle, heatAngle)}
                  fill="none"
                  stroke="var(--orange-9)"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Cool arc (from right) */}
                <path
                  d={createArcPath(centerX, centerY, arcRadius, coolAngle, arcEndAngle)}
                  fill="none"
                  stroke="var(--blue-9)"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Heat indicator dot */}
                <circle
                  cx={centerX + arcRadius * Math.cos((heatAngle * Math.PI) / 180)}
                  cy={centerY + arcRadius * Math.sin((heatAngle * Math.PI) / 180)}
                  r={strokeWidth / 2 + 4}
                  fill="white"
                  stroke="var(--orange-9)"
                  strokeWidth="3"
                  style={{
                    cursor: 'grab',
                    filter:
                      isDragging === 'heat' ? 'drop-shadow(0 0 8px var(--orange-9))' : undefined,
                  }}
                  onMouseDown={(e) => handleDragStart('heat', e)}
                  onTouchStart={(e) => handleDragStart('heat', e)}
                />

                {/* Cool indicator dot */}
                <circle
                  cx={centerX + arcRadius * Math.cos((coolAngle * Math.PI) / 180)}
                  cy={centerY + arcRadius * Math.sin((coolAngle * Math.PI) / 180)}
                  r={strokeWidth / 2 + 4}
                  fill="white"
                  stroke="var(--blue-9)"
                  strokeWidth="3"
                  style={{
                    cursor: 'grab',
                    filter:
                      isDragging === 'cool' ? 'drop-shadow(0 0 8px var(--blue-9))' : undefined,
                  }}
                  onMouseDown={(e) => handleDragStart('cool', e)}
                  onTouchStart={(e) => handleDragStart('cool', e)}
                />

                {/* Temperature labels */}
                {(dragTempLow ?? targetTempLow) !== undefined && (
                  <text
                    x={centerX + (arcRadius - 20) * Math.cos((heatAngle * Math.PI) / 180)}
                    y={centerY + (arcRadius - 20) * Math.sin((heatAngle * Math.PI) / 180)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--orange-9)"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {(dragTempLow ?? targetTempLow)?.toFixed(1)}°
                  </text>
                )}
                {(dragTempHigh ?? targetTempHigh) !== undefined && (
                  <text
                    x={centerX + (arcRadius - 20) * Math.cos((coolAngle * Math.PI) / 180)}
                    y={centerY + (arcRadius - 20) * Math.sin((coolAngle * Math.PI) / 180)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--blue-9)"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {(dragTempHigh ?? targetTempHigh)?.toFixed(1)}°
                  </text>
                )}
              </>
            ) : hvacMode !== 'off' && (targetTemp || targetTempLow || targetTempHigh) ? (
              <>
                {/* Single temperature arc */}
                <path
                  d={createArcPath(
                    centerX,
                    centerY,
                    arcRadius,
                    arcStartAngle,
                    hvacMode === 'heat'
                      ? heatAngle
                      : hvacMode === 'cool'
                        ? coolAngle
                        : arcStartAngle
                  )}
                  fill="none"
                  stroke={`var(--${getStatusColor}-9)`}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Temperature indicator dot */}
                <circle
                  cx={
                    centerX +
                    arcRadius *
                      Math.cos(
                        ((hvacMode === 'heat'
                          ? heatAngle
                          : hvacMode === 'cool'
                            ? coolAngle
                            : arcStartAngle) *
                          Math.PI) /
                          180
                      )
                  }
                  cy={
                    centerY +
                    arcRadius *
                      Math.sin(
                        ((hvacMode === 'heat'
                          ? heatAngle
                          : hvacMode === 'cool'
                            ? coolAngle
                            : arcStartAngle) *
                          Math.PI) /
                          180
                      )
                  }
                  r={strokeWidth / 2 + 2}
                  fill="white"
                  stroke={`var(--${getStatusColor}-9)`}
                  strokeWidth="2"
                />
              </>
            ) : null}
          </svg>

          {/* Center content */}
          <Flex
            direction="column"
            align="center"
            justify="center"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            {/* Status text */}
            {hvacAction && (
              <Text
                size="1"
                color={
                  getStatusColor as
                    | 'gray'
                    | 'orange'
                    | 'blue'
                    | 'green'
                    | 'indigo'
                    | 'yellow'
                    | 'cyan'
                }
                weight="medium"
                style={{ textTransform: 'capitalize', marginBottom: '4px' }}
              >
                {hvacAction.replace(/_/g, ' ')}
              </Text>
            )}

            {/* Current temperature */}
            {currentTemp !== undefined && (
              <Text
                size={size === 'large' ? '8' : size === 'medium' ? '7' : '6'}
                weight="bold"
                style={{ lineHeight: 1 }}
              >
                {Math.round(currentTemp)}
                <Text
                  size={size === 'large' ? '5' : '4'}
                  as="span"
                  style={{ verticalAlign: 'super' }}
                >
                  {tempUnit}
                </Text>
              </Text>
            )}

            {/* Target temperature */}
            {supportsTargetTemp && hvacMode !== 'off' && (
              <Flex align="center" gap="1" style={{ marginTop: '4px' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--blue-9)">
                  <path
                    d="M8 3v10M4 9l4-4 4 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                <Text size="2" color="blue">
                  {supportsTargetTempRange &&
                  hvacMode === 'heat_cool' &&
                  (dragTempLow ?? targetTempLow) &&
                  (dragTempHigh ?? targetTempHigh)
                    ? `${(dragTempLow ?? targetTempLow)?.toFixed(1)} - ${(dragTempHigh ?? targetTempHigh)?.toFixed(1)}${tempUnit}`
                    : `${targetTemp?.toFixed(1)}${tempUnit}`}
                </Text>
              </Flex>
            )}
          </Flex>
        </Box>

        {/* Temperature controls */}
        {!isEditMode && supportsTargetTemp && hvacMode !== 'off' && hvacMode !== 'heat_cool' && (
          <Flex align="center" gap="4" style={{ marginTop: '16px' }}>
            <IconButton
              size="3"
              variant="outline"
              radius="full"
              onClick={() => handleTemperatureChange((targetTemp ?? 20) - tempStep)}
              disabled={isLoading || (targetTemp ?? 20) <= minTemp}
              aria-label="Decrease temperature"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: 'var(--gray-2)',
                borderColor: 'var(--gray-6)',
              }}
            >
              <MinusIcon width="20" height="20" />
            </IconButton>

            <IconButton
              size="3"
              variant="outline"
              radius="full"
              onClick={() => handleTemperatureChange((targetTemp ?? 20) + tempStep)}
              disabled={isLoading || (targetTemp ?? 20) >= maxTemp}
              aria-label="Increase temperature"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: 'var(--gray-2)',
                borderColor: 'var(--gray-6)',
              }}
            >
              <PlusIcon width="20" height="20" />
            </IconButton>
          </Flex>
        )}

        {/* Instructions for heat/cool mode */}
        {!isEditMode && hvacMode === 'heat_cool' && (
          <Text size="1" color="gray" align="center" style={{ marginTop: '8px' }}>
            Drag the orange and blue dots to adjust temperatures
          </Text>
        )}

        {/* HVAC Mode buttons */}
        {!isEditMode && climateAttributes?.hvac_modes && (
          <Flex gap="2" wrap="wrap" justify="center" style={{ marginTop: 'auto' }}>
            {climateAttributes.hvac_modes.map((mode) => {
              const modeConfig = HVAC_MODES[mode as keyof typeof HVAC_MODES]
              if (!modeConfig) return null

              return (
                <Flex key={mode} direction="column" align="center" gap="1">
                  <IconButton
                    size="3"
                    variant={hvacMode === mode ? 'solid' : 'outline'}
                    color={
                      hvacMode === mode
                        ? (modeConfig.color as
                            | 'orange'
                            | 'blue'
                            | 'green'
                            | 'indigo'
                            | 'yellow'
                            | 'cyan'
                            | 'gray')
                        : 'gray'
                    }
                    onClick={() => handleHvacModeChange(mode)}
                    disabled={isLoading}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderWidth: hvacMode === mode ? '2px' : '1px',
                    }}
                    radius="full"
                  >
                    {mode === 'off' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M8 8l8 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : mode === 'heat' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 3C9 3 7 6 7 9c0 2.5 1 4.5 2.5 6S12 18 12 18s1-.5 2.5-1.5S17 11.5 17 9c0-3-2-6-5-6z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      </svg>
                    ) : mode === 'cool' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : mode === 'auto' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <circle
                          cx="12"
                          cy="12"
                          r="8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M12 8v8M8 12h8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <text
                          x="12"
                          y="12"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="8"
                          fill="currentColor"
                          fontWeight="bold"
                        >
                          A
                        </text>
                      </svg>
                    ) : mode === 'heat_cool' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 3C9 3 7 6 7 9c0 2.5 1 4.5 2.5 6S12 18 12 18"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                        <path
                          d="M12 2v20M12 12h10M14 7l7 7M21 7l-7 7"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : mode === 'dry' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 3l-5 9h10L12 3zM7 14c0 2.8 2.2 5 5 5s5-2.2 5-5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : mode === 'fan_only' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="3" fill="currentColor" />
                        <path
                          d="M12 2c0 3-2 4-2 4s4-1 4 2-2 4-2 4 4-1 4 2-2 4-2 4 4-1 4 2M12 22c0-3-2-4-2-4s4 1 4-2-2-4-2-4 4 1 4-2-2-4-2-4 4 1 4-2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      </svg>
                    ) : (
                      <Text size="2" weight="bold">
                        {modeConfig.label.substring(0, 2)}
                      </Text>
                    )}
                  </IconButton>
                  <Text
                    size="1"
                    color={
                      hvacMode === mode
                        ? (modeConfig.color as
                            | 'orange'
                            | 'blue'
                            | 'green'
                            | 'indigo'
                            | 'yellow'
                            | 'cyan'
                            | 'gray')
                        : 'gray'
                    }
                    weight={hvacMode === mode ? 'bold' : 'regular'}
                  >
                    {modeConfig.label}
                  </Text>
                </Flex>
              )
            })}
          </Flex>
        )}
      </Flex>
    </GridCard>
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
