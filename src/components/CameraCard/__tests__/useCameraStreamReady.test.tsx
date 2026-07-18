import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCameraStreamReady, BOOTSTRAP_RETRY_INTERVAL_MS } from '../useCameraStreamReady'
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

    it('re-attempts the ladder on an interval in an HA context and flips to ready', async () => {
      vi.mocked(isHaFrontendContext).mockReturnValue(true)
      vi.mocked(ensureHaElement)
        .mockResolvedValueOnce(false) // initial mount misses (transient)
        .mockResolvedValueOnce(false) // first retry tick still misses
        .mockResolvedValueOnce(true) // second retry succeeds

      const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
      await act(async () => {})
      expect(result.current).toBe('unavailable')

      // A failed retry keeps 'unavailable' (and the interval alive).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(result.current).toBe('unavailable')
      expect(ensureHaElement).toHaveBeenCalledTimes(2)

      // A later success converges the already-mounted card to 'ready'.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS)
      })
      expect(result.current).toBe('ready')
      expect(ensureHaElement).toHaveBeenCalledTimes(3)

      // Once ready, the retry interval is gone.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BOOTSTRAP_RETRY_INTERVAL_MS * 4)
      })
      expect(ensureHaElement).toHaveBeenCalledTimes(3)
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
