import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { formatSince, SINCE_REFRESH_MS, useRelativeSince } from '../lastChanged'

const NOW = Date.parse('2026-07-27T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatSince', () => {
  it('reads sub-minute durations as "just now"', () => {
    expect(formatSince(ago(0), NOW)).toBe('just now')
    expect(formatSince(ago(59_000), NOW)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(formatSince(ago(MINUTE), NOW)).toBe('for 1 min')
    expect(formatSince(ago(59 * MINUTE), NOW)).toBe('for 59 min')
    expect(formatSince(ago(HOUR), NOW)).toBe('for 1 h')
    expect(formatSince(ago(23 * HOUR), NOW)).toBe('for 23 h')
    expect(formatSince(ago(DAY), NOW)).toBe('for 1 d')
    expect(formatSince(ago(9 * DAY), NOW)).toBe('for 9 d')
  })

  it('reads a future timestamp as "just now" rather than a negative duration', () => {
    // A browser clock ahead of Home Assistant's, not a state change to come.
    expect(formatSince(ago(-5 * MINUTE), NOW)).toBe('just now')
  })

  it('renders nothing for a missing or unparseable timestamp', () => {
    expect(formatSince(undefined, NOW)).toBeNull()
    expect(formatSince('', NOW)).toBeNull()
    expect(formatSince('not a date', NOW)).toBeNull()
  })
})

describe('useRelativeSince', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing while the option is off', () => {
    const { result } = renderHook(() => useRelativeSince(ago(5 * MINUTE), false))
    expect(result.current).toBeNull()
  })

  it('keeps the text current at least once a minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const { result } = renderHook(() =>
      useRelativeSince(new Date(NOW - MINUTE).toISOString(), true)
    )
    expect(result.current).toBe('for 1 min')

    act(() => {
      vi.advanceTimersByTime(SINCE_REFRESH_MS)
    })
    expect(result.current).toBe('for 2 min')
  })

  it('runs no timer for a card that is not showing the line', () => {
    vi.useFakeTimers()
    const setInterval = vi.spyOn(globalThis, 'setInterval')

    renderHook(() => useRelativeSince(ago(MINUTE), false))
    expect(setInterval).not.toHaveBeenCalled()
  })

  it('stops its timer on unmount', () => {
    vi.useFakeTimers()
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useRelativeSince(ago(MINUTE), true))
    unmount()
    expect(clearInterval).toHaveBeenCalled()
  })
})
