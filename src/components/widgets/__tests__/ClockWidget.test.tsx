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
    const T0 = Date.parse('2026-07-27T12:00:00Z')
    vi.setSystemTime(T0)

    // Zone-independent: both sides format the fixed instant in the runner's
    // zone, so the exact text pins in ANY timezone (verified failing under
    // TZ=America/New_York with hardcoded 12:00 expectations).
    const timeText = (t: number) =>
      new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const { container } = render(<ClockWidget widget={{ id: '1' }} />)
    expect(container.textContent).toContain(timeText(T0))

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS * 61)
    })
    expect(container.textContent).toContain(timeText(T0 + NOW_1S_MS * 61))
  })
})
