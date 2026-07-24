import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useCameraStreamReady,
  BOOTSTRAP_RETRY_INTERVAL_MS,
  BOOTSTRAP_RETRY_MAX_DELAY_MS,
  BOOTSTRAP_RETRY_MAX_ATTEMPTS,
} from '../useCameraStreamReady'
import { ensureHaElement, isHaFrontendContext } from '~/utils/haFrontend'

// The bootstrap ladder itself is covered by the haFrontend util tests; this
// hook only maps its boolean promise onto the readiness state (plus the
// unavailable-retry loop below).
vi.mock('~/utils/haFrontend', () => ({
  ensureHaElement: vi.fn(),
  isHaFrontendContext: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useCameraStreamReady', () => {
  beforeEach(() => {
    vi.mocked(ensureHaElement).mockReset()
    vi.mocked(isHaFrontendContext).mockReset()
    // Default to the standalone (no-retry) environment; retry tests opt in.
    vi.mocked(isHaFrontendContext).mockReturnValue(false)
  })

  it('bootstraps ha-camera-stream via a throwaway live picture-entity card', async () => {
    vi.mocked(ensureHaElement).mockResolvedValue(true)
    renderHook(() => useCameraStreamReady('camera.demo'))

    expect(ensureHaElement).toHaveBeenCalledWith('ha-camera-stream', {
      type: 'picture-entity',
      entity: 'camera.demo',
      camera_view: 'live',
    })
  })

  it('reports loading, then ready when the element gets defined', async () => {
    const gate = deferred<boolean>()
    vi.mocked(ensureHaElement).mockReturnValue(gate.promise)
    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))

    expect(result.current).toBe('loading')

    act(() => gate.resolve(true))
    await waitFor(() => expect(result.current).toBe('ready'))
  })

  it('reports unavailable when the element cannot be bootstrapped', async () => {
    vi.mocked(ensureHaElement).mockResolvedValue(false)
    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))

    await waitFor(() => expect(result.current).toBe('unavailable'))
  })

  it('re-runs the ladder on remount, so a transient failure gets a fresh chance', async () => {
    // ensureHaElement evicts false resolutions from its cache, so a remounted
    // consumer (retry/remountKey paths) triggers a genuine new ladder run.
    vi.mocked(ensureHaElement).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const first = renderHook(() => useCameraStreamReady('camera.demo'))
    await waitFor(() => expect(first.result.current).toBe('unavailable'))
    first.unmount()

    const second = renderHook(() => useCameraStreamReady('camera.demo'))
    await waitFor(() => expect(second.result.current).toBe('ready'))
    expect(ensureHaElement).toHaveBeenCalledTimes(2)
  })

  it('does not set state after unmount while the ladder is pending', async () => {
    const gate = deferred<boolean>()
    vi.mocked(ensureHaElement).mockReturnValue(gate.promise)
    const { result, unmount } = renderHook(() => useCameraStreamReady('camera.demo'))
    expect(result.current).toBe('loading')

    unmount()
    await act(async () => {
      gate.resolve(true)
      await gate.promise
    })

    // The unmounted hook never received the resolution.
    expect(result.current).toBe('loading')
  })

  describe('bootstrap retry while unavailable', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('re-attempts the ladder with exponential backoff in an HA context and flips to ready', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      vi.mocked(ensureHaElement)
        .mockResolvedValueOnce(false) // initial mount misses (transient)
        .mockResolvedValueOnce(false) // first retry (after 15s) still misses
        .mockResolvedValueOnce(true) // second retry (after +30s) succeeds

      const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')

      // A failed retry keeps 'unavailable' (and the backoff chain alive).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(result.current).toBe('unavailable')
      expect(ensureHaElement).toHaveBeenCalledTimes(2)

      // The next gap doubles: nothing fires within another base interval...
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(2)

      // ...but the 30s mark converges the already-mounted card to 'ready'.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(result.current).toBe('ready')
      expect(ensureHaElement).toHaveBeenCalledTimes(3)

      // Once ready, the retry chain is gone.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_MAX_DELAY_MS * 4)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(3)
    })

    it('caps the delay at 5 minutes and stops for good after the attempt cap', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      // The element never defines on this frontend.
      vi.mocked(ensureHaElement).mockResolvedValue(false)

      const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')
      expect(ensureHaElement).toHaveBeenCalledTimes(1)

      // Walk the whole backoff ladder: 15s, 30s, 60s, 120s, 240s, then capped
      // at 300s per gap until the attempt cap.
      for (let attempt = 0; attempt < BOOTSTRAP_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const delay = Math.min(
          BOOTSTRAP_RETRY_INTERVAL_MS * 2 ** attempt,
          BOOTSTRAP_RETRY_MAX_DELAY_MS
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay)
        })
        expect(ensureHaElement).toHaveBeenCalledTimes(attempt + 2)
      }
      expect(result.current).toBe('unavailable')

      // Cap reached: permanently 'unavailable' — no attempt ever fires again.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_MAX_DELAY_MS * 10)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(BOOTSTRAP_RETRY_MAX_ATTEMPTS + 1)
      expect(result.current).toBe('unavailable')
    })

    it('does not retry outside an HA frontend context (standalone)', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(false)
      vi.mocked(ensureHaElement).mockResolvedValue(false)

      const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')

      // Standalone can never become HA: no interval, no further attempts.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS * 4)
      })
      expect(result.current).toBe('unavailable')
      expect(ensureHaElement).toHaveBeenCalledTimes(1)
    })

    it('clears a pending (unfired) retry timeout on unmount', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      vi.mocked(ensureHaElement).mockResolvedValue(false)

      const { result, unmount } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')
      expect(ensureHaElement).toHaveBeenCalledTimes(1)

      // Unmount midway through the first backoff gap: the scheduled attempt
      // is cancelled and never fires.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS / 2)
      })
      unmount()
      await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_MAX_DELAY_MS * 4)
      expect(ensureHaElement).toHaveBeenCalledTimes(1)
    })

    it('does not schedule a retry when the initial ladder resolves false after unmount', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      const gate = deferred<boolean>()
      vi.mocked(ensureHaElement).mockReturnValue(gate.promise)
      const { unmount } = renderHook(() => useCameraStreamReady('camera.demo'))

      // Unmount while the initial ladder is still pending, THEN let it
      // resolve false: the cancelled resolution sets no state, so the
      // unavailable-retry effect never arms — no backoff attempt ever fires.
      unmount()
      await act(async () => {
        gate.resolve(false)
        await gate.promise
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(1)
    })

    it('stops retrying on unmount and ignores an in-flight retry resolution', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      const gate = deferred<boolean>()
      vi.mocked(ensureHaElement).mockResolvedValueOnce(false).mockReturnValueOnce(gate.promise)

      const { result, unmount } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(2)

      unmount()
      // The pending retry resolves true after unmount: no state is set.
      await act(async () => {
        gate.resolve(true)
        await gate.promise
      })
      expect(result.current).toBe('unavailable')

      // The interval was cleared: no further attempts.
      await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS * 4)
      expect(ensureHaElement).toHaveBeenCalledTimes(2)
    })
  })
})
