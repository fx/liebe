import type { MediaPlayerAttributes } from './features'

/**
 * Media position, derived rather than read.
 *
 * `media_position` is a **snapshot**, not a live value: Home Assistant writes it
 * once and stamps `media_position_updated_at` with the moment it was true, then
 * says nothing more until something else changes. A card that displayed
 * `media_position` directly would show a progress head frozen at wherever the
 * last state update left it (docs/specs/entity-cards/options/media-player.md —
 * `showProgress`).
 *
 * So the position has to be extrapolated locally, and that is a clock — which is
 * why this module is pure and takes `now` as an argument. The failure it is
 * written to avoid is the quiet one: extrapolating from a `media_position` whose
 * `media_position_updated_at` is missing or unparseable produces a bar that
 * advances smoothly and is *wrong*, drifting further from the truth the longer
 * it runs. Wrong-but-plausible is the worst shape a bug can take, so the rule
 * here is explicit — **no timestamp, no extrapolation**: the snapshot is shown
 * as-is, which is exactly what Home Assistant last asserted.
 */

/** A finite number, or nothing. Every one of these attributes is optional. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * `media_position_updated_at` as epoch milliseconds.
 *
 * Home Assistant serialises it as an ISO 8601 string over the WebSocket API.
 * Anything else — absent, empty, a number, an unparseable string — is treated as
 * **no timestamp at all** rather than coerced, because the whole point of the
 * value is to be the instant the position was true, and a guessed instant is
 * worse than none: it silently shifts the entire bar.
 */
export function readPositionUpdatedAt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export interface MediaProgress {
  /** Seconds from the start, clamped into the track. */
  position: number
  /** Track length in seconds. */
  duration: number
  /** `position / duration`, clamped to 0–1 — what the bar actually draws. */
  fraction: number
  /**
   * Whether the position was advanced from the snapshot, or is the snapshot
   * itself. Surfaced because it is the difference between a bar that is a live
   * estimate and one that is a stale fact, and a test that could not tell them
   * apart would pass against a card that never ticks.
   */
  extrapolated: boolean
}

export interface MediaProgressInput {
  attributes: MediaPlayerAttributes | undefined
  /** The entity state — only `playing` advances a position. */
  state: string
  /** `Date.now()` at render, passed in so this stays pure and testable. */
  now: number
}

/**
 * The progress to draw, or `null` when there is nothing to draw.
 *
 * `null` rather than a zeroed bar for every case where the session does not
 * describe a track: the option doc renders the bar only when the session
 * "exposes `media_duration`", and a bar pinned at 0:00 for a radio stream with
 * no duration is a claim the entity never made.
 *
 * The cases, all reachable from real integrations:
 *   - no `media_duration`, or one that is zero/negative/non-numeric → no bar
 *   - no `media_position` → no bar (a duration alone cannot place the head)
 *   - no parseable `media_position_updated_at` → the snapshot, NOT extrapolated
 *   - not `playing` → the snapshot; a paused position does not advance
 *   - `playing` with a timestamp → the snapshot plus elapsed wall time
 *
 * A `media_position_updated_at` in the future (clock skew between Home Assistant
 * and the browser) contributes zero elapsed rather than winding the bar
 * backwards past what the entity reported.
 */
export function resolveMediaProgress({
  attributes,
  state,
  now,
}: MediaProgressInput): MediaProgress | null {
  const duration = num(attributes?.media_duration)
  if (duration === undefined || duration <= 0) return null

  const snapshot = num(attributes?.media_position)
  if (snapshot === undefined) return null

  const updatedAt = readPositionUpdatedAt(attributes?.media_position_updated_at)
  const extrapolated = state === 'playing' && updatedAt !== undefined

  const elapsedSeconds = extrapolated ? Math.max(0, now - updatedAt) / 1000 : 0
  const position = Math.min(duration, Math.max(0, snapshot + elapsedSeconds))

  return { position, duration, fraction: position / duration, extrapolated }
}

/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour — the readout beside the bar and
 * the slider's `aria-valuetext`.
 *
 * Floored rather than rounded, so a track never announces its own total before
 * it has finished playing.
 */
export function formatMediaTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`
}
