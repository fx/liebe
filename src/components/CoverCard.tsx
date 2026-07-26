import { Flex, Text, Button } from '@radix-ui/themes'
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
import { Pill, PillGroup, Slider } from './anatomy'
import { useDashboardStore } from '~/store'
import type { DomainColorName } from '~/theme/tokens'

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
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

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

  /**
   * Which `--liebe-c-*` triplet the cover's rendered state resolves to.
   *
   * Covers are the `cool` row of the domain-colour table, so every state that
   * carries meaning — moving, or open to any degree — resolves there; a closed
   * cover carries no state and so no hue. Nothing here reaches for `ok`, which
   * the table reserves for locked/home/secure/fan: a cover coloured out of
   * another domain's triplet would not follow a theme remapping `--liebe-c-cool`.
   */
  const stateColor: DomainColorName = useMemo(() => {
    // `coverState` only ever resolves to unknown/opening/closing/open/closed,
    // and anything with a nonzero position is already 'open', so these two
    // branches cover the lot.
    if (isMoving || coverState === 'open') return 'cool'
    return 'default'
  }, [coverState, isMoving])

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

  const handlePositionChange = useCallback((value: number) => {
    // The anatomy slider reports every value the drag passes through, which is
    // also what tells the card a drag is under way.
    setIsDraggingPosition(true)
    setLocalPosition(value)
  }, [])

  const handlePositionCommit = useCallback(
    async (value: number) => {
      setIsDraggingPosition(false)
      await callService({
        domain: 'cover',
        service: 'set_cover_position',
        entityId,
        data: { position: value },
      })
      setLocalPosition(null)
    },
    [callService, entityId]
  )

  const handleTiltChange = useCallback((value: number) => {
    setIsDraggingTilt(true)
    setLocalTiltPosition(value)
  }, [])

  const handleTiltCommit = useCallback(
    async (value: number) => {
      setIsDraggingTilt(false)
      await callService({
        domain: 'cover',
        service: 'set_cover_tilt_position',
        entityId,
        data: { tilt_position: value },
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

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <GridCard
        domain="cover"
        size={size}
        isUnavailable={true}
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
      domain="cover"
      color={stateColor}
      size={size}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={coverState === 'open' || currentPosition > 0}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      title={error || undefined}
      className="cover-card"
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        style={{ minHeight: size === 'large' ? '200px' : size === 'medium' ? '180px' : '160px' }}
      >
        {/* Name */}
        <GridCard.Title>{friendlyName}</GridCard.Title>

        {/* Control buttons */}
        {!isEditMode && (
          <GridCard.Controls>
            {/*
             * Open / stop / close are anatomy pills rather than Radix
             * `IconButton`s: the buttons were coloured by a Radix `color` prop,
             * which keeps its hue when a theme remaps the cover's triplet — the
             * exact breakage the token contract exists to prevent. `hideLabel`
             * keeps the icon-only look while the label stays as the accessible
             * name.
             */}
            <PillGroup label="Cover controls">
              {supportsOpen && (
                <Pill
                  domain="cover"
                  color={stateColor}
                  active={coverState === 'open' || currentPosition === 100}
                  label="Open cover"
                  hideLabel
                  icon={<CaretUpIcon />}
                  onClick={handleOpen}
                  disabled={isLoading || coverState === 'open' || currentPosition === 100}
                />
              )}
              {supportsStop && (
                <Pill
                  domain="cover"
                  color={isMoving ? 'alert' : stateColor}
                  active={isMoving}
                  label="Stop cover"
                  hideLabel
                  icon={<PauseIcon />}
                  onClick={handleStop}
                  disabled={isLoading || !isMoving}
                />
              )}
              {supportsClose && (
                <Pill
                  domain="cover"
                  color={stateColor}
                  active={coverState === 'closed' || currentPosition === 0}
                  label="Close cover"
                  hideLabel
                  icon={<CaretDownIcon />}
                  onClick={handleClose}
                  disabled={isLoading || coverState === 'closed' || currentPosition === 0}
                />
              )}
            </PillGroup>
          </GridCard.Controls>
        )}

        {/* Position slider */}
        {!isEditMode && supportsSetPosition && (
          <GridCard.Controls>
            <Slider
              domain="cover"
              color={stateColor}
              active={displayPosition > 0}
              label="Position"
              value={displayPosition}
              readout={`${displayPosition}%`}
              onValueChange={handlePositionChange}
              onValueCommit={handlePositionCommit}
            />
          </GridCard.Controls>
        )}

        {/* Tilt controls */}
        {!isEditMode && supportsTilt && (
          <Flex direction="column" gap="2" width="100%">
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
              <GridCard.Controls>
                <Slider
                  domain="cover"
                  color={stateColor}
                  active={displayTiltPosition > 0}
                  label="Tilt position"
                  value={displayTiltPosition}
                  readout={`${displayTiltPosition}%`}
                  onValueChange={handleTiltChange}
                  onValueCommit={handleTiltCommit}
                />
              </GridCard.Controls>
            )}
          </Flex>
        )}

        {/* Status */}
        <GridCard.Status>
          {error
            ? 'ERROR'
            : isMoving
              ? coverState.toUpperCase()
              : currentPosition > 0 && currentPosition < 100
                ? `${currentPosition}% OPEN`
                : coverState.toUpperCase()}
        </GridCard.Status>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedCoverCard = memo(CoverCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const CoverCard = Object.assign(MemoizedCoverCard, {
  defaultDimensions: { width: 2, height: 3 },
})
