import { Card, Flex, Text } from '@radix-ui/themes'
import { useEffect, useState } from 'react'
import { getPlaybackQuality } from './videoQuality'

export interface CameraStatsProps {
  size: 'small' | 'medium' | 'large'
  videoElement: HTMLVideoElement | null
}

const CODE_FONT = { fontFamily: 'var(--code-font-family)' } as const

function StatItem({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <Flex direction="column" gap="0">
      <Text size="1" color="gray" style={{ ...CODE_FONT, fontSize: '10px' }}>
        {label}
      </Text>
      <Text size="1" weight="medium" color={alert ? 'red' : undefined} style={CODE_FONT}>
        {value}
      </Text>
    </Flex>
  )
}

// Stats display component. Reads FPS, resolution, decoded frames, and dropped
// frames from the video via getPlaybackQuality (standard API with webkit/moz
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

      const { decodedFrames, droppedFrames } = getPlaybackQuality(videoElement)

      // Calculate FPS based on decoded frames
      const framesDelta = decodedFrames - lastDecodedFrames
      const fps = deltaTime > 0 ? Math.round(framesDelta / deltaTime) : 0

      // Get video resolution
      const resolution =
        videoElement.videoWidth && videoElement.videoHeight
          ? `${videoElement.videoWidth}x${videoElement.videoHeight}`
          : ''

      // Return the previous object when nothing changed so React bails out of
      // the re-render instead of reconciling a fresh-but-equal object every
      // second.
      setStats((prev) =>
        prev.fps === fps &&
        prev.decodedFrames === decodedFrames &&
        prev.droppedFrames === droppedFrames &&
        prev.resolution === resolution
          ? prev
          : { fps, decodedFrames, droppedFrames, resolution }
      )

      lastTime = now
      lastDecodedFrames = decodedFrames
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
        <Text size="1" style={CODE_FONT}>
          {stats.fps} FPS • {stats.resolution}
        </Text>
      ) : (
        // Flex layout for medium/large
        <Flex gap="3" align="center">
          <StatItem label="FPS" value={String(stats.fps)} />
          <StatItem label="Resolution" value={stats.resolution} />
          <StatItem label="Frames" value={String(stats.decodedFrames)} />
          <StatItem
            label="Dropped"
            value={String(stats.droppedFrames)}
            alert={stats.droppedFrames > 0}
          />
        </Flex>
      )}
    </Card>
  )
}
