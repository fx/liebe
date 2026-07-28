import { describe, it, expect } from 'vitest'
import {
  configPredatesSpeedControl,
  FAN_OPTION_DEFAULTS,
  FAN_OPTION_KEYS,
  fanOptionsConfigSchema,
  pinLegacyFanSpeedControl,
  readFanOptions,
  SPEED_CONTROL_VERSION,
} from '../fanOptions'
import { configPredatesVersion } from '../configVersion'

/**
 * The fan card's option contract (docs/specs/entity-cards/options/fan.md).
 * The pill arithmetic lives in `FanCard/speedSteps.ts`; this is the reading,
 * the validation, and the pinning migration's own predicates.
 */
describe('readFanOptions', () => {
  it('returns the shipped defaults for an unconfigured card', () => {
    expect(readFanOptions(undefined)).toEqual({
      speedControl: 'slider',
      showPresets: true,
      showOscillate: true,
      showDirection: false,
      animateIcon: true,
      showPercentage: true,
    })
    expect(readFanOptions({})).toEqual(FAN_OPTION_DEFAULTS)
  })

  it('reads every stored key back', () => {
    const stored = readFanOptions({
      speedControl: 'steps',
      showPresets: false,
      showOscillate: false,
      showDirection: true,
      animateIcon: false,
      showPercentage: false,
    })

    expect(stored).toEqual({
      speedControl: 'steps',
      showPresets: false,
      showOscillate: false,
      showDirection: true,
      animateIcon: false,
      showPercentage: false,
    })
    expect(Object.keys(stored).sort()).toEqual([...FAN_OPTION_KEYS].sort())
  })

  it('accepts all three speed styles', () => {
    for (const speedControl of ['slider', 'steps', 'none'] as const) {
      expect(readFanOptions({ speedControl }).speedControl).toBe(speedControl)
    }
  })

  it('falls back per key, so one bad value costs only its own key', () => {
    const options = readFanOptions({
      speedControl: 'pills',
      animateIcon: 'yes',
      showDirection: true,
    })

    expect(options.speedControl).toBe('slider')
    expect(options.animateIcon).toBe(true)
    // Still honoured: the neighbouring key was valid.
    expect(options.showDirection).toBe(true)
  })
})

describe('fanOptionsConfigSchema', () => {
  it('accepts a partial fragment', () => {
    expect(fanOptionsConfigSchema.safeParse({ speedControl: 'none' }).success).toBe(true)
    expect(fanOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a style no build has, rather than swallowing it', () => {
    expect(fanOptionsConfigSchema.safeParse({ speedControl: 'pills' }).success).toBe(false)
    expect(fanOptionsConfigSchema.safeParse({ animateIcon: 'yes' }).success).toBe(false)
  })
})

describe('configPredatesSpeedControl', () => {
  it('reads an older document as old, and this build’s own as current', () => {
    expect(configPredatesSpeedControl('1.0.0')).toBe(true)
    expect(configPredatesSpeedControl('1.1.0')).toBe(true)
    expect(configPredatesSpeedControl(SPEED_CONTROL_VERSION)).toBe(false)
    expect(configPredatesSpeedControl('2.0.0')).toBe(false)
  })

  it('reads a missing or unparseable version as old', () => {
    // Old by definition, and pinning an old card to the control it already had
    // is harmless — failing to pin one silently changes how it is operated.
    expect(configPredatesSpeedControl(undefined)).toBe(true)
    expect(configPredatesSpeedControl(42)).toBe(true)
    expect(configPredatesSpeedControl('')).toBe(true)
    expect(configPredatesSpeedControl('not.a.version')).toBe(true)
  })

  it('is the shared comparison, not a second copy of it', () => {
    for (const version of ['1.0.0', '1.1.0', '1.2.0', '2.0.0', 'nonsense', undefined]) {
      expect(configPredatesSpeedControl(version)).toBe(
        configPredatesVersion(version, SPEED_CONTROL_VERSION)
      )
    }
  })
})

describe('pinLegacyFanSpeedControl', () => {
  it('pins a fan card with no stored style', () => {
    expect(pinLegacyFanSpeedControl('fan', {})).toEqual({ speedControl: 'steps' })
  })

  it('leaves a fan card that already carries one, by reference', () => {
    const config = { speedControl: 'none' }
    expect(pinLegacyFanSpeedControl('fan', config)).toBe(config)
  })

  it('leaves every other domain alone, by reference', () => {
    for (const domain of ['cover', 'light', 'input_number', 'switch']) {
      const config = {}
      expect(pinLegacyFanSpeedControl(domain, config)).toBe(config)
    }
  })

  it('carries the rest of the config across untouched', () => {
    // A document a newer Liebe wrote has to survive a round trip through this
    // one (docs/specs/dashboard-config — "Forward Compatibility").
    expect(pinLegacyFanSpeedControl('fan', { hideName: true, futureKey: 7 })).toEqual({
      hideName: true,
      futureKey: 7,
      speedControl: 'steps',
    })
  })
})

describe('configPredatesVersion', () => {
  it('compares major then minor', () => {
    expect(configPredatesVersion('1.1.0', '1.2.0')).toBe(true)
    expect(configPredatesVersion('1.2.0', '1.2.0')).toBe(false)
    expect(configPredatesVersion('1.3.0', '1.2.0')).toBe(false)
    expect(configPredatesVersion('0.9.0', '1.0.0')).toBe(true)
    expect(configPredatesVersion('2.0.0', '1.2.0')).toBe(false)
  })

  it('ignores the patch segment, which no marker uses', () => {
    expect(configPredatesVersion('1.2.9', '1.2.0')).toBe(false)
  })
})
