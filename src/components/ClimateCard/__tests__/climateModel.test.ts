import { describe, it, expect } from 'vitest'
import {
  clampTemperature,
  readHvacModes,
  readTemperature,
  resolveStatusColor,
} from '../climateModel'

/**
 * What the card is willing to believe about a climate entity.
 *
 * Every serious defect on this card has been a shape nobody checked rather than
 * a branch nobody took: an `unknown` state that read as "running", a setpoint of
 * `0` that read as absent, a `temperature` attribute that had not arrived and
 * was formatted anyway. These readers are the one place those questions are
 * answered, so they are pinned directly.
 */
describe('readTemperature', () => {
  it('takes a finite number as itself, including zero and negatives', () => {
    expect(readTemperature(21.5)).toBe(21.5)
    expect(readTemperature(0)).toBe(0)
    expect(readTemperature(-18)).toBe(-18)
  })

  it('takes a numeric string, which is what a template sensor publishes', () => {
    expect(readTemperature('21.5')).toBe(21.5)
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['not a number', NaN],
    ['infinite', Infinity],
    ['empty', ''],
    ['blank', '   '],
    ['unparseable', 'unknown'],
    ['an object', { value: 21 }],
    ['a boolean', true],
  ])('reads %s as no reading at all', (_name, value) => {
    expect(readTemperature(value)).toBeUndefined()
  })
})

describe('readHvacModes', () => {
  it('keeps the strings and drops everything else', () => {
    expect(readHvacModes(['off', 'heat', 3, null, 'cool'])).toEqual(['off', 'heat', 'cool'])
  })

  it.each([
    ['absent', undefined],
    ['a string', 'heat,cool'],
    ['an object', { heat: true }],
  ])('reads %s as no modes', (_name, value) => {
    expect(readHvacModes(value)).toEqual([])
  })
})

describe('resolveStatusColor', () => {
  it.each([
    ['heating', 'heat'],
    ['cooling', 'cool'],
    ['drying', 'water'],
    ['preheating', 'heat'],
    ['defrosting', 'heat'],
    // Moving air changes no temperature, so the one active action that reads
    // neutral (option doc — "showModePills and state colors").
    ['fan', 'default'],
  ])('lets the %s action decide, whatever the mode is set to', (action, triplet) => {
    expect(resolveStatusColor('heat_cool', action)).toBe(triplet)
  })

  it.each([
    ['heat', 'heat'],
    ['cool', 'cool'],
    ['heat_cool', 'ok'],
    ['auto', 'ok'],
    ['dry', 'water'],
    ['fan_only', 'default'],
  ])('falls back to the %s mode when the thermostat is idle', (mode, triplet) => {
    expect(resolveStatusColor(mode, 'idle')).toBe(triplet)
  })

  it('resolves off, and a mode this build cannot name, to neutral', () => {
    expect(resolveStatusColor('off', 'off')).toBe('default')
    expect(resolveStatusColor('off', undefined)).toBe('default')
    expect(resolveStatusColor('eco', undefined)).toBe('default')
  })
})

describe('clampTemperature', () => {
  it('holds a setpoint inside the entity’s own bounds', () => {
    expect(clampTemperature(21, 7, 35)).toBe(21)
    expect(clampTemperature(2, 7, 35)).toBe(7)
    expect(clampTemperature(50, 7, 35)).toBe(35)
  })
})
