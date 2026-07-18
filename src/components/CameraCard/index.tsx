import { Flex, Text, Button, Spinner } from '@radix-ui/themes'
import { VideoIcon, ReloadIcon } from '@radix-ui/react-icons'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useEntity, useIsConnecting } from '~/hooks'
import { useHomeAssistantOptional } from '../../contexts/HomeAssistantContext'
import { SkeletonCard, ErrorDisplay, FullscreenModal, resolvePanelPortalContainer } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { useDashboardStore, dashboardActions } from '~/store'
import { KeepAlive } from '../KeepAlive'
import { CardConfig } from '../CardConfig'
import type { GridItem } from '~/store/types'
import { HaCameraStream } from './HaCameraStream'
import type { HaCameraStreamHandle } from './HaCameraStream'
import { useCameraStreamReady } from './useCameraStreamReady'
import { useCameraStreamStatus } from './useCameraStreamStatus'
import { StillImageFallback } from './StillImageFallback'
import { CameraControls } from './CameraControls'
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
  access_token?: string
  entity_picture?: string
  frontend_stream_type?: string
  friendly_name?: string
  supported_features?: number
}

// Camera supported features bit flags from Home Assistant
const SUPPORT_STREAM = 2

type FitMode = 'cover' | 'contain' | 'fill'

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
  // Fullscreen overlay portal target: resolved from the card's root DOM node so
  // the overlay stays inside the liebe-panel shadow root (keeps @lit/context
  // resolution working on HA ≥ 2026.7). Falls back to document.body standalone.
  const [portalContainer, setPortalContainer] = useState<Element | undefined>(undefined)
  // Reactive mirror of the element's inner <video> for CameraStats (reading a
  // ref during render is unsafe per react-hooks/refs).
  const [innerVideo, setInnerVideo] = useState<HTMLVideoElement | null>(null)
  const normalContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const streamHandleRef = useRef<HaCameraStreamHandle | null>(null)

  // Get configuration values
  const config = item?.config || {}
  const fit = ((config.fit as string) || 'cover') as FitMode
  const matting = (config.matting as string) || 'small'
  const showStats = config.showStats === true

  // Memoize camera attributes and stream support to prevent re-renders
  const cameraAttributes = useMemo(
    () => entity?.attributes as CameraAttributes | undefined,
    [entity]
  )

  const supportsStream = useMemo(
    () => !!((cameraAttributes?.supported_features ?? 0) & SUPPORT_STREAM),
    [cameraAttributes?.supported_features]
  )

  // Bootstrap <ha-camera-stream>: 'ready' renders the element, 'unavailable'
  // falls back to the still image, 'loading' keeps the connecting state.
  const readiness = useCameraStreamReady(entityId)

  const hasEntity = !!entity
  const streamEnabled = hasEntity && isConnected && supportsStream && readiness === 'ready'

  const getInnerVideo = useCallback(() => streamHandleRef.current?.getInnerVideo() ?? null, [])
  const getMjpegImg = useCallback(() => streamHandleRef.current?.getMjpegImg() ?? null, [])

  const {
    isStreaming,
    hasFrameWarning,
    error: streamError,
    remountKey,
    onStreams,
    onLoad,
    retry: retryStream,
  } = useCameraStreamStatus({
    getInnerVideo,
    getMjpegImg,
    entityState: entity?.state,
    enabled: streamEnabled,
  })

  // Wire element events into the status machine and refresh the reactive inner
  // <video> (it is recreated when the element remounts or swaps players).
  const handleStreams = useCallback(() => {
    onStreams()
    setInnerVideo(getInnerVideo())
  }, [onStreams, getInnerVideo])

  const handleLoad = useCallback(() => {
    onLoad()
    setInnerVideo(getInnerVideo())
  }, [onLoad, getInnerVideo])

  const rootRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setPortalContainer(resolvePanelPortalContainer(node))
    }
  }, [])

  const handleVideoClick = useCallback(() => {
    if (!streamError && !isEditMode) {
      setIsFullscreen(!isFullscreen)
    }
  }, [streamError, isEditMode, isFullscreen])

  const handleVideoFullscreen = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const container = (isFullscreen ? fullscreenContainerRef : normalContainerRef).current
      // Prefer the element's inner <video>; fall back to the <ha-camera-stream>
      // host itself (e.g. MJPEG mode, where there is no inner video).
      const target =
        streamHandleRef.current?.getInnerVideo() ??
        (container?.querySelector('ha-camera-stream') as HTMLElement | null)
      if (!target) return

      try {
        if (document.fullscreenElement === target) {
          await document.exitFullscreen()
        } else {
          await target.requestFullscreen()
        }
      } catch (error) {
        console.error('Fullscreen error:', error)
      }
    },
    [isFullscreen]
  )

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

  const isUnavailable = entity.state === 'unavailable'
  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isRecording = entity.state === 'recording'
  const isIdle = entity.state === 'idle'
  const isStreamingState = entity.state === 'streaming'
  const activeFit: FitMode = isFullscreen ? 'contain' : fit
  // When the element cannot be bootstrapped the still-image fallback renders;
  // report the raw entity state instead of a forever-CONNECTING pill.
  const pillSupportsStream = supportsStream && readiness !== 'unavailable'

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
        }}
      >
        <div ref={rootRefCallback} style={{ width: '100%', height: '100%', position: 'relative' }}>
          {supportsStream ? (
            <div
              ref={normalContainerRef}
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--gray-3)',
                borderRadius: 'var(--radius-2)',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: !isEditMode && !streamError ? 'pointer' : 'default',
              }}
              onClick={handleVideoClick}
            >
              {streamError ? (
                <Flex direction="column" align="center" gap="2" style={{ padding: '12px' }}>
                  <Text size="2" color="red">
                    {streamError}
                  </Text>
                  <Button size="2" variant="soft" onClick={retryStream}>
                    <ReloadIcon />
                    Retry
                  </Button>
                </Flex>
              ) : (
                <>
                  <KeepAlive
                    cacheKey={`camera-${entityId}`}
                    containerRef={isFullscreen ? fullscreenContainerRef : normalContainerRef}
                  >
                    {readiness === 'ready' ? (
                      <HaCameraStream
                        ref={streamHandleRef}
                        entity={entity}
                        hass={hass}
                        muted={isMuted}
                        fitMode={activeFit}
                        remountKey={remountKey}
                        onStreams={handleStreams}
                        onLoad={handleLoad}
                      />
                    ) : readiness === 'unavailable' ? (
                      <StillImageFallback entity={entity} objectFit={activeFit} />
                    ) : null}
                  </KeepAlive>
                  {readiness !== 'unavailable' && !isStreaming && (
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
                </>
              )}
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
            </Flex>
          )}

          {/* Stats display (when enabled) */}
          {showStats && supportsStream && !streamError && (
            <CameraStats size={size} videoElement={innerVideo} />
          )}

          {/* Controls and info container positioned absolutely at bottom left */}
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              fontSize: size === 'small' ? '8px' : size === 'large' ? '11.2px' : '9.6px',
            }}
          >
            <CameraControls
              friendlyName={friendlyName}
              entity={entity}
              streamError={streamError}
              isRecording={isRecording}
              isStreaming={isStreaming}
              isIdle={isIdle}
              supportsStream={pillSupportsStream}
              isEditMode={isEditMode}
              isMuted={isMuted}
              isReconnecting={isReconnecting}
              hasFrameWarning={hasFrameWarning}
              handleToggleMute={handleToggleMute}
              handleVideoFullscreen={handleVideoFullscreen}
              size={size}
            />
          </div>
        </div>
      </GridCard>

      {/* Fullscreen modal */}
      <FullscreenModal
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        includeTheme={false}
        portalContainer={portalContainer}
        backdropStyle={{
          backgroundColor: 'black',
          cursor: 'pointer',
        }}
        contentStyle={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        <div
          ref={fullscreenContainerRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {/* Fullscreen stats display (when enabled) */}
        {showStats && <CameraStats size="large" videoElement={innerVideo} />}

        {/* Fullscreen controls and info container */}
        <div
          style={{
            position: 'absolute',
            bottom: '2%',
            left: '2%',
            zIndex: 10,
            fontSize: 'min(3.2vw, 19.2px)', // Scale based on viewport width (reduced by 20%)
          }}
        >
          <CameraControls
            friendlyName={friendlyName}
            entity={entity}
            streamError={streamError}
            isRecording={isRecording}
            isStreaming={isStreaming}
            isIdle={isIdle}
            supportsStream={pillSupportsStream}
            isEditMode={isEditMode}
            isMuted={isMuted}
            isReconnecting={isReconnecting}
            hasFrameWarning={hasFrameWarning}
            handleToggleMute={handleToggleMute}
            handleVideoFullscreen={handleVideoFullscreen}
            size="large"
            isFullscreen={true}
          />
        </div>

        {/* Exit indicator */}
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
      </FullscreenModal>

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

// Memoize the component to prevent unnecessary re-renders
const MemoizedCameraCard = memo(CameraCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.item === nextProps.item
  )
})

export const CameraCard = Object.assign(MemoizedCameraCard, {
  defaultDimensions: { width: 4, height: 2 },
})
