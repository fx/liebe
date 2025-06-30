import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHomeAssistantRouting } from '../useHomeAssistantRouting'

// Mock the router
const mockNavigate = vi.fn()
const mockSubscribe = vi.fn()
const mockRouterState = {
  location: {
    pathname: '/test-path',
  },
}

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    subscribe: mockSubscribe,
    state: mockRouterState,
  }),
}))

describe('useHomeAssistantRouting', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>
  let originalLocation: Location

  beforeEach(() => {
    // Reset mocks
    mockNavigate.mockClear()
    mockSubscribe.mockClear()

    // Mock window methods
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    // Store original location
    originalLocation = window.location

    // Mock subscribe to return an unsubscribe function
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })

    vi.restoreAllMocks()
  })

  describe('when in Home Assistant environment', () => {
    beforeEach(() => {
      // Mock location to be in Home Assistant
      Object.defineProperty(window, 'location', {
        value: { pathname: '/liebe-dev/test' },
        writable: true,
      })

      // Use fake timers
      vi.useFakeTimers()
    })

    afterEach(() => {
      // Restore real timers
      vi.useRealTimers()
    })

    it('should subscribe to router changes', () => {
      renderHook(() => useHomeAssistantRouting())

      expect(mockSubscribe).toHaveBeenCalledWith('onResolved', expect.any(Function))
    })

    it('should dispatch custom event on route change', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the callback passed to subscribe
      const [[, callback]] = mockSubscribe.mock.calls

      // Simulate route change
      callback()

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'liebe-route-change',
        })
      )

      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent
      expect(event.detail).toEqual({ path: '/test-path' })
    })

    it('should send postMessage when in iframe', () => {
      // Mock being in an iframe
      const mockPostMessage = vi.fn()
      Object.defineProperty(window, 'parent', {
        value: { postMessage: mockPostMessage },
        writable: true,
      })

      renderHook(() => useHomeAssistantRouting())

      // Get the callback passed to subscribe
      const [[, callback]] = mockSubscribe.mock.calls

      // Simulate route change
      callback()

      expect(mockPostMessage).toHaveBeenCalledWith(
        {
          type: 'route-change',
          path: '/test-path',
        },
        '*'
      )
    })

    it('should listen for navigation messages', () => {
      renderHook(() => useHomeAssistantRouting())

      expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('liebe-navigate', expect.any(Function))
    })

    it('should navigate when receiving navigate-to message', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the message handler
      const messageHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'message')[1]

      // Simulate message event
      messageHandler({
        data: {
          type: 'navigate-to',
          path: '/new-path',
        },
      })

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/new-path' })
    })

    it('should navigate when receiving current-route message', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the message handler
      const messageHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'message')[1]

      // Simulate message event with different route
      messageHandler({
        data: {
          type: 'current-route',
          path: '/parent-route',
        },
      })

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/parent-route' })
    })

    it('should not navigate if current-route is same as current', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the message handler
      const messageHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'message')[1]

      // Simulate message event with same route
      messageHandler({
        data: {
          type: 'current-route',
          path: '/test-path', // Same as mockRouterState.location.pathname
        },
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should handle liebe-navigate custom event', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the navigate handler
      const navigateHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'liebe-navigate'
      )[1]

      // Simulate custom event
      navigateHandler({
        detail: {
          path: '/custom-path',
        },
      })

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/custom-path' })
    })

    it('should request current route from parent when in iframe', () => {
      // Mock being in an iframe
      const mockPostMessage = vi.fn()
      Object.defineProperty(window, 'parent', {
        value: { postMessage: mockPostMessage },
        writable: true,
      })

      renderHook(() => useHomeAssistantRouting())

      // Advance timers to trigger the setTimeout
      vi.runAllTimers()

      // Check that postMessage was called
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'get-route' }, '*')
    })

    it('should cleanup listeners on unmount', () => {
      const { unmount } = renderHook(() => useHomeAssistantRouting())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('liebe-navigate', expect.any(Function))
    })
  })

  describe('when not in Home Assistant environment', () => {
    beforeEach(() => {
      // Mock location to be outside Home Assistant
      Object.defineProperty(window, 'location', {
        value: { pathname: '/some-other-path' },
        writable: true,
      })
    })

    it('should not set up any listeners', () => {
      renderHook(() => useHomeAssistantRouting())

      expect(mockSubscribe).not.toHaveBeenCalled()
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('message', expect.any(Function))
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('liebe-navigate', expect.any(Function))
    })
  })
})
