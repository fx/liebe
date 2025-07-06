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
      // This will require either:
      // 1. A custom component that provides WebRTC endpoints
      // 2. Integration with go2rtc addon
      // 3. Direct RTSP URL from camera entity attributes
      //
      // Will use _entityId parameter when implementing the actual WebRTC connection

      // For now, we'll throw an error indicating the feature is not yet implemented
      throw new Error(
        'Camera streaming requires additional setup. The camera needs to be configured in your streaming service (go2rtc, Frigate, etc.) before it can be displayed here.'
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
