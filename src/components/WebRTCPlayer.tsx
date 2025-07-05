import { useEffect, useRef, useState, useCallback } from 'react'
import { Flex, Text } from '@radix-ui/themes'

interface WebRTCPlayerProps {
  entityId: string
  go2rtcUrl?: string // Base URL for go2rtc, defaults to same host as HA
  onError?: (error: Error) => void
}

export function WebRTCPlayer({ entityId, go2rtcUrl, onError }: WebRTCPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Extract camera name from entity ID (remove domain prefix)
  const cameraName = entityId.split('.')[1]

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraName) return

    console.log('[WebRTCPlayer] Initializing WebRTC for camera:', cameraName)

    // Clean up previous connections
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    // Determine go2rtc WebSocket URL
    const baseUrl = go2rtcUrl || window.location.origin
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}:1984/api/ws?src=${cameraName}`

    console.log('[WebRTCPlayer] Connecting to go2rtc WebSocket:', wsUrl)

    try {
      // Create WebSocket connection for signaling
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      pcRef.current = pc

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('[WebRTCPlayer] Received track:', event.track.kind)
        if (event.track.kind === 'video' && video) {
          video.srcObject = event.streams[0]
          setIsLoading(false)
        }
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          console.log('[WebRTCPlayer] Sending ICE candidate')
          ws.send(
            JSON.stringify({
              type: 'webrtc/candidate',
              value: event.candidate.candidate,
            })
          )
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[WebRTCPlayer] Connection state:', pc.connectionState)
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setHasError(true)
          setErrorMessage('WebRTC connection failed')
          onError?.(new Error('WebRTC connection failed'))
        }
      }

      // WebSocket event handlers
      ws.onopen = async () => {
        console.log('[WebRTCPlayer] WebSocket connected, creating offer')

        // Add transceivers for receiving video/audio
        pc.addTransceiver('video', { direction: 'recvonly' })
        pc.addTransceiver('audio', { direction: 'recvonly' })

        // Create and send offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        ws.send(
          JSON.stringify({
            type: 'webrtc/offer',
            value: offer.sdp,
          })
        )
      }

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        console.log('[WebRTCPlayer] Received message:', msg.type)

        if (msg.type === 'webrtc/answer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription({
              type: 'answer',
              sdp: msg.value,
            })
          )
        } else if (msg.type === 'webrtc/candidate') {
          await pc.addIceCandidate({
            candidate: msg.value,
            sdpMid: '0',
          })
        } else if (msg.type === 'error') {
          console.error('[WebRTCPlayer] Error from server:', msg.value)
          setHasError(true)
          setErrorMessage(msg.value || 'Stream error')
          onError?.(new Error(msg.value))
        }
      }

      ws.onerror = (error) => {
        console.error('[WebRTCPlayer] WebSocket error:', error)
        setHasError(true)
        setErrorMessage('WebSocket connection failed')
        onError?.(new Error('WebSocket connection failed'))
      }

      ws.onclose = () => {
        console.log('[WebRTCPlayer] WebSocket closed')
      }
    } catch (error) {
      console.error('[WebRTCPlayer] Setup error:', error)
      setHasError(true)
      setErrorMessage('Failed to initialize WebRTC')
      onError?.(error as Error)
    }

    // Cleanup function
    return () => {
      console.log('[WebRTCPlayer] Cleaning up WebRTC connections')

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }

      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream
        stream.getTracks().forEach((track) => track.stop())
        video.srcObject = null
      }
    }
  }, [cameraName, go2rtcUrl, onError])

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget
      console.error('[WebRTCPlayer] Video error:', video.error)
      setHasError(true)
      setErrorMessage('Video playback error')
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
      align="center"
      justify="center"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: hasError ? 'none' : 'block',
        }}
        onError={handleVideoError}
        onLoadedMetadata={() => {
          console.log('[WebRTCPlayer] Video metadata loaded')
          videoRef.current?.play().catch((e) => {
            console.error('[WebRTCPlayer] Autoplay failed:', e)
          })
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
          <Text size="2" style={{ color: 'white' }}>
            Connecting to WebRTC stream...
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
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: 'var(--space-4)',
          }}
        >
          <Text size="3" weight="medium" style={{ color: 'var(--red-9)' }}>
            Stream Error
          </Text>
          <Text size="2" style={{ color: 'var(--gray-11)' }}>
            {errorMessage}
          </Text>
          <Text size="1" style={{ color: 'var(--gray-10)', marginTop: 'var(--space-2)' }}>
            Make sure go2rtc is installed and the camera is configured
          </Text>
        </Flex>
      )}
    </Flex>
  )
}
