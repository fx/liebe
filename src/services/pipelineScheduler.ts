import { logger } from '../utils/logger'

/**
 * The coalesced pipeline scheduler: one wheel per rate class for history
 * window maintenance, forecast refresh, connection health and staleness
 * checks — replacing the per-entity/per-forecast timer maps in each service.
 *
 * The four pipelines used to own four wheels at four phases, and the
 * history/forecast wheels grew with the dashboard (one entry per entity, per
 * forecast). Here each rate class owns one interval, and members register a
 * callback plus a due-interval measured in ticks of that wheel:
 *
 * - fast (30s): connection health (every tick), staleness checks and
 *   history maintenance (every 2nd tick, i.e. 60s). History maintenance is a
 *   freshness decision, not a cadence: each check refetches only when the
 *   entry is stale, which the per-window tests pin.
 * - slow (5min): forecast refresh. Hourly forecasts refresh every 30min and
 *   daily every 2h; both divide 5min evenly, so each refresh lands on a tick
 *   with no phase of its own.
 *
 * No wheel grows with dashboard size: subscribing the fiftieth entity adds a
 * map entry, not a timer. Refresh, health and staleness cadences are NOT
 * retuned — coalescing aligns phases, it does not change them. One deliberate
 * exception: history maintenance is standardized at 60s for every window (was
 * max(60s, window/100) per window), trading more cheap store-read wakeups for
 * the single wheel; refetches still happen only on staleness.
 */

export const SCHEDULER_FAST_TICK_MS = 30_000
export const SCHEDULER_SLOW_TICK_MS = 5 * 60_000

export type ScheduleRate = 'fast' | 'slow'

interface ScheduledTask {
  id: number
  run: () => void | Promise<unknown>
  /** Run every Nth tick of the wheel. */
  every: number
  /**
   * Wheel tick (global `elapsed`) the task is next due on. Steady-state ticks
   * advance it by `every` (phase-aligned, drift-free). The FIRST due is
   * additionally gated on wall time (see `dueAtMs`): `nextDue` alone anchors
   * at the previous tick, so a task registering between ticks would first
   * fire up to one tick short of its full interval.
   */
  nextDue: number
  /**
   * Wall-clock time of registration plus the full interval: the first fire
   * is never earlier than this, however the registration lands between
   * ticks. Anchoring the first due at the previous tick (`elapsed + every`)
   * short-changes an off-tick registration by up to one tick — a daily
   * forecast mounted 1ms after a slow tick would run 1ms short of 2h, where
   * the per-task intervals this wheel replaced began at registration.
   */
  dueAtMs: number
}

interface Wheel {
  tasks: Map<number, ScheduledTask>
  interval: ReturnType<typeof setInterval> | null
  elapsed: number
}

const wheels: Record<ScheduleRate, Wheel> = {
  fast: { tasks: new Map(), interval: null, elapsed: 0 },
  slow: { tasks: new Map(), interval: null, elapsed: 0 },
}

let nextId = 1

const RATE_TICK_MS: Record<ScheduleRate, number> = {
  fast: SCHEDULER_FAST_TICK_MS,
  slow: SCHEDULER_SLOW_TICK_MS,
}

/**
 * Run every task due on this tick. Each task gets its own exception boundary:
 * one throwing callback (a history prune, a forecast fetch kick, a health
 * check) must not skip the tasks behind it or escape the shared interval —
 * the independent timers this wheel replaced never shared a loop, so a fault
 * in one never reached another. Failures surface through the logger; the
 * task stays registered, so the next due tick retries it.
 */
function runDueTasks(wheel: Wheel): void {
  wheel.elapsed += 1
  for (const task of [...wheel.tasks.values()]) {
    if (wheel.elapsed < task.nextDue) continue
    // First-fire wall-clock gate: until the full interval has elapsed since
    // registration, the task waits no matter the tick phase. Cleared on
    // first fire; steady state rides `nextDue` alone.
    if (task.dueAtMs !== 0) {
      if (Date.now() < task.dueAtMs) continue
      task.dueAtMs = 0
    }
    task.nextDue = wheel.elapsed + task.every
    let result: unknown
    try {
      result = task.run()
    } catch (error) {
      logger.error('pipelineScheduler: scheduled task threw (kept registered):', error)
      continue
    }
    // The 30s health check is async: without this, a rejection in
    // reconnect()/connect()/disconnect() escapes as an unhandled rejection —
    // the sync boundary above never sees it. Awaiting here routes async
    // faults through the same per-task boundary, and the task stays
    // registered so the next due tick retries it.
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        logger.error('pipelineScheduler: scheduled task rejected (kept registered):', error)
      })
    }
  }
}

function ensureWheel(rate: ScheduleRate): Wheel {
  const wheel = wheels[rate]
  if (wheel.interval === null) {
    wheel.elapsed = 0
    wheel.interval = setInterval(() => runDueTasks(wheel), RATE_TICK_MS[rate])
  }
  return wheel
}

function releaseWheel(rate: ScheduleRate): void {
  const wheel = wheels[rate]
  if (wheel.tasks.size === 0 && wheel.interval !== null) {
    clearInterval(wheel.interval)
    wheel.interval = null
  }
}

/**
 * Register `run` on the wheel for `rate`, firing every `everyMs`
 * (rounded up to whole ticks of that wheel). Returns the unsubscribe.
 * The first subscriber starts the wheel; the last to leave stops it.
 */
export function schedulePipelineTask(
  rate: ScheduleRate,
  everyMs: number,
  run: () => void | Promise<unknown>
): () => void {
  // Same fail-fast class as the clock rates: a non-finite or non-positive
  // interval poisons the due arithmetic (`every` NaN → `nextDue` NaN, and no
  // tick is ever `>= NaN`) — so the task would sit registered-but-never-due
  // while the wheel still wakes for it. Throwing names the culprit instead.
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new RangeError(
      `schedulePipelineTask: everyMs must be a positive finite number, got ${String(everyMs)}`
    )
  }
  const wheel = ensureWheel(rate)
  const every = Math.max(1, Math.ceil(everyMs / RATE_TICK_MS[rate]))
  const id = nextId++
  wheel.tasks.set(id, {
    id,
    run,
    every,
    nextDue: wheel.elapsed + every,
    dueAtMs: Date.now() + everyMs,
  })

  let released = false
  return () => {
    if (released) return
    released = true
    wheel.tasks.delete(id)
    releaseWheel(rate)
  }
}

/** Test-only seam: the wheels are module-global. */
export function resetSchedulerForTests(): void {
  for (const wheel of Object.values(wheels)) {
    if (wheel.interval !== null) clearInterval(wheel.interval)
    wheel.interval = null
    wheel.tasks.clear()
    wheel.elapsed = 0
  }
  nextId = 1
}

/** Test-only seam: how many live intervals the wheels currently own. */
export function schedulerIntervalCountForTests(): number {
  return Object.values(wheels).filter((wheel) => wheel.interval !== null).length
}

/** Test-only seam: how many tasks are registered across both wheels. */
export function schedulerTaskCountForTests(): number {
  return wheels.fast.tasks.size + wheels.slow.tasks.size
}
