import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { CameraStats } from '../CameraStats'

type MockableVideo = HTMLVideoElement & Record<string, unknown>

function makeVideo(overrides: Record<string, unknown> = {}): MockableVideo {
  return { videoWidth: 1920, videoHeight: 1080, ...overrides } as unknown as MockableVideo
}

describe('CameraStats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not inflate the first sample against a long-running video', () => {
    let totalVideoFrames = 250_000
    const video = makeVideo({
      getVideoPlaybackQuality: () => ({ totalVideoFrames, droppedVideoFrames: 0 }),
    })
    const { getByText } = render(<CameraStats size="medium" videoElement={video} />)

    // First sample: the baseline is seeded from the video's current counters,
    // and no FPS renders until a second sample exists — NOT ~250000 fps from
    // a zero baseline.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(getByText('FPS').nextElementSibling?.textContent).toBe('—')
    expect(getByText('250000')).toBeInTheDocument()

    // Second sample measures only the frames decoded since the baseline.
    totalVideoFrames = 250_030
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByText('30')).toBeInTheDocument()
  })

  it('renders an FPS placeholder in the compact line until the second sample', () => {
    const video = makeVideo({
      getVideoPlaybackQuality: () => ({ totalVideoFrames: 9000, droppedVideoFrames: 0 }),
    })
    const { container } = render(<CameraStats size="small" videoElement={video} />)

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(container.textContent).toContain('— FPS • 1920x1080')
  })

  it('computes fps, frames, dropped, and resolution from getVideoPlaybackQuality', () => {
    let totalVideoFrames = 0
    let droppedVideoFrames = 0
    const video = makeVideo({
      getVideoPlaybackQuality: () => ({ totalVideoFrames, droppedVideoFrames }),
    })
    const { getByText, getAllByText, queryByText, container } = render(
      <CameraStats size="medium" videoElement={video} />
    )

    // Initial update only establishes the baseline: FPS renders as '—'.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(getAllByText('0').length).toBeGreaterThan(0)
    expect(getByText('FPS').nextElementSibling?.textContent).toBe('—')
    expect(getByText('1920x1080')).toBeInTheDocument()

    // 25 new frames in one second: fps 25, frames 25, dropped 2 (in red).
    totalVideoFrames = 25
    droppedVideoFrames = 2
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByText('2').getAttribute('data-accent-color')).toBe('red')

    // 15 more frames the next second: fps 15, total frames 40.
    totalVideoFrames = 40
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByText('15')).toBeInTheDocument()
    expect(getByText('40')).toBeInTheDocument()

    // Column labels present; bitrate is gone.
    expect(getByText('FPS')).toBeInTheDocument()
    expect(getByText('Resolution')).toBeInTheDocument()
    expect(getByText('Frames')).toBeInTheDocument()
    expect(getByText('Dropped')).toBeInTheDocument()
    expect(queryByText('Bitrate')).toBeNull()
    expect(container.textContent).not.toContain('kb/s')
  })

  it('renders a compact fps and resolution line for small size', () => {
    let totalVideoFrames = 0
    const video = makeVideo({
      getVideoPlaybackQuality: () => ({ totalVideoFrames, droppedVideoFrames: 0 }),
    })
    const { container } = render(<CameraStats size="small" videoElement={video} />)

    // Flush the initial (delta-0) update, then deliver 30 frames in 1s.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    totalVideoFrames = 30
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('30 FPS • 1920x1080')
    expect(container.textContent).not.toContain('kb/s')
    expect(container.textContent).not.toContain('Bitrate')
  })

  it('falls back to webkit frame counters without getVideoPlaybackQuality', () => {
    const video = makeVideo({ webkitDecodedFrameCount: 12, webkitDroppedFrameCount: 3 })
    const { getByText } = render(<CameraStats size="medium" videoElement={video} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(getByText('12')).toBeInTheDocument()
    expect(getByText('3')).toBeInTheDocument()
  })

  it('falls back to moz frame counters and derives dropped from parsed minus decoded', () => {
    const video = makeVideo({ mozDecodedFrames: 20, mozParsedFrames: 26 })
    const { getByText } = render(<CameraStats size="medium" videoElement={video} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(getByText('20')).toBeInTheDocument()
    expect(getByText('6')).toBeInTheDocument()
  })

  it('shows zeros and an empty resolution when no counters or dimensions exist', () => {
    // mozParsedFrames without mozDecodedFrames: the dropped ternary falls
    // through to zero; videoWidth 0 short-circuits the resolution.
    const video = makeVideo({ videoWidth: 0, videoHeight: 0, mozParsedFrames: 5 })
    const { getAllByText, getByText } = render(<CameraStats size="medium" videoElement={video} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(getAllByText('0')).toHaveLength(3)
    expect(getByText('Resolution').nextElementSibling?.textContent).toBe('')
  })

  it('omits the resolution when only the height is missing', () => {
    const video = makeVideo({ videoHeight: 0 })
    const { getByText } = render(<CameraStats size="medium" videoElement={video} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(getByText('Resolution').nextElementSibling?.textContent).toBe('')
  })

  it('schedules no updates without a video element and cleans up on unmount', () => {
    const { unmount } = render(<CameraStats size="medium" videoElement={null} />)
    expect(vi.getTimerCount()).toBe(0)
    unmount()

    const video = makeVideo({
      getVideoPlaybackQuality: () => ({ totalVideoFrames: 1, droppedVideoFrames: 0 }),
    })
    const withVideo = render(<CameraStats size="medium" videoElement={video} />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    withVideo.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
