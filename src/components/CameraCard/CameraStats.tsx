import { Card, Flex, Text } from '@radix-ui/themes'
import { useEffect, useState } from 'react'

export interface CameraStatsProps {
  size: 'small' | 'medium' | 'large'
  videoElement: HTMLVideoElement | null
}

// Stats display component. Reads FPS, resolution, decoded frames, and dropped
// frames from the video via getVideoPlaybackQuality (with webkit/moz
// fallbacks). Bitrate is gone: Liebe no longer owns an RTCPeerConnection to
// read it from.
export function CameraStats({ size, videoElement }: CameraStatsProps) {
  const [stats, setStats] = useState({
    fps: 0,
    decodedFrames: 0,
    droppedFrames: 0,
    resolution: '',
  })

  // Update stats every second
  useEffect(() => {
    if (!videoElement) return

    let lastTime = Date.now()
    let lastDecodedFrames = 0

    const updateStats = () => {
      const now = Date.now()
      const deltaTime = (now - lastTime) / 1000 // Convert to seconds

      // Get video quality stats
      const videoElem = videoElement as HTMLVideoElement & {
        getVideoPlaybackQuality?: () => { totalVideoFrames?: number; droppedVideoFrames?: number }
        webkitDecodedFrameCount?: number
        webkitDroppedFrameCount?: number
        mozDecodedFrames?: number
        mozParsedFrames?: number
      }
      const videoQuality = videoElem.getVideoPlaybackQuality?.()
      const currentDecodedFrames =
        videoQuality?.totalVideoFrames ||
        videoElem.webkitDecodedFrameCount ||
        videoElem.mozDecodedFrames ||
        0
      const currentDroppedFrames =
        videoQuality?.droppedVideoFrames ||
        videoElem.webkitDroppedFrameCount ||
        (videoElem.mozParsedFrames && videoElem.mozDecodedFrames
          ? videoElem.mozParsedFrames - videoElem.mozDecodedFrames
          : 0) ||
        0

      // Calculate FPS based on decoded frames
      const framesDelta = currentDecodedFrames - lastDecodedFrames
      const fps = deltaTime > 0 ? Math.round(framesDelta / deltaTime) : 0

      // Get video resolution
      const resolution =
        videoElement.videoWidth && videoElement.videoHeight
          ? `${videoElement.videoWidth}x${videoElement.videoHeight}`
          : ''

      setStats({
        fps,
        decodedFrames: currentDecodedFrames,
        droppedFrames: currentDroppedFrames,
        resolution,
      })

      lastTime = now
      lastDecodedFrames = currentDecodedFrames
    }

    // Initial update (deferred a tick so the reset happens outside the effect body)
    const initialTimer = setTimeout(updateStats, 0)

    // Update every second
    const interval = setInterval(updateStats, 1000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [videoElement])

  return (
    <Card
      size="1"
      style={{
        position: 'absolute',
        bottom: size === 'small' ? '4px' : '6px',
        right: size === 'small' ? '4px' : '6px',
        backgroundColor: 'var(--color-panel-translucent)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--gray-a5)',
        padding: 'var(--space-2)',
        fontSize: '11px',
      }}
    >
      {size === 'small' ? (
        // Compact single line for small size
        <Text size="1" style={{ fontFamily: 'var(--code-font-family)' }}>
          {stats.fps} FPS • {stats.resolution}
        </Text>
      ) : (
        // Flex layout for medium/large
        <Flex gap="3" align="center">
          <Flex direction="column" gap="0">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--code-font-family)', fontSize: '10px' }}
            >
              FPS
            </Text>
            <Text size="1" weight="medium" style={{ fontFamily: 'var(--code-font-family)' }}>
              {stats.fps}
            </Text>
          </Flex>

          <Flex direction="column" gap="0">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--code-font-family)', fontSize: '10px' }}
            >
              Resolution
            </Text>
            <Text size="1" weight="medium" style={{ fontFamily: 'var(--code-font-family)' }}>
              {stats.resolution}
            </Text>
          </Flex>

          <Flex direction="column" gap="0">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--code-font-family)', fontSize: '10px' }}
            >
              Frames
            </Text>
            <Text size="1" weight="medium" style={{ fontFamily: 'var(--code-font-family)' }}>
              {stats.decodedFrames}
            </Text>
          </Flex>

          <Flex direction="column" gap="0">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--code-font-family)', fontSize: '10px' }}
            >
              Dropped
            </Text>
            <Text
              size="1"
              weight="medium"
              color={stats.droppedFrames > 0 ? 'red' : undefined}
              style={{ fontFamily: 'var(--code-font-family)' }}
            >
              {stats.droppedFrames}
            </Text>
          </Flex>
        </Flex>
      )}
    </Card>
  )
}
