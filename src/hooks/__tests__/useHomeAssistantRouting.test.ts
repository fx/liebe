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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let addEventListenerSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let removeEventListenerSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dispatchEventSpy: any
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

    it('should listen for navigation messages', () => {
      renderHook(() => useHomeAssistantRouting())

      expect(addEventListenerSpy).toHaveBeenCalledWith('liebe-navigate', expect.any(Function))
    })

    it('should handle liebe-navigate custom event', () => {
      renderHook(() => useHomeAssistantRouting())

      // Get the navigate handler
      const navigateCall = addEventListenerSpy.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call[0] === 'liebe-navigate'
      )
      const navigateHandler = navigateCall?.[1] as EventListener

      // Simulate custom event
      navigateHandler(
        new CustomEvent('liebe-navigate', {
          detail: {
            path: '/custom-path',
          },
        })
      )

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/custom-path' })
    })

    it('should cleanup listeners on unmount', () => {
      const { unmount } = renderHook(() => useHomeAssistantRouting())

      unmount()

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
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('liebe-navigate', expect.any(Function))
    })
  })
})
