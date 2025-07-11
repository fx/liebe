import { useRef, useCallback, useEffect, useState } from 'react'
import type { UnsubscribeFunc } from 'home-assistant-js-websocket'
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

interface WebRTCOfferMessage {
  type: 'camera/webrtc/offer'
  entity_id: string
  offer: string
}

interface WebRTCReceiveMessage {
  type: 'session' | 'answer' | 'candidate' | 'error'
  session_id?: string
  answer?: string
  candidate?: RTCIceCandidateInit
  error?: { code: string; message: string } | string
}

interface ExtendedRTCPeerConnection extends RTCPeerConnection {
  sessionId?: string
  unsubscribe?: UnsubscribeFunc
}

export function useWebRTC({ entityId, enabled = true }: UseWebRTCOptions): UseWebRTCReturn {
  const hass = useHomeAssistantOptional()
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const initializingRef = useRef<boolean>(false)
  const pendingInitRef = useRef<boolean>(false)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const cleanup = useCallback(async () => {
    // Store reference to peer connection before clearing
    const pc = peerConnectionRef.current as ExtendedRTCPeerConnection

    // Clear the references immediately to prevent double cleanup
    peerConnectionRef.current = null
    initializingRef.current = false
    pendingInitRef.current = false
    pendingCandidatesRef.current = []

    if (pc) {
      // Unsubscribe from WebSocket messages if available
      if (pc.unsubscribe && typeof pc.unsubscribe === 'function') {
        try {
          await pc.unsubscribe()
        } catch (err) {
          // Ignore "subscription not found" errors during cleanup
          if (err && typeof err === 'object' && 'code' in err && err.code !== 'not_found') {
            console.error('[WebRTC] Error unsubscribing:', err)
          }
        }
      }

      // Close the peer connection
      try {
        pc.close()
      } catch (err) {
        console.error('[WebRTC] Error closing peer connection:', err)
      }
    }

    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  const initializeWebRTC = useCallback(async () => {
    if (!hass || !enabled || !videoElementRef.current) return

    // Prevent multiple initializations
    if (peerConnectionRef.current || initializingRef.current) {
      // If we have an existing connection that's still active, don't reinitialize
      if (
        peerConnectionRef.current &&
        (peerConnectionRef.current.connectionState === 'connected' ||
          peerConnectionRef.current.connectionState === 'connecting')
      ) {
        return
      }
      return
    }

    initializingRef.current = true
    setError(null)
    pendingCandidatesRef.current = []

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
        console.log(`[WebRTC] Connection state changed to: ${pc.connectionState}`)

        switch (pc.connectionState) {
          case 'failed':
            setError('Connection failed')
            setIsStreaming(false)
            // Clean up the connection
            cleanup()
            break
          case 'disconnected':
            setError('Connection lost')
            setIsStreaming(false)
            break
          case 'connected':
            // Clear any previous errors when successfully connected
            setError(null)
            break
          case 'closed':
            // Connection was closed, ensure we're cleaned up
            setIsStreaming(false)
            break
        }
      }

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      let sessionId: string | undefined

      // Send WebRTC offer to Home Assistant using proper home-assistant-js-websocket API
      const offerMessage: WebRTCOfferMessage = {
        type: 'camera/webrtc/offer',
        entity_id: entityId,
        offer: offer.sdp!,
      }

      const unsubscribePromise = hass.connection.subscribeMessage<WebRTCReceiveMessage>(
        (message: WebRTCReceiveMessage) => {
          try {
            switch (message.type) {
              case 'session': {
                sessionId = message.session_id

                // Store session ID for ICE candidate exchange
                const extendedPc = pc as ExtendedRTCPeerConnection
                extendedPc.sessionId = sessionId

                // Set up ICE candidate handler
                pc.onicecandidate = async (iceEvent) => {
                  if (iceEvent.candidate && sessionId) {
                    try {
                      await hass.connection.sendMessagePromise({
                        type: 'camera/webrtc/candidate',
                        entity_id: entityId,
                        session_id: sessionId,
                        candidate: iceEvent.candidate,
                      })
                    } catch (_err) {
                      console.error('[WebRTC] Failed to send ICE candidate:', _err)
                    }
                  }
                }
                break
              }

              case 'answer':
                if (!message.answer) {
                  return
                }
                // Check if we're in the correct state to set remote description
                if (pc.signalingState === 'have-local-offer') {
                  // Set the remote description
                  pc.setRemoteDescription({ type: 'answer', sdp: message.answer })
                    .then(() => {
                      // Process any pending ICE candidates
                      if (pendingCandidatesRef.current.length > 0) {
                        console.log(
                          `[WebRTC] Processing ${pendingCandidatesRef.current.length} pending ICE candidates`
                        )
                        pendingCandidatesRef.current.forEach((candidate) => {
                          pc.addIceCandidate(candidate).catch((err) =>
                            console.error('[WebRTC] Failed to add pending ICE candidate:', err)
                          )
                        })
                        pendingCandidatesRef.current = []
                      }
                    })
                    .catch((err) => {
                      console.error('[WebRTC] Failed to set remote description:', err)
                      setError('Failed to set remote description')
                    })
                } else {
                  console.warn(
                    `[WebRTC] Ignoring answer in wrong state: ${pc.signalingState}. This may indicate duplicate messages or timing issues.`
                  )
                }
                break

              case 'candidate':
                if (message.candidate) {
                  // Only add ICE candidates if we have a remote description
                  if (pc.remoteDescription) {
                    pc.addIceCandidate(message.candidate).catch((err) =>
                      console.error('[WebRTC] Failed to add ICE candidate:', err)
                    )
                  } else {
                    // Queue the candidate to be added later when remote description is set
                    pendingCandidatesRef.current.push(message.candidate)
                    console.log(
                      `[WebRTC] Queuing ICE candidate (${pendingCandidatesRef.current.length} pending)`
                    )
                  }
                }
                break

              case 'error': {
                const errorMsg =
                  typeof message.error === 'string'
                    ? message.error
                    : message.error?.message || 'WebRTC error'
                setError(errorMsg)
                break
              }
            }
          } catch (err) {
            console.error('[WebRTC] Error handling message:', err)
            setError(err instanceof Error ? err.message : 'WebRTC error')
          }
        },
        offerMessage
      )

      // Wait for subscription and store unsubscribe function
      unsubscribePromise
        .then((unsubscribe) => {
          const extendedPc = pc as ExtendedRTCPeerConnection
          extendedPc.unsubscribe = unsubscribe
          initializingRef.current = false
        })
        .catch((_err) => {
          setError('Failed to establish WebRTC connection')
          initializingRef.current = false
        })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize WebRTC')
      initializingRef.current = false
      await cleanup()
    }
  }, [hass, enabled, entityId, cleanup])

  const retry = useCallback(() => {
    setRetryCount((prev) => prev + 1)
  }, [])

  const videoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element
  }, [])

  // Initialize WebRTC when conditions are met
  useEffect(() => {
    // Cleanup if disabled or entity changed
    if (!enabled) {
      cleanup()
      return
    }

    // Don't initialize if we don't have all requirements
    if (!videoElementRef.current || !hass) {
      return
    }

    // Don't initialize if already initializing, initialized, or pending
    if (peerConnectionRef.current || initializingRef.current || pendingInitRef.current) {
      return
    }

    // Set pending flag to prevent multiple timer setups
    pendingInitRef.current = true

    // Debounce initialization to prevent rapid re-triggers
    const timer = setTimeout(() => {
      pendingInitRef.current = false

      // Double-check conditions before initializing (could have changed during timeout)
      if (
        videoElementRef.current &&
        hass &&
        enabled &&
        !peerConnectionRef.current &&
        !initializingRef.current
      ) {
        initializeWebRTC()
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      pendingInitRef.current = false
    }
  }, [enabled, hass, entityId, retryCount, cleanup, initializeWebRTC])

  // Cleanup on unmount
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
