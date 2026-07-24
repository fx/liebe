import { Flex, Text, Button, Spinner } from '@radix-ui/themes'
import { VideoIcon, ReloadIcon } from '@radix-ui/react-icons'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEntity, useIsConnecting } from '~/hooks'
import { useHomeAssistantOptional } from '../../contexts/HomeAssistantContext'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { useDashboardStore, dashboardActions } from '~/store'
import { enterCameraFullscreen, exitCameraFullscreen } from '~/store/cameraFullscreenStore'
import { CardConfig } from '../CardConfig'
import { logger } from '~/utils/logger'
import type { GridItem } from '~/store/types'
import { HaCameraStream } from './HaCameraStream'
import type { HaCameraStreamHandle } from './HaCameraStream'
import { useCameraStreamReady } from './useCameraStreamReady'
import { useCameraStreamStatus } from './useCameraStreamStatus'
import { StillImageFallback } from './StillImageFallback'
import { CameraControls } from './CameraControls'
import type { CameraStatus } from './CameraControls'
import { CameraStats } from './CameraStats'
import './CameraCard.css'

interface CameraCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
}

interface CameraAttributes {
  supported_features?: number
}

// Camera supported features bit flags from Home Assistant
const SUPPORT_STREAM = 2

type FitMode = 'cover' | 'contain' | 'fill'
const FIT_MODES: readonly FitMode[] = ['cover', 'contain', 'fill']

export interface CameraStatusInput {
  streamError: string | null
  isReconnecting: boolean
  /** Streaming is supported AND the <ha-camera-stream> bootstrap has not failed. */
  supportsStream: boolean
  isStreaming: boolean
  /**
   * Recent-frame evidence from the status hook (frames observed within
   * FRAME_WARNING_MS) — NOT the lagging isStreaming flag, which a frozen
   * frame never flips false while the watchdog is suspended during entity
   * unavailability.
   */
  isActivelyStreaming: boolean
  hasFrameWarning: boolean
  entityState: string
}

// Single derivation of the status pill, in strict priority order:
// ERROR > UNAVAILABLE (entity unavailable and not streaming) > CONNECTING >
// NO SIGNAL > RECORDING > STREAMING > IDLE > raw state. CameraControls maps
// label, icon, and color from the returned status, so they can never disagree.
export function deriveCameraStatus({
  streamError,
  isReconnecting,
  supportsStream,
  isStreaming,
  isActivelyStreaming,
  hasFrameWarning,
  entityState,
}: CameraStatusInput): CameraStatus {
  if (streamError) return 'error'
  // An unavailable entity shows the truthful UNAVAILABLE pill (raw state)
  // unless frames are DEMONSTRABLY flowing — recent-frame evidence, not the
  // lagging isStreaming flag, which stays true over a frozen frame while the
  // status machine is suspended. A dead camera therefore reads UNAVAILABLE
  // immediately instead of NO SIGNAL followed by a stall error; a stream
  // that keeps playing through the blip keeps its STREAMING pill below.
  if (entityState === 'unavailable' && !isActivelyStreaming) return 'raw'
  if (isReconnecting || (supportsStream && !isStreaming)) return 'connecting'
  if (hasFrameWarning) return 'no-signal'
  if (
    entityState === 'recording' ||
    (supportsStream && isStreaming && entityState === 'streaming')
  ) {
    return 'recording'
  }
  if (supportsStream && isStreaming) return 'streaming'
  if (entityState === 'idle') return 'idle'
  return 'raw'
}

function CameraCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
  item,
}: CameraCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { mode, currentScreenId } = useDashboardStore()
  const isEditMode = mode === 'edit'
  const isReconnecting = useIsConnecting()
  const hass = useHomeAssistantOptional()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(true) // Start muted by default
  const [configOpen, setConfigOpen] = useState(false)
  // Reactive mirror of the element's inner <video> for CameraStats (reading a
  // ref during render is unsafe per react-hooks/refs).
  const [innerVideo, setInnerVideo] = useState<HTMLVideoElement | null>(null)
  // The ONE persistently-mounted stream container. In-app fullscreen is a pure
  // CSS/position flip on this element — the <ha-camera-stream> node it holds
  // NEVER moves in the DOM, so it never disconnects/reconnects the stream. See
  // docs/changes/0008-camera-fullscreen-no-dom-move.md.
  const streamContainerRef = useRef<HTMLDivElement>(null)
  const streamHandleRef = useRef<HaCameraStreamHandle | null>(null)

  // Get configuration values. `fit` is whitelisted against the supported
  // modes (persisted config is user-editable YAML — an unknown value must
  // degrade to the cover default, not flow into CSS/HaCameraStream).
  const config = item?.config || {}
  const fit = FIT_MODES.find((mode) => mode === config.fit) ?? 'cover'
  const matting = (config.matting as string) || 'small'
  const showStats = config.showStats === true

  const supportsStream = !!(
    ((entity?.attributes as CameraAttributes | undefined)?.supported_features ?? 0) & SUPPORT_STREAM
  )
  const isUnavailable = entity?.state === 'unavailable'

  // Bootstrap <ha-camera-stream>: 'ready' renders the element, 'unavailable'
  // falls back to the still image, 'loading' keeps the connecting state.
  const readiness = useCameraStreamReady(entityId)

  // Entity availability does NOT gate mounting: a 1-2 s 'unavailable' blip
  // (HA reconnect) must not hard-unmount <ha-camera-stream> — the underlying
  // stream often keeps playing straight through. Instead the card shows the
  // unavailable chrome/pill immediately and the status hook SUSPENDS its
  // entire machine while the entity is unavailable (load budget paused,
  // watchdog silent, media-error fast-fails suppressed — exactly like a
  // hidden tab), so a dead camera can never burn budgets or surface sticky
  // errors during the blip. On recovery the hook resumes with a frame-clock
  // grace, a restored remount budget, and an automatic retry of any surfaced
  // error — no manual Retry click needed.
  const streamEnabled = !!entity && isConnected && supportsStream && readiness === 'ready'

  const getInnerVideo = useCallback(() => streamHandleRef.current?.getInnerVideo() ?? null, [])
  const getMjpegImg = useCallback(() => streamHandleRef.current?.getMjpegImg() ?? null, [])

  const {
    isStreaming,
    isActivelyStreaming,
    hasFrameWarning,
    error: streamError,
    remountKey,
    onStreamEvent,
    retry: retryStream,
  } = useCameraStreamStatus({
    getInnerVideo,
    getMjpegImg,
    entityState: entity?.state,
    enabled: streamEnabled,
    entityAvailable: !isUnavailable,
  })

  // The in-place overlay only actually renders when the card body shows the
  // stream container. If it cannot — a surfaced error (shown in-card with
  // Retry), an entity/connection dropout, initial loading, or lost stream
  // support — close fullscreen during render (React's sanctioned state
  // adjustment; converges on the next render with no setState-in-effect
  // cascade). This keeps the ESC handler and the root-Theme stacking lift from
  // staying active with nothing overlaid, and keeps any later recovery
  // (including the status machine's automatic error retry) in-card until the
  // user taps again — never a silent reopen.
  const canShowOverlay =
    !isEntityLoading && !!entity && isConnected && supportsStream && !streamError
  if (isFullscreen && !canShowOverlay) {
    setIsFullscreen(false)
  }

  // ESC exits the in-app fullscreen overlay (the FullscreenModal that used to
  // own this handling is gone — fullscreen is now in-place on the card).
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // While the overlay is open, lift the root Theme's stacking (PanelApp reads
  // this store) so the in-place fixed overlay paints over Home Assistant's
  // chrome — WITHOUT ever moving the stream node.
  useEffect(() => {
    if (!isFullscreen) return
    enterCameraFullscreen()
    return () => exitCameraFullscreen()
  }, [isFullscreen])

  // Wire element events into the status machine and refresh the reactive inner
  // <video> (it is recreated when the element remounts or swaps players).
  const handleStreamEvent = useCallback(() => {
    onStreamEvent()
    setInnerVideo(getInnerVideo())
  }, [onStreamEvent, getInnerVideo])

  const handleVideoClick = useCallback(() => {
    if (!streamError && !isEditMode) {
      setIsFullscreen(!isFullscreen)
    }
  }, [streamError, isEditMode, isFullscreen])

  // Keyboard parity for the clickable stream surface: Enter and Space toggle
  // fullscreen exactly like a tap (Space's default scroll is suppressed). Only
  // the surface itself acts — Enter/Space bubbling up from a focused control
  // button (mute, native fullscreen) must activate that button, not also flip
  // the overlay (and Space's preventDefault must not swallow the activation).
  const handleVideoKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleVideoClick()
      }
    },
    [handleVideoClick]
  )

  const handleVideoFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    // Prefer the element's inner <video>; fall back to the <ha-camera-stream>
    // host itself (e.g. MJPEG mode, where there is no inner video).
    const target =
      streamHandleRef.current?.getInnerVideo() ??
      (streamContainerRef.current?.querySelector('ha-camera-stream') as HTMLElement | null)
    if (!target) return

    try {
      // Fullscreen state must be read from the target's OWN root: for a
      // target inside a shadow root (ha-camera-stream's inner <video>),
      // document.fullscreenElement is retargeted to the shadow HOST, so a
      // document-level comparison never matches and toggle-off would call
      // requestFullscreen again. A light-DOM target's root IS the document;
      // anything else (e.g. a detached node) falls back to the document
      // check.
      const root = target.getRootNode()
      const fullscreenElement =
        root instanceof Document || root instanceof ShadowRoot
          ? root.fullscreenElement
          : document.fullscreenElement
      if (fullscreenElement === target) {
        await document.exitFullscreen()
      } else {
        await target.requestFullscreen()
      }
    } catch (error) {
      logger.error('Fullscreen error:', error)
    }
  }, [])

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMuted((prev) => !prev)
  }, [])

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && currentScreenId) {
      dashboardActions.updateGridItem(currentScreenId, item.id, updates)
    }
  }

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={2} />
  }

  // Show error state when disconnected or the entity is missing. The skeleton
  // guard above already swallows the connected-but-missing-entity case, so
  // this block only ever renders while disconnected — no per-prop ternaries.
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error="Disconnected from Home Assistant"
        variant="card"
        title="Disconnected"
        onRetry={() => window.location.reload()}
        size="3"
      />
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isRecording = entity.state === 'recording'
  const isStreamingState = entity.state === 'streaming'
  const activeFit: FitMode = isFullscreen ? 'contain' : fit
  // When the element cannot be bootstrapped the still-image fallback renders;
  // derive the pill from the raw entity state instead of a forever-CONNECTING.
  // (Entity unavailability is handled inside deriveCameraStatus: UNAVAILABLE
  // unless recent-frame evidence proves the stream is still playing through
  // the blip.)
  const pillSupportsStream = supportsStream && readiness !== 'unavailable'
  const status = deriveCameraStatus({
    streamError,
    isReconnecting,
    supportsStream: pillSupportsStream,
    isStreaming,
    isActivelyStreaming,
    hasFrameWarning,
    entityState: entity.state,
  })
  const showControls = pillSupportsStream && isStreaming && !streamError && !isEditMode
  // The stream surface is tappable (fullscreen toggle) outside edit mode and
  // while no error branch is shown; when it is, it is also a keyboard button.
  const videoClickable = !isEditMode && !streamError

  // Calculate matting/padding based on configuration
  // Map matting values to Radix UI space tokens
  // Small matches the default padding for the current card size
  const defaultPadding = size === 'small' ? '2' : size === 'large' ? '4' : '3'
  const mattingPadding =
    matting === 'none'
      ? '0'
      : matting === 'large'
        ? 'var(--space-5)'
        : `var(--space-${defaultPadding})`

  // Status pill + controls: a SINGLE instance (replacing the old duplicated
  // in-card/fullscreen pair). It lives inside the stream container so the
  // container's normal→fullscreen position flip carries it with no DOM move;
  // it also renders in the non-stream branch and during the error branch (the
  // ERROR pill). Buttons stopPropagation so they never toggle fullscreen.
  const controls = (
    <div
      style={{
        position: 'absolute',
        bottom: isFullscreen ? '2%' : '8px',
        left: isFullscreen ? '2%' : '8px',
        fontSize: isFullscreen
          ? 'min(3.2vw, 19.2px)' // Scale with viewport width (reduced by 20%)
          : size === 'small'
            ? '8px'
            : size === 'large'
              ? '11.2px'
              : '9.6px',
      }}
    >
      <CameraControls
        friendlyName={friendlyName}
        status={status}
        rawState={entity.state}
        showControls={showControls}
        isMuted={isMuted}
        handleToggleMute={handleToggleMute}
        handleVideoFullscreen={handleVideoFullscreen}
        size={isFullscreen ? 'large' : size}
        isFullscreen={isFullscreen}
      />
    </div>
  )

  return (
    <>
      <GridCard
        size={size}
        isLoading={false}
        isError={!!streamError}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isRecording || isStreamingState}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={streamError || undefined}
        className="camera-card"
        customPadding={mattingPadding}
        style={{
          backgroundColor:
            (isRecording || isStreamingState) && !isSelected && !streamError
              ? 'var(--blue-3)'
              : undefined,
          borderColor:
            (isRecording || isStreamingState) && !isSelected && !streamError
              ? 'var(--blue-6)'
              : undefined,
          borderWidth: isSelected || streamError || isRecording || isStreamingState ? '2px' : '1px',
          // Drop the Radix card's `contain: paint` (a containing block AND a
          // paint clip) for exactly the fullscreen duration so the in-place
          // fixed stream container can escape the card and cover the viewport.
          // Restored the instant the overlay closes.
          ...(isFullscreen ? { contain: 'none' } : {}),
        }}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {supportsStream ? (
            <div
              ref={streamContainerRef}
              role={videoClickable ? 'button' : undefined}
              tabIndex={videoClickable ? 0 : undefined}
              aria-label={videoClickable ? `Toggle fullscreen for ${friendlyName}` : undefined}
              onClick={handleVideoClick}
              onKeyDown={videoClickable ? handleVideoKeyDown : undefined}
              style={
                isFullscreen
                  ? {
                      // In-place promotion to a viewport-filling fixed overlay.
                      // The stream node inside NEVER moves — this is a pure
                      // style flip, so no disconnect/reconnect fires.
                      position: 'fixed',
                      inset: 0,
                      zIndex: 99999,
                      backgroundColor: 'black',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }
                  : {
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'var(--gray-3)',
                      borderRadius: 'var(--radius-2)',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: videoClickable ? 'pointer' : 'default',
                    }
              }
            >
              {streamError ? (
                <Flex direction="column" align="center" gap="2" style={{ padding: '12px' }}>
                  <Text size="2" color="red">
                    {streamError}
                  </Text>
                  {/* size 3+: minimum 44px touch target (touch-first UI). */}
                  <Button size="3" variant="soft" onClick={retryStream}>
                    <ReloadIcon />
                    Retry
                  </Button>
                </Flex>
              ) : (
                <>
                  {readiness === 'ready' ? (
                    <HaCameraStream
                      ref={streamHandleRef}
                      entity={entity}
                      hass={hass}
                      muted={isMuted}
                      fitMode={activeFit}
                      remountKey={remountKey}
                      onStreamEvent={handleStreamEvent}
                    />
                  ) : readiness === 'unavailable' ? (
                    <StillImageFallback entity={entity} objectFit={activeFit} />
                  ) : null}
                  {readiness !== 'unavailable' && !isUnavailable && !isStreaming && (
                    <Flex
                      align="center"
                      justify="center"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'var(--gray-3)',
                      }}
                    >
                      <Spinner size="3" />
                    </Flex>
                  )}
                  {/* Debug stats overlay (single instance; grows to large in
                      fullscreen). Readiness-gated: the still-image fallback has
                      no video to read playback quality from. */}
                  {showStats && readiness === 'ready' && (
                    <CameraStats size={isFullscreen ? 'large' : size} videoElement={innerVideo} />
                  )}
                  {/* Exit hint (fullscreen only). pointerEvents:none so a tap
                      landing on it still bubbles to the container's exit
                      handler (letterbox/backdrop tap closes). */}
                  {isFullscreen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: 'rgba(0, 0, 0, 0.7)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backdropFilter: 'blur(4px)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '500',
                        pointerEvents: 'none',
                      }}
                    >
                      Click or press ESC to exit
                    </div>
                  )}
                </>
              )}
              {controls}
            </div>
          ) : (
            <Flex
              direction="column"
              align="center"
              justify="center"
              style={{ width: '100%', height: '100%' }}
            >
              <GridCard.Icon>
                <VideoIcon
                  style={{
                    color: isRecording || isStreamingState ? 'var(--blue-9)' : 'var(--gray-9)',
                    opacity: 1,
                    transition: 'opacity 0.2s ease',
                    width: 20,
                    height: 20,
                  }}
                />
              </GridCard.Icon>
              {controls}
            </Flex>
          )}
        </div>
      </GridCard>

      {/* Configuration modal */}
      <CardConfig.Modal
        open={configOpen}
        onOpenChange={setConfigOpen}
        item={
          item || {
            id: '',
            entityId,
            type: 'entity',
            x: 0,
            y: 0,
            width: CameraCard.defaultDimensions.width,
            height: CameraCard.defaultDimensions.height,
          }
        }
        onSave={handleConfigSave}
      />
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders (default shallow
// prop comparison).
const MemoizedCameraCard = memo(CameraCardComponent)

export const CameraCard = Object.assign(MemoizedCameraCard, {
  defaultDimensions: { width: 4, height: 2 },
})
