import { describe, it, expect } from 'vitest'
import { resolveSwitchIconName } from '../icon'

describe('resolveSwitchIconName', () => {
  it('derives the switch glyph from device_class', () => {
    expect(resolveSwitchIconName('switch', { device_class: 'outlet' }, true)).toBe('outlet')
    expect(resolveSwitchIconName('switch', { device_class: 'switch' }, true)).toBe('power')
  })

  it('falls back to the domain default with the option off', () => {
    // The option turns the lookup off; it does not turn the card generic.
    expect(resolveSwitchIconName('switch', { device_class: 'outlet' }, false)).toBe('power')
  })

  it('falls back to the domain default for an unknown or absent device_class', () => {
    expect(resolveSwitchIconName('switch', { device_class: 'something_new' }, true)).toBe('power')
    expect(resolveSwitchIconName('switch', {}, true)).toBe('power')
    expect(resolveSwitchIconName('switch', undefined, true)).toBe('power')
    expect(resolveSwitchIconName('switch', { device_class: 7 }, true)).toBe('power')
  })

  it('never consults device_class outside the switch domain', () => {
    // The fallback-safety rule: `device_class: outlet` means something else on
    // another domain, and this card cannot know what, so it must not map it.
    expect(resolveSwitchIconName('siren', { device_class: 'outlet' }, true)).toBe('generic')
    expect(resolveSwitchIconName('vacuum', { device_class: 'switch' }, true)).toBe('generic')
  })

  it('keeps the per-domain glyphs the card already had', () => {
    expect(resolveSwitchIconName('light', {}, true)).toBe('light')
    expect(resolveSwitchIconName('input_boolean', {}, true)).toBe('boolean')
    expect(resolveSwitchIconName('siren', {}, true)).toBe('generic')
  })
})
