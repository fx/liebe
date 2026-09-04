import { useEffect, useSyncExternalStore } from 'react'

/**
 * Shared clocks: one interval per tick rate for the whole panel, replacing one
 * interval per consumer.
 *
 * A dashboard with a camera, a media player and a presence card used to wake
 * three subtrees at three slightly different phases every second; here N
 * mounted `useNow(1000)` consumers produce one interval and one notification
 * per tick, so those subtrees re-render in the same commit. The 1s and 60s
 * rates are separate clocks because their phases genuinely differ — a per-hour
 * forecast aligned to a 1s phase would re-render sixty times too often.
 */

interface ClockState {
  version: number
  interval: ReturnType<typeof setInterval> | null
  subscribers: number
  fire?: () => void
}

const clocks = new Map<number, ClockState>()
const stores = new Map<number, { subscribe: (notify: () => void) => () => void }>()

/** The subscription a disabled consumer holds: never notifies, reads zero. */
const EMPTY_STORE = { subscribe: () => () => {} }

function clockStore(rateMs: number): { subscribe: (notify: () => void) => () => void } {
  let store = stores.get(rateMs)
  if (!store) {
    const listeners = new Set<() => void>()
    store = {
      subscribe: (notify: () => void) => {
        listeners.add(notify)
        return () => {
          listeners.delete(notify)
        }
      },
    }
    stores.set(rateMs, store)
    // The tick closure reads the map so tests can reset clocks without
    // leaving a stale listener set behind.
    const fire = () => {
      const clock = clocks.get(rateMs)
      if (!clock) return
      clock.version += 1
      for (const listener of [...listeners]) listener()
    }
    const clock: ClockState = {
      version: 0,
      interval: setInterval(fire, rateMs),
      subscribers: 0,
    }
    clocks.set(rateMs, clock)
    clock.fire = fire
  }
  return store
}

/** The 1s clock: media progress, camera stats, clock widget. */
export const NOW_1S_MS = 1000

/** The 60s clock: recency/since lines, last-activated lines. */
export const NOW_60S_MS = 60_000

/**
 * Imperative subscription to the 1s clock, for sampling owned by an effect
 * rather than by render (CameraStats reads video counters per tick). The
 * listener fires in the same commit as the React subscribers' notification —
 * one interval, one wake, however many listeners it has.
 */
export function subscribeSecondTick(run: () => void): () => void {
  const store = clockStore(NOW_1S_MS)
  // An imperative listener holds the clock alive like a mounted consumer.
  const clock = clocks.get(NOW_1S_MS)
  if (clock) clock.subscribers += 1
  const notify = () => run()
  const release = store.subscribe(notify)
  let released = false
  return () => {
    if (released) return
    released = true
    release()
    const current = clocks.get(NOW_1S_MS)
    if (current) {
      current.subscribers -= 1
      if (current.subscribers <= 0) {
        if (current.interval !== null) clearInterval(current.interval)
        clocks.delete(NOW_1S_MS)
        stores.delete(NOW_1S_MS)
      }
    }
  }
}

/** Test-only seam: the clocks are module-global. */
export function resetClocksForTests(): void {
  for (const clock of clocks.values()) {
    if (clock.interval !== null) clearInterval(clock.interval)
  }
  clocks.clear()
  stores.clear()
}

/** Test-only seam: how many live intervals one rate currently owns. */
export function clockIntervalCountForTests(rateMs: number): number {
  const clock = clocks.get(rateMs)
  return clock?.interval == null ? 0 : 1
}

/**
 * The current tick version of the shared clock at `rateMs`. Re-renders the
 * caller once per tick while mounted — one interval per rate, not one per
 * consumer. The rate SHOULD be one of the exported constants; an arbitrary
 * rate gets its own clock (correct, but a new wheel rather than a shared one).
 */
export function useNow(rateMs: number, enabled = true): number {
  const store = enabled ? clockStore(rateMs) : EMPTY_STORE
  useEffect(() => {
    if (!enabled) return
    const clock = clocks.get(rateMs)
    if (clock) clock.subscribers += 1
    return () => {
      const current = clocks.get(rateMs)
      if (!current) return
      current.subscribers -= 1
      if (current.subscribers <= 0) {
        if (current.interval !== null) clearInterval(current.interval)
        clocks.delete(rateMs)
        stores.delete(rateMs)
      }
    }
  }, [rateMs, enabled])
  useSyncExternalStore(
    store.subscribe,
    () => clocks.get(rateMs)?.version ?? 0,
    () => 0
  )
  return clocks.get(rateMs)?.version ?? 0
}

/** A tick of the shared 1s clock. */
export function useNowSecond(enabled = true): number {
  return useNow(NOW_1S_MS, enabled)
}

/** A tick of the shared 60s clock. */
export function useNowMinute(enabled = true): number {
  return useNow(NOW_60S_MS, enabled)
}
