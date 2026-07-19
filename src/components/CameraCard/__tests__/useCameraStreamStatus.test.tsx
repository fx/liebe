import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useCameraStreamStatus,
  MAX_AUTO_REMOUNTS,
  CONNECT_TIMEOUT_MS,
} from '../useCameraStreamStatus'

// Watchdog ticks every 250ms; one tick past the 500ms warning threshold.
const WARNING_TICK_MS = 750
// One tick past the 5s stall threshold.
const STALL_TICK_MS = 5250

// Toggle document.hidden (jsdom exposes it as a prototype getter; an instance
// property shadows it) and fire the visibilitychange event, as a real tab
// switch would.
function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

interface RvfcVideo {
  video: HTMLVideoElement
  fireFrame: () => void
  fireError: () => void
  requestSpy: ReturnType<typeof vi.fn>
  cancelSpy?: ReturnType<typeof vi.fn>
  addListenerSpy: ReturnType<typeof vi.fn>
  removeListenerSpy: ReturnType<typeof vi.fn>
}

function createRvfcVideo({ withCancel = true }: { withCancel?: boolean } = {}): RvfcVideo {
  const callbacks: Array<() => void> = []
  const errorListeners: EventListener[] = []
  const requestSpy = vi.fn((callback: () => void) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const cancelSpy = vi.fn()
  const addListenerSpy = vi.fn((type: string, listener: EventListener) => {
    if (type === 'error') errorListeners.push(listener)
  })
  const removeListenerSpy = vi.fn((type: string, listener: EventListener) => {
    if (type === 'error') {
      const index = errorListeners.indexOf(listener)
      if (index !== -1) errorListeners.splice(index, 1)
    }
  })
  const video = {
    currentTime: 0,
    requestVideoFrameCallback: requestSpy,
    addEventListener: addListenerSpy,
    removeEventListener: removeListenerSpy,
  } as unknown as Record<string, unknown>
  if (withCancel) {
    video.cancelVideoFrameCallback = cancelSpy
  }
  const fireFrame = () => {
    const pending = callbacks.splice(0, callbacks.length)
    pending.forEach((callback) => callback())
  }
  const fireError = () => {
    ;[...errorListeners].forEach((listener) => listener(new Event('error')))
  }
  return {
    video: video as unknown as HTMLVideoElement,
    fireFrame,
    fireError,
    requestSpy,
    cancelSpy: withCancel ? cancelSpy : undefined,
    addListenerSpy,
    removeListenerSpy,
  }
}

// Plain (rVFC-less) video mocks still need the listener API the hook wires up.
function withListenerApi<T extends Record<string, unknown>>(mock: T): T {
  return { addEventListener: () => {}, removeEventListener: () => {}, ...mock }
}

interface MjpegImg {
  img: HTMLImageElement
  fireError: () => void
  setNaturalWidth: (width: number) => void
  addListenerSpy: ReturnType<typeof vi.fn>
  removeListenerSpy: ReturnType<typeof vi.fn>
}

function createMjpegImg(naturalWidth = 0): MjpegImg {
  const errorListeners: EventListener[] = []
  const addListenerSpy = vi.fn((type: string, listener: EventListener) => {
    if (type === 'error') errorListeners.push(listener)
  })
  const removeListenerSpy = vi.fn()
  const img = {
    naturalWidth,
    addEventListener: addListenerSpy,
    removeEventListener: removeListenerSpy,
  }
  return {
    img: img as unknown as HTMLImageElement,
    fireError: () => [...errorListeners].forEach((listener) => listener(new Event('error'))),
    setNaturalWidth: (width: number) => {
      img.naturalWidth = width
    },
    addListenerSpy,
    removeListenerSpy,
  }
}

interface StatusProps {
  enabled: boolean
  entityState: string
  entityAvailable: boolean
}

function renderStatus({
  video = null as HTMLVideoElement | null,
  img = null as HTMLImageElement | null,
} = {}) {
  const getInnerVideo = () => video
  const getMjpegImg = () => img
  return renderHook(
    ({ enabled, entityState, entityAvailable }: StatusProps) =>
      useCameraStreamStatus({ getInnerVideo, getMjpegImg, entityState, enabled, entityAvailable }),
    { initialProps: { enabled: true, entityState: 'streaming', entityAvailable: true } }
  )
}

describe('useCameraStreamStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Restore jsdom's prototype getter (visible) if a test shadowed it.
    delete (document as { hidden?: boolean }).hidden
  })

  it('is idle until a load or streams event starts a watch', () => {
    const { video } = createRvfcVideo()
    const { result } = renderStatus({ video })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.remountKey).toBe(0)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    // No watch was started, so no warning or remount ever fires.
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(0)
  })

  it('reports streaming on frames via requestVideoFrameCallback and stays healthy', () => {
    const { video, fireFrame } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    expect(result.current.isStreaming).toBe(false)

    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)

    // Regular frames keep the watchdog quiet.
    act(() => {
      vi.advanceTimersByTime(250)
      fireFrame()
      vi.advanceTimersByTime(250)
      fireFrame()
    })
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.isStreaming).toBe(true)
  })

  it('warns after 500ms without frames and clears the warning on the next frame', () => {
    const { video, fireFrame } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })

    act(() => {
      vi.advanceTimersByTime(WARNING_TICK_MS)
    })
    expect(result.current.hasFrameWarning).toBe(true)
    expect(result.current.isStreaming).toBe(true)

    act(() => {
      fireFrame()
    })
    expect(result.current.hasFrameWarning).toBe(false)
  })

  it('ignores a queued watchdog tick from a superseded epoch', () => {
    const { video } = createRvfcVideo()
    const { result } = renderStatus({ video })

    // Epoch 1 warns after 750ms without frames.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(WARNING_TICK_MS)
    })
    expect(result.current.hasFrameWarning).toBe(true)

    // A new stream event clears the warning and announces epoch 2
    // synchronously — but epoch 1's watchdog interval is still installed
    // until React runs the effect cleanup. A tick firing in that window must
    // no-op instead of re-raising the warning the new epoch just cleared.
    act(() => {
      result.current.onStreamEvent()
      vi.advanceTimersByTime(250)
    })
    expect(result.current.hasFrameWarning).toBe(false)
  })

  it('ignores a queued frame callback from a superseded epoch', () => {
    const { video, fireFrame } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })

    // Epoch 2 is announced synchronously; a frame callback the browser had
    // already queued for epoch 1's watch fires before the cleanup runs. It
    // must neither mark frames nor re-register on the old video's behalf.
    act(() => {
      result.current.onStreamEvent()
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(false)

    // The new epoch's own frames still flip the machine to streaming.
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)
  })

  it('ignores a media error from a superseded epoch', () => {
    const { video, fireFrame, fireError } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)

    // The old player errors during its teardown window (after the new epoch
    // was announced, before the old watch's cleanup): no error may surface
    // over the replacement stream.
    act(() => {
      result.current.onStreamEvent()
      fireError()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(true)
  })

  it('ignores a poll tick from a superseded epoch', () => {
    const video = withListenerApi({ currentTime: 0 }) as unknown as HTMLVideoElement
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })

    // Epoch 1's poll interval fires once more after epoch 2 was announced:
    // the progress it sees belongs to the old watch and must not mark frames.
    act(() => {
      result.current.onStreamEvent()
      ;(video as unknown as { currentTime: number }).currentTime = 5
      vi.advanceTimersByTime(250)
    })
    expect(result.current.isStreaming).toBe(false)

    // The new epoch's poll (baselined at 5) detects fresh progress normally.
    act(() => {
      ;(video as unknown as { currentTime: number }).currentTime = 6
      vi.advanceTimersByTime(250)
    })
    expect(result.current.isStreaming).toBe(true)
  })

  it('requests a remount after a sustained 5s stall, then errors when the remount never comes up', () => {
    const { video } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })

    expect(result.current.remountKey).toBe(1)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.error).toBeNull()

    // The stalled watch stopped itself: no further remounts without a new
    // load event. The remounted element never fires one, so the connect
    // timeout surfaces an error instead of spinning forever.
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
    })
    expect(result.current.remountKey).toBe(1)
    expect(result.current.error).toBe('Stream failed to start')
  })

  it('surfaces "Stream stalled" after the auto-remount cap and recovers on frames', () => {
    const { video, fireFrame } = createRvfcVideo()
    const { result } = renderStatus({ video })

    for (let cycle = 0; cycle < MAX_AUTO_REMOUNTS; cycle += 1) {
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
      expect(result.current.remountKey).toBe(cycle + 1)
      expect(result.current.error).toBeNull()
    }

    // Budget exhausted: the next stall errors instead of remounting.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })
    expect(result.current.error).toBe('Stream stalled')
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)
    expect(result.current.isStreaming).toBe(false)

    // A healthy frame on a later watch clears the error and the budget.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(true)

    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)
    expect(result.current.error).toBeNull()
  })

  it('retry clears the surfaced error, restores the budget, and bumps remountKey', () => {
    const { video, fireFrame } = createRvfcVideo()
    const { result } = renderStatus({ video })

    // Exhaust the auto-remount budget so the stall surfaces an error.
    for (let cycle = 0; cycle <= MAX_AUTO_REMOUNTS; cycle += 1) {
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
    }
    expect(result.current.error).toBe('Stream stalled')
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)

    act(() => {
      result.current.retry()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)

    // Budget was restored: the next stall auto-remounts instead of erroring.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)
    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 2)
  })

  it('restores the auto-remount budget on an entity state transition', () => {
    const { video, fireFrame } = createRvfcVideo()
    const getInnerVideo = () => video
    const getMjpegImg = () => null
    const { result, rerender } = renderHook(
      ({ entityState }: { entityState: string }) =>
        useCameraStreamStatus({
          getInnerVideo,
          getMjpegImg,
          entityState,
          enabled: true,
          entityAvailable: true,
        }),
      { initialProps: { entityState: 'streaming' } }
    )

    // Stream once so the load budget re-arms fresh at the first stall (a
    // stream that never started would legitimately hit the load budget first).
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    for (let cycle = 0; cycle < MAX_AUTO_REMOUNTS; cycle += 1) {
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
      act(() => {
        result.current.onStreamEvent()
      })
    }
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)

    // Entity state changed (camera restarted): the next stall remounts again
    // instead of erroring.
    rerender({ entityState: 'idle' })
    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)
  })

  it('falls back to playback polling when requestVideoFrameCallback is absent', () => {
    let totalVideoFrames = 0
    const video = withListenerApi({
      currentTime: 0,
      getVideoPlaybackQuality: () => ({ totalVideoFrames }),
    }) as unknown as HTMLVideoElement

    const { result } = renderStatus({ video })
    act(() => {
      result.current.onStreamEvent()
    })

    // No progress: not streaming.
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.isStreaming).toBe(false)

    // currentTime advances: frame detected.
    act(() => {
      ;(video as unknown as { currentTime: number }).currentTime = 1.5
      vi.advanceTimersByTime(250)
    })
    expect(result.current.isStreaming).toBe(true)

    // Decoded frame count advances even with a frozen currentTime.
    act(() => {
      vi.advanceTimersByTime(WARNING_TICK_MS)
    })
    expect(result.current.hasFrameWarning).toBe(true)
    act(() => {
      totalVideoFrames = 42
      vi.advanceTimersByTime(250)
    })
    expect(result.current.hasFrameWarning).toBe(false)
  })

  it('polls without getVideoPlaybackQuality and with an empty quality report', () => {
    const bareVideo = withListenerApi({ currentTime: 0 }) as unknown as HTMLVideoElement
    const bare = renderStatus({ video: bareVideo })
    act(() => {
      bare.result.current.onStreamEvent()
    })
    act(() => {
      ;(bareVideo as unknown as { currentTime: number }).currentTime = 2
      vi.advanceTimersByTime(250)
    })
    expect(bare.result.current.isStreaming).toBe(true)
    bare.unmount()

    const emptyQualityVideo = withListenerApi({
      currentTime: 0,
      getVideoPlaybackQuality: () => ({}),
    }) as unknown as HTMLVideoElement
    const empty = renderStatus({ video: emptyQualityVideo })
    act(() => {
      empty.result.current.onStreamEvent()
    })
    act(() => {
      ;(emptyQualityVideo as unknown as { currentTime: number }).currentTime = 2
      vi.advanceTimersByTime(250)
    })
    expect(empty.result.current.isStreaming).toBe(true)
  })

  it('treats an mjpeg image as streaming once it has decoded pixels, without a watchdog', () => {
    const { img, setNaturalWidth, removeListenerSpy } = createMjpegImg()
    const { result } = renderStatus({ img })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(false)

    act(() => {
      setNaturalWidth(640)
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(true)
    expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))

    // No frame watchdog in MJPEG mode: no warning, no remount, ever.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('keeps the connect timeout armed when a stream event fires before any element exists', () => {
    // `streams` fires when the camera capabilities resolve — potentially
    // before the player (and its inner <video>/<img>) exists. The watch
    // attaches nothing, so the load-phase timeout must still be able to
    // expire instead of leaving an infinite CONNECTING spinner.
    const { result } = renderStatus()

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(0)
    expect(result.current.error).toBeNull()

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.error).toBe('Stream failed to start')
  })

  it('clears stale streaming and re-arms the load budget when a swap epoch finds no media target', () => {
    // Player swap race (e.g. a mute toggle recreating the player): an early
    // `streams` event can arrive while the streaming flag is still true from
    // the superseded video watch and NEITHER a video nor an MJPEG img exists
    // yet. The epoch must drop the stale flag — leaving it true would mean no
    // watch, `connecting` false (no load budget), and a STREAMING pill
    // forever if no later `load` ever fires.
    const { video, fireFrame } = createRvfcVideo()
    let currentVideo: HTMLVideoElement | null = video
    const getInnerVideo = () => currentVideo
    const getMjpegImg = () => null
    const { result } = renderHook(() =>
      useCameraStreamStatus({
        getInnerVideo,
        getMjpegImg,
        entityState: 'streaming',
        enabled: true,
        entityAvailable: true,
      })
    )

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)

    // The swap announces a new epoch before any media element exists.
    currentVideo = null
    act(() => {
      result.current.onStreamEvent()
    })
    expect(result.current.isStreaming).toBe(false)

    // Dropping the flag re-armed the connection-state budget: a swap that
    // never comes up expires into a surfaced error instead of spinning.
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
    })
    expect(result.current.error).toBeNull()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.error).toBe('Stream failed to start')
  })

  it('recovers normally when the swapped player comes up after a targetless epoch', () => {
    const { video, fireFrame } = createRvfcVideo()
    let currentVideo: HTMLVideoElement | null = video
    const getInnerVideo = () => currentVideo
    const getMjpegImg = () => null
    const { result } = renderHook(() =>
      useCameraStreamStatus({
        getInnerVideo,
        getMjpegImg,
        entityState: 'streaming',
        enabled: true,
        entityAvailable: true,
      })
    )

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)

    // Early `streams` with no media target drops the stale flag...
    currentVideo = null
    act(() => {
      result.current.onStreamEvent()
    })
    expect(result.current.isStreaming).toBe(false)

    // ...and the replacement player's `load` starts a fresh watch whose
    // frames flip the machine back to streaming with no error surfaced.
    currentVideo = video
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('disarms the load budget on streaming, not on attach: frames end the load phase', () => {
    const { video, fireFrame } = createRvfcVideo()
    let currentVideo: HTMLVideoElement | null = null
    const getInnerVideo = () => currentVideo
    const getMjpegImg = () => null
    const { result } = renderHook(() =>
      useCameraStreamStatus({
        getInnerVideo,
        getMjpegImg,
        entityState: 'streaming',
        enabled: true,
        entityAvailable: true,
      })
    )

    // First event arrives before the player exists: nothing attaches, and the
    // load budget stays armed (it is owned by connection state, not by the
    // watch).
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.error).toBeNull()

    // The player comes up and fires again: decoded frames flip the machine to
    // streaming, which disarms the budget — frames keep the stream healthy
    // well past it.
    currentVideo = video
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    act(() => {
      for (let elapsed = 0; elapsed < CONNECT_TIMEOUT_MS + 5000; elapsed += 250) {
        vi.advanceTimersByTime(250)
        fireFrame()
      }
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isStreaming).toBe(true)
  })

  it('keeps the load budget armed after a watch attaches without ever producing frames', () => {
    // Attaching to a real <video> is NOT the end of the load phase: only
    // decoded frames are. An attached element that never decodes must still
    // expire into 'Stream failed to start' instead of spinning forever (the
    // stall path may remount along the way; the budget survives it because it
    // is owned by connection state, not by any single incarnation).
    const { video } = createRvfcVideo()
    const { result } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
    })
    expect(result.current.error).toBe('Stream failed to start')
    expect(result.current.isStreaming).toBe(false)
  })

  it('clears a stale frame warning when a new epoch starts in mjpeg mode', () => {
    const { video } = createRvfcVideo()
    const { img, setNaturalWidth } = createMjpegImg()
    let currentVideo: HTMLVideoElement | null = video
    let currentImg: HTMLImageElement | null = null
    const getInnerVideo = () => currentVideo
    const getMjpegImg = () => currentImg
    const { result } = renderHook(() =>
      useCameraStreamStatus({
        getInnerVideo,
        getMjpegImg,
        entityState: 'streaming',
        enabled: true,
        entityAvailable: true,
      })
    )

    // Video watch warns after 500ms without frames.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(WARNING_TICK_MS)
    })
    expect(result.current.hasFrameWarning).toBe(true)

    // Player swap to MJPEG: the new epoch must clear the stale warning (MJPEG
    // mode never raises or clears warnings itself, so it would latch forever).
    currentVideo = null
    currentImg = img
    act(() => {
      result.current.onStreamEvent()
    })
    expect(result.current.hasFrameWarning).toBe(false)

    act(() => {
      setNaturalWidth(640)
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.hasFrameWarning).toBe(false)
  })

  it('resets all status and ignores events while disabled', () => {
    const { video, fireFrame } = createRvfcVideo()
    const getInnerVideo = () => video
    const getMjpegImg = () => null
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCameraStreamStatus({
          getInnerVideo,
          getMjpegImg,
          entityState: 'streaming',
          enabled,
          entityAvailable: true,
        }),
      { initialProps: { enabled: true } }
    )

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      fireFrame()
    })
    expect(result.current.isStreaming).toBe(true)

    rerender({ enabled: false })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.error).toBeNull()

    // Events while disabled start no watch, and no connect timeout is armed.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 10_000)
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.remountKey).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('cancels the pending video frame callback on unmount and ignores late frames', () => {
    const { video, fireFrame, requestSpy, cancelSpy } = createRvfcVideo()
    const { result, unmount } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)

    unmount()
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    // A frame callback that was already queued by the browser runs after
    // unmount: the stopped guard prevents any re-registration.
    fireFrame()
    expect(requestSpy).toHaveBeenCalledTimes(1)
  })

  it('unmounts cleanly when the video has no cancelVideoFrameCallback', () => {
    const { video } = createRvfcVideo({ withCancel: false })
    const { result, unmount } = renderStatus({ video })

    act(() => {
      result.current.onStreamEvent()
    })

    expect(() => unmount()).not.toThrow()
  })

  describe('connect timeout (load phase)', () => {
    it('errors with "Stream failed to start" when no stream event ever arrives, and retry re-arms it', () => {
      const { video } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
      })
      expect(result.current.error).toBeNull()

      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
      expect(result.current.isStreaming).toBe(false)
      expect(result.current.remountKey).toBe(0)

      // The expired timer fired once; nothing else happens afterwards.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBe('Stream failed to start')
      expect(result.current.remountKey).toBe(0)

      // Retry clears the error, remounts, and grants a fresh connect budget.
      act(() => {
        result.current.retry()
      })
      expect(result.current.error).toBeNull()
      expect(result.current.remountKey).toBe(1)
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('is cleared when the watch attaches and never fires for a healthy stream', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })

      // Frames keep flowing well past the connect budget: no error.
      act(() => {
        for (let elapsed = 0; elapsed < CONNECT_TIMEOUT_MS + 5000; elapsed += 250) {
          vi.advanceTimersByTime(250)
          fireFrame()
        }
      })
      expect(result.current.error).toBeNull()
      expect(result.current.isStreaming).toBe(true)
    })

    it('is not scheduled while mounted hidden and arms the full budget on visibility', () => {
      const { video } = createRvfcVideo()
      act(() => {
        setDocumentHidden(true)
      })
      const { result } = renderStatus({ video })

      // Hidden from the start: no timeout is pending at all.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      // Becoming visible schedules the untouched 20s budget.
      act(() => {
        setDocumentHidden(false)
      })
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('handles redundant hidden events and disposes cleanly while hidden', () => {
      const { video } = createRvfcVideo()
      act(() => {
        setDocumentHidden(true)
      })
      const { result, unmount } = renderStatus({ video })

      // A redundant hidden event with no pending timer is a no-op.
      act(() => {
        setDocumentHidden(true)
      })
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      // Unmount while hidden: dispose has no pending timer to clear.
      expect(() => unmount()).not.toThrow()
    })

    it('no-ops when the budget expires after the first frame already won the race', () => {
      // markFrame flips isStreamingRef synchronously, but React commits the
      // re-render (whose effect cleanup disposes the timer) later — the
      // pending timeout can therefore still fire after frames started. Keep
      // both inside ONE act() so the cleanup deterministically has not run
      // when the timer expires: onExpire must see the ref and no-op instead
      // of surfacing 'Stream failed to start' over a live stream.
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        // Frames every watchdog tick (no stall) up to the budget boundary;
        // the un-disposed timer fires at exactly CONNECT_TIMEOUT_MS, AFTER
        // the last frame — no later frame can paper over a wrongly surfaced
        // error, so this isolates the onExpire guard itself.
        for (let elapsed = 0; elapsed < CONNECT_TIMEOUT_MS; elapsed += 250) {
          fireFrame()
          vi.advanceTimersByTime(250)
        }
      })
      expect(result.current.error).toBeNull()
      expect(result.current.isStreaming).toBe(true)
    })

    it('clears a pending "Stream failed to start" when frames flow while streaming', () => {
      // Belt-and-braces on markFrame: streaming-true-with-that-error is
      // reachable when an MJPEG epoch whose image already had decoded pixels
      // (so the swap keeps the streaming flag true) fast-fails on the image
      // `error` event before its first poll tick — the next decoded frame
      // must clear the stale failure.
      const { video, fireFrame } = createRvfcVideo()
      const { img, fireError } = createMjpegImg(640)
      let currentVideo: HTMLVideoElement | null = video
      let currentImg: HTMLImageElement | null = null
      const getInnerVideo = () => currentVideo
      const getMjpegImg = () => currentImg
      const { result } = renderHook(() =>
        useCameraStreamStatus({
          getInnerVideo,
          getMjpegImg,
          entityState: 'streaming',
          enabled: true,
          entityAvailable: true,
        })
      )

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      // Player swap to MJPEG; the image errors while the streaming flag from
      // the video watch is still true.
      currentVideo = null
      currentImg = img
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireError()
      })
      expect(result.current.error).toBe('Stream failed to start')
      expect(result.current.isStreaming).toBe(true)

      // Swap back to a video epoch: the first frame clears the stale error.
      currentVideo = video
      currentImg = null
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.error).toBeNull()
      expect(result.current.isStreaming).toBe(true)
    })

    it('pauses while the tab is hidden and resumes with the remaining budget', () => {
      const { video } = createRvfcVideo()
      const { result } = renderStatus({ video })

      // 10s of the budget spent while visible.
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      act(() => {
        setDocumentHidden(true)
      })
      // A whole minute hidden does not trip the timeout.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      act(() => {
        setDocumentHidden(false)
      })
      // Only the remaining ~10s of visible budget applies.
      act(() => {
        vi.advanceTimersByTime(10_000 - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })
  })

  describe('entity availability (machine suspension)', () => {
    it('pauses the budget while the entity is unavailable and resumes with the remainder', () => {
      const { video } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      // 10s of the budget spent while available.
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      // A whole minute unavailable does not burn budget.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      // Only the remaining ~10s applies.
      act(() => {
        vi.advanceTimersByTime(10_000 - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('arms paused when enabled while the entity is already unavailable', () => {
      const { video } = createRvfcVideo()
      const getInnerVideo = () => video
      const getMjpegImg = () => null
      const { result, rerender } = renderHook(
        ({ entityAvailable }: { entityAvailable: boolean }) =>
          useCameraStreamStatus({
            getInnerVideo,
            getMjpegImg,
            entityState: 'unavailable',
            enabled: true,
            entityAvailable,
          }),
        { initialProps: { entityAvailable: false } }
      )

      // Unavailable from the start: the budget never runs.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      // Recovery grants the untouched 20s budget.
      rerender({ entityAvailable: true })
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('keeps a playing stream and its status across an unavailability blip', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      // Blip: nothing resets, no error ever surfaces (budget is disarmed
      // while streaming and paused while unavailable).
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.error).toBeNull()
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('auto-retries a surfaced error when the entity recovers from unavailable', () => {
      const { video } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
      })
      expect(result.current.error).toBe('Stream failed to start')

      // The error keeps showing while unavailable (no mid-blip wipe)...
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      expect(result.current.error).toBe('Stream failed to start')

      // ...but recovery auto-retries: the error clears and the element is
      // remounted without any manual Retry click.
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      expect(result.current.error).toBeNull()
      expect(result.current.remountKey).toBe(1)

      // The cleared error re-arms a FRESH connect budget for the remounted
      // element (connecting again), so a camera that stays dead re-errors.
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('does not auto-remount on recovery when no error was surfaced', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      // A healthy blip must not churn the element: no remount, status intact.
      expect(result.current.remountKey).toBe(0)
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('suspends warning and stall evaluation while the entity is unavailable', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      // A minute of frozen frames during the blip: no warning, no stall
      // remount, no error — and the auto-remount budget does not burn.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.hasFrameWarning).toBe(false)
      expect(result.current.remountKey).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('grants a grace period after entity recovery before resuming evaluation', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      act(() => {
        vi.advanceTimersByTime(60_000)
      })

      // Recovery: the frame clock restarts from now (like return-to-visible)
      // instead of instantly reporting a 60s stall.
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(result.current.hasFrameWarning).toBe(false)
      expect(result.current.remountKey).toBe(0)

      // The watchdog resumed: a real frame gap now warns again.
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.hasFrameWarning).toBe(true)
    })

    it('restores the auto-remount budget when the entity recovers', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      // Stream once (so the load budget re-arms fresh at the first stall),
      // then burn the whole auto-remount budget with available-entity stalls.
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      for (let cycle = 0; cycle < MAX_AUTO_REMOUNTS; cycle += 1) {
        act(() => {
          vi.advanceTimersByTime(STALL_TICK_MS)
        })
        act(() => {
          result.current.onStreamEvent()
        })
      }
      expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)

      // Blip and recover: the machine resumes with a fresh budget, so the
      // next stall remounts instead of surfacing "Stream stalled".
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
      expect(result.current.error).toBeNull()
      expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)
    })

    it('suppresses the video error fast-fail while the entity is unavailable and recovers via stall remount', () => {
      const { video, fireFrame, fireError } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })

      // Backend dies during the blip: the media error must NOT surface a
      // sticky 'Video playback error'.
      act(() => {
        fireError()
      })
      expect(result.current.error).toBeNull()
      expect(result.current.isStreaming).toBe(true)

      // Recovery: the resumed watchdog stalls out the dead element and
      // auto-remounts it (budget restored), bringing the stream back without
      // any manual Retry.
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
      expect(result.current.error).toBeNull()
      expect(result.current.remountKey).toBe(1)
    })

    it('suppresses the mjpeg error fast-fail while the entity is unavailable', () => {
      const { img, fireError } = createMjpegImg()
      const { result, rerender } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      act(() => {
        fireError()
      })
      expect(result.current.error).toBeNull()
    })
  })

  describe('recent-frame evidence (isActivelyStreaming)', () => {
    it('is false while the entity is available, even when streaming', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)
      // Only the UNAVAILABLE pill precedence consumes it; while available it
      // stays false rather than tracking every frame.
      expect(result.current.isActivelyStreaming).toBe(false)
    })

    it('is true during a blip while frames demonstrably flow, and resets on recovery', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      // Evaluated immediately on the transition: frames are recent.
      expect(result.current.isActivelyStreaming).toBe(true)

      // Frames keep flowing through the blip: evidence holds.
      act(() => {
        vi.advanceTimersByTime(250)
        fireFrame()
        vi.advanceTimersByTime(250)
        fireFrame()
      })
      expect(result.current.isActivelyStreaming).toBe(true)

      // Recovery: the evidence resets (the pill no longer needs it).
      rerender({ enabled: true, entityState: 'streaming', entityAvailable: true })
      expect(result.current.isActivelyStreaming).toBe(false)
    })

    it('is false immediately when the entity goes unavailable over a stale frame', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      // Frame freezes well past FRAME_WARNING_MS before the entity drops:
      // a dead camera must read UNAVAILABLE right away, not STREAMING.
      act(() => {
        vi.advanceTimersByTime(WARNING_TICK_MS)
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.isActivelyStreaming).toBe(false)
    })

    it('demotes the evidence when frames stop mid-blip', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result, rerender } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      rerender({ enabled: true, entityState: 'unavailable', entityAvailable: false })
      expect(result.current.isActivelyStreaming).toBe(true)

      // Frames freeze during the blip: the 250ms evaluator flips the
      // evidence false once FRAME_WARNING_MS passes without a frame.
      act(() => {
        vi.advanceTimersByTime(WARNING_TICK_MS)
      })
      expect(result.current.isActivelyStreaming).toBe(false)
    })
  })

  describe('visibility-aware watchdog', () => {
    it('skips stall and warning evaluation while the tab is hidden', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      act(() => {
        setDocumentHidden(true)
      })
      // rVFC is suspended in hidden tabs: a minute without frames must not
      // warn, stall, remount, or error.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.hasFrameWarning).toBe(false)
      expect(result.current.remountKey).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('grants a grace period after returning to a visible tab before resuming evaluation', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      act(() => {
        setDocumentHidden(true)
      })
      act(() => {
        vi.advanceTimersByTime(60_000)
      })

      // Back to visible: the frame clock restarts from now instead of
      // instantly reporting a 60s stall.
      act(() => {
        setDocumentHidden(false)
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(result.current.hasFrameWarning).toBe(false)
      expect(result.current.remountKey).toBe(0)

      // The watchdog resumed: a real frame gap now warns again.
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.hasFrameWarning).toBe(true)
    })

    it('restores the auto-remount budget when the tab becomes visible again', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { result } = renderStatus({ video })

      // Stream once (so the load budget re-arms fresh at the first stall),
      // then burn the whole auto-remount budget with visible stalls.
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      for (let cycle = 0; cycle < MAX_AUTO_REMOUNTS; cycle += 1) {
        act(() => {
          vi.advanceTimersByTime(STALL_TICK_MS)
        })
        act(() => {
          result.current.onStreamEvent()
        })
      }
      expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)

      // Hide and return: the visible session starts with a fresh budget, so
      // the next stall remounts instead of surfacing "Stream stalled".
      act(() => {
        setDocumentHidden(true)
      })
      act(() => {
        setDocumentHidden(false)
      })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
      expect(result.current.error).toBeNull()
      expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)
    })
  })

  describe('video element errors', () => {
    it('surfaces "Video playback error" immediately and stops the watch', () => {
      const { video, fireFrame, fireError, removeListenerSpy } = createRvfcVideo()
      const { result } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      act(() => {
        fireError()
      })
      expect(result.current.error).toBe('Video playback error')
      expect(result.current.isStreaming).toBe(false)
      expect(result.current.hasFrameWarning).toBe(false)
      expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))

      // The watch stopped: no stall remount ever fires afterwards.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.remountKey).toBe(0)
      expect(result.current.error).toBe('Video playback error')
    })

    it('attaches the error listener per watch and removes it on unmount', () => {
      const { video, addListenerSpy, removeListenerSpy } = createRvfcVideo()
      const { result, unmount } = renderStatus({ video })

      act(() => {
        result.current.onStreamEvent()
      })
      expect(addListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))

      unmount()
      expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))
    })
  })

  describe('mjpeg connect handling', () => {
    it('errors when the image never decodes pixels within the connect budget', () => {
      const { img, setNaturalWidth } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 500)
      })
      expect(result.current.error).toBeNull()

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(result.current.error).toBe('Stream failed to start')
      expect(result.current.isStreaming).toBe(false)

      // Pixels decoding later are a genuine recovery — mirroring the video
      // path, where frames on a later watch clear a surfaced error.
      act(() => {
        setNaturalWidth(640)
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.isStreaming).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('re-arms the load budget when a video-to-mjpeg swap arrives with a stale streaming flag', () => {
      // MJPEG has no frame watchdog: a swap from a streaming video watch to an
      // image that never decodes would otherwise leave STREAMING latched
      // forever. The attach point drops the stale flag, which re-arms the
      // connection-state budget — the swap fails after a fresh 20 s instead.
      const { video, fireFrame } = createRvfcVideo()
      const { img } = createMjpegImg()
      let currentVideo: HTMLVideoElement | null = video
      let currentImg: HTMLImageElement | null = null
      const getInnerVideo = () => currentVideo
      const getMjpegImg = () => currentImg
      const { result } = renderHook(() =>
        useCameraStreamStatus({
          getInnerVideo,
          getMjpegImg,
          entityState: 'streaming',
          enabled: true,
          entityAvailable: true,
        })
      )

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      // Player swap to an MJPEG image with no decoded pixels.
      currentVideo = null
      currentImg = img
      act(() => {
        result.current.onStreamEvent()
      })
      expect(result.current.isStreaming).toBe(false)

      // The re-armed budget is a FRESH 20 s from the swap.
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 250)
      })
      expect(result.current.error).toBeNull()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('keeps streaming across a swap to an mjpeg image that already has pixels', () => {
      const { video, fireFrame } = createRvfcVideo()
      const { img } = createMjpegImg(640)
      let currentVideo: HTMLVideoElement | null = video
      let currentImg: HTMLImageElement | null = null
      const getInnerVideo = () => currentVideo
      const getMjpegImg = () => currentImg
      const { result } = renderHook(() =>
        useCameraStreamStatus({
          getInnerVideo,
          getMjpegImg,
          entityState: 'streaming',
          enabled: true,
          entityAvailable: true,
        })
      )

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireFrame()
      })
      expect(result.current.isStreaming).toBe(true)

      // Decoded pixels are real streaming evidence: no false blink, no budget.
      currentVideo = null
      currentImg = img
      act(() => {
        result.current.onStreamEvent()
      })
      expect(result.current.isStreaming).toBe(true)
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 5000)
      })
      expect(result.current.error).toBeNull()
      expect(result.current.isStreaming).toBe(true)
    })

    it('does not grant a fresh budget when the mjpeg image attaches mid-load', () => {
      // The MJPEG branch used to own "the remaining load budget" with its own
      // 20 s tracker started at attach time — an image attaching at t=10 s
      // effectively got 30 s. The budget is now owned by connection state:
      // attach changes nothing, and expiry lands at 20 s from CONNECTING.
      const { img } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 10_000)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })

    it('fails fast on an image error event', () => {
      const { img, fireError, removeListenerSpy } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        fireError()
      })
      expect(result.current.error).toBe('Stream failed to start')
      expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('ignores an image error from a superseded mjpeg epoch', () => {
      const { img, fireError } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })

      // The old image errors after the new epoch was announced but before the
      // old watch's cleanup: no error may surface on the replacement's behalf.
      act(() => {
        result.current.onStreamEvent()
        fireError()
      })
      expect(result.current.error).toBeNull()
    })

    it('ignores a poll tick from a superseded mjpeg epoch', () => {
      const { img, setNaturalWidth } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })

      // Epoch 1's poll interval fires once more after epoch 2 was announced:
      // the decoded pixels it sees belong to the old watch and must not flip
      // the machine to streaming.
      act(() => {
        result.current.onStreamEvent()
        setNaturalWidth(640)
        vi.advanceTimersByTime(500)
      })
      expect(result.current.isStreaming).toBe(false)

      // The new epoch's own poll reports the pixels normally.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(result.current.isStreaming).toBe(true)
    })

    it('pauses the mjpeg connect budget while the tab is hidden', () => {
      const { img } = createMjpegImg()
      const { result } = renderStatus({ img })

      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        setDocumentHidden(true)
      })
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(result.current.error).toBeNull()

      act(() => {
        setDocumentHidden(false)
      })
      act(() => {
        vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
      })
      expect(result.current.error).toBe('Stream failed to start')
    })
  })
})
