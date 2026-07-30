import { describe, it, expect } from 'vitest'
import {
  configPredatesControlStyle,
  decimalsFor,
  quantizeHelperValue,
  CONTROL_STYLE_VERSION,
  pinLegacyControlStyle,
  readBooleanControlStyle,
  readNumberControlStyle,
  readSelectControlStyle,
  readSelectOptions,
  resolveNumberPresentation,
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

describe('resolveNumberPresentation', () => {
  it('renders the stepper on every tier that is wider than one column', () => {
    expect(resolveNumberPresentation('stepper', 'row')).toBe('stepper')
    expect(resolveNumberPresentation('stepper', 'full')).toBe('stepper')
    // `glance` carries no embedded control at all, so nothing is substituted
    // for the stepper there — the card declines to render one either way.
    expect(resolveNumberPresentation('stepper', 'glance')).toBe('stepper')
  })

  it('gives the stepper way to the vertical slider at tall', () => {
    // The one-column tier: a content-sized row of buttons cannot be taken down
    // to that tile's content region, so the tier's own vertical slider renders
    // instead (docs/specs/entity-cards/options/input-helpers.md).
    expect(resolveNumberPresentation('stepper', 'tall')).toBe('slider')
  })

  it('leaves a stored slider alone, tall included', () => {
    expect(resolveNumberPresentation('slider', 'tall')).toBe('slider')
    expect(resolveNumberPresentation('slider', 'row')).toBe('slider')
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

describe('decimalsFor', () => {
  it('reads the precision off the step, not off "is it fractional"', () => {
    // The old rule was `step < 1 ? 1 : 0`, which formatted every one of these
    // to a single place — so a helper stepping by 0.01 displayed a value it
    // would immediately round, and the readout disagreed with what could be set.
    expect(decimalsFor(1)).toBe(0)
    expect(decimalsFor(5)).toBe(0)
    expect(decimalsFor(0.5)).toBe(1)
    expect(decimalsFor(0.01)).toBe(2)
    expect(decimalsFor(0.001)).toBe(3)
    expect(decimalsFor(2.25)).toBe(2)
  })

  it('reads a step written in scientific notation', () => {
    // `1e-2` and `0.01` are the same number, and `String` renders both as
    // `0.01` — the literal form is not what decides this, the magnitude is.
    expect(decimalsFor(1e-2)).toBe(2)
    expect(decimalsFor(1e-3)).toBe(3)
    // Below 1e-6, `String` switches to exponent notation and the fraction
    // digits leave the text entirely; read off that text a 1e-7 step would
    // format as an integer.
    expect(decimalsFor(1e-7)).toBe(7)
    expect(decimalsFor(1.5e-7)).toBe(8)
    // A step large enough to render exponentially implies no decimals, and the
    // subtraction must not go negative.
    expect(decimalsFor(1e21)).toBe(0)
  })

  it('treats an absent, zero or non-finite step as whole numbers', () => {
    // All of these reach the card from a hand-edited helper, and all of them
    // mean the same as the `step || 1` the controls fall back to.
    expect(decimalsFor(undefined)).toBe(0)
    expect(decimalsFor(0)).toBe(0)
    expect(decimalsFor(Number.NaN)).toBe(0)
    expect(decimalsFor(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('stays within what toFixed accepts', () => {
    // `toFixed` throws a RangeError past 100 digits. `step: 1e-300` is absurd
    // and is also a number a YAML field can hold, so an unclamped count would
    // throw in the middle of a render rather than misformat.
    expect(decimalsFor(1e-300)).toBe(100)
    expect(() => (1.5).toFixed(decimalsFor(1e-300))).not.toThrow()
  })

  it('is negative-step safe', () => {
    // Not a step Home Assistant produces, but the sign says nothing about
    // precision and a leading `-` must not be counted as a digit.
    expect(decimalsFor(-0.25)).toBe(2)
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

  it('keeps a step finer than four decimals on its own grid', () => {
    // The tail-trimming used to round at a fixed four places, which doubled as
    // a precision ceiling by accident: a value snapped to a 1e-5 grid was
    // rounded straight back off it.
    expect(quantizeHelperValue(0.123456, { min: 0, max: 1, step: 0.00001 })).toBe(0.12346)
    // Every step of 0.0001 or coarser — which is all of them in practice —
    // trims exactly as it did before.
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
