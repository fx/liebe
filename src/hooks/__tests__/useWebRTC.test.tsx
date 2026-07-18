import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebRTC } from '../useWebRTC'
import { HomeAssistantProvider } from '../../contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'

// Minimal RTCPeerConnection stand-in that lets initializeWebRTC run to the
// point where the peer connection is created and exposed.
class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = []
  connectionState = 'new'
  signalingState = 'stable'
  remoteDescription: unknown = null
  ontrack: ((e: unknown) => void) | null = null
  onicecandidate: ((e: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  constructor() {
    MockRTCPeerConnection.instances.push(this)
  }
  addTransceiver = vi.fn()
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' })
  setLocalDescription = vi.fn().mockResolvedValue(undefined)
  setRemoteDescription = vi.fn().mockResolvedValue(undefined)
  addIceCandidate = vi.fn().mockResolvedValue(undefined)
  close = vi.fn()
  getStats = vi.fn().mockResolvedValue(new Map())
}

describe('useWebRTC', () => {
  let mockHass: HomeAssistant

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HomeAssistantProvider hass={mockHass}>{children}</HomeAssistantProvider>
  )

  beforeEach(() => {
    vi.useFakeTimers()
    MockRTCPeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
    mockHass = createMockHomeAssistant()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exposes the peer connection reactively once it is created', async () => {
    const { result } = renderHook(() => useWebRTC({ entityId: 'camera.test', enabled: true }), {
      wrapper,
    })

    // No connection before a video element is attached.
    expect(result.current.peerConnection).toBeNull()

    // Attach a video element, then trigger the init effect via retry().
    await act(async () => {
      result.current.videoRef({} as unknown as HTMLVideoElement)
      result.current.retry()
    })
    // Advance past the 200ms init debounce and flush the async handshake.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    // The hook re-rendered and now exposes the live connection (previously this
    // value was read from a ref during render and could be stale/non-reactive).
    expect(MockRTCPeerConnection.instances).toHaveLength(1)
    expect(result.current.peerConnection).toBe(MockRTCPeerConnection.instances[0])
  })

  it('clears the exposed peer connection when disabled', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWebRTC({ entityId: 'camera.test', enabled }),
      { wrapper, initialProps: { enabled: true } }
    )

    await act(async () => {
      result.current.videoRef({} as unknown as HTMLVideoElement)
      result.current.retry()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.peerConnection).not.toBeNull()

    // Disabling tears the connection down; the exposed value must go back to null.
    await act(async () => {
      rerender({ enabled: false })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.peerConnection).toBeNull()
  })
})
