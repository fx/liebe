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
 * - fast (30s): connection health, staleness checks, history maintenance.
 *   History maintenance is a freshness decision, not a cadence: a window with
 *   a short bucket interval still checks every 30s and refetches only when its
 *   entry is stale, which the per-window tests pin.
 * - slow (5min): forecast refresh. Hourly forecasts refresh every 30min and
 *   daily every 2h; both divide 5min evenly, so each refresh lands on a tick
 *   with no phase of its own.
 *
 * No wheel grows with dashboard size: subscribing the fiftieth entity adds a
 * map entry, not a timer. Rates are NOT retuned — coalescing aligns phases, it
 * does not change cadences.
 */

export const SCHEDULER_FAST_TICK_MS = 30_000
export const SCHEDULER_SLOW_TICK_MS = 5 * 60_000

export type ScheduleRate = 'fast' | 'slow'

interface ScheduledTask {
  id: number
  run: () => void
  /** Run every Nth tick of the wheel. */
  every: number
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
 * task stays registered, so the next tick retries it.
 */
function runDueTasks(wheel: Wheel): void {
  wheel.elapsed += 1
  for (const task of [...wheel.tasks.values()]) {
    if (wheel.elapsed % task.every !== 0) continue
    try {
      task.run()
    } catch (error) {
      logger.error(`pipelineScheduler: scheduled task threw (kept registered): ${String(error)}`)
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

/**
 * Advance the wheels' elapsed counters without waiting: the test seam for
 * asserting phase alignment. A task with `every: N` fires when the wheel's
 * elapsed count is a multiple of N — the same condition the interval applies.
 */
export function advanceSchedulerForTests(ms: number): void {
  for (const [rate, wheel] of Object.entries(wheels) as [ScheduleRate, Wheel][]) {
    const ticks = Math.floor(ms / RATE_TICK_MS[rate])
    for (let i = 0; i < ticks; i++) runDueTasks(wheel)
  }
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
  run: () => void
): () => void {
  const wheel = ensureWheel(rate)
  const every = Math.max(1, Math.ceil(everyMs / RATE_TICK_MS[rate]))
  const id = nextId++
  wheel.tasks.set(id, { id, run, every })

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
