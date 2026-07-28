import { describe, it, expect } from 'vitest'
import {
  deriveSpeedSteps,
  fanSpinDurationSeconds,
  FAN_SPIN_FASTEST_S,
  FAN_SPIN_FIXED_S,
  FAN_SPIN_SLOWEST_S,
  MAX_SPEED_PILLS,
  QUARTILE_SPEEDS,
  readFanPercentage,
  selectedSpeedStep,
} from '../speedSteps'

/**
 * The step-pill arithmetic (docs/specs/entity-cards/options/fan.md — "Speed
 * control"). Pure, so the contract is testable without a fan, a card, or a
 * render.
 */
describe('deriveSpeedSteps', () => {
  it('derives evenly divided pills from the speed count', () => {
    expect(deriveSpeedSteps(25)).toEqual([25, 50, 75, 100])
    expect(deriveSpeedSteps(50)).toEqual([50, 100])
    expect(deriveSpeedSteps(100)).toEqual([100])
  })

  it('handles a step that does not divide 100 by counting speeds, not multiplying', () => {
    // The whole reason the contract is a count: multiples of 30 give
    // 30 / 60 / 90, and the fan can never be driven to full speed.
    expect(deriveSpeedSteps(30)).toEqual([33, 67, 100])
    expect(deriveSpeedSteps(33.33)).toEqual([33, 67, 100])
    expect(deriveSpeedSteps(16.67)).toEqual([17, 33, 50, 67, 83, 100])
  })

  it('always ends exactly at 100 and yields only integers', () => {
    for (const step of [10, 12.5, 16.67, 20, 25, 30, 33.33, 50, 100]) {
      const steps = deriveSpeedSteps(step)
      expect(steps[steps.length - 1]).toBe(100)
      for (const value of steps) expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('falls back to quartiles for a step it cannot use', () => {
    for (const step of [undefined, null, 0, -25, '25', NaN, Infinity, -Infinity, {}]) {
      expect(deriveSpeedSteps(step)).toEqual([...QUARTILE_SPEEDS])
    }
  })

  it('falls back to quartiles rather than rendering more pills than fit', () => {
    // 10 speeds is legitimate for the fan and illegible on a `row` card, so the
    // limit is a fixed count — "as many as fit" cannot be unit-tested.
    expect(deriveSpeedSteps(10)).toEqual([...QUARTILE_SPEEDS])
    expect(deriveSpeedSteps(0.5)).toEqual([...QUARTILE_SPEEDS])
    // …and exactly at the limit, it does not.
    expect(deriveSpeedSteps(100 / MAX_SPEED_PILLS)).toHaveLength(MAX_SPEED_PILLS)
  })

  it('never returns an empty set, so a fan always has something to press', () => {
    for (const step of [200, 1000, 99.9]) {
      expect(deriveSpeedSteps(step).length).toBeGreaterThan(0)
    }
  })

  it('returns a fresh array, so a caller cannot mutate the fallback', () => {
    const first = deriveSpeedSteps(undefined)
    first.push(999)
    expect(deriveSpeedSteps(undefined)).toEqual([...QUARTILE_SPEEDS])
  })
})

describe('selectedSpeedStep', () => {
  const quartiles = [25, 50, 75, 100]

  it('selects an exact match', () => {
    expect(selectedSpeedStep(quartiles, 50)).toBe(50)
    expect(selectedSpeedStep(quartiles, 100)).toBe(100)
  })

  it('selects the nearest pill within half a step', () => {
    // Half a quartile step is 12.5.
    expect(selectedSpeedStep(quartiles, 37)).toBe(25)
    expect(selectedSpeedStep(quartiles, 38)).toBe(50)
    expect(selectedSpeedStep(quartiles, 62)).toBe(50)
    expect(selectedSpeedStep(quartiles, 63)).toBe(75)
  })

  it('selects nothing when no pill is within half a step', () => {
    // A stopped fan lights no speed rather than misreporting one.
    expect(selectedSpeedStep(quartiles, 0)).toBeUndefined()
    expect(selectedSpeedStep(quartiles, 5)).toBeUndefined()
  })

  it('scales the tolerance with the pill count', () => {
    // Three speeds: half a step is ~16.7, so 45 is within reach of 33.
    const three = [33, 67, 100]
    expect(selectedSpeedStep(three, 45)).toBe(33)
    expect(selectedSpeedStep(three, 17)).toBe(33)
    // One further out and nothing is within reach — the quartile set would
    // have given up four points earlier.
    expect(selectedSpeedStep(three, 16)).toBeUndefined()
    // Four speeds: half a step is 12.5, so the same fan gives up sooner.
    expect(selectedSpeedStep(quartiles, 13)).toBe(25)
    expect(selectedSpeedStep(quartiles, 12)).toBeUndefined()
  })

  it('selects nothing for a percentage it cannot read', () => {
    for (const percentage of [undefined, null, 'fast', NaN, Infinity]) {
      expect(selectedSpeedStep(quartiles, percentage)).toBeUndefined()
    }
  })

  it('selects nothing from an empty pill set', () => {
    expect(selectedSpeedStep([], 50)).toBeUndefined()
  })
})

describe('readFanPercentage', () => {
  it('reads a usable percentage', () => {
    expect(readFanPercentage(0)).toBe(0)
    expect(readFanPercentage(66)).toBe(66)
  })

  it('clamps out of range and rounds fractional', () => {
    // The slider positions its thumb from `value / max`, the state line
    // interpolates it, and the spin duration divides by it.
    expect(readFanPercentage(-10)).toBe(0)
    expect(readFanPercentage(120)).toBe(100)
    expect(readFanPercentage(66.6)).toBe(67)
  })

  it('answers nothing for a percentage it cannot read', () => {
    for (const value of [undefined, null, '66', NaN, Infinity, {}]) {
      expect(readFanPercentage(value)).toBeUndefined()
    }
  })
})

describe('fanSpinDurationSeconds', () => {
  it('turns faster at higher speeds', () => {
    expect(fanSpinDurationSeconds(100)).toBeLessThan(fanSpinDurationSeconds(50))
    expect(fanSpinDurationSeconds(50)).toBeLessThan(fanSpinDurationSeconds(25))
  })

  it('clamps both ends, so the spin is never a blur nor mistakable for stopped', () => {
    expect(fanSpinDurationSeconds(100)).toBeGreaterThanOrEqual(FAN_SPIN_FASTEST_S)
    expect(fanSpinDurationSeconds(1)).toBeLessThanOrEqual(FAN_SPIN_SLOWEST_S)
    expect(fanSpinDurationSeconds(200)).toBe(FAN_SPIN_FASTEST_S)
  })

  it('uses the fixed rate for a fan with no percentage to read', () => {
    expect(fanSpinDurationSeconds(undefined)).toBe(FAN_SPIN_FIXED_S)
    expect(fanSpinDurationSeconds(0)).toBe(FAN_SPIN_FIXED_S)
  })
})
