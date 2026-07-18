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
   * reconnect blip) the ENTIRE status machine is suspended, exactly like a
   * hidden tab — the load budget is paused, the watchdog evaluates neither
   * warnings nor stalls (so the auto-remount budget cannot burn), and the
   * fast-fail media `error` listeners are suppressed (a backend dying during
   * a blip must not surface a sticky error). On recovery the frame clock is
   * grace-reset, the remount budget is restored, and any surfaced error is
   * AUTO-RETRIED (cleared + remount) — recovery never needs a manual Retry.
   */
  entityAvailable: boolean
}

export interface UseCameraStreamStatusResult {
  isStreaming: boolean
  /**
   * Recent-frame evidence: true only while decoded frames were observed
   * within FRAME_WARNING_MS. Maintained (via a 250 ms evaluator) ONLY while
   * the entity is unavailable — the pill needs proof that frames are
   * demonstrably flowing NOW, not the lagging isStreaming flag (the watchdog
   * is suspended during unavailability, so a frozen frame never flips
   * isStreaming false). False whenever the entity is available.
   */
  isActivelyStreaming: boolean
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
  const [isActivelyStreaming, setIsActivelyStreaming] = useState(false)
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
  const isActivelyStreamingRef = useRef(false)
  const hasFrameWarningRef = useRef(false)
  const errorRef = useRef<string | null>(null)
  // Hook-level frame clock shared by the active watch's watchdog, the
  // recent-frame pill evidence, and the unavailability-recovery grace reset.
  // Watches run strictly sequentially, so one clock suffices.
  const lastFrameTimeRef = useRef(0)
  // Active load-budget timer, plus a mirror of entityAvailable so a timer
  // armed while the entity is already unavailable starts paused.
  const loadBudgetTimerRef = useRef<ReturnType<typeof createVisibleTimeout> | null>(null)
  const entityAvailableRef = useRef(entityAvailable)

  // Every surfaced-error write goes through this so errorRef always mirrors
  // the state (markFrame and the recovery path need a synchronous read).
  const setSurfacedError = useCallback((value: string | null) => {
    errorRef.current = value
    setError(value)
  }, [])

  const onStreamEvent = useCallback(() => {
    // A disabled machine ignores stray element events entirely: no warning
    // mutation, no epoch churn (the watch effect would reject the epoch
    // anyway, but state must not move while the disable-reset owns it).
    if (!enabled) return
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
  }, [enabled])

  const retry = useCallback(() => {
    consecutiveRemountsRef.current = 0
    isStreamingRef.current = false
    hasFrameWarningRef.current = false
    setIsStreaming(false)
    setHasFrameWarning(false)
    setSurfacedError(null)
    setRemountKey((key) => key + 1)
  }, [setSurfacedError])

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
  // disable: surfaced status persists through a blip and is auto-retried on
  // recovery (below) instead of being wiped mid-blip.
  useEffect(() => {
    if (!enabled) return
    return () => {
      consecutiveRemountsRef.current = 0
      isStreamingRef.current = false
      hasFrameWarningRef.current = false
      setIsStreaming(false)
      setHasFrameWarning(false)
      setSurfacedError(null)
    }
  }, [enabled, setSurfacedError])

  // Entity availability pauses/resumes the active load-budget timer (declared
  // BEFORE the arming effect so a timer armed on the same render reads the
  // fresh value from the ref). On the unavailable→available transition the
  // machine resumes exactly like a return-to-visible: the frame clock is
  // grace-reset (frames were legitimately frozen while HA reconnected), the
  // auto-remount budget is restored, and any surfaced error is AUTO-RETRIED
  // (cleared + remount) — the backend just came back, so recovery must never
  // require a manual Retry click. Errors surfaced while the entity was
  // available still require manual Retry as before.
  useEffect(() => {
    const wasAvailable = entityAvailableRef.current
    entityAvailableRef.current = entityAvailable
    loadBudgetTimerRef.current?.setPaused(!entityAvailable)
    if (!wasAvailable && entityAvailable) {
      consecutiveRemountsRef.current = 0
      lastFrameTimeRef.current = Date.now()
      if (errorRef.current !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the unavailable→available transition is an external HA signal, and the auto-retry (clear error + bump remountKey) must fire exactly once per transition; it is a one-shot event response, not state derivable during render.
        retry()
      }
    }
  }, [entityAvailable, retry])

  // Recent-frame pill evidence: maintained only while the entity is
  // unavailable (the only consumer is the UNAVAILABLE-vs-STREAMING pill
  // precedence). Evaluated immediately on the transition — a dead camera's
  // frozen frame must read UNAVAILABLE right away — and re-evaluated every
  // watchdog interval so frames stopping mid-blip demote the pill too.
  useEffect(() => {
    const setActivelyStreaming = (value: boolean) => {
      if (isActivelyStreamingRef.current !== value) {
        isActivelyStreamingRef.current = value
        setIsActivelyStreaming(value)
      }
    }
    if (!enabled || entityAvailable) {
      setActivelyStreaming(false)
      return
    }
    const evaluate = () =>
      setActivelyStreaming(
        isStreamingRef.current && Date.now() - lastFrameTimeRef.current <= FRAME_WARNING_MS
      )
    evaluate()
    const interval = setInterval(evaluate, WATCHDOG_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [enabled, entityAvailable])

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
      // Expiry race: the first frame can beat the timer inside the same task
      // window (markFrame flips the ref synchronously, but React has not yet
      // committed the re-render whose cleanup disposes this timer). Frames
      // won: no-op instead of surfacing a stale failure over a live stream.
      if (isStreamingRef.current) return
      setSurfacedError('Stream failed to start')
    })
    timer.setPaused(!entityAvailableRef.current)
    loadBudgetTimerRef.current = timer
    return () => {
      if (loadBudgetTimerRef.current === timer) {
        loadBudgetTimerRef.current = null
      }
      timer.dispose()
    }
  }, [connecting, setSurfacedError])

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
      lastFrameTimeRef.current = Date.now()
      let stopped = false

      const onVisibilityChange = () => {
        if (!document.hidden) {
          // Grace period on tab return: rVFC was suspended while hidden, so
          // the frame clock restarts instead of reporting a phantom stall.
          lastFrameTimeRef.current = Date.now()
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
      // right away instead of burning the 5 s stall plus the remount budget —
      // EXCEPT while the entity is unavailable: the backend dying during a
      // blip must not surface a sticky 'Video playback error' (the machine is
      // suspended like a hidden tab; on recovery the resumed watchdog's stall
      // remount brings the stream back automatically). Like every callback of
      // this watch, a superseded epoch no-ops: the old player erroring during
      // its teardown window must not surface an error over the replacement.
      function onVideoError() {
        if (watchEpochRef.current !== epoch) return
        if (!entityAvailableRef.current) return
        stop()
        isStreamingRef.current = false
        hasFrameWarningRef.current = false
        setIsStreaming(false)
        setHasFrameWarning(false)
        setSurfacedError('Video playback error')
      }
      video.addEventListener('error', onVideoError)

      // Per-frame path: only record the frame time and restore the remount
      // budget; the surfaced flags flip on transition only (an error is only
      // ever set while isStreaming is false, so the streaming transition also
      // clears it).
      const markFrame = () => {
        lastFrameTimeRef.current = Date.now()
        consecutiveRemountsRef.current = 0
        if (hasFrameWarningRef.current) {
          hasFrameWarningRef.current = false
          setHasFrameWarning(false)
        }
        if (!isStreamingRef.current) {
          isStreamingRef.current = true
          setIsStreaming(true)
          setSurfacedError(null)
        } else if (errorRef.current === 'Stream failed to start') {
          // Belt-and-braces against any load-budget expiry that slipped past
          // the isStreamingRef guard: flowing frames must ALWAYS clear a
          // pending 'Stream failed to start' (reachable e.g. when an MJPEG
          // epoch fast-failed while the streaming flag was still true from a
          // superseded video watch).
          setSurfacedError(null)
        }
      }

      if (hasRequestVideoFrameCallback(video)) {
        const onFrame = () => {
          // A frame callback already queued by the browser can fire between
          // onStreamEvent's synchronous epoch bump and this watch's cleanup:
          // it must not mark frames (or re-register) on the old video's
          // behalf — the new epoch owns the frame clock now.
          if (stopped || watchEpochRef.current !== epoch) return
          markFrame()
          timers.rvfcId = video.requestVideoFrameCallback(onFrame)
        }
        timers.rvfcId = video.requestVideoFrameCallback(onFrame)
      } else {
        // rVFC unavailable: poll playback progress instead. The poll tick
        // carries the same superseded-epoch guard as the watchdog below.
        let lastTime = video.currentTime
        let lastFrames = getPlaybackQuality(video).decodedFrames
        timers.poll = setInterval(() => {
          if (watchEpochRef.current !== epoch) return
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
        // hidden. An unavailable entity suspends the machine the same way —
        // frames may legitimately freeze while HA reconnects, and the
        // auto-remount budget must not burn during the blip. The
        // visibilitychange grace above (and the recovery grace in the
        // availability effect) re-baseline the frame clock on resume.
        if (document.hidden || !entityAvailableRef.current) return
        const elapsed = Date.now() - lastFrameTimeRef.current
        if (elapsed > STALL_MS) {
          // Sustained stall: stop this watch (a remount fires a new `load`
          // event which starts a fresh one).
          stop()
          isStreamingRef.current = false
          hasFrameWarningRef.current = false
          setIsStreaming(false)
          setHasFrameWarning(false)
          if (consecutiveRemountsRef.current >= MAX_AUTO_REMOUNTS) {
            setSurfacedError('Stream stalled')
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

    // A video→MJPEG player swap can arrive with the streaming flag still
    // true from the superseded video watch. MJPEG has no frame watchdog to
    // ever flip it false, so an image that never decodes would leave a stale
    // STREAMING forever. Falling back to false here re-arms the
    // connection-state load budget (CONNECT_TIMEOUT_MS) for the swap — the
    // documented "streaming falling back to false re-arms a fresh budget"
    // contract — so a dead MJPEG swap fails into 'Stream failed to start'.
    if (img.naturalWidth === 0 && isStreamingRef.current) {
      isStreamingRef.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the stale streaming flag is only detectable when the new epoch's watch attaches to the MJPEG image; it is a one-shot event response to the player swap, not state derivable during render.
      setIsStreaming(false)
    }

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
      // Suppressed while the entity is unavailable, mirroring the video
      // path: a backend blip must not surface a sticky 'Stream failed to
      // start' (the paused load budget covers the post-recovery load phase).
      if (!entityAvailableRef.current) return
      stopMjpeg()
      setSurfacedError('Stream failed to start')
    }
    img.addEventListener('error', onImgError)
    timers.poll = setInterval(() => {
      if (img.naturalWidth > 0) {
        stopMjpeg()
        isStreamingRef.current = true
        setIsStreaming(true)
        setSurfacedError(null)
      }
    }, MJPEG_POLL_INTERVAL_MS)
    return stopMjpeg
  }, [enabled, watchEpoch, getInnerVideo, getMjpegImg, setSurfacedError])

  return {
    isStreaming,
    isActivelyStreaming,
    hasFrameWarning,
    error,
    remountKey,
    onStreamEvent,
    retry,
  }
}
