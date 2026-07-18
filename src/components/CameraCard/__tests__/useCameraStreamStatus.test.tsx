import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCameraStreamStatus, MAX_AUTO_REMOUNTS } from '../useCameraStreamStatus'

// Watchdog ticks every 250ms; one tick past the 500ms warning threshold.
const WARNING_TICK_MS = 750
// One tick past the 5s stall threshold.
const STALL_TICK_MS = 5250

interface RvfcVideo {
  video: HTMLVideoElement
  fireFrame: () => void
  requestSpy: ReturnType<typeof vi.fn>
  cancelSpy?: ReturnType<typeof vi.fn>
}

function createRvfcVideo({ withCancel = true }: { withCancel?: boolean } = {}): RvfcVideo {
  const callbacks: Array<() => void> = []
  const requestSpy = vi.fn((callback: () => void) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const cancelSpy = vi.fn()
  const video = { currentTime: 0, requestVideoFrameCallback: requestSpy } as unknown as Record<
    string,
    unknown
  >
  if (withCancel) {
    video.cancelVideoFrameCallback = cancelSpy
  }
  const fireFrame = () => {
    const pending = callbacks.splice(0, callbacks.length)
    pending.forEach((callback) => callback())
  }
  return {
    video: video as unknown as HTMLVideoElement,
    fireFrame,
    requestSpy,
    cancelSpy: withCancel ? cancelSpy : undefined,
  }
}

function renderStatus({
  video = null as HTMLVideoElement | null,
  img = null as HTMLImageElement | null,
} = {}) {
  const getInnerVideo = () => video
  const getMjpegImg = () => img
  return renderHook(
    ({ enabled, entityState }: { enabled: boolean; entityState: string }) =>
      useCameraStreamStatus({ getInnerVideo, getMjpegImg, entityState, enabled }),
    { initialProps: { enabled: true, entityState: 'streaming' } }
  )
}

describe('useCameraStreamStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('requests a remount after a sustained 5s stall', () => {
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
    // load event.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.remountKey).toBe(1)
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
    const { video } = createRvfcVideo()
    const getInnerVideo = () => video
    const getMjpegImg = () => null
    const { result, rerender } = renderHook(
      ({ entityState }: { entityState: string }) =>
        useCameraStreamStatus({ getInnerVideo, getMjpegImg, entityState, enabled: true }),
      { initialProps: { entityState: 'streaming' } }
    )

    for (let cycle = 0; cycle < MAX_AUTO_REMOUNTS; cycle += 1) {
      act(() => {
        result.current.onStreamEvent()
      })
      act(() => {
        vi.advanceTimersByTime(STALL_TICK_MS)
      })
    }
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS)

    // Entity state changed (camera restarted): the next stall remounts again
    // instead of erroring.
    rerender({ entityState: 'idle' })
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(STALL_TICK_MS)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.remountKey).toBe(MAX_AUTO_REMOUNTS + 1)
  })

  it('falls back to playback polling when requestVideoFrameCallback is absent', () => {
    let totalVideoFrames = 0
    const video = {
      currentTime: 0,
      getVideoPlaybackQuality: () => ({ totalVideoFrames }),
    } as unknown as HTMLVideoElement

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
    const bareVideo = { currentTime: 0 } as unknown as HTMLVideoElement
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

    const emptyQualityVideo = {
      currentTime: 0,
      getVideoPlaybackQuality: () => ({}),
    } as unknown as HTMLVideoElement
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
    const img = { naturalWidth: 0 } as unknown as HTMLImageElement
    const { result } = renderStatus({ img })

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(false)

    act(() => {
      ;(img as unknown as { naturalWidth: number }).naturalWidth = 640
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(true)

    // No frame watchdog in MJPEG mode: no warning, no remount, ever.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('does nothing when neither a video nor an mjpeg image is found', () => {
    const { result } = renderStatus()

    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.hasFrameWarning).toBe(false)
    expect(result.current.remountKey).toBe(0)
  })

  it('resets all status and ignores events while disabled', () => {
    const { video, fireFrame } = createRvfcVideo()
    const getInnerVideo = () => video
    const getMjpegImg = () => null
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCameraStreamStatus({ getInnerVideo, getMjpegImg, entityState: 'streaming', enabled }),
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

    // Events while disabled start no watch.
    act(() => {
      result.current.onStreamEvent()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.remountKey).toBe(0)
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
})
