import { Flex, Text } from '@radix-ui/themes'
import { CameraIcon, PlayIcon, PauseIcon } from '@radix-ui/react-icons'
import { useEntity, useRemoteHass } from '~/hooks'
import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import { useDashboardStore } from '~/store'
import type Hls from 'hls.js'

interface CameraCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface CameraAttributes {
  friendly_name?: string
  entity_picture?: string
  access_token?: string
  frontend_stream_type?: string
  supported_features?: number
}

// Camera supported features bit flags from Home Assistant
const SUPPORT_STREAM = 2

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
  const hass = useRemoteHass()

  // Stream state
  const [isStreamLoading, setIsStreamLoading] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  // Refs for video element and HLS instance
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const cameraAttributes = entity?.attributes as CameraAttributes | undefined
  const supportsStream = (cameraAttributes?.supported_features ?? 0) & SUPPORT_STREAM

  // Get camera snapshot URL
  const getCameraSnapshotUrl = useCallback(() => {
    if (!hass || !entity) return null

    // Use entity_picture if available
    if (cameraAttributes?.entity_picture) {
      return cameraAttributes.entity_picture
    }

    // Otherwise use the standard camera proxy endpoint
    // Home Assistant will handle authentication automatically in custom panel mode
    return `/api/camera_proxy/${entityId}`
  }, [hass, entity, entityId, cameraAttributes])

  // Get camera stream URL
  const getCameraStreamUrl = useCallback(async () => {
    if (!hass || !entity || !supportsStream) return null

    try {
      setIsStreamLoading(true)
      setStreamError(null)

      // For now, we'll use the standard HLS stream endpoint
      // Home Assistant will create the stream when accessed
      // This follows the pattern from Home Assistant's frontend
      return `/api/camera_proxy_stream/${entityId}/master.m3u8`
    } catch (error) {
      console.error('Failed to get camera stream:', error)
      setStreamError('Failed to load camera stream')
      return null
    } finally {
      setIsStreamLoading(false)
    }
  }, [hass, entity, entityId, supportsStream])

  // Update snapshot URL when entity changes
  useEffect(() => {
    if (entity && isConnected) {
      const url = getCameraSnapshotUrl()
      setImageUrl(url)
    }
  }, [entity, isConnected, getCameraSnapshotUrl])

  // Initialize/cleanup HLS stream
  useEffect(() => {
    const initializeStream = async () => {
      if (!streamUrl || !videoRef.current || size === 'small') return

      // Dynamically import HLS.js
      try {
        const Hls = (await import('hls.js')).default

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          })

          hlsRef.current = hls

          hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean }) => {
            if (data.fatal) {
              console.error('HLS fatal error:', data)
              setStreamError('Stream playback error')
              setIsPlaying(false)
            }
          })

          hls.loadSource(streamUrl)
          hls.attachMedia(videoRef.current)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (isPlaying && videoRef.current) {
              videoRef.current.play().catch((err) => {
                console.error('Failed to play video:', err)
                setStreamError('Failed to play stream')
                setIsPlaying(false)
              })
            }
          })
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari)
          videoRef.current.src = streamUrl
          if (isPlaying) {
            videoRef.current.play().catch((err) => {
              console.error('Failed to play video:', err)
              setStreamError('Failed to play stream')
              setIsPlaying(false)
            })
          }
        } else {
          setStreamError('HLS not supported')
        }
      } catch (error) {
        console.error('Failed to load HLS.js:', error)
        setStreamError('Failed to load video player')
      }
    }

    initializeStream()

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [streamUrl, isPlaying, size])

  // Handle play/pause toggle
  const handlePlayPause = useCallback(async () => {
    if (isStreamLoading) return

    if (!isPlaying) {
      // Start playing
      if (!streamUrl) {
        const url = await getCameraStreamUrl()
        if (url) {
          setStreamUrl(url)
          setIsPlaying(true)
        }
      } else {
        setIsPlaying(true)
        if (videoRef.current) {
          videoRef.current.play().catch((err) => {
            console.error('Failed to play video:', err)
            setStreamError('Failed to play stream')
            setIsPlaying(false)
          })
        }
      }
    } else {
      // Pause
      setIsPlaying(false)
      if (videoRef.current) {
        videoRef.current.pause()
      }
    }
  }, [isPlaying, streamUrl, getCameraStreamUrl, isStreamLoading])

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
  const friendlyName = cameraAttributes?.friendly_name || entity.entity_id

  // For small cards, clicking should show the snapshot in a larger view (future enhancement)
  const handleClick = size === 'small' ? undefined : undefined

  return (
    <GridCard
      size={size}
      isLoading={isStreamLoading}
      isError={!!streamError}
      isStale={isStale}
      isSelected={isSelected}
      isOn={false}
      isUnavailable={isUnavailable}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      title={streamError || (isStale ? 'Entity data may be outdated' : undefined)}
      className="camera-card"
      style={{
        borderWidth: isSelected || streamError || isStale ? '2px' : '1px',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        {/* Show snapshot for small size or when not playing */}
        {(size === 'small' || !isPlaying) && imageUrl && (
          <img
            src={imageUrl}
            alt={friendlyName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            onError={(e) => {
              console.error('Failed to load camera snapshot')
              e.currentTarget.style.display = 'none'
            }}
          />
        )}

        {/* Video element for live stream (medium/large sizes) */}
        {size !== 'small' && (
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
              display: isPlaying ? 'block' : 'none',
            }}
            muted
            playsInline
          />
        )}

        {/* Overlay content */}
        <Flex
          direction="column"
          align="center"
          justify="between"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: 'var(--space-3)',
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)',
          }}
        >
          {/* Camera icon for error/unavailable states */}
          {(isUnavailable || (!imageUrl && !isPlaying)) && (
            <Flex align="center" justify="center" style={{ flex: 1 }}>
              <CameraIcon
                style={{
                  width: 40,
                  height: 40,
                  color: 'var(--gray-8)',
                  opacity: 0.5,
                }}
              />
            </Flex>
          )}

          {/* Bottom controls */}
          <Flex direction="column" align="center" gap="2" style={{ width: '100%' }}>
            {/* Play/Pause button for medium/large sizes */}
            {!isEditMode && size !== 'small' && supportsStream && (
              <button
                onClick={handlePlayPause}
                disabled={isStreamLoading}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isStreamLoading ? 'not-allowed' : 'pointer',
                  opacity: isStreamLoading ? 0.5 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {isPlaying ? (
                  <PauseIcon style={{ width: 20, height: 20, color: 'white' }} />
                ) : (
                  <PlayIcon style={{ width: 20, height: 20, color: 'white' }} />
                )}
              </button>
            )}

            {/* Camera name */}
            <Text
              size="2"
              weight="medium"
              style={{
                color: 'white',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              }}
            >
              {friendlyName}
            </Text>

            {/* Status text */}
            {(streamError || isUnavailable) && (
              <Text
                size="1"
                weight="medium"
                style={{
                  color: 'var(--red-9)',
                  background: 'rgba(255, 255, 255, 0.9)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                {streamError || 'UNAVAILABLE'}
              </Text>
            )}
          </Flex>
        </Flex>
      </Flex>
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const CameraCard = memo(CameraCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.size === nextProps.size &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})
