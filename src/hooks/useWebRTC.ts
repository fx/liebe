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
  hasFrameWarning: boolean
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
  const [hasFrameWarning, setHasFrameWarning] = useState(false)
  const cleanupRef = useRef<(() => Promise<void>) | null>(null)
  const frameMonitorRef = useRef<{
    lastFrameTime: number
    reconnectTimer: NodeJS.Timeout | null
    animationFrameId: number | null
    videoFrameCallbackCleanup: (() => void) | null
    lastWarningTime: number
  }>({
    lastFrameTime: 0,
    reconnectTimer: null,
    animationFrameId: null,
    videoFrameCallbackCleanup: null,
    lastWarningTime: 0,
  })

  const cleanup = useCallback(async () => {
    // Stop frame monitoring
    if (frameMonitorRef.current.reconnectTimer) {
      clearTimeout(frameMonitorRef.current.reconnectTimer)
      frameMonitorRef.current.reconnectTimer = null
    }
    if (frameMonitorRef.current.animationFrameId) {
      cancelAnimationFrame(frameMonitorRef.current.animationFrameId)
      frameMonitorRef.current.animationFrameId = null
    }
    if (frameMonitorRef.current.videoFrameCallbackCleanup) {
      frameMonitorRef.current.videoFrameCallbackCleanup()
      frameMonitorRef.current.videoFrameCallbackCleanup = null
    }
    frameMonitorRef.current.lastFrameTime = 0
    setHasFrameWarning(false)

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

  // Monitor video frames
  const startFrameMonitoring = useCallback(() => {
    if (!videoElementRef.current) return

    const video = videoElementRef.current
    frameMonitorRef.current.lastFrameTime = 0 // Start at 0 to detect first frame
    let lastTime = video.currentTime
    let lastDecodedFrames = 0
    let hasReceivedFirstFrame = false
    let debugLogTimer = Date.now()
    let frameCount = 0
    let lastDebugFrameCount = 0
    let videoFrameCallbackId: number | null = null

    // Use requestVideoFrameCallback if available for accurate frame detection
    if ('requestVideoFrameCallback' in video) {
      const onVideoFrame = (_now: number) => {
        frameMonitorRef.current.lastFrameTime = Date.now()
        frameCount++

        if (!hasReceivedFirstFrame) {
          hasReceivedFirstFrame = true
          console.log('[WebRTC] First frame received via requestVideoFrameCallback')
          setIsStreaming(true)
        }

        // Clear frame warning
        setHasFrameWarning(false)
        if (frameMonitorRef.current.reconnectTimer) {
          clearTimeout(frameMonitorRef.current.reconnectTimer)
          frameMonitorRef.current.reconnectTimer = null
        }

        // Continue monitoring
        videoFrameCallbackId = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (callback: (now: number) => void) => number
          }
        ).requestVideoFrameCallback(onVideoFrame)
      }

      videoFrameCallbackId = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback: (callback: (now: number) => void) => number
        }
      ).requestVideoFrameCallback(onVideoFrame)
    }

    const checkFrames = () => {
      if (!video || !video.srcObject) {
        frameMonitorRef.current.animationFrameId = null
        setIsStreaming(false)
        return
      }

      const now = Date.now()
      const currentTime = video.currentTime
      // For live streams, also check decoded frames and video dimensions
      const videoFrames =
        (
          video as HTMLVideoElement & {
            webkitDecodedFrameCount?: number
            mozDecodedFrames?: number
          }
        ).webkitDecodedFrameCount ||
        (video as HTMLVideoElement & { mozDecodedFrames?: number }).mozDecodedFrames ||
        0
      const hasVideoDimensions = video.videoWidth > 0 && video.videoHeight > 0

      // Multiple ways to detect frame updates:
      // 1. currentTime advancing (works for recorded video)
      // 2. Decoded frame count increasing (works for some browsers)
      // For live streams, we need actual frame changes, not just ready state
      const isReceivingFrames =
        (currentTime !== lastTime && video.readyState >= 2) || videoFrames > lastDecodedFrames

      if (isReceivingFrames) {
        frameMonitorRef.current.lastFrameTime = now
        lastTime = currentTime
        lastDecodedFrames = videoFrames
        frameCount++

        // We're receiving frames - set streaming to true
        if (!hasReceivedFirstFrame) {
          hasReceivedFirstFrame = true
          console.log('[WebRTC] First frame received, setting isStreaming to true')
          // For live streams that don't update currentTime or decoded frames,
          // we need to check if video dimensions are available as initial confirmation
          if (!isReceivingFrames && hasVideoDimensions && video.readyState >= 3) {
            console.log('[WebRTC] Live stream detected with dimensions, considering as streaming')
            frameMonitorRef.current.lastFrameTime = now
          }
        }
        setIsStreaming(true)

        // Clear frame warning since we're receiving frames
        setHasFrameWarning(false)
        if (frameMonitorRef.current.reconnectTimer) {
          clearTimeout(frameMonitorRef.current.reconnectTimer)
          frameMonitorRef.current.reconnectTimer = null
        }
      }

      // Debug logging every 5 seconds
      if (now - debugLogTimer >= 5000) {
        const fps = ((frameCount - lastDebugFrameCount) / 5).toFixed(1)
        const hasVideoFrameCallback = 'requestVideoFrameCallback' in video
        console.log(`[WebRTC Debug] ${entityId} Frame Stats:`, {
          fps,
          currentTime: currentTime.toFixed(2),
          decodedFrames: videoFrames,
          videoDimensions: `${video.videoWidth}x${video.videoHeight}`,
          readyState: video.readyState,
          networkState: video.networkState,
          buffered:
            video.buffered.length > 0
              ? `${video.buffered.start(0).toFixed(1)}-${video.buffered.end(0).toFixed(1)}`
              : 'none',
          isReceivingFrames,
          hasVideoFrameCallback,
          usingVideoFrameCallback: hasVideoFrameCallback && videoFrameCallbackId !== null,
          timeSinceLastFrame:
            frameMonitorRef.current.lastFrameTime > 0
              ? `${now - frameMonitorRef.current.lastFrameTime}ms`
              : 'N/A',
        })
        debugLogTimer = now
        lastDebugFrameCount = frameCount
      }

      // Only check for stale frames if we've received at least one frame
      if (frameMonitorRef.current.lastFrameTime > 0) {
        const timeDiff = now - frameMonitorRef.current.lastFrameTime

        // Show warning after 500ms without new frames (increased from 200ms for live streams)
        if (timeDiff > 500 && !frameMonitorRef.current.reconnectTimer) {
          // Set the warning state immediately
          if (!hasFrameWarning) {
            setHasFrameWarning(true)
          }

          // Only log warning once per second
          const timeSinceLastWarning = now - frameMonitorRef.current.lastWarningTime
          if (timeSinceLastWarning >= 1000) {
            console.log(`[WebRTC] Frame warning: No new frames for ${Math.round(timeDiff)}ms`)
            frameMonitorRef.current.lastWarningTime = now
          }
        }

        // Reconnect after 5 seconds without new frames (increased from 3s for stability)
        if (timeDiff > 5000 && !frameMonitorRef.current.reconnectTimer) {
          frameMonitorRef.current.reconnectTimer = setTimeout(() => {
            console.log('[WebRTC] No frames received for 5 seconds, reconnecting...')
            setHasFrameWarning(false)
            setIsStreaming(false)
            frameMonitorRef.current.reconnectTimer = null
            // Force cleanup and retry
            cleanup().then(() => {
              setTimeout(() => setRetryCount((prev) => prev + 1), 100)
            })
          }, 0)
        }
      }

      frameMonitorRef.current.animationFrameId = requestAnimationFrame(checkFrames)
    }

    // Start monitoring immediately
    frameMonitorRef.current.animationFrameId = requestAnimationFrame(checkFrames)

    // Store cleanup function for video frame callback
    frameMonitorRef.current.videoFrameCallbackCleanup = () => {
      if (videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in video) {
        ;(
          video as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }
        ).cancelVideoFrameCallback(videoFrameCallbackId)
      }
    }
  }, [cleanup, entityId, hasFrameWarning])

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
          const video = videoElementRef.current
          video.srcObject = event.streams[0]

          // Start monitoring frames immediately - let frame monitoring determine streaming state
          startFrameMonitoring()

          // Handle video errors
          video.addEventListener(
            'error',
            (e) => {
              console.error('[WebRTC] Video error:', e)
              setError('Video playback error')
              setIsStreaming(false)
            },
            { once: true }
          )
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
  }, [hass, enabled, entityId, cleanup, startFrameMonitoring])

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

  // Store cleanup function in ref for access in event listener
  useEffect(() => {
    cleanupRef.current = cleanup
  }, [cleanup])

  // Remove stale connection listener - camera streams are independent of entity updates
  // WebRTC connections should only reconnect based on their own connection state,
  // not global entity update events

  // Handle visibility changes to reconnect when returning to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && enabled) {
        // Check if we need to reconnect
        if (peerConnectionRef.current) {
          const state = peerConnectionRef.current.connectionState
          if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            console.log(
              `[WebRTC] Reconnecting ${entityId} after visibility change (state: ${state})`
            )
            cleanup().then(() => {
              setTimeout(() => setRetryCount((prev) => prev + 1), 500)
            })
          }
        } else if (!initializingRef.current && !pendingInitRef.current) {
          // No connection exists and we're not initializing, trigger a retry
          console.log(`[WebRTC] Initializing ${entityId} after visibility change`)
          setTimeout(() => setRetryCount((prev) => prev + 1), 500)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, entityId, cleanup])

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
    hasFrameWarning,
  }
}
