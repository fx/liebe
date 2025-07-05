import { Flex, Text, Button, SegmentedControl } from '@radix-ui/themes'
import { CameraIcon, PlayIcon } from '@radix-ui/react-icons'
import { useHassUrl, useHomeAssistant } from '~/hooks'
import { useState, useCallback, useEffect, memo } from 'react'
import { HLSPlayer } from './HLSPlayer'
import { WebRTCPlayer } from './WebRTCPlayer'

import type { HassEntity } from '~/store/entityTypes'

interface SimpleCameraCardProps {
  entity: HassEntity
  entityId: string
}

interface HassWithWebSocket {
  connection?: {
    sendMessagePromise?: (message: { type: string; entity_id: string }) => Promise<{ url?: string }>
  }
}

function SimpleCameraCardComponent({ entity, entityId }: SimpleCameraCardProps) {
  const { toAbsoluteUrl } = useHassUrl()
  const hass = useHomeAssistant()
  const [showStream, setShowStream] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [isLoadingStream, setIsLoadingStream] = useState(false)
  const [streamType, setStreamType] = useState<'webrtc' | 'hls'>('webrtc')

  const friendlyName = entity?.attributes?.friendly_name || entityId
  const isUnavailable = entity?.state === 'unavailable'
  const supportsStream =
    entity?.attributes?.supported_features && (entity.attributes.supported_features & 2) !== 0

  // Get camera snapshot URL
  const imageUrl = entity?.attributes?.entity_picture
    ? toAbsoluteUrl(entity.attributes.entity_picture as string)
    : toAbsoluteUrl(`/api/camera_proxy/${entityId}`)

  // Get stream URL when needed
  const getStreamUrl = useCallback(async () => {
    if (!hass || !supportsStream) return

    setIsLoadingStream(true)
    try {
      // Use WebSocket to get HLS stream URL - REQUIRED for proper authentication
      const hassWithWS = hass as unknown as HassWithWebSocket
      const connection = hassWithWS.connection

      if (connection?.sendMessagePromise) {
        console.log('[CameraCard] Using WebSocket to get camera stream URL for', entityId)

        // Use WebSocket to get the HLS stream URL
        const result = await connection.sendMessagePromise({
          type: 'camera/stream',
          entity_id: entityId,
        })

        console.log('[CameraCard] WebSocket camera/stream response:', result)

        if (result?.url) {
          // The URL from camera/stream already includes authentication
          // It should be in the format: /api/hls/{token}/playlist.m3u8
          const hlsUrl = toAbsoluteUrl(result.url)
          console.log('[CameraCard] Got HLS URL from WebSocket:', hlsUrl)
          console.log('[CameraCard] Full stream response:', result)

          // Check if we have access token
          const accessToken = (result as { access_token?: string })?.access_token
          if (accessToken) {
            console.log('[CameraCard] Got access token for stream')
          }

          setStreamUrl(hlsUrl)
          setShowStream(true)
          return
        } else {
          throw new Error('No URL in camera/stream response')
        }
      } else {
        throw new Error('WebSocket sendMessagePromise not available')
      }
    } catch (error) {
      console.error('[CameraCard] Failed to get camera stream:', error)
      // Fall back to snapshot view
      setShowStream(false)
    } finally {
      setIsLoadingStream(false)
    }
  }, [hass, entityId, supportsStream, toAbsoluteUrl])

  // Handle play button click
  const handlePlayClick = useCallback(() => {
    if (showStream) {
      setShowStream(false)
      setStreamUrl(null)
      setStreamType('webrtc') // Reset to WebRTC for next time
    } else {
      // For WebRTC, we don't need to get a stream URL
      if (streamType === 'webrtc') {
        setShowStream(true)
      } else {
        getStreamUrl()
      }
    }
  }, [showStream, streamType, getStreamUrl])

  // Clean up stream when component unmounts
  useEffect(() => {
    return () => {
      if (streamUrl) {
        // Stream cleanup is handled by HLS player
        setStreamUrl(null)
      }
    }
  }, [streamUrl])

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Show stream or snapshot */}
      {showStream ? (
        streamType === 'webrtc' ? (
          <WebRTCPlayer
            entityId={entityId}
            onError={(error) => {
              console.error('[CameraCard] WebRTC error:', error)
              // Try falling back to HLS
              setStreamType('hls')
              if (!streamUrl) {
                getStreamUrl()
              }
            }}
          />
        ) : streamUrl ? (
          <HLSPlayer
            url={streamUrl}
            poster={imageUrl}
            onError={() => {
              console.error('[CameraCard] HLS Player error, reverting to snapshot')
              setShowStream(false)
              setStreamUrl(null)
            }}
            onStreamExpired={() => {
              console.log('[CameraCard] Stream expired, refreshing...')
              getStreamUrl()
            }}
          />
        ) : null
      ) : (
        imageUrl &&
        !isUnavailable && (
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
              console.error(`Failed to load camera snapshot for ${entityId}`)
              e.currentTarget.style.display = 'none'
            }}
          />
        )
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
        {(isUnavailable || !imageUrl) && (
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

          {/* Stream controls */}
          {supportsStream && !isUnavailable && (
            <>
              <Button
                size="2"
                variant="soft"
                onClick={handlePlayClick}
                disabled={isLoadingStream}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  color: 'var(--gray-12)',
                }}
              >
                {isLoadingStream ? (
                  'Loading...'
                ) : showStream ? (
                  'Show Snapshot'
                ) : (
                  <>
                    <PlayIcon /> Live Stream
                  </>
                )}
              </Button>

              {/* Stream type selector - only show when streaming */}
              {showStream && (
                <SegmentedControl.Root
                  value={streamType}
                  onValueChange={(value) => {
                    const newType = value as 'webrtc' | 'hls'
                    setStreamType(newType)
                    // If switching to HLS and we don't have a URL yet, get it
                    if (newType === 'hls' && !streamUrl) {
                      getStreamUrl()
                    }
                  }}
                  size="1"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <SegmentedControl.Item value="webrtc">WebRTC</SegmentedControl.Item>
                  <SegmentedControl.Item value="hls">HLS</SegmentedControl.Item>
                </SegmentedControl.Root>
              )}
            </>
          )}

          {/* Status text */}
          {isUnavailable && (
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
              UNAVAILABLE
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}

export const SimpleCameraCard = memo(SimpleCameraCardComponent)
