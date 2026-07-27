import { describe, it, expect } from 'vitest'
import { HA_BRIGHTNESS_MAX, haBrightnessToPercent, percentToHaBrightness } from '../lightBrightness'

describe('percentToHaBrightness', () => {
  it('converts the UI scale onto Home Assistant’s', () => {
    expect(percentToHaBrightness(0)).toBe(0)
    expect(percentToHaBrightness(50)).toBe(128)
    expect(percentToHaBrightness(100)).toBe(HA_BRIGHTNESS_MAX)
  })

  it('never rounds a nonzero percentage down to zero', () => {
    // `light.turn_on` with `brightness: 0` turns the light OFF, so the bottom
    // of the slider's usable range must not silently become the off switch
    // (docs/specs/entity-cards/options/light.md — "Brightness"). Sub-half-step
    // percentages are what `Math.round` alone would collapse.
    expect(percentToHaBrightness(0.1)).toBe(1)
    expect(percentToHaBrightness(0.4)).toBe(1)
    expect(percentToHaBrightness(1)).toBe(3)
  })

  it('clamps a value from outside the UI scale', () => {
    // Preset percentages come out of a config file, so they are whatever was
    // typed there.
    expect(percentToHaBrightness(150)).toBe(HA_BRIGHTNESS_MAX)
    expect(percentToHaBrightness(-20)).toBe(0)
  })
})

describe('haBrightnessToPercent', () => {
  it('converts Home Assistant’s scale onto the UI’s', () => {
    expect(haBrightnessToPercent(0)).toBe(0)
    expect(haBrightnessToPercent(128)).toBe(50)
    expect(haBrightnessToPercent(HA_BRIGHTNESS_MAX)).toBe(100)
  })

  it('clamps an out-of-range attribute', () => {
    expect(haBrightnessToPercent(400)).toBe(100)
    expect(haBrightnessToPercent(-1)).toBe(0)
  })
})
