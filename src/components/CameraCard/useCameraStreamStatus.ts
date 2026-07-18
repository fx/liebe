import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlaybackQuality } from './videoQuality'

// Thresholds preserved from the old useWebRTC frame monitor.
export const FRAME_WARNING_MS = 500
export const STALL_MS = 5000
const WATCHDOG_INTERVAL_MS = 250
const MJPEG_POLL_INTERVAL_MS = 500
export const MAX_AUTO_REMOUNTS = 3
// Load-phase budget: a new element incarnation (mount, remount, or enable)
// must produce a `load`/`streams` event — and the MJPEG image its first
// decoded pixels — within this much VISIBLE time, or the machine surfaces
// 'Stream failed to start' (with the Retry button) instead of leaving an
// infinite CONNECTING spinner.
export const CONNECT_TIMEOUT_MS = 20_000

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

// Wall-clock accumulator that only counts time while the document is visible.
// Hidden tabs suspend rendering, rVFC, and media loading, so hidden spans must
// not count against loading budgets. Both transition directions re-baseline:
// going hidden banks the visible span up to that moment, and elapsed() skips
// any span that ends while hidden (intervals are throttled in hidden tabs, so
// the span between two ticks can be arbitrarily long).
function createVisibleElapsedTracker(): { elapsed: () => number; dispose: () => void } {
  let visibleElapsed = 0
  let last = Date.now()
  const onVisibilityChange = () => {
    const now = Date.now()
    if (document.hidden) {
      // Going hidden: bank the visible span up to this moment.
      visibleElapsed += now - last
    }
    // Either direction re-baselines, so hidden time can never be counted.
    last = now
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return {
    elapsed: () => {
      const now = Date.now()
      if (!document.hidden) {
        visibleElapsed += now - last
      }
      last = now
      return visibleElapsed
    },
    dispose: () => document.removeEventListener('visibilitychange', onVisibilityChange),
  }
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
  /** Wire to HaCameraStream's onStreamEvent (fires on both `streams` and `load`). */
  onStreamEvent: () => void
  /** Manual retry: clears surfaced status, restores the auto-remount budget, and bumps remountKey. */
  retry: () => void
}

// Status machine for the <ha-camera-stream> element: watches decoded frames on
// the inner <video> after the element signals `load`/`streams`, surfaces a
// warning after FRAME_WARNING_MS without frames, and requests an element
// remount after a sustained STALL_MS stall (capped at MAX_AUTO_REMOUNTS
// consecutive remounts, after which it surfaces a "Stream stalled" error
// instead of looping forever). A visibility-aware connect timeout covers the
// load phase: an element that never fires a stream event (camera never starts,
// or a post-stall remount that never comes up) surfaces 'Stream failed to
// start' after CONNECT_TIMEOUT_MS of visible time.
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
  // Mirrors of the surfaced flags so the per-frame path (30-60 calls/s) can
  // dispatch state only on transitions instead of on every decoded frame.
  const isStreamingRef = useRef(false)
  const hasFrameWarningRef = useRef(false)
  // Active connect timer (load-phase timeout); cleared by the first stream
  // event of the current element incarnation.
  const connectTimerRef = useRef<{
    id: ReturnType<typeof setInterval>
    tracker: { elapsed: () => number; dispose: () => void }
  } | null>(null)

  const clearConnectTimer = useCallback(() => {
    const timer = connectTimerRef.current
    if (timer) {
      clearInterval(timer.id)
      timer.tracker.dispose()
      connectTimerRef.current = null
    }
  }, [])

  const onStreamEvent = useCallback(() => {
    // The element came up: the load-phase timeout no longer applies.
    clearConnectTimer()
    setWatchEpoch((epoch) => epoch + 1)
  }, [clearConnectTimer])

  const retry = useCallback(() => {
    consecutiveRemountsRef.current = 0
    isStreamingRef.current = false
    hasFrameWarningRef.current = false
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

  // Returning to a hidden tab: rVFC and rendering were suspended, so any stall
  // accounting from around the hidden span is suspect — restore the
  // auto-remount budget whenever the tab becomes visible again.
  useEffect(() => {
    if (!enabled) return
    const onVisibilityChange = () => {
      if (!document.hidden) {
        consecutiveRemountsRef.current = 0
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [enabled])

  // Reset all surfaced status when the hook is disabled (cleanup-phase reset,
  // mirroring useWebRTC's teardown pattern).
  useEffect(() => {
    if (!enabled) return
    return () => {
      consecutiveRemountsRef.current = 0
      isStreamingRef.current = false
      hasFrameWarningRef.current = false
      setIsStreaming(false)
      setHasFrameWarning(false)
      setError(null)
    }
  }, [enabled])

  // Load-phase (connect) timeout: armed for every element incarnation
  // (enable/mount and every remount), cleared by the incarnation's first
  // `load`/`streams` event. Only visible time counts — a hidden tab's
  // suspended loading must not trip it.
  useEffect(() => {
    if (!enabled) return
    // remountKey is an intentional dependency: each remount re-arms the timer.
    void remountKey
    const tracker = createVisibleElapsedTracker()
    const id = setInterval(() => {
      if (tracker.elapsed() >= CONNECT_TIMEOUT_MS) {
        clearConnectTimer()
        setError('Stream failed to start')
      }
    }, WATCHDOG_INTERVAL_MS)
    connectTimerRef.current = { id, tracker }
    return clearConnectTimer
  }, [enabled, remountKey, clearConnectTimer])

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

      const onVisibilityChange = () => {
        if (!document.hidden) {
          // Grace period on tab return: rVFC was suspended while hidden, so
          // the frame clock restarts instead of reporting a phantom stall.
          lastFrameTime = Date.now()
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange)

      const stop = () => {
        stopped = true
        document.removeEventListener('visibilitychange', onVisibilityChange)
        video.removeEventListener('error', onVideoError)
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

      // The media element erroring is an immediate, fatal signal: surface it
      // right away instead of burning the 5 s stall plus the remount budget.
      function onVideoError() {
        stop()
        isStreamingRef.current = false
        hasFrameWarningRef.current = false
        setIsStreaming(false)
        setHasFrameWarning(false)
        setError('Video playback error')
      }
      video.addEventListener('error', onVideoError)

      // Per-frame path: only record the frame time and restore the remount
      // budget; the surfaced flags flip on transition only (an error is only
      // ever set while isStreaming is false, so the streaming transition also
      // clears it).
      const markFrame = () => {
        lastFrameTime = Date.now()
        consecutiveRemountsRef.current = 0
        if (hasFrameWarningRef.current) {
          hasFrameWarningRef.current = false
          setHasFrameWarning(false)
        }
        if (!isStreamingRef.current) {
          isStreamingRef.current = true
          setIsStreaming(true)
          setError(null)
        }
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
        let lastFrames = getPlaybackQuality(video).decodedFrames
        timers.poll = setInterval(() => {
          const frames = getPlaybackQuality(video).decodedFrames
          if (video.currentTime !== lastTime || frames > lastFrames) {
            lastTime = video.currentTime
            lastFrames = frames
            markFrame()
          }
        }, WATCHDOG_INTERVAL_MS)
      }

      timers.watchdog = setInterval(() => {
        // Hidden tabs suspend rVFC (and throttle rendering) without the stream
        // being unhealthy: skip stall/warning evaluation entirely while
        // hidden. The visibilitychange grace above re-baselines on return.
        if (document.hidden) return
        const elapsed = Date.now() - lastFrameTime
        if (elapsed > STALL_MS) {
          // Sustained stall: stop this watch (a remount fires a new `load`
          // event which starts a fresh one).
          stop()
          isStreamingRef.current = false
          hasFrameWarningRef.current = false
          setIsStreaming(false)
          setHasFrameWarning(false)
          if (consecutiveRemountsRef.current >= MAX_AUTO_REMOUNTS) {
            setError('Stream stalled')
          } else {
            consecutiveRemountsRef.current += 1
            setRemountKey((key) => key + 1)
          }
        } else if (elapsed > FRAME_WARNING_MS && !hasFrameWarningRef.current) {
          hasFrameWarningRef.current = true
          setHasFrameWarning(true)
        }
      }, WATCHDOG_INTERVAL_MS)

      return stop
    }

    const img = getMjpegImg()
    if (!img) return

    // MJPEG mode: streaming once the image has decoded pixels; no frame
    // watchdog (the browser owns the multipart stream), but the load phase
    // shares the connect budget — an image that never decodes must not spin
    // forever, and an `error` event fails fast.
    const tracker = createVisibleElapsedTracker()
    const timers: { poll: ReturnType<typeof setInterval> | null } = { poll: null }
    const stopMjpeg = () => {
      if (timers.poll) {
        clearInterval(timers.poll)
        timers.poll = null
      }
      tracker.dispose()
      img.removeEventListener('error', onImgError)
    }
    function onImgError() {
      stopMjpeg()
      setError('Stream failed to start')
    }
    img.addEventListener('error', onImgError)
    timers.poll = setInterval(() => {
      if (img.naturalWidth > 0) {
        stopMjpeg()
        isStreamingRef.current = true
        setIsStreaming(true)
        return
      }
      if (tracker.elapsed() >= CONNECT_TIMEOUT_MS) {
        stopMjpeg()
        setError('Stream failed to start')
      }
    }, MJPEG_POLL_INTERVAL_MS)
    return stopMjpeg
  }, [enabled, watchEpoch, getInnerVideo, getMjpegImg])

  return { isStreaming, hasFrameWarning, error, remountKey, onStreamEvent, retry }
}
