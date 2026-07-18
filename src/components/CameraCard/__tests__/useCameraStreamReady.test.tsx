import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCameraStreamReady } from '../useCameraStreamReady'
import { ensureHaElement } from '~/utils/haFrontend'

// The bootstrap ladder itself is covered by the haFrontend util tests; this
// hook only maps its boolean promise onto the readiness state.
vi.mock('~/utils/haFrontend', () => ({
  ensureHaElement: vi.fn(),
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
})
