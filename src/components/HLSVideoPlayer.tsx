import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { Flex, IconButton } from '@radix-ui/themes'
import {
  PlayIcon,
  PauseIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  SpeakerModerateIcon,
} from '@radix-ui/react-icons'
import { ErrorDisplay } from './ui'

interface HLSVideoPlayerProps {
  url: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  controls?: boolean
  onError?: (error: Error) => void
  onLoadedMetadata?: () => void
  onStreamExpired?: () => void
}

// Track the current URL for each HLS instance
const hlsUrlMap = new WeakMap<Hls, string>()

export function HLSVideoPlayer({
  url,
  poster,
  autoPlay = true,
  muted = true,
  controls = true,
  onError,
  onLoadedMetadata,
  onStreamExpired,
}: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [isMuted, setIsMuted] = useState(muted)
  const [volume, setVolume] = useState(muted ? 0 : 1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    // Don't reinitialize if we already have an HLS instance with the same URL
    if (hlsRef.current && hlsUrlMap.get(hlsRef.current) === url) {
      return
    }

    setError(null)
    setIsLoading(true)

    // Clean up previous HLS instance if it exists
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // If HLS is supported natively by the browser
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.load()
    }
    // Use HLS.js for browsers that don't support HLS natively
    else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1, // Auto quality selection
        debug: false,
        lowLatencyMode: true,
        backBufferLength: 90,
      })

      hlsRef.current = hls
      hls.attachMedia(video)

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(url)
        // Store the URL for comparison
        hlsUrlMap.set(hls, url)
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false)
        if (autoPlay) {
          video.play().catch((e) => {
            console.error('Auto-play failed:', e)
            setIsPlaying(false)
          })
        }
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', event, data)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Check if it's a 401/403 error which might indicate expired token
              if (data.response?.code === 401 || data.response?.code === 403) {
                console.log('Stream token may have expired')
                onStreamExpired?.()
              } else {
                setError('Network error - unable to load stream')
                hls.startLoad()
              }
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - stream format issue')
              hls.recoverMediaError()
              break
            default:
              setError('Unable to load video stream')
              hls.destroy()
              break
          }
          onError?.(new Error(data.details))
        }
      })

      hls.loadSource(url)
    } else {
      setError('HLS is not supported in this browser')
    }

    // Cleanup
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [url, autoPlay, onError, onStreamExpired])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play().catch((e) => {
        console.error('Play failed:', e)
        setError('Failed to play video')
      })
    }
  }, [isPlaying])

  // Handle mute/unmute
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const newMuted = !isMuted
    video.muted = newMuted
    setIsMuted(newMuted)
    if (!newMuted && volume === 0) {
      video.volume = 0.5
      setVolume(0.5)
    }
  }, [isMuted, volume])

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const newVolume = parseFloat(e.target.value)
    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
    video.muted = newVolume === 0
  }, [])

  // Show/hide controls with mouse movement
  const handleMouseMove = useCallback(() => {
    if (!controls) return

    setShowControls(true)

    // Clear existing timeout
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
    }

    // Hide controls after 3 seconds of inactivity
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }, [controls])

  // Video event handlers
  const handlePlay = useCallback(() => setIsPlaying(true), [])
  const handlePause = useCallback(() => setIsPlaying(false), [])
  const handleLoadedMetadata = useCallback(() => {
    setIsLoading(false)
    onLoadedMetadata?.()
  }, [onLoadedMetadata])
  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const video = e.currentTarget
      const error = video.error
      if (error) {
        console.error('Video error:', error)
        setError(`Video error: ${error.message}`)
        onError?.(new Error(error.message))
      }
    },
    [onError]
  )

  if (error) {
    return <ErrorDisplay error={error} variant="inline" title="Stream Error" />
  }

  const VolumeIcon =
    isMuted || volume === 0 ? SpeakerOffIcon : volume < 0.5 ? SpeakerModerateIcon : SpeakerLoudIcon

  return (
    <Flex
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#000',
        cursor: controls && showControls ? 'default' : 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        muted={muted}
        autoPlay={autoPlay}
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        onPlay={handlePlay}
        onPause={handlePause}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
      />

      {/* Loading indicator */}
      {isLoading && (
        <Flex
          align="center"
          justify="center"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ color: 'white' }}>Loading stream...</div>
        </Flex>
      )}

      {/* Custom controls */}
      {controls && !isLoading && (
        <Flex
          direction="row"
          align="center"
          gap="2"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 'var(--space-3)',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            opacity: showControls ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Play/Pause button */}
          <IconButton size="2" variant="ghost" onClick={togglePlay} style={{ color: 'white' }}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </IconButton>

          {/* Volume controls */}
          <IconButton size="2" variant="ghost" onClick={toggleMute} style={{ color: 'white' }}>
            <VolumeIcon />
          </IconButton>

          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            style={{
              width: '80px',
              height: '4px',
              background: 'rgba(255, 255, 255, 0.3)',
              outline: 'none',
              cursor: 'pointer',
            }}
          />

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Quality indicator could go here */}
        </Flex>
      )}
    </Flex>
  )
}
