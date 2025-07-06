import { useRef, useCallback, useEffect, useState } from 'react'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'

interface UseWebRTCOptions {
  entityId: string
  enabled?: boolean
}

interface UseWebRTCReturn {
  videoRef: (element: HTMLVideoElement | null) => void
  isStreaming: boolean
  error: string | null
  retry: () => void
}

export function useWebRTC({
  entityId: _entityId,
  enabled = true,
}: UseWebRTCOptions): UseWebRTCReturn {
  const hass = useHomeAssistantOptional()
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  const initializeWebRTC = useCallback(async () => {
    if (!hass || !enabled || !videoElementRef.current) return

    setError(null)
    cleanup()

    try {
      // Create peer connection with STUN servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      })
      peerConnectionRef.current = pc

      // Add transceivers for receiving video/audio
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      // Handle incoming stream
      pc.ontrack = (event) => {
        if (videoElementRef.current && event.streams[0]) {
          videoElementRef.current.srcObject = event.streams[0]
          setIsStreaming(true)
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('Connection lost')
          setIsStreaming(false)
        }
      }

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // TODO: Implement WebRTC offer/answer exchange with Home Assistant
      // The hass object in custom panels doesn't have direct WebSocket access
      // We need to either:
      // 1. Use the hass-ws connection if available
      // 2. Call a service that returns WebRTC credentials
      // 3. Use the camera's stream URL directly with go2rtc

      // For now, check if camera supports WebRTC by looking at attributes
      const entity = hass.states[_entityId]
      if (!entity) {
        throw new Error('Camera entity not found')
      }

      // Check if this is a go2rtc stream or has WebRTC support
      const attributes = entity.attributes as any
      const streamSource = attributes.stream_source || attributes.entity_picture

      if (!streamSource) {
        throw new Error(
          'No stream source available. Ensure your camera is properly configured in Home Assistant.'
        )
      }

      // Provide helpful setup message
      throw new Error(
        'WebRTC streaming is not yet fully implemented. Camera entities need to be configured in go2rtc with WebRTC support enabled.'
      )
    } catch (err) {
      console.error('WebRTC initialization failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize WebRTC')
      cleanup()
    }
  }, [hass, enabled, cleanup])

  const retry = useCallback(() => {
    setRetryCount((prev) => prev + 1)
  }, [])

  const videoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      videoElementRef.current = element
      if (element && enabled) {
        initializeWebRTC()
      }
    },
    [enabled, initializeWebRTC]
  )

  // Retry on error or retry count change
  useEffect(() => {
    if (retryCount > 0 && enabled && videoElementRef.current) {
      initializeWebRTC()
    }
  }, [retryCount, enabled, initializeWebRTC])

  // Cleanup on unmount or when disabled
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    videoRef,
    isStreaming,
    error,
    retry,
  }
}
