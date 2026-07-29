import { describe, it, expect } from 'vitest'
import { formatMediaTime, readPositionUpdatedAt, resolveMediaProgress } from '../progress'
import type { MediaPlayerAttributes } from '../features'

/**
 * The position extrapolation, which is a clock.
 *
 * The defect these tests exist for is not a crash. It is a bar that advances
 * smoothly and is **wrong** — what you get by extrapolating from a
 * `media_position` whose `media_position_updated_at` is missing or unparseable,
 * drifting further from the truth the longer it runs. Nothing about the screen
 * says so. Hence the rule the first block pins: no timestamp, no extrapolation.
 */

const AT = '2026-07-29T12:00:00.000Z'
const AT_MS = Date.parse(AT)

const attrs = (overrides: Partial<MediaPlayerAttributes>): MediaPlayerAttributes => ({
  media_duration: 300,
  media_position: 30,
  media_position_updated_at: AT,
  ...overrides,
})

const progress = (overrides: Partial<MediaPlayerAttributes>, state = 'playing', now = AT_MS) =>
  resolveMediaProgress({ attributes: attrs(overrides), state, now })

describe('readPositionUpdatedAt', () => {
  it('parses the ISO string Home Assistant publishes', () => {
    expect(readPositionUpdatedAt(AT)).toBe(AT_MS)
  })

  /**
   * Everything else is "no timestamp", never a guess. A coerced instant shifts
   * the whole bar, and a number in particular is tempting to accept — it would
   * be an epoch, but nothing guarantees which unit.
   */
  it.each([
    ['absent', undefined],
    ['null', null],
    ['a number', 1_780_000_000_000],
    ['an empty string', ''],
    ['an unparseable string', 'not a date'],
    ['an object', { at: AT }],
  ])('reports no timestamp for %s', (_label, raw) => {
    expect(readPositionUpdatedAt(raw)).toBeUndefined()
  })
})

describe('resolveMediaProgress', () => {
  it('extrapolates forward from the snapshot while playing', () => {
    // 30s in at the stamp, read 45s of wall time later.
    expect(progress({}, 'playing', AT_MS + 45_000)).toMatchObject({
      position: 75,
      duration: 300,
      extrapolated: true,
    })
  })

  it('reports the fraction the bar draws', () => {
    expect(progress({ media_position: 150 }, 'playing', AT_MS)?.fraction).toBeCloseTo(0.5)
  })

  /**
   * THE rule. A snapshot with no timestamp is shown as the snapshot — which is
   * exactly what Home Assistant last asserted — rather than advanced from an
   * instant nobody knows.
   */
  it('does not extrapolate without a timestamp, however long ago the snapshot was', () => {
    expect(
      progress({ media_position_updated_at: undefined }, 'playing', AT_MS + 600_000)
    ).toMatchObject({ position: 30, extrapolated: false })
  })

  it('does not extrapolate from an unparseable timestamp', () => {
    expect(
      progress({ media_position_updated_at: 'yesterday' }, 'playing', AT_MS + 60_000)
    ).toMatchObject({ position: 30, extrapolated: false })
  })

  /** A paused position does not advance, timestamp or no timestamp. */
  it.each(['paused', 'idle', 'off', 'standby', 'on', 'buffering'])(
    'does not extrapolate in %s',
    (state) => {
      expect(progress({}, state, AT_MS + 60_000)).toMatchObject({
        position: 30,
        extrapolated: false,
      })
    }
  )

  /** Clock skew between Home Assistant and the browser must not run the bar backwards. */
  it('contributes no elapsed time for a timestamp in the future', () => {
    expect(progress({}, 'playing', AT_MS - 60_000)).toMatchObject({
      position: 30,
      extrapolated: true,
    })
  })

  it('clamps at the end of the track rather than running past it', () => {
    const result = progress({}, 'playing', AT_MS + 999_000)

    expect(result?.position).toBe(300)
    expect(result?.fraction).toBe(1)
  })

  it('clamps a negative snapshot up to the start', () => {
    expect(progress({ media_position: -5 }, 'paused')?.position).toBe(0)
  })

  /*
   * No bar at all, rather than a zeroed one: the option doc draws it only when
   * the session "exposes `media_duration`", and a bar pinned at 0:00 for a radio
   * stream is a claim the entity never made.
   */
  it.each([
    ['absent duration', { media_duration: undefined }],
    ['zero duration', { media_duration: 0 }],
    ['negative duration', { media_duration: -10 }],
    ['non-numeric duration', { media_duration: '300' }],
    ['NaN duration', { media_duration: Number.NaN }],
    ['Infinite duration', { media_duration: Number.POSITIVE_INFINITY }],
    ['absent position', { media_position: undefined }],
    ['non-numeric position', { media_position: '30' }],
    ['NaN position', { media_position: Number.NaN }],
  ])('draws no bar for %s', (_label, overrides) => {
    expect(progress(overrides)).toBeNull()
  })

  it('draws no bar for an entity with no attributes at all', () => {
    expect(resolveMediaProgress({ attributes: undefined, state: 'playing', now: AT_MS })).toBeNull()
  })

  /**
   * A live stream: duration and position both present but the position never
   * advances past the duration, so the bar stays coherent rather than
   * overflowing its track.
   */
  it('keeps the fraction inside 0–1 for every reachable input', () => {
    for (const now of [AT_MS - 10_000, AT_MS, AT_MS + 10_000, AT_MS + 10_000_000]) {
      const result = progress({}, 'playing', now)
      expect(result!.fraction).toBeGreaterThanOrEqual(0)
      expect(result!.fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('formatMediaTime', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [65, '1:05'],
    [599, '9:59'],
    [600, '10:00'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [7325, '2:02:05'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatMediaTime(seconds)).toBe(expected)
  })

  /** Floored, so a track never announces its own total before it has finished. */
  it('floors rather than rounding', () => {
    expect(formatMediaTime(59.9)).toBe('0:59')
  })

  it('treats a negative position as the start', () => {
    expect(formatMediaTime(-5)).toBe('0:00')
  })
})
