import { describe, it, expect } from 'vitest'
import {
  BINARY_SENSOR_OPTION_DEFAULTS,
  binarySensorOptionsConfigSchema,
  readBinarySensorOptions,
} from '../binarySensorOptions'

/**
 * The binary sensor option contract (docs/specs/entity-cards/options/sensor.md
 * — "Binary sensor").
 *
 * Same split as its siblings: the schema is strict so a bad value is rejected
 * at the import gate naming the field, and the reader is total so a value that
 * reached storage some other way costs its own key rather than the render
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */

describe('readBinarySensorOptions', () => {
  it('defaults every key when there is no config', () => {
    expect(readBinarySensorOptions(undefined)).toEqual(BINARY_SENSOR_OPTION_DEFAULTS)
    expect(readBinarySensorOptions({})).toEqual(BINARY_SENSOR_OPTION_DEFAULTS)
  })

  it('leaves the icons unset by default', () => {
    // Not `CircleCheck`/`Circle`: an unset icon means "use the device-class
    // pair", and defaulting to the generic names would pin every door sensor
    // to a tick and a circle.
    expect(BINARY_SENSOR_OPTION_DEFAULTS.onIcon).toBe('')
    expect(BINARY_SENSOR_OPTION_DEFAULTS.offIcon).toBe('')
  })

  it('reads a fully configured card', () => {
    expect(
      readBinarySensorOptions({
        onIcon: 'Bell',
        offIcon: 'BellOff',
        onLabel: 'Ajar',
        offLabel: 'Shut',
        invert: true,
      })
    ).toEqual({
      onIcon: 'Bell',
      offIcon: 'BellOff',
      onLabel: 'Ajar',
      offLabel: 'Shut',
      invert: true,
    })
  })

  it.each([
    ['a label that is not text', { onLabel: 12 }],
    ['a label that is null', { offLabel: null }],
    ['an icon that is not text', { onIcon: ['Bell'] }],
    ['an inversion written as a string', { invert: 'yes' }],
    ['an inversion written as a number', { invert: 1 }],
  ])('falls back to the default for %s', (_name, config) => {
    expect(readBinarySensorOptions(config)).toEqual(BINARY_SENSOR_OPTION_DEFAULTS)
  })

  it('keeps the keys around a bad one', () => {
    expect(readBinarySensorOptions({ invert: 'yes', onLabel: 'Ajar' })).toEqual({
      ...BINARY_SENSOR_OPTION_DEFAULTS,
      onLabel: 'Ajar',
    })
  })

  it('ignores keys belonging to other cards', () => {
    expect(readBinarySensorOptions({ showGraph: false, hideState: true })).toEqual(
      BINARY_SENSOR_OPTION_DEFAULTS
    )
  })
})

describe('binarySensorOptionsConfigSchema', () => {
  it('accepts what the form writes', () => {
    expect(
      binarySensorOptionsConfigSchema.safeParse({
        onIcon: 'Bell',
        offIcon: '',
        onLabel: 'Ajar',
        offLabel: '',
        invert: false,
      }).success
    ).toBe(true)
  })

  it('accepts a config that sets nothing', () => {
    expect(binarySensorOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  it.each([
    ['an inversion that is not a boolean', { invert: 'yes' }],
    ['a label that is not text', { onLabel: 12 }],
    ['an icon that is not text', { offIcon: false }],
  ])('rejects %s at the gate', (_name, config) => {
    // `invert: "yes"` in particular: a document that reads a door backwards is
    // one its author needs told about, not one that silently ignores the key.
    expect(binarySensorOptionsConfigSchema.safeParse(config).success).toBe(false)
  })
})
