import { Flex, Text, Button, Spinner } from '@radix-ui/themes'
import {
  VideoIcon,
  ReloadIcon,
  EnterFullScreenIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons'
import { useEntity, useWebRTC, useIsConnecting } from '~/hooks'
import { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { SkeletonCard, ErrorDisplay, FullscreenModal } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore, dashboardActions } from '~/store'
import { KeepAlive } from './KeepAlive'
import { CardConfig } from './CardConfig'
import type { GridItem } from '~/store/types'
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

// Stats display component
function CameraStats({
  size,
  hasFrameWarning,
  isStreaming,
}: {
  size: 'small' | 'medium' | 'large'
  hasFrameWarning: boolean
  isStreaming: boolean
}) {
  const scaleFactor = size === 'small' ? 0.64 : size === 'large' ? 0.96 : 0.8
  const [stats, setStats] = useState({
    timestamp: new Date().toLocaleTimeString(),
    fps: 0,
    decodedFrames: 0,
    droppedFrames: 0,
    bitrate: 0,
    resolution: '',
  })

  // Update timestamp every second
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        ...prev,
        timestamp: new Date().toLocaleTimeString(),
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: `${0.5 * scaleFactor}em`,
        padding: `${0.3 * scaleFactor}em ${0.4 * scaleFactor}em`,
        backdropFilter: 'blur(8px)',
        fontSize: `${scaleFactor * 0.8}em`,
        fontFamily: 'monospace',
        color: '#00ff00',
        lineHeight: 1.2,
      }}
    >
      <div>Time: {stats.timestamp}</div>
      <div>Streaming: {isStreaming ? 'YES' : 'NO'}</div>
      <div>Frame Warning: {hasFrameWarning ? 'YES' : 'NO'}</div>
      <div style={{ marginTop: '4px' }}>
        <div>FPS: {stats.fps}</div>
        <div>Decoded: {stats.decodedFrames}</div>
        <div>Dropped: {stats.droppedFrames}</div>
        <div>Bitrate: {stats.bitrate} kbps</div>
        {stats.resolution && <div>Res: {stats.resolution}</div>}
      </div>
    </div>
  )
}

// Custom-styled camera controls for both regular and fullscreen views
function CameraControls({
  friendlyName,
  entity,
  streamError,
  isRecording,
  isStreaming,
  isIdle,
  supportsStream,
  isEditMode,
  isMuted,
  isReconnecting,
  hasFrameWarning,
  handleToggleMute,
  handleVideoFullscreen,
  size,
  isFullscreen = false,
}: {
  friendlyName: string
  entity: { state: string; attributes: CameraAttributes }
  streamError: string | null
  isRecording: boolean
  isStreaming: boolean
  isIdle: boolean
  supportsStream: boolean
  isEditMode: boolean
  isMuted: boolean
  isReconnecting: boolean
  hasFrameWarning: boolean
  handleToggleMute: (e: React.MouseEvent) => void
  handleVideoFullscreen: (e: React.MouseEvent) => void
  size: 'small' | 'medium' | 'large'
  isFullscreen?: boolean
}) {
  // Base scale factor for different sizes
  const scaleFactor = size === 'small' ? 0.64 : size === 'large' ? 0.96 : 0.8

  return (
    <div
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: `${0.6 * scaleFactor}em`,
        padding: `${0.3 * scaleFactor}em ${0.5 * scaleFactor}em`,
        backdropFilter: 'blur(8px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${0.64 * scaleFactor}em`,
        fontSize: isFullscreen ? 'inherit' : `${scaleFactor}em`,
      }}
    >
      {/* Entity info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${0.08 * scaleFactor}em` }}>
        <div
          style={{
            color: 'white',
            fontSize: '1em',
            fontWeight: 600,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {friendlyName}
        </div>
        <div
          style={{
            color: streamError ? '#ff6b6b' : isRecording || isStreaming ? '#4dabf7' : '#868e96',
            fontSize: '0.8em',
            lineHeight: 1.2,
            textTransform: 'uppercase',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: `${0.4 * scaleFactor}em`,
          }}
        >
          {isReconnecting || (supportsStream && !isStreaming && !streamError) ? (
            <Spinner size="1" />
          ) : hasFrameWarning && !streamError ? (
            <ExclamationTriangleIcon style={{ color: '#f59e0b', width: '1em', height: '1em' }} />
          ) : (isRecording || isStreaming) && !streamError ? (
            <span className="recording-dot" />
          ) : null}
          {streamError
            ? 'ERROR'
            : isReconnecting || (supportsStream && !isStreaming && !streamError)
              ? 'CONNECTING'
              : hasFrameWarning
                ? 'NO SIGNAL'
                : supportsStream && isStreaming && (isRecording || entity.state === 'streaming')
                  ? 'RECORDING'
                  : supportsStream && isStreaming
                    ? 'STREAMING'
                    : isIdle
                      ? 'IDLE'
                      : entity.state.toUpperCase()}
        </div>
      </div>

      {/* Control buttons */}
      {supportsStream && isStreaming && !streamError && !isEditMode && (
        <div style={{ display: 'flex', gap: `${0.4 * scaleFactor}em` }}>
          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{
              width: '2.5em',
              height: '2.5em',
              borderRadius: '0.5em',
              border: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              padding: 0,
              fontSize: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            {isMuted ? (
              <SpeakerOffIcon style={{ width: '55%', height: '55%' }} />
            ) : (
              <SpeakerLoudIcon style={{ width: '55%', height: '55%' }} />
            )}
          </button>
          <button
            onClick={handleVideoFullscreen}
            title="Toggle native fullscreen"
            style={{
              width: '2.5em',
              height: '2.5em',
              borderRadius: '0.5em',
              border: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              padding: 0,
              fontSize: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <EnterFullScreenIcon style={{ width: '55%', height: '55%' }} />
          </button>
        </div>
      )}
    </div>
  )
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(true) // Start muted by default
  const [configOpen, setConfigOpen] = useState(false)
  const normalContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  // Get configuration values
  const config = item?.config || {}
  const fit = (config.fit as string) || 'cover'
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

  // Memoize the enabled flag to prevent unnecessary WebRTC re-initializations
  const hasEntity = !!entity
  const webRTCEnabled = useMemo(() => {
    const enabled = hasEntity && isConnected && supportsStream
    return enabled
  }, [hasEntity, isConnected, supportsStream])

  // Use WebRTC hook for streaming
  const {
    videoRef,
    isStreaming,
    error: streamError,
    retry: retryStream,
    hasFrameWarning,
  } = useWebRTC({
    entityId,
    enabled: webRTCEnabled,
  })

  const handleVideoClick = useCallback(() => {
    if (!streamError && !isEditMode) {
      setIsFullscreen(!isFullscreen)
    }
  }, [streamError, isEditMode, isFullscreen])

  const handleVideoFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoElementRef.current
    if (!video) return

    try {
      if (document.fullscreenElement === video) {
        await document.exitFullscreen()
      } else {
        await video.requestFullscreen()
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
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

  // Combined ref callback for both WebRTC and local ref
  const combinedVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef(element)
      videoElementRef.current = element
    },
    [videoRef]
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

  const isUnavailable = entity.state === 'unavailable'
  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isRecording = entity.state === 'recording'
  const isIdle = entity.state === 'idle'
  const isStreaming_ = entity.state === 'streaming'

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
        isOn={isRecording || isStreaming_}
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
            (isRecording || isStreaming_) && !isSelected && !streamError
              ? 'var(--blue-3)'
              : undefined,
          borderColor:
            (isRecording || isStreaming_) && !isSelected && !streamError
              ? 'var(--blue-6)'
              : undefined,
          borderWidth: isSelected || streamError || isRecording || isStreaming_ ? '2px' : '1px',
        }}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
                  {streamError.includes('not yet fully implemented') ? (
                    <>
                      <Text size="2" weight="medium" style={{ textAlign: 'center' }}>
                        Camera Configuration Required
                      </Text>
                      <Text
                        size="1"
                        color="gray"
                        style={{ textAlign: 'center', maxWidth: '300px' }}
                      >
                        This camera needs to be configured for streaming.
                      </Text>
                      <Flex direction="column" gap="2" align="center" style={{ marginTop: '8px' }}>
                        <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                          If you have go2rtc installed:
                        </Text>
                        <Flex direction="column" gap="1">
                          <Text size="1" color="gray">
                            1. Open go2rtc web UI (port 1984)
                          </Text>
                          <Text size="1" color="gray">
                            2. Add your camera&apos;s RTSP stream
                          </Text>
                          <Text size="1" color="gray">
                            3. Configure WebRTC for the stream
                          </Text>
                        </Flex>
                        <Text
                          size="1"
                          color="blue"
                          style={{ textDecoration: 'underline', cursor: 'pointer' }}
                          onClick={() =>
                            window.open('https://github.com/AlexxIT/go2rtc#quick-start', '_blank')
                          }
                        >
                          View go2rtc setup guide →
                        </Text>
                      </Flex>
                    </>
                  ) : (
                    <>
                      <Text size="2" color="red">
                        {streamError}
                      </Text>
                      <Button size="2" variant="soft" onClick={retryStream}>
                        <ReloadIcon />
                        Retry
                      </Button>
                    </>
                  )}
                </Flex>
              ) : (
                <>
                  <KeepAlive
                    cacheKey={`camera-${entityId}`}
                    containerRef={isFullscreen ? fullscreenContainerRef : normalContainerRef}
                  >
                    <video
                      ref={combinedVideoRef}
                      autoPlay
                      playsInline
                      muted={isMuted}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: isFullscreen ? 'contain' : (fit as 'cover' | 'contain'),
                        display: isStreaming ? 'block' : 'none',
                      }}
                    />
                  </KeepAlive>
                  {!isStreaming && (
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
                    color: isRecording || isStreaming_ ? 'var(--blue-9)' : 'var(--gray-9)',
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
            <CameraStats size={size} hasFrameWarning={hasFrameWarning} isStreaming={isStreaming} />
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
              supportsStream={supportsStream}
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
        {showStats && (
          <CameraStats size="large" hasFrameWarning={hasFrameWarning} isStreaming={isStreaming} />
        )}

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
            supportsStream={supportsStream}
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
