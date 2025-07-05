import { useEffect, useRef, useState, useMemo } from 'react'
import { Flex, Text } from '@radix-ui/themes'
import { useHomeAssistant } from '~/hooks'

interface WebRTCPlayerProps {
  entityId: string
  onError?: (error: Error) => void
}

interface HassEntity {
  entity_id: string
  state: string
  attributes: {
    stream_source?: string
    camera_stream_source?: string
    stream_url?: string
    entity_picture?: string
    [key: string]: unknown
  }
}

// Configuration for go2rtc URL patterns
// Users can set GO2RTC_URL in their environment or we'll try common patterns
const GO2RTC_PATTERNS = [
  // Pattern 1: Direct port access (most reliable if port is exposed)
  (hostname: string, streamSource: string) =>
    `http://${hostname}:1984/stream.html?src=${encodeURIComponent(streamSource)}&mode=webrtc`,

  // Pattern 2: Common add-on ingress pattern (requires knowing the ingress path)
  (hostname: string, streamSource: string, protocol: string = 'http') =>
    `${protocol}://${hostname}/api/hassio_ingress/a889b5a8_go2rtc/stream.html?src=${encodeURIComponent(streamSource)}&mode=webrtc`,
]

export function WebRTCPlayer({ entityId, onError }: WebRTCPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0)
  const hass = useHomeAssistant()

  // Get the stream URL based on entity
  const streamUrl = useMemo(() => {
    if (!hass || !entityId) return null

    const entity = hass.states[entityId] as HassEntity | undefined
    if (!entity) return null

    // Try to get stream source from various entity attributes
    // Priority: stream_source > camera_stream_source > entity_picture (for RTSP URLs) > entity name
    let streamSource =
      entity.attributes.stream_source ||
      entity.attributes.camera_stream_source ||
      entity.attributes.stream_url

    // If no explicit stream source, check if entity_picture contains an RTSP URL
    if (!streamSource && entity.attributes.entity_picture) {
      const entityPicture = entity.attributes.entity_picture
      if (
        typeof entityPicture === 'string' &&
        (entityPicture.startsWith('rtsp://') ||
          entityPicture.startsWith('rtsps://') ||
          entityPicture.startsWith('http://') ||
          entityPicture.startsWith('https://'))
      ) {
        streamSource = entityPicture
      }
    }

    // Fallback to entity name (camera.name -> name)
    if (!streamSource) {
      streamSource = entityId.split('.')[1]
    }

    console.log('[WebRTCPlayer] Stream source for', entityId, ':', streamSource)

    // Build URL using current pattern
    try {
      const pattern = GO2RTC_PATTERNS[currentPatternIndex]
      if (!pattern) return null

      const hostname = window.location.hostname
      const protocol = window.location.protocol.replace(':', '')

      // Call pattern with appropriate arguments
      const url =
        pattern.length === 3
          ? pattern(hostname, streamSource, protocol)
          : pattern(hostname, streamSource)

      console.log('[WebRTCPlayer] Trying go2rtc URL pattern', currentPatternIndex + 1, ':', url)
      return url
    } catch (error) {
      console.error('[WebRTCPlayer] Error building stream URL:', error)
      return null
    }
  }, [hass, entityId, currentPatternIndex])

  useEffect(() => {
    if (!streamUrl) {
      setHasError(true)
      setErrorMessage('Unable to determine stream URL')
      onError?.(new Error('Unable to determine stream URL'))
    }
  }, [streamUrl, onError])

  const handleIframeLoad = () => {
    console.log('[WebRTCPlayer] go2rtc iframe loaded successfully')
    setIsLoading(false)
    setHasError(false)
  }

  const handleIframeError = () => {
    console.error(
      '[WebRTCPlayer] go2rtc iframe failed to load with pattern',
      currentPatternIndex + 1
    )

    // Try next pattern
    if (currentPatternIndex < GO2RTC_PATTERNS.length - 1) {
      console.log('[WebRTCPlayer] Trying next URL pattern...')
      setCurrentPatternIndex((prev) => prev + 1)
    } else {
      // All patterns failed
      setHasError(true)
      setErrorMessage('Failed to connect to go2rtc. Make sure go2rtc is installed and accessible.')
      setIsLoading(false)
      onError?.(new Error('Failed to connect to go2rtc'))
    }
  }

  // Reset state when entity changes
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
    setCurrentPatternIndex(0)
  }, [entityId])

  return (
    <Flex
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#000',
        overflow: 'hidden',
      }}
      align="center"
      justify="center"
    >
      {streamUrl && (
        <iframe
          key={`${entityId}-${currentPatternIndex}`} // Force reload on pattern change
          ref={iframeRef}
          src={streamUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: isLoading ? 'none' : 'block',
          }}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          allow="camera; microphone; autoplay; fullscreen"
          // Remove sandbox to allow all features needed by go2rtc
          title={`go2rtc stream for ${entityId}`}
        />
      )}

      {isLoading && !hasError && (
        <Flex
          align="center"
          justify="center"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            pointerEvents: 'none',
          }}
        >
          <Text size="2" style={{ color: 'white' }}>
            Connecting to go2rtc...
          </Text>
        </Flex>
      )}

      {hasError && (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="2"
          style={{
            padding: 'var(--space-4)',
            maxWidth: '400px',
          }}
        >
          <Text size="3" weight="medium" style={{ color: 'var(--red-9)' }}>
            WebRTC Stream Error
          </Text>
          <Text size="2" style={{ color: 'var(--gray-11)', textAlign: 'center' }}>
            {errorMessage}
          </Text>
          <Text
            size="1"
            style={{ color: 'var(--gray-10)', marginTop: 'var(--space-2)', textAlign: 'center' }}
          >
            Ensure go2rtc is installed and your camera is properly configured in go2rtc. The stream
            source must match the go2rtc configuration.
          </Text>
        </Flex>
      )}
    </Flex>
  )
}
