import { describe, it, expect } from 'vitest'
import {
  VACUUM_OPTION_DEFAULTS,
  VACUUM_OPTION_KEYS,
  readVacuumOptions,
  vacuumOptionsConfigSchema,
} from '../vacuumOptions'

/**
 * Written against `docs/specs/entity-cards/options/vacuum.md` — its Options
 * table is the source for every default below, not the constant they are read
 * from (REVIEW.md — "Tests Pin Intent, Not Implementation").
 */
describe('VACUUM_OPTION_DEFAULTS', () => {
  it('matches the option doc table', () => {
    expect(VACUUM_OPTION_DEFAULTS).toEqual({
      showCommands: true,
      showBattery: true,
      showFanSpeed: true,
      showLocate: false,
      showStats: false,
    })
  })

  /** The two the doc turns off, called out so a flipped default fails by name. */
  it('keeps locate and stats off, because both are occasional', () => {
    expect(VACUUM_OPTION_DEFAULTS.showLocate).toBe(false)
    expect(VACUUM_OPTION_DEFAULTS.showStats).toBe(false)
  })

  it('declares exactly the five keys the doc specifies', () => {
    expect([...VACUUM_OPTION_KEYS]).toEqual([
      'showCommands',
      'showBattery',
      'showFanSpeed',
      'showLocate',
      'showStats',
    ])
  })
})

describe('readVacuumOptions', () => {
  it('takes the defaults for a card with no config at all', () => {
    expect(readVacuumOptions(undefined)).toEqual(VACUUM_OPTION_DEFAULTS)
    expect(readVacuumOptions({})).toEqual(VACUUM_OPTION_DEFAULTS)
  })

  it('reads a stored value over the default', () => {
    expect(readVacuumOptions({ showCommands: false, showLocate: true })).toMatchObject({
      showCommands: false,
      showLocate: true,
    })
  })

  /**
   * One bad key costs only itself. A document with a hand-edited
   * `showCommands: "false"` must still render its other options as written,
   * rather than being thrown back to defaults wholesale.
   */
  it('falls back per key, leaving the siblings alone', () => {
    expect(readVacuumOptions({ showCommands: 'false', showLocate: true })).toMatchObject({
      showCommands: true,
      showLocate: true,
    })
  })

  it.each([
    ['a string', 'false'],
    ['a number', 0],
    ['null', null],
    ['an object', {}],
    ['an array', [true]],
  ])('falls back to the default when a value is %s', (_label, raw) => {
    for (const key of VACUUM_OPTION_KEYS) {
      expect(readVacuumOptions({ [key]: raw })[key]).toBe(VACUUM_OPTION_DEFAULTS[key])
    }
  })

  /** Every key is readable and independently overridable. */
  it('reads every key from storage', () => {
    const inverted = Object.fromEntries(
      VACUUM_OPTION_KEYS.map((key) => [key, !VACUUM_OPTION_DEFAULTS[key]])
    )

    expect(readVacuumOptions(inverted)).toEqual(inverted)
  })
})

describe('vacuumOptionsConfigSchema', () => {
  it('accepts the full option surface', () => {
    expect(
      vacuumOptionsConfigSchema.safeParse({
        showCommands: true,
        showBattery: false,
        showFanSpeed: true,
        showLocate: true,
        showStats: false,
      }).success
    ).toBe(true)
  })

  it('accepts a document stating none of the keys', () => {
    expect(vacuumOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  /**
   * Rejected at the gate rather than waved through: all five read "not the
   * disabling value" as enabled, so `showCommands: "false"` would silently keep
   * a cluster its author asked to hide.
   */
  it.each(VACUUM_OPTION_KEYS)('rejects a non-boolean %s at the import gate', (key) => {
    expect(vacuumOptionsConfigSchema.safeParse({ [key]: 'false' }).success).toBe(false)
  })
})
