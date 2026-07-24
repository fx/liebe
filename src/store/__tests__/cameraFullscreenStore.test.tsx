import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
  useCameraFullscreenActive,
} from '../cameraFullscreenStore'

describe('cameraFullscreenStore', () => {
  beforeEach(() => {
    cameraFullscreenStore.setState(() => 0)
  })

  it('counts entries and exits, staying active until every overlay closes', () => {
    expect(cameraFullscreenStore.state).toBe(0)

    enterCameraFullscreen()
    expect(cameraFullscreenStore.state).toBe(1)

    // A second overlay keeps the lift on; the first exit must not clear it.
    enterCameraFullscreen()
    expect(cameraFullscreenStore.state).toBe(2)

    exitCameraFullscreen()
    expect(cameraFullscreenStore.state).toBe(1)

    exitCameraFullscreen()
    expect(cameraFullscreenStore.state).toBe(0)
  })

  it('clamps at zero so an unbalanced exit never goes negative', () => {
    exitCameraFullscreen()
    expect(cameraFullscreenStore.state).toBe(0)
  })

  it('useCameraFullscreenActive tracks whether any overlay is open', () => {
    const { result } = renderHook(() => useCameraFullscreenActive())
    expect(result.current).toBe(false)

    act(() => enterCameraFullscreen())
    expect(result.current).toBe(true)

    act(() => exitCameraFullscreen())
    expect(result.current).toBe(false)
  })
})
