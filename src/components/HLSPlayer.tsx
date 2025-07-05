import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { Flex } from '@radix-ui/themes'

interface HLSPlayerProps {
  url: string
  poster?: string
  onError?: (error: Error) => void
  onStreamExpired?: () => void
}

export function HLSPlayer({ url, poster, onError, onStreamExpired }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    console.log('[HLSPlayer] Initializing with URL:', url)

    // Prevent multiple instances
    if (hlsRef.current) {
      console.log('[HLSPlayer] Destroying existing HLS instance')
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false, // Disable debug logging to reduce spam
        xhrSetup: function (xhr) {
          xhr.withCredentials = false
        },
        // Live stream optimizations
        liveDurationInfinity: true,
        liveBackBufferLength: 30, // Keep 30 seconds of back buffer
        maxBufferLength: 30, // Maximum buffer length
        maxMaxBufferLength: 600, // Maximum buffer length on ABR switch
        lowLatencyMode: true,
        backBufferLength: 90,
        // Reduce stalling
        maxBufferHole: 0.5,
        maxFragLookUpTolerance: 0.25,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        // Optimize loading
        startFragPrefetch: true,
        progressive: true,
        testBandwidth: false, // Disable bandwidth testing
        // Retry configuration
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 0,
      })

      hlsRef.current = hls

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLSPlayer] Manifest parsed, starting playback')
        setIsLoading(false)
        // Start playback with muted audio for autoplay
        video.muted = true
        video.play().catch((e) => {
          console.error('[HLSPlayer] Autoplay failed:', e)
          // Try again with user interaction
          setIsLoading(false)
        })
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('[HLSPlayer] Fatal HLS error:', data)
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('[HLSPlayer] Fatal network error, trying to recover')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('[HLSPlayer] Fatal media error, trying to recover')
              hls.recoverMediaError()
              break
            default:
              console.error('[HLSPlayer] Fatal error, cannot recover')
              setHasError(true)
              if (data.response?.code === 401 || data.response?.code === 403) {
                onStreamExpired?.()
              } else {
                onError?.(new Error(data.details))
              }
              break
          }
        } else if (
          data.type === Hls.ErrorTypes.MEDIA_ERROR &&
          data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR
        ) {
          // Ignore non-fatal buffer stalled errors
          console.log('[HLSPlayer] Buffer stalled, will recover automatically')
        }
      })

      // Add buffer and playback monitoring
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        const buffered = video.buffered
        if (buffered.length > 0) {
          const bufferedEnd = buffered.end(buffered.length - 1)
          const currentTime = video.currentTime
          const bufferLength = bufferedEnd - currentTime
          if (bufferLength < 2 && !video.paused) {
            console.log('[HLSPlayer] Low buffer detected:', bufferLength)
          }
        }
      })

      hls.loadSource(url)
      hls.attachMedia(video)

      // Store reference
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      console.log('[HLSPlayer] Using native HLS support')
      video.src = url
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false)
        video.play().catch((e) => {
          console.error('[HLSPlayer] Native autoplay failed:', e)
        })
      })
    }

    return () => {
      if (hlsRef.current) {
        console.log('[HLSPlayer] Cleaning up HLS instance')
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [url, onError, onStreamExpired])

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget
      console.error('[HLSPlayer] Video error:', {
        error: video.error,
        errorCode: video.error?.code,
        errorMessage: video.error?.message,
        src: video.src,
      })
      setHasError(true)
      onError?.(new Error('Video playback error'))
    },
    [onError]
  )

  return (
    <Flex
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#000',
      }}
    >
      <video
        ref={videoRef}
        controls
        muted
        playsInline
        autoPlay
        poster={poster}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={handleVideoError}
        onLoadedMetadata={() => {
          console.log('[HLSPlayer] Video metadata loaded')
        }}
        onCanPlay={() => {
          console.log('[HLSPlayer] Video can play')
          setIsLoading(false)
        }}
      />

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
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: 'white' }}>Loading HLS stream...</div>
        </Flex>
      )}
    </Flex>
  )
}
