import { describe, it, expect } from 'vitest'
import {
  formatSensorNumber,
  formatSensorState,
  formatSensorTrend,
  type SensorFormatOptions,
} from '../format'
import { SENSOR_OPTION_DEFAULTS } from '~/store/sensorOptions'

/**
 * The formatting pipeline: raw value → `valueScale` → `displayPrecision` →
 * unit (docs/specs/entity-cards/options/sensor.md).
 *
 * The `auto` matrix itself is pinned one level up, through the rendered card
 * (`src/components/__tests__/sensorFormatting.test.tsx`), because that is the
 * behaviour that must not regress and it predates this module. What is tested
 * here is what 0018 adds: that the three options layer ON TOP of that matrix in
 * that order rather than replacing it, and that every surface — value, trend,
 * footer — gets the same treatment.
 */

const defaults: SensorFormatOptions = {
  displayPrecision: SENSOR_OPTION_DEFAULTS.displayPrecision,
  valueScale: SENSOR_OPTION_DEFAULTS.valueScale,
  unitOverride: SENSOR_OPTION_DEFAULTS.unitOverride,
}

const power = { deviceClass: 'power', unit: 'W' }
const temperature = { deviceClass: 'temperature', unit: '°C' }

describe('formatSensorNumber', () => {
  it('applies the auto matrix when nothing is configured', () => {
    expect(formatSensorNumber(1250, power, defaults).text).toBe('1.3 kW')
    expect(formatSensorNumber(21.42, temperature, defaults).text).toBe('21.4 °C')
  })

  it('applies a fixed precision after scaling, not before', () => {
    // The option doc's own example: "a 1250 W reading with displayPrecision: 2
    // renders 1.25 kW". Precision before scaling would give `1250.00 W`.
    expect(formatSensorNumber(1250, power, { ...defaults, displayPrecision: 2 }).text).toBe(
      '1.25 kW'
    )
  })

  it.each([
    [0, '21 °C'],
    [1, '21.4 °C'],
    [2, '21.42 °C'],
  ] as const)('forces %i decimals', (displayPrecision, expected) => {
    expect(formatSensorNumber(21.42, temperature, { ...defaults, displayPrecision }).text).toBe(
      expected
    )
  })

  it('adds decimals the auto matrix would not', () => {
    // `humidity` rounds under `auto`; a fixed precision overrides that rather
    // than being capped by it.
    expect(
      formatSensorNumber(
        55.6,
        { deviceClass: 'humidity', unit: '%' },
        {
          ...defaults,
          displayPrecision: 2,
        }
      ).text
    ).toBe('55.60 %')
  })

  it('shows the raw magnitude under valueScale: none', () => {
    const result = formatSensorNumber(1250, power, { ...defaults, valueScale: 'none' })
    expect(result.text).toBe('1250 W')
    expect(result.scaled).toBe(false)
  })

  it('keeps a fixed precision under valueScale: none', () => {
    expect(
      formatSensorNumber(1250, power, { ...defaults, valueScale: 'none', displayPrecision: 2 }).text
    ).toBe('1250.00 W')
  })

  it('attaches the k prefix to an overridden unit', () => {
    const result = formatSensorNumber(1250, power, { ...defaults, unitOverride: 'Watt' })
    expect(result.text).toBe('1.3 kWatt')
    expect(result.unit).toBe('kWatt')
  })

  it('replaces the unit without converting the value', () => {
    // Display-only by contract: the number is untouched, whatever the label
    // claims about it.
    const result = formatSensorNumber(21.42, temperature, { ...defaults, unitOverride: '°F' })
    expect(result.text).toBe('21.4 °F')
    expect(result.value).toBe(21.4)
  })

  it('supplies a unit the entity does not report', () => {
    expect(
      formatSensorNumber(
        42,
        { deviceClass: undefined, unit: undefined },
        {
          ...defaults,
          unitOverride: 'lx',
        }
      ).text
    ).toBe('42 lx')
  })

  it('renders a number with no unit at all as a bare figure', () => {
    const result = formatSensorNumber(42, { deviceClass: undefined, unit: undefined }, defaults)
    expect(result.text).toBe('42')
    expect(result.unit).toBe('')
  })

  it('does not scale a value it has no unit to prefix', () => {
    // `1.3 k` is a number a thousand times too small followed by a stray
    // letter; the whole value is the honest answer.
    const result = formatSensorNumber(1250, { deviceClass: 'power' }, defaults)
    expect(result.text).toBe('1250')
    expect(result.scaled).toBe(false)
  })

  it('scales once an override supplies the missing unit', () => {
    // The same reading, the same entity — the override is what makes `k`
    // sayable, so it is what makes scaling meaningful.
    const result = formatSensorNumber(
      1250,
      { deviceClass: 'power' },
      {
        ...defaults,
        unitOverride: 'W',
      }
    )
    expect(result.text).toBe('1.3 kW')
    expect(result.scaled).toBe(true)
  })

  it('reports the value as rendered, scaled and rounded', () => {
    // What a caller compares against zero, so it has to be the number the card
    // shows rather than the one it was given.
    expect(formatSensorNumber(1250, power, defaults).value).toBe(1.3)
    expect(formatSensorNumber(0.04, temperature, defaults).value).toBe(0)
  })

  it('scales only at or above a thousand', () => {
    expect(formatSensorNumber(999.9, power, defaults).text).toBe('1000 W')
    expect(formatSensorNumber(1000, power, defaults).text).toBe('1.0 kW')
  })

  it('leaves a negative reading unscaled, as the shipped rule does', () => {
    // The scaling test is on the signed value, not the magnitude. Widening it
    // is a change to a MUST-not-regress rule and belongs to whoever decides
    // that solar export should read `-1.5 kW`.
    expect(formatSensorNumber(-1500, power, defaults).text).toBe('-1500 W')
  })
})

describe('formatSensorState', () => {
  it('formats a numeric state through the pipeline', () => {
    expect(formatSensorState('1250', power, { ...defaults, displayPrecision: 2 })).toBe('1.25 kW')
  })

  it.each([
    ['unavailable', 'UNAVAILABLE'],
    ['unknown', 'UNKNOWN'],
    ['charging', 'CHARGING'],
    ['2026-07-27T10:00:00+00:00', '2026-07-27T10:00:00+00:00'],
    ['', ''],
    ['   ', ''],
  ])('passes the non-numeric state %s through untouched', (state, expected) => {
    // Every option is set to something that would be visible if it applied: a
    // precision has nothing to round, and `°C` after `UNAVAILABLE` would read
    // as a measurement.
    expect(
      formatSensorState(state, temperature, {
        displayPrecision: 2,
        valueScale: 'none',
        unitOverride: 'kWh',
      })
    ).toBe(expected)
  })
})

describe('formatSensorTrend', () => {
  it('signs a rise and points up', () => {
    expect(formatSensorTrend(0.8, temperature, defaults)).toEqual({
      direction: 'up',
      text: '+0.8 °C',
    })
  })

  it('keeps the minus sign on a fall and points down', () => {
    expect(formatSensorTrend(-0.8, temperature, defaults)).toEqual({
      direction: 'down',
      text: '-0.8 °C',
    })
  })

  it('reads a movement too small to render as flat', () => {
    // An arrow beside `+0.0` is the card contradicting its own text, so the
    // direction comes from the delta as RENDERED.
    expect(formatSensorTrend(0.04, temperature, defaults)).toEqual({
      direction: 'flat',
      text: '0.0 °C',
    })
  })

  it('strips the sign a rounded-away fall would keep', () => {
    // `(-0.04).toFixed(1)` is `-0.0`: a minus sign on a movement the card just
    // called flat.
    expect(formatSensorTrend(-0.04, temperature, defaults)).toEqual({
      direction: 'flat',
      text: '0.0 °C',
    })
  })

  it('reads an exact zero as flat', () => {
    expect(formatSensorTrend(0, temperature, defaults)).toEqual({
      direction: 'flat',
      text: '0.0 °C',
    })
  })

  it('formats the delta in the same unit as the value', () => {
    // A card reading `1.3 kW` may not report its change in watts.
    expect(formatSensorTrend(1250, power, defaults).text).toBe('+1.3 kW')
  })

  it('honours the unit override and the precision', () => {
    expect(
      formatSensorTrend(1250, power, { ...defaults, unitOverride: 'Watt', displayPrecision: 2 })
    ).toEqual({ direction: 'up', text: '+1.25 kWatt' })
  })
})
