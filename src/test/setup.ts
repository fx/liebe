import '@testing-library/jest-dom'
import { vi } from 'vitest'
import '../styles/app.css'
import '@radix-ui/themes/styles.css'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
// Uses a function expression (not an arrow) so it is constructable with `new`,
// which vitest 4 requires for vi.fn() mocks invoked as constructors.
global.ResizeObserver = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
}) as unknown as typeof ResizeObserver

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock pointer capture methods for Radix UI Slider
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn()
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn()
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
}
