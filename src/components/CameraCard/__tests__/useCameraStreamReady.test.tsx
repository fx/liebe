import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useCameraStreamReady,
  ensureCameraStreamElement,
  resetCameraStreamReadyForTests,
} from '../useCameraStreamReady'

// NOTE: jsdom cannot unregister custom elements, so the tests in this file are
// order-sensitive: every test that needs 'ha-camera-stream' to be UNDEFINED
// must run before the success-path test that defines it. The ladder's promise
// cache is reset per test via resetCameraStreamReadyForTests().

interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => HTMLElement
}
type LoadCardHelpers = () => Promise<CardHelpers>

function setLoadCardHelpers(fn: LoadCardHelpers | undefined) {
  ;(window as unknown as { loadCardHelpers?: LoadCardHelpers }).loadCardHelpers = fn
}

describe('useCameraStreamReady', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetCameraStreamReadyForTests()
    setLoadCardHelpers(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    setLoadCardHelpers(undefined)
  })

  it('reports unavailable when loadCardHelpers never appears (poll timeout)', async () => {
    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))

    expect(result.current).toBe('loading')

    // Still polling after 1s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current).toBe('loading')

    // Poll gives up after 20 attempts x 250ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250 * 20)
    })
    expect(result.current).toBe('unavailable')
  })

  it('does not set state after unmount while the ladder is pending', async () => {
    const { result, unmount } = renderHook(() => useCameraStreamReady('camera.demo'))
    expect(result.current).toBe('loading')

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250 * 20)
    })

    // The unmounted hook never received the resolution.
    expect(result.current).toBe('loading')
  })

  it('reports unavailable when loadCardHelpers rejects', async () => {
    setLoadCardHelpers(vi.fn().mockRejectedValue(new Error('boom')))

    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current).toBe('unavailable')
  })

  it('reports unavailable when createCardElement throws', async () => {
    setLoadCardHelpers(
      vi.fn().mockResolvedValue({
        createCardElement: vi.fn(() => {
          throw new Error('bad card config')
        }),
      })
    )

    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current).toBe('unavailable')
  })

  it('reports unavailable when the element is never defined after card creation', async () => {
    const createCardElement = vi.fn(() => document.createElement('div'))

    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))

    // loadCardHelpers appears only after a couple of poll attempts, covering
    // the poll-retry-then-found path.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    setLoadCardHelpers(vi.fn().mockResolvedValue({ createCardElement }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    // The throwaway card was created but never defines the element; the
    // whenDefined timeout trips after 10s.
    expect(createCardElement).toHaveBeenCalledWith({
      type: 'picture-entity',
      entity: 'camera.demo',
      camera_view: 'live',
    })
    expect(result.current).toBe('loading')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current).toBe('unavailable')
  })

  it('resolves ready via the helpers path and runs the ladder once for many consumers', async () => {
    const createCardElement = vi.fn(() => {
      customElements.define('ha-camera-stream', class extends HTMLElement {})
      return document.createElement('div')
    })
    const loadCardHelpers = vi.fn().mockResolvedValue({ createCardElement })
    setLoadCardHelpers(loadCardHelpers)

    // The module-level cache hands every caller the same promise.
    expect(ensureCameraStreamElement('camera.first')).toBe(
      ensureCameraStreamElement('camera.second')
    )

    const first = renderHook(() => useCameraStreamReady('camera.first'))
    const second = renderHook(() => useCameraStreamReady('camera.second'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(first.result.current).toBe('ready')
    expect(second.result.current).toBe('ready')
    // One ladder run total: one helpers load, one throwaway card, configured
    // with the entityId of the first caller.
    expect(loadCardHelpers).toHaveBeenCalledTimes(1)
    expect(createCardElement).toHaveBeenCalledTimes(1)
    expect(createCardElement).toHaveBeenCalledWith({
      type: 'picture-entity',
      entity: 'camera.first',
      camera_view: 'live',
    })
  })

  it('resolves ready immediately when the element is already defined', async () => {
    // The previous test defined 'ha-camera-stream'; the cache was reset in
    // beforeEach, so this run takes the already-defined short-circuit.
    const loadCardHelpers = vi.fn()
    setLoadCardHelpers(loadCardHelpers as unknown as LoadCardHelpers)

    const { result } = renderHook(() => useCameraStreamReady('camera.demo'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current).toBe('ready')
    expect(loadCardHelpers).not.toHaveBeenCalled()
  })
})
