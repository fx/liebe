import { describe, it, expect } from 'vitest'
import { createVacuumEntity } from '~/test/fixtures'
import {
  VACUUM_ACTIVITY,
  VACUUM_FEATURE,
  readFanSpeedList,
  readVacuumFeatures,
  readVacuumMask,
  type VacuumAttributes,
} from '../features'

/**
 * The `supported_features` bits, pinned against the values read out of Home
 * Assistant's own source.
 *
 * This file exists because of a specific, shipped defect: the cover card's
 * `COVER_FEATURE` map had `STOP_TILT` and `SET_TILT_POSITION` transposed, and
 * **every test agreed with it**, because the tests were written from the same
 * map they were meant to check. A test that reads the constant it is verifying
 * proves only that the file is self-consistent.
 *
 * So the literals below are written out by hand from
 * `homeassistant/components/vacuum/const.py` on `dev`
 * (`class VacuumEntityFeature`). If a bit here is wrong, the fix is to re-read
 * that file, not to make this match `features.ts`.
 */
describe('VACUUM_FEATURE', () => {
  it('matches VacuumEntityFeature bit for bit', () => {
    expect(VACUUM_FEATURE).toEqual({
      TURN_ON: 1,
      TURN_OFF: 2,
      PAUSE: 4,
      STOP: 8,
      RETURN_HOME: 16,
      FAN_SPEED: 32,
      BATTERY: 64,
      STATUS: 128,
      SEND_COMMAND: 256,
      LOCATE: 512,
      CLEAN_SPOT: 1024,
      MAP: 2048,
      STATE: 4096,
      START: 8192,
      CLEAN_AREA: 16384,
    })
  })

  /**
   * The two this card's behaviour hinges on hardest, asserted separately so a
   * failure names which one moved rather than diffing a 15-key object.
   *
   * `START` is **8192**, not the small number its importance suggests: it was
   * added to the enum long after `PAUSE` and `STOP`, so it sits above `MAP`. A
   * transcription that assumed the control bits were contiguous would put it at
   * 64 — which is `BATTERY`, a bit that still exists and means something else
   * entirely.
   */
  it('places START at 8192 and LOCATE at 512', () => {
    expect(VACUUM_FEATURE.START).toBe(8192)
    expect(VACUUM_FEATURE.LOCATE).toBe(512)
  })

  /**
   * `BATTERY` is still in the enum. The option doc claims it "is likewise gone
   * from the current feature set", which is not true of the source — what is
   * true is that the attributes behind it are deprecated and stop working in
   * 2026.8, so the card must not gate on it. Pinned here so the distinction
   * survives: the bit exists, and reading it would still be wrong.
   */
  it('keeps BATTERY in the enum, which is why the card cannot gate on it', () => {
    expect(VACUUM_FEATURE.BATTERY).toBe(64)
    expect(Object.keys(readVacuumFeatures({ supported_features: 64 }))).not.toContain('battery')
    expect(Object.values(readVacuumFeatures({ supported_features: 64 })).some(Boolean)).toBe(false)
  })
})

describe('VACUUM_ACTIVITY', () => {
  /** Six members, transcribed from `class VacuumActivity` in the same file. */
  it('matches VacuumActivity member for member', () => {
    expect(VACUUM_ACTIVITY).toEqual({
      CLEANING: 'cleaning',
      DOCKED: 'docked',
      IDLE: 'idle',
      PAUSED: 'paused',
      RETURNING: 'returning',
      ERROR: 'error',
    })
  })

  /**
   * `unavailable` and `unknown` are NOT activity members — they come from
   * `homeassistant.const` and replace any entity's state. Pinned because the
   * primary-action table has a row for them, and a reader who found them here
   * would reasonably conclude the table's first rung was redundant.
   */
  it('excludes unavailable and unknown, which are core states', () => {
    expect(Object.values(VACUUM_ACTIVITY)).not.toContain('unavailable')
    expect(Object.values(VACUUM_ACTIVITY)).not.toContain('unknown')
  })
})

/**
 * The default fixture's mask, pinned against the bits it claims to advertise.
 *
 * `createVacuumEntity` writes `supported_features` as a bare literal and its doc
 * comment lists the bits in prose; this is the only thing holding the two
 * together. Written as a sum of **named members** rather than as `8764`, so a
 * wrong bit fails here by name instead of as a mismatch between two opaque
 * numbers (REVIEW.md — "Tests Pin Intent, Not Implementation").
 */
describe('createVacuumEntity', () => {
  it('advertises exactly the bits its doc comment claims', () => {
    const { PAUSE, STOP, RETURN_HOME, FAN_SPEED, LOCATE, START } = VACUUM_FEATURE

    expect(createVacuumEntity().attributes.supported_features).toBe(
      PAUSE | STOP | RETURN_HOME | FAN_SPEED | LOCATE | START
    )
  })

  it('lights every gate this card reads, through readVacuumFeatures', () => {
    expect(readVacuumFeatures(createVacuumEntity().attributes as VacuumAttributes)).toEqual({
      pause: true,
      stop: true,
      returnHome: true,
      fanSpeed: true,
      locate: true,
      start: true,
    })
  })

  /**
   * The default fixture publishes no `battery_level`, deliberately: the
   * attribute is deprecated and stops working in 2026.8, and a fixture carrying
   * it would let a card that only ever reads the legacy path look correct.
   */
  it('publishes no deprecated battery_level attribute', () => {
    expect(createVacuumEntity().attributes).not.toHaveProperty('battery_level')
  })
})

describe('readVacuumMask', () => {
  it('reads a numeric mask', () => {
    expect(readVacuumMask({ supported_features: 8193 })).toBe(8193)
  })

  it('truncates a float rather than masking against a fraction', () => {
    expect(readVacuumMask({ supported_features: 8192.7 })).toBe(8192)
  })

  it.each([
    ['a string', '8192'],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an array', [8192]],
  ])('advertises nothing when supported_features is %s', (_label, raw) => {
    expect(readVacuumMask({ supported_features: raw })).toBe(0)
  })

  it('advertises nothing for an entity with no attributes at all', () => {
    expect(readVacuumMask(undefined)).toBe(0)
  })
})

describe('readVacuumFeatures', () => {
  const featuresOf = (supported_features: unknown) =>
    readVacuumFeatures({ supported_features } as VacuumAttributes)

  it('reports every gate false for an entity advertising nothing', () => {
    expect(featuresOf(0)).toEqual({
      pause: false,
      stop: false,
      returnHome: false,
      fanSpeed: false,
      locate: false,
      start: false,
    })
  })

  /**
   * One case per gate, each with **only** that bit set, so a gate reading the
   * wrong bit fails rather than being carried by a neighbour in a combined mask.
   */
  it.each([
    ['pause', 4],
    ['stop', 8],
    ['returnHome', 16],
    ['fanSpeed', 32],
    ['locate', 512],
    ['start', 8192],
  ] as const)('reads %s from bit %i alone', (gate, bit) => {
    const features = featuresOf(bit)

    expect(features[gate]).toBe(true)
    expect(Object.values(features).filter(Boolean)).toHaveLength(1)
  })

  it('reads several bits from a combined mask', () => {
    // START | RETURN_HOME
    expect(featuresOf(8192 | 16)).toMatchObject({
      start: true,
      returnHome: true,
      pause: false,
      stop: false,
    })
  })

  it('returns booleans rather than masked bits', () => {
    for (const value of Object.values(featuresOf(8192))) {
      expect(typeof value).toBe('boolean')
    }
  })

  it('ignores bits this card does not gate on', () => {
    // SEND_COMMAND | CLEAN_SPOT | MAP | STATE | CLEAN_AREA — none is a control here.
    expect(
      Object.values(featuresOf(256 | 1024 | 2048 | 4096 | 16384)).filter(Boolean)
    ).toHaveLength(0)
  })
})

describe('readFanSpeedList', () => {
  it('reads the entity list as published', () => {
    expect(readFanSpeedList({ fan_speed_list: ['quiet', 'max'] })).toEqual(['quiet', 'max'])
  })

  /**
   * Every element must survive being handed to `vacuum.set_fan_speed`. An
   * integration publishing a null or a blank entry would otherwise put an option
   * on the select that dispatches a speed the vacuum cannot have.
   */
  it('drops entries that are not usable speeds', () => {
    expect(readFanSpeedList({ fan_speed_list: ['quiet', '', '   ', null, 7, 'max'] })).toEqual([
      'quiet',
      'max',
    ])
  })

  it.each([
    ['missing', undefined],
    ['a string', 'quiet,max'],
    ['an object', { quiet: true }],
    ['null', null],
  ])('is empty when fan_speed_list is %s', (_label, fan_speed_list) => {
    expect(readFanSpeedList({ fan_speed_list })).toEqual([])
  })

  it('is empty for an entity with no attributes at all', () => {
    expect(readFanSpeedList(undefined)).toEqual([])
  })
})
