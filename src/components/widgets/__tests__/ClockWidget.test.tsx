import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ClockWidget } from '../ClockWidget'
import { resetClocksForTests, NOW_1S_MS } from '~/hooks/useNow'

// ClockWidget rides the shared 1s clock: every widget re-renders in the same
// commit, with one interval for all of them. Fake timers throughout.

describe('ClockWidget', () => {
  afterEach(() => {
    resetClocksForTests()
    vi.useRealTimers()
  })

  it('renders the current time and advances it once per shared tick', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-27T12:00:00Z'))

    const { container } = render(<ClockWidget widget={{ id: '1' }} />)
    expect(container.textContent).toMatch(/12:00/)

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS * 61)
    })
    expect(container.textContent).toMatch(/12:01/)
  })
})
