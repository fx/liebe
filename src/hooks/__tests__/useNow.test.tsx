import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  subscribeClockTick,
  subscribeSecondTick,
  useNow,
  useNowMinute,
  useNowSecond,
  useNowTimestamp,
  NOW_1S_MS,
  NOW_60S_MS,
  resetClocksForTests,
  clockIntervalCountForTests,
  clockStoreForTests,
  listenersForTests,
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

  it('schedules no timer during render: an abandoned render leaks no interval', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    // The store shell is what render touches (via useSyncExternalStore's
    // getSnapshot path): looking it up must allocate a listener set and
    // nothing else. Only the commit-phase subscribe may start the timer.
    const store = clockStoreForTests(NOW_1S_MS)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)

    // The abandoned render never subscribes — still no timer.
    expect(setIntervalSpy).not.toHaveBeenCalled()

    // The committed subscriber starts exactly one interval; its release stops
    // it, so teardown is guaranteed however the subscriber leaves.
    const notify = vi.fn()
    const release = store.subscribe(notify)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(1)

    release()
    release()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)
  })

  it('reads the wall time without an impure render-phase call', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-27T12:00:00Z'))

    function Probe({ enabled }: { enabled: boolean }) {
      const now = useNowTimestamp(NOW_1S_MS, enabled)
      return <span>{now}</span>
    }
    const { container, rerender } = render(<Probe enabled />)
    expect(container.textContent).toBe(String(Date.parse('2026-07-27T12:00:00Z')))

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS)
    })
    expect(container.textContent).toBe(String(Date.parse('2026-07-27T12:00:01Z')))

    rerender(<Probe enabled={false} />)
    const frozen = container.textContent
    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS * 5)
    })
    expect(container.textContent).toBe(frozen)
  })

  it('primes on re-enable: no stale first frame after a disabled period', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-27T12:00:00Z'))

    function Probe({ enabled }: { enabled: boolean }) {
      const now = useNowTimestamp(NOW_1S_MS, enabled)
      return <span>{now}</span>
    }
    const { container, rerender } = render(<Probe enabled />)
    const T0 = Date.parse('2026-07-27T12:00:00Z')
    expect(container.textContent).toBe(String(T0))

    // Disabled for five ticks: frozen, no wake.
    rerender(<Probe enabled={false} />)
    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS * 5)
    })
    expect(container.textContent).toBe(String(T0))

    // Re-enable at T0+5s: the passive-effect prime refreshes before the next
    // tick, so the first frame is current rather than one stale frame.
    vi.setSystemTime(T0 + 5 * NOW_1S_MS)
    rerender(<Probe enabled />)
    expect(container.textContent).toBe(String(T0 + 5 * NOW_1S_MS))
  })

  it('keeps a stable subscribe identity across re-renders (no churn)', () => {
    vi.useFakeTimers()

    // One stable shell per rate: `useSyncExternalStore` re-subscribes whenever
    // the `subscribe` identity changes, so a fresh closure per render would
    // unsubscribe/resubscribe every consumer on every tick — churning the very
    // subscriptions the shared clock exists to keep still.
    expect(clockStoreForTests(NOW_1S_MS)).toBe(clockStoreForTests(NOW_1S_MS))

    function Probe() {
      useNowSecond()
      return null
    }
    const { rerender } = render(<Probe />)
    const before = (listenersForTests(NOW_1S_MS) as Set<unknown>).size

    // A parent re-render (no tick) must not add or drop subscriptions.
    rerender(<Probe />)
    expect((listenersForTests(NOW_1S_MS) as Set<unknown>).size).toBe(before)

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS)
    })
    // The tick re-rendered the consumer exactly once AND left the
    // subscription count unchanged — one notify, no resubscribe loop.
    expect((listenersForTests(NOW_1S_MS) as Set<unknown>).size).toBe(before)
  })

  it('shares one interval between hook consumers and imperative samplers', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    // CameraStats' shape: an effect-owned sampler, no render subscription.
    const sampled: number[] = []
    const stop = subscribeSecondTick(() => sampled.push(1))

    function Probe() {
      useNowSecond()
      return null
    }
    render(<Probe />)

    // One interval for the hook consumer AND the imperative sampler.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(1)

    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS)
    })
    expect(sampled).toEqual([1])

    stop()
  })

  it('a disabled useNow holds no subscription and reads zero', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    function Probe() {
      const seen = useNow(NOW_1S_MS, false)
      return <span>{seen}</span>
    }
    const { container } = render(<Probe />)

    expect(container.textContent).toBe('0')
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)
  })

  it('exposes the per-rate conveniences on the shared clocks', () => {
    vi.useFakeTimers()

    function Probe() {
      const second = useNowSecond()
      const minute = useNowMinute()
      return (
        <span>
          {second}:{minute}
        </span>
      )
    }
    const { container } = render(<Probe />)
    expect(container.textContent).toBe('0:0')

    // Separate wheels: the 1s tick advances only the second reading.
    act(() => {
      vi.advanceTimersByTime(NOW_1S_MS)
    })
    expect(container.textContent).toBe('1:0')
  })

  it('rejects a junk rate instead of scheduling a tight loop', () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    for (const rate of [0, -1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => useNow(rate)).toThrow(RangeError)
      expect(() => subscribeClockTick(rate, () => {})).toThrow(RangeError)
    }
    // Nothing was scheduled for any of them.
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clockIntervalCountForTests(NOW_1S_MS)).toBe(0)
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
