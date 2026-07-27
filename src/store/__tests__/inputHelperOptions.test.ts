import { describe, it, expect } from 'vitest'
import {
  configPredatesControlStyle,
  quantizeHelperValue,
  CONTROL_STYLE_VERSION,
  pinLegacyControlStyle,
  readBooleanControlStyle,
  readNumberControlStyle,
  readSelectControlStyle,
  readSelectOptions,
  resolveSelectPresentation,
} from '../inputHelperOptions'

describe('readBooleanControlStyle', () => {
  it('defaults to the tile', () => {
    expect(readBooleanControlStyle(undefined)).toBe('tile')
    expect(readBooleanControlStyle({})).toBe('tile')
  })

  it('reads a stored style, and ignores one that is not its own', () => {
    expect(readBooleanControlStyle({ controlStyle: 'switch' })).toBe('switch')
    // `slider` belongs to the number helper; on a boolean it is not a value at
    // all, so the default stands rather than the card rendering nothing.
    expect(readBooleanControlStyle({ controlStyle: 'slider' })).toBe('tile')
    expect(readBooleanControlStyle({ controlStyle: 7 })).toBe('tile')
  })
})

describe('readNumberControlStyle', () => {
  it('follows the helper’s own mode when unset', () => {
    expect(readNumberControlStyle({}, 'slider')).toBe('slider')
    expect(readNumberControlStyle({}, 'box')).toBe('stepper')
    // An absent or unrecognised mode is a stepper: it is what the card has
    // always rendered, and the safer of the two to be wrong about.
    expect(readNumberControlStyle({}, undefined)).toBe('stepper')
    expect(readNumberControlStyle(undefined, 'nonsense')).toBe('stepper')
  })

  it('lets an explicit style override the entity in either direction', () => {
    expect(readNumberControlStyle({ controlStyle: 'stepper' }, 'slider')).toBe('stepper')
    expect(readNumberControlStyle({ controlStyle: 'slider' }, 'box')).toBe('slider')
  })
})

describe('readSelectControlStyle', () => {
  it('defaults to the dropdown', () => {
    expect(readSelectControlStyle({})).toBe('dropdown')
    expect(readSelectControlStyle({ controlStyle: 'pills' })).toBe('pills')
    expect(readSelectControlStyle({ controlStyle: 'tile' })).toBe('dropdown')
  })
})

describe('readSelectOptions', () => {
  it('reads the helper’s list', () => {
    expect(readSelectOptions({ options: ['Home', 'Away'] })).toEqual(['Home', 'Away'])
  })

  it('treats every shape a hand-edited helper can produce as no options', () => {
    expect(readSelectOptions(undefined)).toEqual([])
    expect(readSelectOptions({})).toEqual([])
    expect(readSelectOptions({ options: 'Home' })).toEqual([])
    expect(readSelectOptions({ options: null })).toEqual([])
    expect(readSelectOptions({ options: { a: 1 } })).toEqual([])
  })

  it('drops non-string members rather than rendering them', () => {
    expect(readSelectOptions({ options: ['Home', 3, null, 'Away'] })).toEqual(['Home', 'Away'])
  })
})

describe('resolveSelectPresentation', () => {
  it('leaves the dropdown alone everywhere', () => {
    expect(resolveSelectPresentation('dropdown', 'full', 2)).toBe('dropdown')
    expect(resolveSelectPresentation('dropdown', 'glance', 9)).toBe('dropdown')
  })

  it('renders pills only at full, and only up to five options', () => {
    expect(resolveSelectPresentation('pills', 'full', 4)).toBe('pills')
    expect(resolveSelectPresentation('pills', 'full', 5)).toBe('pills')
    expect(resolveSelectPresentation('pills', 'full', 6)).toBe('dropdown')
    expect(resolveSelectPresentation('pills', 'row', 4)).toBe('dropdown')
    expect(resolveSelectPresentation('pills', 'tall', 2)).toBe('dropdown')
    expect(resolveSelectPresentation('pills', 'glance', 1)).toBe('dropdown')
    // No options is not a pill group with nothing in it: it is the dropdown,
    // which renders disabled and says so.
    expect(resolveSelectPresentation('pills', 'full', 0)).toBe('dropdown')
  })
})

describe('configPredatesControlStyle', () => {
  it('recognises documents written before the option existed', () => {
    expect(configPredatesControlStyle('1.0.0')).toBe(true)
    expect(configPredatesControlStyle('0.9.0')).toBe(true)
  })

  it('recognises documents written since', () => {
    expect(configPredatesControlStyle(CONTROL_STYLE_VERSION)).toBe(false)
    expect(configPredatesControlStyle('1.2.0')).toBe(false)
    expect(configPredatesControlStyle('2.0.0')).toBe(false)
  })

  it('treats a missing or unreadable version as legacy', () => {
    // Pinning an old card to the control it already had is harmless; failing to
    // pin one silently changes how a placed card is operated.
    expect(configPredatesControlStyle(undefined)).toBe(true)
    expect(configPredatesControlStyle(null)).toBe(true)
    expect(configPredatesControlStyle('')).toBe(true)
    expect(configPredatesControlStyle('nonsense')).toBe(true)
    expect(configPredatesControlStyle(1.0)).toBe(true)
  })
})

describe('pinLegacyControlStyle', () => {
  it('pins the controls the two affected helpers were built with', () => {
    expect(pinLegacyControlStyle('input_boolean', {})).toEqual({ controlStyle: 'switch' })
    expect(pinLegacyControlStyle('input_number', {})).toEqual({ controlStyle: 'stepper' })
  })

  it('leaves everything else alone, by reference', () => {
    // `input_select`'s new default IS its current dropdown, so there is no
    // control surface to preserve.
    const select = { name: 'Mode' }
    expect(pinLegacyControlStyle('input_select', select)).toBe(select)

    const light = { showBrightnessSlider: false }
    expect(pinLegacyControlStyle('light', light)).toBe(light)
  })

  it('never overwrites a style the card already carries', () => {
    const configured = { controlStyle: 'tile' }
    expect(pinLegacyControlStyle('input_boolean', configured)).toBe(configured)
  })

  it('keeps every other key, including ones this build does not know', () => {
    expect(pinLegacyControlStyle('input_number', { name: 'Volume', futureKey: 1 })).toEqual({
      name: 'Volume',
      futureKey: 1,
      controlStyle: 'stepper',
    })
  })
})

describe('quantizeHelperValue', () => {
  it('snaps to the helper’s step, measured from its minimum', () => {
    expect(quantizeHelperValue(62, { min: 0, max: 100, step: 5 })).toBe(60)
    // The grid starts at `min`, so an offset minimum shifts every landing point.
    expect(quantizeHelperValue(62, { min: 1, max: 100, step: 5 })).toBe(61)
  })

  it('keeps a fractional step free of binary-float tails', () => {
    expect(quantizeHelperValue(20.3, { min: 0, max: 30, step: 0.1 })).toBe(20.3)
    expect(quantizeHelperValue(0.30000000000000004, { min: 0, max: 1, step: 0.1 })).toBe(0.3)
  })

  it('clamps to each bound', () => {
    expect(quantizeHelperValue(140, { min: 0, max: 100, step: 5 })).toBe(100)
    expect(quantizeHelperValue(-20, { min: 0, max: 100, step: 5 })).toBe(0)
  })

  it('constrains nothing a helper does not publish', () => {
    // A hand-edited helper may carry no bounds at all.
    expect(quantizeHelperValue(62.5, {})).toBe(62.5)
    expect(quantizeHelperValue(62.5, { step: 0 })).toBe(62.5)
    expect(quantizeHelperValue(140, { min: 0 })).toBe(140)
    expect(quantizeHelperValue(-20, { max: 100 })).toBe(-20)
  })
})
