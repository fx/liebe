import { useCallback, useEffect, useRef, useState } from 'react'

// Thresholds preserved from the old useWebRTC frame monitor.
export const FRAME_WARNING_MS = 500
export const STALL_MS = 5000
const WATCHDOG_INTERVAL_MS = 250
const MJPEG_POLL_INTERVAL_MS = 500
export const MAX_AUTO_REMOUNTS = 3

// Runtime capability checks (not `in` narrowing: lib.dom types the rVFC
// methods on every HTMLVideoElement, but Firefox may not implement them).
function hasRequestVideoFrameCallback(video: HTMLVideoElement): boolean {
  return (
    typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
    'function'
  )
}

function hasCancelVideoFrameCallback(video: HTMLVideoElement): boolean {
  return (
    typeof (video as { cancelVideoFrameCallback?: unknown }).cancelVideoFrameCallback === 'function'
  )
}

export interface UseCameraStreamStatusOptions {
  getInnerVideo: () => HTMLVideoElement | null
  getMjpegImg: () => HTMLImageElement | null
  entityState?: string
  enabled: boolean
}

export interface UseCameraStreamStatusResult {
  isStreaming: boolean
  hasFrameWarning: boolean
  error: string | null
  /** Pass as HaCameraStream's remountKey: bumps request an element remount. */
  remountKey: number
  /** Wire to HaCameraStream's onStreams. */
  onStreams: () => void
  /** Wire to HaCameraStream's onLoad. */
  onLoad: () => void
  /** Manual retry: clears surfaced status, restores the auto-remount budget, and bumps remountKey. */
  retry: () => void
}

function getDecodedFrames(video: HTMLVideoElement): number {
  const extendedVideo = video as HTMLVideoElement & {
    getVideoPlaybackQuality?: () => { totalVideoFrames?: number }
  }
  return extendedVideo.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
}

// Status machine for the <ha-camera-stream> element: watches decoded frames on
// the inner <video> after the element signals `load`/`streams`, surfaces a
// warning after FRAME_WARNING_MS without frames, and requests an element
// remount after a sustained STALL_MS stall (capped at MAX_AUTO_REMOUNTS
// consecutive remounts, after which it surfaces a "Stream stalled" error
// instead of looping forever).
export function useCameraStreamStatus({
  getInnerVideo,
  getMjpegImg,
  entityState,
  enabled,
}: UseCameraStreamStatusOptions): UseCameraStreamStatusResult {
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasFrameWarning, setHasFrameWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remountKey, setRemountKey] = useState(0)
  // Each `load`/`streams` event starts a fresh watch (the inner video is
  // recreated when the element remounts or swaps players).
  const [watchEpoch, setWatchEpoch] = useState(0)
  const consecutiveRemountsRef = useRef(0)

  const onStreams = useCallback(() => {
    setWatchEpoch((epoch) => epoch + 1)
  }, [])

  const onLoad = useCallback(() => {
    setWatchEpoch((epoch) => epoch + 1)
  }, [])

  const retry = useCallback(() => {
    consecutiveRemountsRef.current = 0
    setIsStreaming(false)
    setHasFrameWarning(false)
    setError(null)
    setRemountKey((key) => key + 1)
  }, [])

  // An entity state transition means the camera itself changed (restarted,
  // went idle, ...) — restore the auto-remount budget.
  useEffect(() => {
    // entityState is an intentional dependency: the reset keys off it.
    void entityState
    consecutiveRemountsRef.current = 0
  }, [entityState])

  // Reset all surfaced status when the hook is disabled (cleanup-phase reset,
  // mirroring useWebRTC's teardown pattern).
  useEffect(() => {
    if (!enabled) return
    return () => {
      consecutiveRemountsRef.current = 0
      setIsStreaming(false)
      setHasFrameWarning(false)
      setError(null)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || watchEpoch === 0) return

    const video = getInnerVideo()
    if (video) {
      const timers: {
        rvfcId: number | null
        poll: ReturnType<typeof setInterval> | null
        watchdog: ReturnType<typeof setInterval> | null
      } = { rvfcId: null, poll: null, watchdog: null }
      let lastFrameTime = Date.now()
      let stopped = false

      const stop = () => {
        stopped = true
        if (timers.rvfcId !== null && hasCancelVideoFrameCallback(video)) {
          video.cancelVideoFrameCallback(timers.rvfcId)
        }
        timers.rvfcId = null
        if (timers.poll) {
          clearInterval(timers.poll)
          timers.poll = null
        }
        if (timers.watchdog) {
          clearInterval(timers.watchdog)
          timers.watchdog = null
        }
      }

      const markFrame = () => {
        lastFrameTime = Date.now()
        consecutiveRemountsRef.current = 0
        setIsStreaming(true)
        setHasFrameWarning(false)
        setError(null)
      }

      if (hasRequestVideoFrameCallback(video)) {
        const onFrame = () => {
          if (stopped) return
          markFrame()
          timers.rvfcId = video.requestVideoFrameCallback(onFrame)
        }
        timers.rvfcId = video.requestVideoFrameCallback(onFrame)
      } else {
        // rVFC unavailable: poll playback progress instead.
        let lastTime = video.currentTime
        let lastFrames = getDecodedFrames(video)
        timers.poll = setInterval(() => {
          const frames = getDecodedFrames(video)
          if (video.currentTime !== lastTime || frames > lastFrames) {
            lastTime = video.currentTime
            lastFrames = frames
            markFrame()
          }
        }, WATCHDOG_INTERVAL_MS)
      }

      timers.watchdog = setInterval(() => {
        const elapsed = Date.now() - lastFrameTime
        if (elapsed > STALL_MS) {
          // Sustained stall: stop this watch (a remount fires a new `load`
          // event which starts a fresh one).
          stop()
          setIsStreaming(false)
          setHasFrameWarning(false)
          if (consecutiveRemountsRef.current >= MAX_AUTO_REMOUNTS) {
            setError('Stream stalled')
          } else {
            consecutiveRemountsRef.current += 1
            setRemountKey((key) => key + 1)
          }
        } else if (elapsed > FRAME_WARNING_MS) {
          setHasFrameWarning(true)
        }
      }, WATCHDOG_INTERVAL_MS)

      return stop
    }

    const img = getMjpegImg()
    if (!img) return

    // MJPEG mode: streaming once the image has decoded pixels; no frame
    // watchdog (the browser owns the multipart stream).
    const poll = setInterval(() => {
      if (img.naturalWidth > 0) {
        clearInterval(poll)
        setIsStreaming(true)
      }
    }, MJPEG_POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [enabled, watchEpoch, getInnerVideo, getMjpegImg])

  return { isStreaming, hasFrameWarning, error, remountKey, onStreams, onLoad, retry }
}
