import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SENSOR_GRAPH_HOURS,
  MAX_SENSOR_GRAPH_HOURS,
  MIN_SENSOR_GRAPH_HOURS,
  SENSOR_OPTION_DEFAULTS,
  isCounterStateClass,
  isNumericSensorEntity,
  normalizeSensorGraphHours,
  readSensorOptions,
  resolveSensorGraphMode,
  sensorOptionsConfigSchema,
} from '../sensorOptions'
import { createSensorEntity } from '~/test/fixtures'

/**
 * The sensor option contract (docs/specs/entity-cards/options/sensor.md).
 *
 * Two halves, and the split is the design: the SCHEMA is strict, because an
 * import gate that waved `graphMode: bars` through would turn a typo into a
 * card silently drawing something else; the READER is total, because a document
 * this build cannot fully interpret still reaches the render path
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility") and a
 * dashboard must not fail to render over a number.
 */

describe('readSensorOptions', () => {
  it('defaults every key when there is no config at all', () => {
    expect(readSensorOptions(undefined)).toEqual(SENSOR_OPTION_DEFAULTS)
    expect(readSensorOptions({})).toEqual(SENSOR_OPTION_DEFAULTS)
  })

  it('reads a fully configured card', () => {
    expect(
      readSensorOptions({
        displayPrecision: '2',
        unitOverride: 'kWh',
        valueScale: 'none',
        showGraph: false,
        graphHours: 48,
        graphMode: 'bar',
        showTrend: false,
      })
    ).toEqual({
      displayPrecision: 2,
      unitOverride: 'kWh',
      valueScale: 'none',
      showGraph: false,
      graphHours: 48,
      graphMode: 'bar',
      showTrend: false,
    })
  })

  it.each([
    ['auto', 'auto'],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    // The spelling a hand-written YAML produces: unquoted digits parse as
    // numbers, and they are the same three values.
    [0, 0],
    [1, 1],
    [2, 2],
  ] as const)('resolves displayPrecision %s', (stored, expected) => {
    expect(readSensorOptions({ displayPrecision: stored }).displayPrecision).toBe(expected)
  })

  it.each([
    ['a precision this build has no rule for', { displayPrecision: '3' }],
    ['a numeric precision out of range', { displayPrecision: 4 }],
    ['a precision of the wrong type', { displayPrecision: true }],
    ['a unit that is not text', { unitOverride: 12 }],
    ['a scale this build does not know', { valueScale: 'kilo' }],
    ['a graph mode this build does not know', { graphMode: 'candles' }],
    ['a boolean written as a string', { showGraph: 'false' }],
    ['a boolean written as a number', { showTrend: 0 }],
    ['a whole config of the wrong type', { displayPrecision: null, graphHours: [] }],
  ])('falls back to the defaults for %s', (_name, config) => {
    // One bad key costs only its own key, and never the render.
    expect(readSensorOptions(config)).toEqual({
      ...SENSOR_OPTION_DEFAULTS,
      ...readSensorOptions({}),
    })
  })

  it('keeps the keys around a bad one', () => {
    expect(readSensorOptions({ graphMode: 'candles', unitOverride: 'kWh' })).toEqual({
      ...SENSOR_OPTION_DEFAULTS,
      unitOverride: 'kWh',
    })
  })

  it('accepts an empty unit override as "use the entity\'s own"', () => {
    expect(readSensorOptions({ unitOverride: '' }).unitOverride).toBe('')
  })
})

describe('normalizeSensorGraphHours', () => {
  it.each([
    ['not a number', undefined],
    ['a string', '24'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative', -5],
    ['null', null],
  ])('falls back to the default window for %s', (_name, value) => {
    // None of these describes a window at all, so they all mean the same thing.
    expect(normalizeSensorGraphHours(value)).toBe(DEFAULT_SENSOR_GRAPH_HOURS)
  })

  it.each([
    ['below the minimum', 0.5, MIN_SENSOR_GRAPH_HOURS],
    ['at the minimum', 1, 1],
    ['a fractional window inside the range', 1.5, 1.5],
    ['at the maximum', 168, 168],
    ['above the maximum', 5000, MAX_SENSOR_GRAPH_HOURS],
    // A window described badly clamps, rather than reverting to the default:
    // the document did ask for "as much history as possible".
    ['far above the maximum', Number.MAX_SAFE_INTEGER, MAX_SENSOR_GRAPH_HOURS],
  ])('clamps %s', (_name, value, expected) => {
    expect(normalizeSensorGraphHours(value)).toBe(expected)
  })

  it('is what readSensorOptions returns, so consumers need not repeat it', () => {
    expect(readSensorOptions({ graphHours: 5000 }).graphHours).toBe(MAX_SENSOR_GRAPH_HOURS)
    expect(readSensorOptions({ graphHours: NaN }).graphHours).toBe(DEFAULT_SENSOR_GRAPH_HOURS)
    expect(readSensorOptions({ graphHours: -1 }).graphHours).toBe(DEFAULT_SENSOR_GRAPH_HOURS)
  })
})

describe('resolveSensorGraphMode', () => {
  it.each(['measurement', undefined, 'total_something'])(
    'falls a stored bar back to a line on state_class %s',
    (stateClass) => {
      // Presentational key, so it degrades rather than being rejected — and
      // per-bucket differences of a measurement series mean nothing.
      expect(resolveSensorGraphMode('bar', stateClass)).toBe('line')
    }
  )

  it.each(['total', 'total_increasing'])('keeps bars on the cumulative %s', (stateClass) => {
    expect(resolveSensorGraphMode('bar', stateClass)).toBe('bar')
  })

  it('never turns a stored line into bars', () => {
    expect(resolveSensorGraphMode('line', 'total_increasing')).toBe('line')
  })
})

describe('isCounterStateClass', () => {
  it.each([
    ['total', true],
    ['total_increasing', true],
    ['measurement', false],
    ['', false],
    [undefined, false],
    [12, false],
    [null, false],
  ])('reads %s as %s', (stateClass, expected) => {
    expect(isCounterStateClass(stateClass)).toBe(expected)
  })
})

describe('isNumericSensorEntity', () => {
  it('accepts a sensor reporting a reading', () => {
    expect(isNumericSensorEntity(createSensorEntity())).toBe(true)
  })

  it.each(['unavailable', 'unknown', 'none', ''])(
    'still accepts one whose state is the transient %s',
    (state) => {
      // A thermometer whose integration is down is still a thermometer. This
      // is the same judgement the history service makes before it decides to
      // fetch, which is the point of sharing the predicate.
      expect(isNumericSensorEntity(createSensorEntity({ state }))).toBe(true)
    }
  )

  it.each(['charging', 'home', '2026-07-27T10:00:00+00:00'])(
    'rejects the text state %s',
    (state) => {
      expect(isNumericSensorEntity(createSensorEntity({ state }))).toBe(false)
    }
  )

  it('rejects an entity that is not in the store', () => {
    expect(isNumericSensorEntity(undefined)).toBe(false)
  })
})

describe('sensorOptionsConfigSchema', () => {
  it('accepts the values the form writes', () => {
    expect(
      sensorOptionsConfigSchema.safeParse({
        displayPrecision: '1',
        unitOverride: 'kWh',
        valueScale: 'auto',
        showGraph: true,
        graphHours: 24,
        graphMode: 'bar',
        showTrend: false,
      }).success
    ).toBe(true)
  })

  it('accepts a config that sets nothing', () => {
    expect(sensorOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  it.each([
    ['an unknown graph mode', { graphMode: 'candles' }],
    ['an unknown scale', { valueScale: 'kilo' }],
    ['a precision this build has no rule for', { displayPrecision: '3' }],
    ['a window below the minimum', { graphHours: 0 }],
    ['a window above the maximum', { graphHours: 500 }],
    ['a window that is not finite', { graphHours: Infinity }],
    ['a window that is not a number', { graphHours: '24' }],
    ['a unit that is not text', { unitOverride: 12 }],
    ['a switch that is not a boolean', { showGraph: 'yes' }],
  ])('rejects %s at the gate', (_name, config) => {
    // Rejected NAMING the field, rather than silently defaulted: a document
    // asking for a hundred days of recorder history is one its author needs
    // told about.
    expect(sensorOptionsConfigSchema.safeParse(config).success).toBe(false)
  })
})
