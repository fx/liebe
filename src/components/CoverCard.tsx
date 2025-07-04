import { Flex, Text, Box, IconButton, Button } from '@radix-ui/themes'
import * as Slider from '@radix-ui/react-slider'
import {
  CaretUpIcon,
  CaretDownIcon,
  PauseIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore } from '~/store'

interface CoverCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

// Cover supported features bit flags from Home Assistant
const SUPPORT_OPEN = 1
const SUPPORT_CLOSE = 2
const SUPPORT_SET_POSITION = 4
const SUPPORT_STOP = 8
const SUPPORT_OPEN_TILT = 16
const SUPPORT_CLOSE_TILT = 32
const SUPPORT_SET_TILT_POSITION = 64

interface CoverAttributes {
  current_position?: number
  current_tilt_position?: number
  position?: number
  tilt_position?: number
  supported_features?: number
  device_class?: string
}

function CoverCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: CoverCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, callService, clearError } = useServiceCall()

  // Local state for sliders while dragging
  const [localPosition, setLocalPosition] = useState<number | null>(null)
  const [localTiltPosition, setLocalTiltPosition] = useState<number | null>(null)
  const [isDraggingPosition, setIsDraggingPosition] = useState(false)
  const [isDraggingTilt, setIsDraggingTilt] = useState(false)

  const coverAttributes = entity?.attributes as CoverAttributes | undefined
  const supportedFeatures = coverAttributes?.supported_features ?? 0

  // Feature support checks
  const supportsOpen = supportedFeatures & SUPPORT_OPEN
  const supportsClose = supportedFeatures & SUPPORT_CLOSE
  const supportsSetPosition = supportedFeatures & SUPPORT_SET_POSITION
  const supportsStop = supportedFeatures & SUPPORT_STOP
  const supportsOpenTilt = supportedFeatures & SUPPORT_OPEN_TILT
  const supportsCloseTilt = supportedFeatures & SUPPORT_CLOSE_TILT
  const supportsSetTiltPosition = supportedFeatures & SUPPORT_SET_TILT_POSITION
  const supportsTilt = supportsOpenTilt || supportsCloseTilt || supportsSetTiltPosition

  // Get current position (0-100 scale from HA)
  const currentPosition = useMemo(() => {
    return coverAttributes?.current_position ?? coverAttributes?.position ?? 0
  }, [coverAttributes?.current_position, coverAttributes?.position])

  const currentTiltPosition = useMemo(() => {
    return coverAttributes?.current_tilt_position ?? coverAttributes?.tilt_position ?? 0
  }, [coverAttributes?.current_tilt_position, coverAttributes?.tilt_position])

  const displayPosition =
    isDraggingPosition && localPosition !== null ? localPosition : currentPosition
  const displayTiltPosition =
    isDraggingTilt && localTiltPosition !== null ? localTiltPosition : currentTiltPosition

  // Determine if cover is open, closed, or in between
  const coverState = useMemo(() => {
    if (!entity) return 'unknown'
    if (entity.state === 'opening') return 'opening'
    if (entity.state === 'closing') return 'closing'
    if (entity.state === 'open' || currentPosition > 0) return 'open'
    if (entity.state === 'closed' || currentPosition === 0) return 'closed'
    return entity.state
  }, [entity, currentPosition])

  const isMoving = coverState === 'opening' || coverState === 'closing'

  // Visual state color based on position and state
  const stateColor = useMemo(() => {
    if (isMoving) return 'blue'
    if (coverState === 'open' || currentPosition > 50) return 'green'
    if (coverState === 'closed' || currentPosition === 0) return 'gray'
    return 'orange'
  }, [coverState, currentPosition, isMoving])

  // Service call handlers
  const handleOpen = useCallback(async () => {
    if (isLoading) return
    if (error) clearError()
    await callService({
      domain: 'cover',
      service: 'open_cover',
      entityId,
    })
  }, [callService, entityId, error, isLoading, clearError])

  const handleClose = useCallback(async () => {
    if (isLoading) return
    if (error) clearError()
    await callService({
      domain: 'cover',
      service: 'close_cover',
      entityId,
    })
  }, [callService, entityId, error, isLoading, clearError])

  const handleStop = useCallback(async () => {
    if (isLoading) return
    if (error) clearError()
    await callService({
      domain: 'cover',
      service: 'stop_cover',
      entityId,
    })
  }, [callService, entityId, error, isLoading, clearError])

  const handlePositionChange = useCallback((value: number[]) => {
    setLocalPosition(value[0])
  }, [])

  const handlePositionCommit = useCallback(
    async (value: number[]) => {
      setIsDraggingPosition(false)
      await callService({
        domain: 'cover',
        service: 'set_cover_position',
        entityId,
        data: { position: value[0] },
      })
      setLocalPosition(null)
    },
    [callService, entityId]
  )

  const handleTiltChange = useCallback((value: number[]) => {
    setLocalTiltPosition(value[0])
  }, [])

  const handleTiltCommit = useCallback(
    async (value: number[]) => {
      setIsDraggingTilt(false)
      await callService({
        domain: 'cover',
        service: 'set_cover_tilt_position',
        entityId,
        data: { tilt_position: value[0] },
      })
      setLocalTiltPosition(null)
    },
    [callService, entityId]
  )

  const handleOpenTilt = useCallback(async () => {
    if (isLoading) return
    if (error) clearError()
    await callService({
      domain: 'cover',
      service: 'open_cover_tilt',
      entityId,
    })
  }, [callService, entityId, error, isLoading, clearError])

  const handleCloseTilt = useCallback(async () => {
    if (isLoading) return
    if (error) clearError()
    await callService({
      domain: 'cover',
      service: 'close_cover_tilt',
      entityId,
    })
  }, [callService, entityId, error, isLoading, clearError])

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={2} showButton={true} />
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

  const buttonSize = {
    small: '1',
    medium: '2',
    large: '3',
  }[size] as '1' | '2' | '3'

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

  return (
    <GridCard
      size={size}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={coverState === 'open' || currentPosition > 0}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      title={error || (isStale ? 'Entity data may be outdated' : undefined)}
      className="cover-card"
      style={{
        borderWidth: isSelected || error || isStale ? '2px' : '1px',
      }}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        style={{ minHeight: size === 'large' ? '200px' : size === 'medium' ? '180px' : '160px' }}
      >
        {/* Name */}
        <GridCard.Title>
          <Text weight="medium">{friendlyName}</Text>
        </GridCard.Title>

        {/* Control buttons */}
        <GridCard.Controls>
          <Flex gap="2" align="center">
            {supportsOpen && (
              <IconButton
                size={buttonSize}
                variant="soft"
                color={stateColor}
                onClick={handleOpen}
                disabled={isLoading || coverState === 'open' || currentPosition === 100}
                aria-label="Open cover"
              >
                <CaretUpIcon />
              </IconButton>
            )}
            {supportsStop && (
              <IconButton
                size={buttonSize}
                variant="soft"
                color={isMoving ? 'red' : stateColor}
                onClick={handleStop}
                disabled={isLoading || !isMoving}
                aria-label="Stop cover"
              >
                <PauseIcon />
              </IconButton>
            )}
            {supportsClose && (
              <IconButton
                size={buttonSize}
                variant="soft"
                color={stateColor}
                onClick={handleClose}
                disabled={isLoading || coverState === 'closed' || currentPosition === 0}
                aria-label="Close cover"
              >
                <CaretDownIcon />
              </IconButton>
            )}
          </Flex>
        </GridCard.Controls>
        )}

        {/* Position slider */}
        {!isEditMode && supportsSetPosition && (
          <Box style={{ width: '100%' }}>
            <Flex align="center" gap="2">
              <Text size="1" color="gray" style={{ minWidth: '35px' }}>
                {displayPosition}%
              </Text>
              <Slider.Root
                className="SliderRoot"
                value={[displayPosition]}
                onValueChange={handlePositionChange}
                onValueCommit={handlePositionCommit}
                onPointerDown={() => setIsDraggingPosition(true)}
                onPointerUp={() => setIsDraggingPosition(false)}
                max={100}
                step={1}
                aria-label="Position"
                style={{ flex: 1 }}
              >
                <Slider.Track className="SliderTrack">
                  <Slider.Range className="SliderRange" />
                </Slider.Track>
                <Slider.Thumb className="SliderThumb" />
              </Slider.Root>
            </Flex>
          </Box>
        )}

        {/* Tilt controls */}
        {supportsTilt && (
          <Box style={{ width: '100%' }}>
            <Flex direction="column" gap="2">
              <Text size="1" color="gray">
                Tilt
              </Text>
              {/* Tilt buttons */}
              <Flex gap="2" justify="center">
                {supportsOpenTilt && (
                  <Button size="1" variant="soft" onClick={handleOpenTilt} disabled={isLoading}>
                    <ChevronRightIcon />
                  </Button>
                )}
                {supportsCloseTilt && (
                  <Button size="1" variant="soft" onClick={handleCloseTilt} disabled={isLoading}>
                    <ChevronLeftIcon />
                  </Button>
                )}
              </Flex>
              {/* Tilt position slider */}
              {supportsSetTiltPosition && (
                <Flex align="center" gap="2">
                  <Text size="1" color="gray" style={{ minWidth: '35px' }}>
                    {displayTiltPosition}%
                  </Text>
                  <Slider.Root
                    className="SliderRoot"
                    value={[displayTiltPosition]}
                    onValueChange={handleTiltChange}
                    onValueCommit={handleTiltCommit}
                    onPointerDown={() => setIsDraggingTilt(true)}
                    onPointerUp={() => setIsDraggingTilt(false)}
                    max={100}
                    step={1}
                    aria-label="Tilt position"
                    style={{ flex: 1 }}
                  >
                    <Slider.Track className="SliderTrack">
                      <Slider.Range className="SliderRange" />
                    </Slider.Track>
                    <Slider.Thumb className="SliderThumb" />
                  </Slider.Root>
                </Flex>
              )}
            </Flex>
          </Box>
        )}

        {/* Status */}
        <GridCard.Status>
          <Text size="1" color={error ? 'red' : stateColor} weight="medium">
            {error
              ? 'ERROR'
              : isMoving
                ? coverState.toUpperCase()
                : currentPosition > 0 && currentPosition < 100
                  ? `${currentPosition}% OPEN`
                  : coverState.toUpperCase()}
          </Text>
        </GridCard.Status>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const CoverCard = memo(CoverCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
