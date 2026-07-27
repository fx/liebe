import { Box, Flex, Text, Button } from '@radix-ui/themes'
import {
  CaretUpIcon,
  CaretDownIcon,
  PauseIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@radix-ui/react-icons'
import { Blinds } from 'lucide-react'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { Pill, PillGroup, Slider } from './anatomy'
import { useDashboardStore } from '~/store'
import type { DomainColorName } from '~/theme/tokens'
import type { CardTier } from '~/utils/cardTier'

interface CoverCardProps {
  entityId: string
  tier?: CardTier
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
  tier = 'row',
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

  /*
   * Feature support checks. Each one is a *boolean*, not the masked bits: these
   * gate JSX with `&&`, and React renders a numeric `0` as the text "0" — an
   * unsupported bit would print a stray zero into the button row.
   */
  const supportsOpen = (supportedFeatures & SUPPORT_OPEN) !== 0
  const supportsClose = (supportedFeatures & SUPPORT_CLOSE) !== 0
  const supportsSetPosition = (supportedFeatures & SUPPORT_SET_POSITION) !== 0
  const supportsStop = (supportedFeatures & SUPPORT_STOP) !== 0
  const supportsOpenTilt = (supportedFeatures & SUPPORT_OPEN_TILT) !== 0
  const supportsCloseTilt = (supportedFeatures & SUPPORT_CLOSE_TILT) !== 0
  const supportsSetTiltPosition = (supportedFeatures & SUPPORT_SET_TILT_POSITION) !== 0
  const supportsTilt = supportsOpenTilt || supportsCloseTilt || supportsSetTiltPosition

  // Get current position (0-100 scale from HA)
  const rawPosition = coverAttributes?.current_position ?? coverAttributes?.position
  const hasPosition = rawPosition !== undefined
  const currentPosition = rawPosition ?? 0

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
    // Before the position branches: a cover whose state nobody knows has no
    // position either, and the `currentPosition === 0` default below would
    // otherwise report it — on the state line and to the close button — as a
    // cover that is definitely closed.
    if (entity.state === 'unknown') return 'unknown'
    if (entity.state === 'open' || currentPosition > 0) return 'open'
    if (entity.state === 'closed' || currentPosition === 0) return 'closed'
    return entity.state
  }, [entity, currentPosition])

  const isMoving = coverState === 'opening' || coverState === 'closing'

  /*
   * What "fully open" and "fully closed" mean for the button row
   * (docs/specs/entity-cards/options/cover.md — "Open / stop / close buttons").
   * When the entity reports a position, only that position decides: `coverState`
   * reads `open` at any position above zero, so gating on it left a cover at 60%
   * unable to be driven the rest of the way open from the button row. State-based
   * disabling applies only to covers with no position at all, where the state is
   * genuinely binary.
   */
  const isFullyOpen = hasPosition ? currentPosition === 100 : coverState === 'open'
  const isFullyClosed = hasPosition ? currentPosition === 0 : coverState === 'closed'

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
    return <SkeletonCard tier={tier} showIcon={true} lines={2} showButton={true} />
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
        domain="cover"
        tier={tier}
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

  /*
   * What each tier carries (docs/specs/entity-cards/options/cover.md — "Tier
   * layouts"). Omission, never clipping or scrolling
   * (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  icon + name + state; no embedded controls — the tile's own action
   *           and the detail dialog behind a hold carry operability here.
   *   row     icon + meta + horizontal position slider. A binary cover has no
   *           position to set, so it renders the glance content in the row
   *           arrangement, exactly as the option doc states.
   *   tall    icon on top, vertical position slider filling the middle (top =
   *           open, so the control is a miniature of the blind), meta below.
   *   full    row content plus the open/stop/close row, then the tilt controls
   *           when the cover supports tilt.
   */
  const isGlance = tier === 'glance'
  const isTall = tier === 'tall'
  const isFull = tier === 'full'
  const showPositionSlider = !isGlance && !isEditMode && supportsSetPosition
  const showButtons = isFull && !isEditMode
  const showTilt = isFull && !isEditMode && supportsTilt

  const icon = (
    <GridCard.Icon>
      <Blinds size={20} />
    </GridCard.Icon>
  )

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status>
        {error
          ? 'ERROR'
          : isMoving
            ? coverState.toUpperCase()
            : currentPosition > 0 && currentPosition < 100
              ? `${currentPosition}% OPEN`
              : coverState.toUpperCase()}
      </GridCard.Status>
    </GridCard.Meta>
  )

  const positionSlider = (orientation: 'horizontal' | 'vertical') => (
    <GridCard.Controls>
      <Slider
        domain="cover"
        color={stateColor}
        active={displayPosition > 0}
        label="Position"
        orientation={orientation}
        value={displayPosition}
        readout={`${displayPosition}%`}
        onValueChange={handlePositionChange}
        onValueCommit={handlePositionCommit}
      />
    </GridCard.Controls>
  )

  const buttons = (
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
            active={isFullyOpen}
            label="Open cover"
            hideLabel
            icon={<CaretUpIcon />}
            onClick={handleOpen}
            disabled={isLoading || isFullyOpen}
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
            active={isFullyClosed}
            label="Close cover"
            hideLabel
            icon={<CaretDownIcon />}
            onClick={handleClose}
            disabled={isLoading || isFullyClosed}
          />
        )}
      </PillGroup>
    </GridCard.Controls>
  )

  const tilt = (
    <Flex direction="column" gap="2" width="100%">
      <Text size="1" color="gray">
        Tilt
      </Text>
      {/* Tilt buttons */}
      <Flex gap="2" justify="center">
        {/*
         * Icon-only, so the label has to be the accessible name — without it
         * these two announce as nothing at all, which is the naming half of
         * issue #191 and the same defect the simple set shipped at `glance`.
         * Named for what they do to the slats, not to the cover: "Open cover"
         * is already the pill above them.
         *
         * `size="3"` to match the other controls on this card rather than the
         * `size="1"` they shipped with; the project's 44px touch-target
         * minimum is a separate, card-wide question tracked by issue #204.
         */}
        {supportsOpenTilt && (
          <Button
            size="3"
            variant="soft"
            onClick={handleOpenTilt}
            disabled={isLoading}
            aria-label="Open cover tilt"
          >
            <ChevronRightIcon />
          </Button>
        )}
        {supportsCloseTilt && (
          <Button
            size="3"
            variant="soft"
            onClick={handleCloseTilt}
            disabled={isLoading}
            aria-label="Close cover tilt"
          >
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
  )

  return (
    <GridCard
      domain="cover"
      color={stateColor}
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={coverState === 'open' || currentPosition > 0}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      /*
       * Deliberately not `toggle`. The cover contract's tap default is
       * state-aware (stop while moving, `more-info` for tilt-only, inert while
       * indeterminate) and arrives with 0019; until the card can resolve it,
       * declaring the detail dialog is the safe half of that rule rather than
       * putting a motorized opening one ambient tap away
       * (docs/specs/entity-cards/options/cover.md, REVIEW.md — safety-critical
       * controls).
       */
      defaultAction="more-info"
      title={error || undefined}
      className="cover-card"
    >
      {isGlance ? (
        <Flex direction="column" align="center" justify="center" gap="2">
          {icon}
          {meta}
        </Flex>
      ) : isTall ? (
        <Flex direction="column" align="center" gap="2" height="100%">
          {icon}
          {/* Top of the track is fully open, so the control reads as a
              miniature of the blind it drives. */}
          {showPositionSlider && (
            <Box flexGrow="1" style={{ display: 'flex', minHeight: 0 }}>
              {positionSlider('vertical')}
            </Box>
          )}
          {meta}
        </Flex>
      ) : (
        <Flex direction="column" gap="3">
          <Flex align="center" gap="3">
            {icon}
            {meta}
            {showPositionSlider && <Box flexGrow="1">{positionSlider('horizontal')}</Box>}
          </Flex>
          {showButtons && buttons}
          {showTilt && tilt}
        </Flex>
      )}
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedCoverCard = memo(CoverCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const CoverCard = Object.assign(MemoizedCoverCard, {
  defaultDimensions: { width: 2, height: 3 },
})
