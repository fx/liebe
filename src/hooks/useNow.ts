import { useEffect, useState, useSyncExternalStore } from 'react'

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
 *
 * Render-phase purity: NOTHING here schedules a timer during render. Looking
 * up (or creating) a clock entry during render only allocates a listener set —
 * the interval starts in the subscription path (`clockSubscribe`), which React
 * invokes from the commit phase via `useSyncExternalStore`, never from render.
 * A render React abandons therefore leaves an empty entry behind, never a live
 * timer with no owner. Interval teardown is likewise owned by the
 * unsubscribe: the last release clears the timer, so teardown is guaranteed
 * however the subscriber leaves.
 */

/** The 1s clock: media progress, camera stats, clock widget. */
export const NOW_1S_MS = 1000

/** The 60s clock: recency/since lines, last-activated lines. */
export const NOW_60S_MS = 60_000

const versions = new Map<number, number>()
const listeners = new Map<number, Set<() => void>>()
const intervals = new Map<number, ReturnType<typeof setInterval>>()

/** The subscription a disabled consumer holds: never notifies, reads zero. */
const EMPTY_STORE = { subscribe: () => () => {} }

function ensureEntry(rateMs: number): Set<() => void> {
  let set = listeners.get(rateMs)
  if (!set) {
    set = new Set()
    listeners.set(rateMs, set)
    versions.set(rateMs, 0)
  }
  return set
}

function ensureInterval(rateMs: number): void {
  if (intervals.has(rateMs)) return
  intervals.set(
    rateMs,
    setInterval(() => {
      versions.set(rateMs, (versions.get(rateMs) ?? 0) + 1)
      for (const listener of [...(listeners.get(rateMs) ?? [])]) listener()
    }, rateMs)
  )
}

function maybeTeardown(rateMs: number): void {
  if ((listeners.get(rateMs)?.size ?? 0) > 0) return
  const interval = intervals.get(rateMs)
  if (interval === undefined) return
  clearInterval(interval)
  intervals.delete(rateMs)
}

/**
 * Subscribe `notify` to the clock at `rateMs`, starting the interval on first
 * subscription. MUST be called from the commit phase (an effect, an event
 * handler, or `useSyncExternalStore`'s subscribe) — never during render.
 * Returns the release, which stops the interval once the last subscriber
 * leaves. Double release is safe and releases nothing further.
 */
export function subscribeClockTick(rateMs: number, notify: () => void): () => void {
  const set = ensureEntry(rateMs)
  set.add(notify)
  ensureInterval(rateMs)

  let released = false
  return () => {
    if (released) return
    released = true
    set.delete(notify)
    maybeTeardown(rateMs)
  }
}

/**
 * Imperative subscription to the 1s clock, for sampling owned by an effect
 * rather than by render (CameraStats reads video counters per tick). The
 * listener fires in the same commit as the React subscribers' notification —
 * one interval, one wake, however many listeners it has.
 */
export function subscribeSecondTick(run: () => void): () => void {
  return subscribeClockTick(NOW_1S_MS, run)
}

/**
 * The store shell for `useSyncExternalStore`. Render-safe by construction:
 * creating the entry allocates a listener set and nothing else — no timer, so
 * an abandoned render cannot leak one. The interval starts when React
 * subscribes (commit phase) and stops on the last unsubscribe.
 */
function clockStore(rateMs: number): { subscribe: (notify: () => void) => () => void } {
  ensureEntry(rateMs)
  return {
    subscribe: (notify: () => void) => subscribeClockTick(rateMs, notify),
  }
}

/** Test-only seam: look up a clock's store shell without subscribing. */
export function clockStoreForTests(rateMs: number): {
  subscribe: (notify: () => void) => () => void
} {
  return clockStore(rateMs)
}

/** Test-only seam: the clocks are module-global. */
export function resetClocksForTests(): void {
  for (const interval of intervals.values()) clearInterval(interval)
  versions.clear()
  listeners.clear()
  intervals.clear()
}

/** Test-only seam: how many live intervals one rate currently owns. */
export function clockIntervalCountForTests(rateMs: number): number {
  return intervals.has(rateMs) ? 1 : 0
}

/**
 * The current tick version of the shared clock at `rateMs`. Re-renders the
 * caller once per tick while mounted — one interval per rate, not one per
 * consumer. The rate SHOULD be one of the exported constants; an arbitrary
 * rate gets its own clock (correct, but a new wheel rather than a shared one).
 */
export function useNow(rateMs: number, enabled = true): number {
  const store = enabled ? clockStore(rateMs) : EMPTY_STORE
  const version = useSyncExternalStore(
    store.subscribe,
    () => versions.get(rateMs) ?? 0,
    () => 0
  )
  return enabled ? version : 0
}

/**
 * The wall time, kept current by the shared clock at `rateMs`. The tick only
 * decides WHEN it recomputes; the value is read from the clock, never during
 * render — `Date.now()` runs in the state initializer (mount) and in the
 * interval callback (commit-adjacent), both of which the purity rule permits.
 */
export function useNowTimestamp(rateMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    // Prime on (re-)enable: a consumer disabled for a while holds its mount
    // reading (or pre-disable tick) and would otherwise render one stale frame
    // before the next tick — for a 60s since-line, a text wrong by the whole
    // disabled duration, visible up to a minute. The write runs once per
    // enable transition, not per render, so it cannot cascade: after it, the
    // effect's dependencies are unchanged and it does not re-fire.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prime on the enable transition (the old per-consumer ticker's priming timeout, same purpose); the value is not derivable during render because the purity gate forbids the clock read there.
    setNow(Date.now())
    return subscribeClockTick(rateMs, () => setNow(Date.now()))
  }, [rateMs, enabled])

  return now
}

/** A tick of the shared 1s clock. */
export function useNowSecond(enabled = true): number {
  return useNow(NOW_1S_MS, enabled)
}

/** A tick of the shared 60s clock. */
export function useNowMinute(enabled = true): number {
  return useNow(NOW_60S_MS, enabled)
}
