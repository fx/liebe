import { Flex, Text, Button, IconButton, Box, Card } from '@radix-ui/themes'
import {
  VideoIcon,
  ReloadIcon,
  EnterFullScreenIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from '@radix-ui/react-icons'
import { useEntity, useWebRTC } from '~/hooks'
import { memo, useMemo, useState, useRef, useCallback } from 'react'
import { SkeletonCard, ErrorDisplay, FullscreenModal } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore } from '~/store'
import { KeepAlive } from './KeepAlive'

interface CameraCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
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

// Camera controls component to avoid duplication
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
  handleToggleMute,
  handleVideoFullscreen,
  size,
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
  handleToggleMute: (e: React.MouseEvent) => void
  handleVideoFullscreen: (e: React.MouseEvent) => void
  size: 'small' | 'medium' | 'large'
}) {
  const isSmall = size === 'small'
  const cardSize = isSmall ? '1' : '2'
  const textSize = isSmall ? '1' : '3'
  const textSizeSmall = isSmall ? '1' : '2'
  const buttonSize = isSmall ? '1' : '2'
  const gap = isSmall ? '2' : '3'
  const buttonGap = isSmall ? '1' : '2'

  return (
    <Card size={cardSize}>
      <Flex align="center" gap={gap}>
        {/* Entity info */}
        <Flex direction="column" gap="0">
          <Text size={textSize} weight="medium" truncate>
            {friendlyName}
          </Text>
          <Text
            size={textSizeSmall}
            color={streamError ? 'red' : isRecording || isStreaming ? 'blue' : 'gray'}
          >
            {streamError
              ? 'ERROR'
              : isRecording
                ? 'RECORDING'
                : isStreaming
                  ? 'STREAMING'
                  : isIdle
                    ? 'IDLE'
                    : entity.state.toUpperCase()}
          </Text>
        </Flex>

        {/* Control buttons - only show when streaming and not in edit mode */}
        {supportsStream && isStreaming && !streamError && !isEditMode && (
          <Flex gap={buttonGap}>
            <IconButton
              size={buttonSize}
              variant="soft"
              highContrast
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}
            </IconButton>
            <IconButton
              size={buttonSize}
              variant="soft"
              highContrast
              onClick={handleVideoFullscreen}
              title="Toggle native fullscreen"
            >
              <EnterFullScreenIcon />
            </IconButton>
          </Flex>
        )}
      </Flex>
    </Card>
  )
}

function CameraCardComponent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: CameraCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(true) // Start muted by default
  const normalContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

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
        title={streamError || (isStale ? 'Entity data may be outdated' : undefined)}
        className="camera-card"
        style={{
          backgroundColor:
            (isRecording || isStreaming_) && !isSelected && !streamError
              ? 'var(--blue-3)'
              : undefined,
          borderColor:
            (isRecording || isStreaming_) && !isSelected && !streamError && !isStale
              ? 'var(--blue-6)'
              : undefined,
          borderWidth:
            isSelected || streamError || isRecording || isStreaming_ || isStale ? '2px' : '1px',
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
                        objectFit: isFullscreen ? 'contain' : 'cover',
                        display: isStreaming ? 'block' : 'none',
                      }}
                    />
                  </KeepAlive>
                </>
              )}
              {!isStreaming && !streamError && (
                <Text size="2" color="gray">
                  Connecting...
                </Text>
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
                    color: isStale
                      ? 'var(--orange-9)'
                      : isRecording || isStreaming_
                        ? 'var(--blue-9)'
                        : 'var(--gray-9)',
                    opacity: isStale ? 0.6 : 1,
                    transition: 'opacity 0.2s ease',
                    width: 20,
                    height: 20,
                  }}
                />
              </GridCard.Icon>
            </Flex>
          )}

          {/* Controls and info container positioned absolutely at bottom left */}
          <Box
            position="absolute"
            bottom={isFullscreen ? '4' : '2'}
            left={isFullscreen ? '4' : '2'}
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
              handleToggleMute={handleToggleMute}
              handleVideoFullscreen={handleVideoFullscreen}
              size={size}
            />
          </Box>
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

        {/* Fullscreen controls and info container */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 10,
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
            handleToggleMute={handleToggleMute}
            handleVideoFullscreen={handleVideoFullscreen}
            size="large"
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
    prevProps.onSelect === nextProps.onSelect
  )
})

export const CameraCard = Object.assign(MemoizedCameraCard, {
  defaultDimensions: { width: 4, height: 2 },
})
