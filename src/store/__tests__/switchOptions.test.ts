import { describe, it, expect } from 'vitest'
import {
  readCardConfirm,
  readSwitchOptions,
  resolveSwitchStateLabel,
  SWITCH_OPTION_DEFAULTS,
} from '../switchOptions'

describe('readSwitchOptions', () => {
  it('returns the defaults for an unconfigured card', () => {
    expect(readSwitchOptions(undefined)).toEqual(SWITCH_OPTION_DEFAULTS)
    expect(readSwitchOptions({})).toEqual(SWITCH_OPTION_DEFAULTS)
  })

  it('reads every option', () => {
    expect(
      readSwitchOptions({
        confirm: true,
        deviceClassIcon: false,
        stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' },
        showLastChanged: true,
      })
    ).toEqual({
      confirm: true,
      deviceClassIcon: false,
      stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' },
      showLastChanged: true,
    })
  })

  it('normalizes a half-filled stateLabels to both keys', () => {
    expect(readSwitchOptions({ stateLabels: { onLabel: 'Brewing' } }).stateLabels).toEqual({
      onLabel: 'Brewing',
      offLabel: '',
    })
    expect(readSwitchOptions({ stateLabels: { offLabel: 'Idle' } }).stateLabels).toEqual({
      onLabel: '',
      offLabel: 'Idle',
    })
  })

  it('falls back per key, so one bad value does not cost the others', () => {
    const options = readSwitchOptions({
      confirm: 'yes',
      deviceClassIcon: false,
      stateLabels: { onLabel: 7 },
      showLastChanged: null,
    })

    // The invalid keys revert to their defaults — critically, `confirm` reverts
    // to gated-off only because the card that asked for a gate stored something
    // no version of this build wrote; a truthy string must never read as `true`.
    expect(options.confirm).toBe(false)
    expect(options.stateLabels).toEqual(SWITCH_OPTION_DEFAULTS.stateLabels)
    expect(options.showLastChanged).toBe(false)
    // ...while the key that did validate survives.
    expect(options.deviceClassIcon).toBe(false)
  })

  it('rejects unknown keys inside stateLabels rather than carrying them', () => {
    expect(readSwitchOptions({ stateLabels: { onLabel: 'On', extra: 'x' } }).stateLabels).toEqual(
      SWITCH_OPTION_DEFAULTS.stateLabels
    )
  })
})

describe('readCardConfirm', () => {
  it('answers the shell without it reading the rest of the card’s options', () => {
    expect(readCardConfirm({ confirm: true })).toBe(true)
    expect(readCardConfirm({ confirm: false })).toBe(false)
    expect(readCardConfirm(undefined)).toBe(false)
  })
})

describe('resolveSwitchStateLabel', () => {
  const labels = { onLabel: 'Brewing', offLabel: 'Idle' }

  it('remaps on and off', () => {
    expect(resolveSwitchStateLabel('on', labels)).toBe('Brewing')
    expect(resolveSwitchStateLabel('off', labels)).toBe('Idle')
  })

  it('leaves every other state raw', () => {
    // Including whatever a fallback domain reports — a label reading "Brewing"
    // on a siren that is `triggered` would be the card lying about the entity.
    expect(resolveSwitchStateLabel('unavailable', labels)).toBe('UNAVAILABLE')
    expect(resolveSwitchStateLabel('triggered', labels)).toBe('TRIGGERED')
    expect(resolveSwitchStateLabel('unknown', labels)).toBe('UNKNOWN')
  })

  it('falls through to the raw state for an empty label', () => {
    expect(resolveSwitchStateLabel('on', { onLabel: '', offLabel: 'Idle' })).toBe('ON')
    expect(resolveSwitchStateLabel('off', SWITCH_OPTION_DEFAULTS.stateLabels)).toBe('OFF')
  })
})
