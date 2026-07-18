import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlaybackQuality } from './videoQuality'

// Thresholds preserved from the old useWebRTC frame monitor.
export const FRAME_WARNING_MS = 500
export const STALL_MS = 5000
const WATCHDOG_INTERVAL_MS = 250
const MJPEG_POLL_INTERVAL_MS = 500
export const MAX_AUTO_REMOUNTS = 3
// Load budget: while the machine is CONNECTING (enabled, not streaming, no
// surfaced error) it must start producing decoded frames/pixels within this
// much COUNTED time (visible AND entity available), or it surfaces
// 'Stream failed to start' (with the Retry button) instead of an infinite
// CONNECTING spinner.
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

// Wall-clock accumulator that only counts time while the document is visible
// AND the tracker is not externally paused. Hidden tabs suspend rendering,
// rVFC, and media loading, so hidden spans must not count against budgets —
// and a paused tracker (entity unavailable) must not burn budget either. Both
// dimensions share this ONE banking implementation: every transition banks
// the counted span up to that moment and re-baselines, so uncounted spans can
// never leak into elapsed() (intervals are throttled in hidden tabs, so the
// span between two events can be arbitrarily long).
function createVisibleElapsedTracker(onCountingChange?: (counting: boolean) => void): {
  elapsed: () => number
  isCounting: () => boolean
  setPaused: (paused: boolean) => void
  dispose: () => void
} {
  let banked = 0
  let last = Date.now()
  let paused = false
  let counting = !document.hidden
  const update = () => {
    const now = Date.now()
    if (counting) {
      banked += now - last
    }
    last = now
    const nowCounting = !document.hidden && !paused
    if (nowCounting !== counting) {
      counting = nowCounting
      onCountingChange?.(nowCounting)
    }
  }
  const onVisibilityChange = () => update()
  document.addEventListener('visibilitychange', onVisibilityChange)
  return {
    elapsed: () => {
      update()
      return banked
    },
    isCounting: () => counting,
    setPaused: (value: boolean) => {
      paused = value
      update()
    },
    dispose: () => document.removeEventListener('visibilitychange', onVisibilityChange),
  }
}

// Single-shot timeout over COUNTED time: fires onExpire once budgetMs of
// visible, unpaused time has elapsed. Composes createVisibleElapsedTracker
// for the banking (one implementation): whenever counting stops (tab hidden,
// externally paused) the pending timeout is cancelled, and whenever it
// resumes the remaining budget is re-scheduled. One timer instead of a 4 Hz
// polling interval for the same counted-time-only semantics.
function createVisibleTimeout(
  budgetMs: number,
  onExpire: () => void
): {
  setPaused: (paused: boolean) => void
  dispose: () => void
} {
  let id: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (id !== null) {
      clearTimeout(id)
      id = null
    }
  }
  const schedule = () => {
    clear()
    id = setTimeout(
      () => {
        id = null
        dispose()
        onExpire()
      },
      Math.max(0, budgetMs - tracker.elapsed())
    )
  }
  const tracker = createVisibleElapsedTracker((counting) => (counting ? schedule() : clear()))
  const dispose = () => {
    tracker.dispose()
    clear()
  }
  // Created while not counting (hidden tab, paused): nothing is scheduled
  // until counting starts.
  if (tracker.isCounting()) {
    schedule()
  }
  return { setPaused: tracker.setPaused, dispose }
}

export interface UseCameraStreamStatusOptions {
  getInnerVideo: () => HTMLVideoElement | null
  getMjpegImg: () => HTMLImageElement | null
  entityState?: string
  enabled: boolean
  /**
   * Entity availability: while false (entity `unavailable`, e.g. an HA
   * reconnect blip) the load budget is PAUSED — unavailable time does not
   * count, exactly like hidden-tab time — and resumes when the entity
   * recovers. Surfaced status is never reset by availability changes.
   */
  entityAvailable: boolean
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
// instead of looping forever).
//
// The load budget is ONE timer owned by connection state: it is armed exactly
// while the machine is CONNECTING (enabled && !isStreaming && !error) —
// independent of watch epochs, attach state, or the video-vs-MJPEG branch —
// so no incarnation, early `streams` event, or player swap can ever leave an
// infinite CONNECTING spinner: either frames/pixels flow (disarming it) or it
// expires into 'Stream failed to start'.
export function useCameraStreamStatus({
  getInnerVideo,
  getMjpegImg,
  entityState,
  enabled,
  entityAvailable,
}: UseCameraStreamStatusOptions): UseCameraStreamStatusResult {
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasFrameWarning, setHasFrameWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remountKey, setRemountKey] = useState(0)
  // Each `load`/`streams` event starts a fresh watch (the inner video is
  // recreated when the element remounts or swaps players).
  const [watchEpoch, setWatchEpoch] = useState(0)
  // Synchronous mirror of watchEpoch: onStreamEvent bumps it immediately, so
  // a stale watch's watchdog tick — which can fire between the event and this
  // effect's cleanup — can detect that it no longer owns the current epoch.
  const watchEpochRef = useRef(0)
  const consecutiveRemountsRef = useRef(0)
  // Mirrors of the surfaced flags so the per-frame path (30-60 calls/s) can
  // dispatch state only on transitions instead of on every decoded frame.
  const isStreamingRef = useRef(false)
  const hasFrameWarningRef = useRef(false)
  // Active load-budget timer, plus a mirror of entityAvailable so a timer
  // armed while the entity is already unavailable starts paused.
  const loadBudgetTimerRef = useRef<ReturnType<typeof createVisibleTimeout> | null>(null)
  const entityAvailableRef = useRef(entityAvailable)

  const onStreamEvent = useCallback(() => {
    // A stale frame warning must not leak across epochs: a video watch that
    // warned and then ended (player swap, element remount) would otherwise
    // latch NO SIGNAL into a mode that never clears it (MJPEG in particular
    // has no frame watchdog).
    if (hasFrameWarningRef.current) {
      hasFrameWarningRef.current = false
      setHasFrameWarning(false)
    }
    watchEpochRef.current += 1
    setWatchEpoch(watchEpochRef.current)
  }, [])

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
  // mirroring useWebRTC's teardown pattern). Availability changes are NOT a
  // disable: surfaced errors survive entity blips.
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

  // Entity availability pauses/resumes the active load-budget timer (declared
  // BEFORE the arming effect so a timer armed on the same render reads the
  // fresh value from the ref).
  useEffect(() => {
    entityAvailableRef.current = entityAvailable
    loadBudgetTimerRef.current?.setPaused(!entityAvailable)
  }, [entityAvailable])

  // THE load-budget timer — owned by connection state. Armed exactly when the
  // machine is CONNECTING (enabled && !isStreaming && !error): streaming
  // flipping true disarms it; streaming falling back to false (stall remount,
  // player swap) re-arms a fresh budget; a surfaced error disarms it. By
  // construction the timer therefore ALWAYS exists while CONNECTING — no
  // watch epoch, attach state, or video-vs-MJPEG branch can open a gap.
  const connecting = enabled && !isStreaming && !error
  useEffect(() => {
    if (!connecting) return
    const timer = createVisibleTimeout(CONNECT_TIMEOUT_MS, () => {
      loadBudgetTimerRef.current = null
      setError('Stream failed to start')
    })
    timer.setPaused(!entityAvailableRef.current)
    loadBudgetTimerRef.current = timer
    return () => {
      if (loadBudgetTimerRef.current === timer) {
        loadBudgetTimerRef.current = null
      }
      timer.dispose()
    }
  }, [connecting])

  useEffect(() => {
    if (!enabled || watchEpoch === 0) return
    // Captured at watch creation: a stale watchdog tick (this watch's interval
    // firing after a newer epoch was announced but before this effect's
    // cleanup ran) must no-op instead of re-raising a warning the new epoch
    // just cleared.
    const epoch = watchEpoch

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
        // A queued tick from a superseded watch must never mutate status the
        // new epoch owns (onStreamEvent bumps the ref synchronously; this
        // watch's cleanup runs on the following render).
        if (watchEpochRef.current !== epoch) return
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
    // Nothing attachable yet (the event fired before the player came up):
    // nothing to watch. The load-budget timer is owned by connection state,
    // so it stays armed regardless.
    if (!img) return

    // MJPEG mode: streaming once the image has decoded pixels; no frame
    // watchdog (the browser owns the multipart stream). The load phase is
    // covered by the connection-state budget timer — this branch only reports
    // success (decoded pixels, which also clears any stale error, mirroring
    // the video path's frame transition) or fast-fails on the image's `error`
    // event.
    const timers: { poll: ReturnType<typeof setInterval> | null } = { poll: null }
    const stopMjpeg = () => {
      if (timers.poll) {
        clearInterval(timers.poll)
        timers.poll = null
      }
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
        setError(null)
      }
    }, MJPEG_POLL_INTERVAL_MS)
    return stopMjpeg
  }, [enabled, watchEpoch, getInnerVideo, getMjpegImg])

  return { isStreaming, hasFrameWarning, error, remountKey, onStreamEvent, retry }
}
