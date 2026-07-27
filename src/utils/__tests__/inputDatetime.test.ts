import { describe, it, expect } from 'vitest'
import {
  buildSetDatetimePayload,
  describeInputDatetimeShape,
  toDatetimeInputValue,
} from '../inputDatetime'

const DATE_ONLY = { has_date: true, has_time: false }
const TIME_ONLY = { has_date: false, has_time: true }
const COMBINED = { has_date: true, has_time: true }
const NEITHER = { has_date: false, has_time: false }

describe('buildSetDatetimePayload', () => {
  it('sends only `date` for a date-only helper', () => {
    expect(buildSetDatetimePayload('2024-03-02', DATE_ONLY)).toEqual({ date: '2024-03-02' })
  })

  it('takes the date half when a date-only helper is handed a full datetime', () => {
    expect(buildSetDatetimePayload('2024-03-02T06:30', DATE_ONLY)).toEqual({ date: '2024-03-02' })
  })

  it('refuses a time for a date-only helper rather than guessing a date', () => {
    expect(buildSetDatetimePayload('06:30', DATE_ONLY)).toBeNull()
  })

  it('pads seconds onto a time-only helper', () => {
    expect(buildSetDatetimePayload('06:30', TIME_ONLY)).toEqual({ time: '06:30:00' })
  })

  it('leaves seconds alone when the value already carries them', () => {
    expect(buildSetDatetimePayload('06:30:45', TIME_ONLY)).toEqual({ time: '06:30:45' })
  })

  it('takes the time half when a time-only helper is handed a full datetime', () => {
    expect(buildSetDatetimePayload('2024-03-02 06:30:45', TIME_ONLY)).toEqual({ time: '06:30:45' })
  })

  it('refuses a date for a time-only helper', () => {
    expect(buildSetDatetimePayload('2024-03-02', TIME_ONLY)).toBeNull()
  })

  it('joins both halves with a space for a combined helper', () => {
    expect(buildSetDatetimePayload('2024-03-02T06:30', COMBINED)).toEqual({
      datetime: '2024-03-02 06:30:00',
    })
  })

  it('sets a combined helper at midnight when the value carries no time', () => {
    expect(buildSetDatetimePayload('2024-03-02', COMBINED)).toEqual({
      datetime: '2024-03-02 00:00:00',
    })
  })

  it('refuses a bare time for a combined helper', () => {
    expect(buildSetDatetimePayload('06:30', COMBINED)).toBeNull()
  })

  it('treats absent attributes as a combined helper', () => {
    expect(buildSetDatetimePayload('2024-03-02 06:30:00')).toEqual({
      datetime: '2024-03-02 06:30:00',
    })
  })

  it('sends nothing for a helper carrying neither half', () => {
    expect(buildSetDatetimePayload('2024-03-02', NEITHER)).toBeNull()
  })

  it('sends nothing for values that are not datetimes at all', () => {
    expect(buildSetDatetimePayload('', COMBINED)).toBeNull()
    expect(buildSetDatetimePayload('unknown', COMBINED)).toBeNull()
    expect(buildSetDatetimePayload('2024-3-2', DATE_ONLY)).toBeNull()
    expect(buildSetDatetimePayload(1709337000, COMBINED)).toBeNull()
  })

  it('ignores surrounding whitespace', () => {
    expect(buildSetDatetimePayload('  2024-03-02  ', DATE_ONLY)).toEqual({ date: '2024-03-02' })
  })
})

describe('describeInputDatetimeShape', () => {
  const id = 'input_datetime.alarm_time'

  it('names the shape and the format the helper accepts', () => {
    expect(describeInputDatetimeShape(id, DATE_ONLY)).toBe(`${id} expects a date (YYYY-MM-DD)`)
    expect(describeInputDatetimeShape(id, TIME_ONLY)).toBe(`${id} expects a time (HH:MM)`)
    expect(describeInputDatetimeShape(id, COMBINED)).toBe(
      `${id} expects a date and time (YYYY-MM-DD HH:MM)`
    )
  })

  it('describes a helper carrying neither half without naming a format', () => {
    expect(describeInputDatetimeShape(id, NEITHER)).toBe(
      `${id} has neither a date nor a time to set`
    )
  })

  it('treats absent attributes as a combined helper, as the payload builder does', () => {
    expect(describeInputDatetimeShape(id)).toBe(`${id} expects a date and time (YYYY-MM-DD HH:MM)`)
  })
})

describe('toDatetimeInputValue', () => {
  it('rewrites the published state into what datetime-local accepts', () => {
    // The bug this exists for: assigned raw, this state leaves the field blank.
    expect(toDatetimeInputValue('2024-01-15 06:30:00', COMBINED)).toBe('2024-01-15T06:30')
  })

  it('fills in midnight when a combined helper publishes a bare date', () => {
    expect(toDatetimeInputValue('2024-01-15', COMBINED)).toBe('2024-01-15T00:00')
  })

  it('drops the seconds a time input will not take', () => {
    expect(toDatetimeInputValue('06:30:00', TIME_ONLY)).toBe('06:30')
  })

  it('passes a date-only state through', () => {
    expect(toDatetimeInputValue('2024-01-15', DATE_ONLY)).toBe('2024-01-15')
  })

  it('takes the matching half when the state carries both', () => {
    expect(toDatetimeInputValue('2024-01-15 06:30:00', DATE_ONLY)).toBe('2024-01-15')
    expect(toDatetimeInputValue('2024-01-15 06:30:00', TIME_ONLY)).toBe('06:30')
  })

  it('blanks a state that cannot serve the helper shape', () => {
    expect(toDatetimeInputValue('06:30:00', COMBINED)).toBe('')
    expect(toDatetimeInputValue('06:30:00', DATE_ONLY)).toBe('')
    expect(toDatetimeInputValue('2024-01-15', TIME_ONLY)).toBe('')
    expect(toDatetimeInputValue('2024-01-15 06:30:00', NEITHER)).toBe('')
  })

  it('blanks the unset and unknown states', () => {
    expect(toDatetimeInputValue('', COMBINED)).toBe('')
    expect(toDatetimeInputValue('unknown', COMBINED)).toBe('')
    expect(toDatetimeInputValue('unavailable', DATE_ONLY)).toBe('')
  })

  it('treats absent attributes as a combined helper', () => {
    expect(toDatetimeInputValue('2024-01-15 06:30:00')).toBe('2024-01-15T06:30')
  })
})
