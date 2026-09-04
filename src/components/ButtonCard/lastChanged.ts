import { NOW_60S_MS, useNowTimestamp } from '~/hooks/useNow'

/**
 * The `showLastChanged` secondary text: how long the entity has held its
 * current state (docs/specs/entity-cards/options/switch.md — "`showLastChanged`").
 *
 * One phrasing ("for 5 min"), not two, because the state line reads as a single
 * sentence — "ON · for 5 min" — and mixing "for" with "ago" in the same slot
 * would make the duration's subject ambiguous at a glance. Below a minute it is
 * "just now": a switch that changed nine seconds ago is not usefully "for 9 s",
 * and the per-minute refresh below could not keep such a number honest anyway.
 */

/** How often the text is recomputed while visible (spec: at least per minute). */
export const SINCE_REFRESH_MS = 60_000

export function formatSince(lastChanged: string | undefined, now: number): string | null {
  if (!lastChanged) return null

  const changedAt = Date.parse(lastChanged)
  if (Number.isNaN(changedAt)) return null

  const elapsedMinutes = Math.floor((now - changedAt) / 60_000)
  // Negative elapsed time is a clock disagreeing with Home Assistant's, not a
  // state change in the future; "just now" is the honest reading of it.
  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes < 60) return `for ${elapsedMinutes} min`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `for ${elapsedHours} h`

  return `for ${Math.floor(elapsedHours / 24)} d`
}

/**
 * The same text, kept current while the card is on screen.
 *
 * The interval runs only while the option is on: an unconfigured card — which
 * is every card by default — must not pay a timer per tile for a line it does
 * not render.
 */
export function useRelativeSince(lastChanged: string | undefined, enabled: boolean): string | null {
  // Shared 60s clock: N mounted since-lines re-render once per minute in the
  // same commit instead of each owning a 60s interval at its own phase. The
  // text is derived from the wall time at render, so the shared tick only
  // decides WHEN it recomputes, never what it says.
  // The wall time rides the shared 60s clock: the tick decides WHEN the
  // text recomputes, and every since-line on the dashboard recomputes in the
  // same commit. `Date.now()` runs in the hook's mount initializer and tick
  // callback — never during render, where the purity rule forbids it.
  const now = useNowTimestamp(NOW_60S_MS, enabled)

  if (!enabled) return null
  return formatSince(lastChanged, now)
}
