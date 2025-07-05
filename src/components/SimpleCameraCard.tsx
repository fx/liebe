import { Flex, Text, Button } from '@radix-ui/themes'
import { CameraIcon, PlayIcon } from '@radix-ui/react-icons'
import { useHassUrl, useRemoteHass } from '~/hooks'
import { useState, useCallback, useEffect, memo } from 'react'
import { HLSVideoPlayer } from './HLSVideoPlayer'

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
  const hass = useRemoteHass()
  const [showStream, setShowStream] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [isLoadingStream, setIsLoadingStream] = useState(false)

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
      // Try to use WebSocket to get HLS stream URL
      // Check if the connection has sendMessagePromise method
      const hassWithWS = hass as unknown as HassWithWebSocket
      const connection = hassWithWS.connection

      if (connection?.sendMessagePromise) {
        console.log('[CameraCard] Using WebSocket to get camera stream URL for', entityId)
        try {
          // Use WebSocket to get the HLS stream URL
          const result = await connection.sendMessagePromise({
            type: 'camera/stream',
            entity_id: entityId,
          })

          console.log('[CameraCard] WebSocket camera/stream response:', result)

          if (result?.url) {
            const hlsUrl = toAbsoluteUrl(result.url)
            console.log('[CameraCard] Got HLS URL from WebSocket:', hlsUrl)
            setStreamUrl(hlsUrl)
            setShowStream(true)
            return
          }
        } catch (wsError) {
          console.warn('[CameraCard] WebSocket camera/stream failed:', wsError)
          // Fall through to use direct URL
        }
      } else {
        console.log('[CameraCard] WebSocket sendMessagePromise not available, using direct URL')
      }

      // Fallback: Use the direct HLS stream endpoint
      // This is the standard Home Assistant camera proxy stream endpoint
      const hlsUrl = toAbsoluteUrl(`/api/camera_proxy_stream/${entityId}/master.m3u8`)
      setStreamUrl(hlsUrl)
      setShowStream(true)
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
    } else {
      getStreamUrl()
    }
  }, [showStream, getStreamUrl])

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
      {/* Show HLS stream or snapshot */}
      {showStream && streamUrl ? (
        <HLSVideoPlayer
          key={entityId} // Use entityId as key to prevent unnecessary remounts
          url={streamUrl}
          poster={imageUrl}
          autoPlay={true}
          muted={true}
          controls={true}
          onError={() => {
            setShowStream(false)
            setStreamUrl(null)
          }}
          onStreamExpired={() => {
            console.log('[CameraCard] Stream expired, refreshing...')
            // Just refresh the stream URL without clearing it first
            // This prevents the player from being destroyed and recreated
            getStreamUrl()
          }}
        />
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
