import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  useNow,
  useNowSecond,
  NOW_1S_MS,
  NOW_60S_MS,
  resetClocksForTests,
  clockIntervalCountForTests,
} from '../useNow'

// PR 2 probes: the shared clocks MUST wake N consumers with one interval, and
// a disabled consumer MUST hold no subscription. Fake timers throughout.

describe('useNow shared clocks', () => {
  afterEach(() => {
    resetClocksForTests()
    vi.useRealTimers()
  })

  it('mounts N consumers on one interval and wakes them in one tick', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    let rendersA = 0
    let rendersB = 0
    let rendersC = 0
    function A() {
      rendersA++
      useNowSecond()
      return null
    }
    function B() {
      rendersB++
      useNowSecond()
      return null
    }
    function C() {
      rendersC++
      useNowSecond()
      return null
    }
    render(
      <>
        <A />
        <B />
        <C />
      </>
    )

    // One interval for three consumers — the single-wake requirement.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(1)

    const before = [rendersA, rendersB, rendersC]
    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS)
    })

    // Each consumer re-rendered exactly once for the tick.
    expect([rendersA, rendersB, rendersC]).toEqual([before[0] + 1, before[1] + 1, before[2] + 1])
  })

  it('keeps the 1s and 60s rates on separate clocks', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    function Fast() {
      useNow(NOW_1S_MS)
      return null
    }
    function Slow() {
      useNow(NOW_60S_MS)
      return null
    }
    render(
      <>
        <Fast />
        <Slow />
      </>
    )

    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(1)
    expect(clockIntervalCountForTests(NOW_60S_MS)).toBe(1)
  })

  it('a disabled consumer holds no subscription and pays no wake', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    let renders = 0
    function Probe() {
      renders++
      useNow(NOW_1S_MS, false)
      return null
    }
    render(<Probe />)

    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS * 5)
    })
    expect(renders).toBe(1)
  })

  it('tears the interval down when the last consumer unmounts', () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    function Probe() {
      useNowSecond()
      return null
    }
    const { unmount } = render(<Probe />)
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(1)

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)
  })
})
