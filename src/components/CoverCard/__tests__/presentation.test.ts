import { describe, it, expect } from 'vitest'
import {
  COVER_DEVICE_CLASS_GLYPHS,
  COVER_FEATURE,
  GENERIC_COVER_GLYPHS,
  classifyCoverRoute,
  coverGateApplies,
  coverSupportsPosition,
  coverSupportsTilt,
  readCoverDeviceClass,
  readCoverPosition,
  readCoverTiltPosition,
  readSupportedFeatures,
  requiresCoverConfirmation,
  resolveCoverPresentation,
  toEffectivePosition,
  toRawPosition,
  type CoverAttributes,
  type CoverRouteContext,
} from '../presentation'
import { COVER_OPTION_DEFAULTS, type CoverOptions } from '~/store/coverOptions'

const options = (overrides: Partial<CoverOptions> = {}): CoverOptions => ({
  ...COVER_OPTION_DEFAULTS,
  ...overrides,
})

const present = (
  state: string,
  attributes: CoverAttributes | undefined,
  overrides: Partial<CoverOptions> = {}
) => resolveCoverPresentation({ state, attributes, options: options(overrides) })

/**
 * The shapes an attribute can actually arrive in.
 *
 * Every defect this project has shipped in a card has been a missing *case*,
 * not a missing branch, so these enumerate what a template sensor, a REST
 * integration or a half-loaded entity can put on the wire rather than what a
 * well-behaved cover publishes.
 */
describe('attribute shapes', () => {
  describe('readCoverPosition', () => {
    it('reads `current_position`, then falls back to `position`', () => {
      expect(readCoverPosition({ current_position: 40, position: 90 })).toBe(40)
      expect(readCoverPosition({ position: 90 })).toBe(90)
    })

    it('answers nothing for a cover that reports no usable position', () => {
      expect(readCoverPosition(undefined)).toBeUndefined()
      expect(readCoverPosition({})).toBeUndefined()
      expect(readCoverPosition({ current_position: null })).toBeUndefined()
      expect(readCoverPosition({ current_position: 'open' })).toBeUndefined()
      expect(readCoverPosition({ current_position: NaN })).toBeUndefined()
      expect(readCoverPosition({ current_position: Infinity })).toBeUndefined()
    })

    it('falls through to `position` when `current_position` is unusable', () => {
      expect(readCoverPosition({ current_position: 'n/a', position: 25 })).toBe(25)
    })

    it('clamps out-of-range values and rounds fractional ones', () => {
      // Radix positions the thumb from `value / max`, the readout interpolates
      // the number into text, and the disable rule compares it to 0 and 100 —
      // none of the three survives `-5`, `150` or `33.333`.
      expect(readCoverPosition({ current_position: -5 })).toBe(0)
      expect(readCoverPosition({ current_position: 150 })).toBe(100)
      expect(readCoverPosition({ current_position: 33.333 })).toBe(33)
      expect(readCoverPosition({ current_position: 0.4 })).toBe(0)
    })
  })

  describe('readCoverTiltPosition', () => {
    it('reads `current_tilt_position` with the `tilt_position` fallback', () => {
      expect(readCoverTiltPosition({ current_tilt_position: 10, tilt_position: 80 })).toBe(10)
      expect(readCoverTiltPosition({ tilt_position: 80 })).toBe(80)
      expect(readCoverTiltPosition({ current_tilt_position: '80' })).toBeUndefined()
      expect(readCoverTiltPosition(undefined)).toBeUndefined()
    })
  })

  describe('readSupportedFeatures', () => {
    it('reads a numeric mask and truncates a fractional one', () => {
      expect(readSupportedFeatures({ supported_features: 255 })).toBe(255)
      expect(readSupportedFeatures({ supported_features: 3.7 })).toBe(3)
    })

    it('advertises nothing for an absent or non-numeric mask', () => {
      // `"255" & 1` is `1` in JavaScript, so a coercing read would hand a full
      // feature set to an entity whose `supported_features` is a string.
      expect(readSupportedFeatures(undefined)).toBe(0)
      expect(readSupportedFeatures({})).toBe(0)
      expect(readSupportedFeatures({ supported_features: '255' })).toBe(0)
      expect(readSupportedFeatures({ supported_features: null })).toBe(0)
      expect(readSupportedFeatures({ supported_features: NaN })).toBe(0)
    })
  })

  describe('readCoverDeviceClass', () => {
    it('takes a non-empty string and nothing else', () => {
      expect(readCoverDeviceClass({ device_class: 'garage' })).toBe('garage')
      expect(readCoverDeviceClass({ device_class: '' })).toBeUndefined()
      expect(readCoverDeviceClass({ device_class: 4 })).toBeUndefined()
      expect(readCoverDeviceClass(undefined)).toBeUndefined()
    })
  })
})

describe('feature bit matrix', () => {
  it('names Home Assistant’s CoverEntityFeature bits', () => {
    expect(COVER_FEATURE).toEqual({
      OPEN: 1,
      CLOSE: 2,
      SET_POSITION: 4,
      STOP: 8,
      OPEN_TILT: 16,
      CLOSE_TILT: 32,
      STOP_TILT: 64,
      SET_TILT_POSITION: 128,
    })
  })

  it('gates the position slider on bit 4 alone', () => {
    expect(coverSupportsPosition({ supported_features: 4 })).toBe(true)
    expect(coverSupportsPosition({ supported_features: 11 })).toBe(false)
    expect(coverSupportsPosition(undefined)).toBe(false)
  })

  it('gates tilt on any tilt bit, stop-tilt included', () => {
    for (const bit of [16, 32, 64, 128]) {
      expect(coverSupportsTilt({ supported_features: bit })).toBe(true)
    }
    // Open + close + set-position + stop: no tilt at all.
    expect(coverSupportsTilt({ supported_features: 15 })).toBe(false)
  })
})

describe('position inversion', () => {
  it('is the identity when the option is off', () => {
    expect(toEffectivePosition(30, false)).toBe(30)
    expect(toRawPosition(30, false)).toBe(30)
  })

  it('is symmetric: converting both ways returns the original', () => {
    for (const value of [0, 1, 30, 50, 70, 99, 100]) {
      expect(toRawPosition(toEffectivePosition(value, true), true)).toBe(value)
      expect(toEffectivePosition(toRawPosition(value, true), true)).toBe(value)
    }
  })

  it('maps the extremes across', () => {
    expect(toEffectivePosition(0, true)).toBe(100)
    expect(toEffectivePosition(100, true)).toBe(0)
    // The scenario's wire payload: effective 100 leaves as `{ position: 0 }`.
    expect(toRawPosition(100, true)).toBe(0)
  })
})

describe('resolveCoverPresentation', () => {
  describe('state derivation', () => {
    it('reports the movement states as themselves', () => {
      expect(present('opening', { current_position: 35 }).state).toBe('opening')
      expect(present('closing', { current_position: 35 }).isMoving).toBe(true)
      expect(present('opening', { current_position: 35 }).label).toBe('OPENING')
    })

    it('reports an unknown cover as unknown rather than closed', () => {
      const result = present('unknown', { supported_features: 3 })
      expect(result.state).toBe('unknown')
      expect(result.isIndeterminate).toBe(true)
      expect(result.label).toBe('UNKNOWN')
    })

    it('lets the position decide wherever there is one', () => {
      expect(present('closed', { current_position: 60 }).state).toBe('open')
      expect(present('open', { current_position: 0 }).state).toBe('closed')
    })

    it('falls back to the reported state for a cover with no position', () => {
      expect(present('open', { supported_features: 3 }).state).toBe('open')
      expect(present('closed', { supported_features: 3 }).state).toBe('closed')
      // An unrecognised state is passed through rather than invented.
      expect(present('jammed', { supported_features: 3 }).label).toBe('JAMMED')
    })
  })

  describe('button disabling', () => {
    it('uses the position alone when the entity reports one', () => {
      const partly = present('open', { current_position: 60 })
      expect(partly.isFullyOpen).toBe(false)
      expect(partly.isFullyClosed).toBe(false)

      expect(present('open', { current_position: 100 }).isFullyOpen).toBe(true)
      expect(present('closed', { current_position: 0 }).isFullyClosed).toBe(true)
    })

    it('uses the state for a cover with no position at all', () => {
      expect(present('open', { supported_features: 3 }).isFullyOpen).toBe(true)
      expect(present('closed', { supported_features: 3 }).isFullyClosed).toBe(true)
    })

    it('follows the effective position when the scale is inverted', () => {
      // Raw 0 is fully open on a reversed integration, so Open is what is held
      // back — and it agrees with the 100% the user is reading.
      const inverted = present('closed', { current_position: 0 }, { invertPosition: true })
      expect(inverted.effectivePosition).toBe(100)
      expect(inverted.isFullyOpen).toBe(true)
      expect(inverted.isFullyClosed).toBe(false)
      expect(inverted.label).toBe('OPEN')
    })
  })

  describe('state labels', () => {
    it('derives `percent` for a positional cover', () => {
      const result = present('open', { current_position: 72 })
      expect(result.labelStyle).toBe('percent')
      expect(result.label).toBe('72% OPEN')
    })

    it('derives `percent` from the set-position bit even before a position arrives', () => {
      expect(present('open', { supported_features: COVER_FEATURE.SET_POSITION }).labelStyle).toBe(
        'percent'
      )
    })

    it('derives `open-closed` for a binary cover', () => {
      const result = present('open', { supported_features: 3 })
      expect(result.labelStyle).toBe('open-closed')
      expect(result.label).toBe('OPEN')
    })

    it('reads the extremes as words even in the percent style', () => {
      expect(present('open', { current_position: 100 }).label).toBe('OPEN')
      expect(present('closed', { current_position: 0 }).label).toBe('CLOSED')
    })

    it('never prints a percentage in the `open-closed` style', () => {
      expect(
        present('open', { current_position: 43 }, { stateLabelStyle: 'open-closed' }).label
      ).toBe('OPEN')
    })

    it('is inert-safe: `percent` on a binary cover falls back to the words', () => {
      const result = present('open', { supported_features: 3 }, { stateLabelStyle: 'percent' })
      expect(result.labelStyle).toBe('percent')
      expect(result.label).toBe('OPEN')
    })

    it('shows the inverted value in the percent style', () => {
      expect(present('open', { current_position: 30 }, { invertPosition: true }).label).toBe(
        '70% OPEN'
      )
    })

    it('still reads the movement states while moving, in either style', () => {
      for (const stateLabelStyle of ['percent', 'open-closed'] as const) {
        expect(present('closing', { current_position: 40 }, { stateLabelStyle }).label).toBe(
          'CLOSING'
        )
      }
    })
  })

  describe('tint', () => {
    it('resolves the cool triplet for an open or moving cover, and nothing for a closed one', () => {
      expect(present('open', { current_position: 60 }).color).toBe('cool')
      expect(present('opening', { current_position: 0 }).color).toBe('cool')
      expect(present('closed', { current_position: 0 }).color).toBe('default')
      expect(present('closed', { current_position: 0 }).isActive).toBe(false)
    })
  })

  describe('device-class glyphs', () => {
    it('picks the class pair and follows the state', () => {
      const closed = present('closed', { device_class: 'garage', supported_features: 3 })
      const open = present('open', { device_class: 'garage', supported_features: 3 })

      expect(closed.icon).toBe(COVER_DEVICE_CLASS_GLYPHS.garage.closed)
      expect(open.icon).toBe(COVER_DEVICE_CLASS_GLYPHS.garage.open)
    })

    it('gives a moving cover the open variant', () => {
      expect(present('closing', { device_class: 'garage', supported_features: 3 }).icon).toBe(
        COVER_DEVICE_CLASS_GLYPHS.garage.open
      )
    })

    it('falls back to the generic pair for an unmapped or absent class', () => {
      expect(present('open', { device_class: 'hatch', supported_features: 3 }).icon).toBe(
        GENERIC_COVER_GLYPHS.open
      )
      expect(present('closed', { supported_features: 3 }).icon).toBe(GENERIC_COVER_GLYPHS.closed)
    })

    it('falls back for a device class that names something off Object.prototype', () => {
      // `device_class` is free text on the wire, and a bare index into the
      // table would answer `constructor` with a function — which the card would
      // then try to render as a glyph.
      for (const deviceClass of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        expect(present('open', { device_class: deviceClass, supported_features: 3 }).icon).toBe(
          GENERIC_COVER_GLYPHS.open
        )
      }
    })

    it('uses the generic pair for every class when the option is off', () => {
      const result = present(
        'closed',
        { device_class: 'garage', supported_features: 3 },
        { deviceClassIcon: false }
      )
      expect(result.icon).toBe(GENERIC_COVER_GLYPHS.closed)
    })

    it('gives every mapped class a distinct pair', () => {
      const glyphs = Object.values(COVER_DEVICE_CLASS_GLYPHS).flatMap((pair) => [
        pair.open,
        pair.closed,
      ])
      expect(
        new Set([...glyphs, GENERIC_COVER_GLYPHS.open, GENERIC_COVER_GLYPHS.closed]).size
      ).toBe(glyphs.length + 2)
    })

    it('covers every device class the option doc names', () => {
      for (const deviceClass of [
        'garage',
        'gate',
        'door',
        'window',
        'blind',
        'shade',
        'curtain',
        'shutter',
        'awning',
      ]) {
        expect(COVER_DEVICE_CLASS_GLYPHS[deviceClass]).toBeDefined()
      }
    })
  })
})

/**
 * The `confirmOpen` gate, classified by *effect* rather than by service name
 * (docs/specs/entity-cards/options/cover.md — `confirmOpen`).
 */
describe('classifyCoverRoute', () => {
  const entityId = 'cover.garage'

  const context = (overrides: Partial<CoverRouteContext> = {}): CoverRouteContext => ({
    entityId,
    isIndeterminate: false,
    effectivePosition: 0,
    invertPosition: false,
    ...overrides,
  })

  const callService = (service: string, data?: Record<string, unknown>) =>
    ({ action: 'call-service', service, data }) as const

  it('gates the cover’s own open service', () => {
    expect(classifyCoverRoute(callService('cover.open_cover'), context())).toBe('opening')
  })

  it('gates the generic aliases', () => {
    // An enumeration of `cover.*` would leave these open, which is the bypass
    // the option doc calls out by name.
    expect(classifyCoverRoute(callService('homeassistant.turn_on'), context())).toBe('opening')
    expect(classifyCoverRoute(callService('cover.turn_on'), context())).toBe('opening')
  })

  it('leaves closing and stopping ungated', () => {
    for (const service of [
      'cover.close_cover',
      'cover.stop_cover',
      'homeassistant.turn_off',
      'cover.open_cover_tilt',
      'cover.set_cover_tilt_position',
    ]) {
      expect(classifyCoverRoute(callService(service), context())).toBe('not-opening')
    }
  })

  it('leaves every non-actuating action ungated', () => {
    expect(classifyCoverRoute('more-info', context())).toBe('not-opening')
    expect(classifyCoverRoute('none', context())).toBe('not-opening')
    expect(classifyCoverRoute({ action: 'navigate', target: 'hall' }, context())).toBe(
      'not-opening'
    )
  })

  it('ignores a service aimed at another entity', () => {
    expect(
      classifyCoverRoute(callService('cover.open_cover', { entity_id: 'cover.other' }), context())
    ).toBe('not-opening')
  })

  it('gates a service that reaches this entity inside a list', () => {
    // `buildServiceData` spreads `data`, so any shape naming this entity
    // dispatches at it — the hole a string-only reading leaves.
    expect(
      classifyCoverRoute(
        callService('cover.open_cover', { entity_id: ['cover.other', entityId] }),
        context()
      )
    ).toBe('opening')
  })

  describe('toggle', () => {
    it('opens from fully closed and closes from anywhere else', () => {
      expect(classifyCoverRoute('toggle', context({ effectivePosition: 0 }))).toBe('opening')
      expect(classifyCoverRoute('toggle', context({ effectivePosition: 60 }))).toBe('not-opening')
      expect(classifyCoverRoute('toggle', context({ effectivePosition: 100 }))).toBe('not-opening')
    })

    it('classifies the generic toggle alias the same way', () => {
      expect(classifyCoverRoute(callService('homeassistant.toggle'), context())).toBe('opening')
      expect(
        classifyCoverRoute(callService('cover.toggle'), context({ effectivePosition: 60 }))
      ).toBe('not-opening')
    })

    it('cannot be classified with no position to compare against', () => {
      expect(classifyCoverRoute('toggle', context({ effectivePosition: undefined }))).toBe(
        'unclassifiable'
      )
    })

    it('cannot be classified on a reversed scale', () => {
      // Home Assistant decides a toggle's direction from the raw position the
      // user is not looking at, so the card cannot predict which way it goes.
      expect(classifyCoverRoute('toggle', context({ invertPosition: true }))).toBe('unclassifiable')
    })

    it('cannot be classified while the state is indeterminate', () => {
      expect(classifyCoverRoute('toggle', context({ isIndeterminate: true }))).toBe(
        'unclassifiable'
      )
      expect(
        classifyCoverRoute(callService('cover.toggle'), context({ isIndeterminate: true }))
      ).toBe('unclassifiable')
    })
  })

  describe('set_cover_position', () => {
    it('gates a commit to a wider opening and lets a narrower one through', () => {
      const at40 = context({ effectivePosition: 40 })
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: 80 }), at40)
      ).toBe('opening')
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: 10 }), at40)
      ).toBe('not-opening')
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: 40 }), at40)
      ).toBe('not-opening')
    })

    it('compares in the effective scale when the entity’s is reversed', () => {
      // Raw 10 is 90% open; the cover currently sits at effective 40.
      const inverted = context({ effectivePosition: 40, invertPosition: true })
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: 10 }), inverted)
      ).toBe('opening')
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: 90 }), inverted)
      ).toBe('not-opening')
    })

    it('cannot be classified without a current position or a usable target', () => {
      expect(
        classifyCoverRoute(
          callService('cover.set_cover_position', { position: 80 }),
          context({ effectivePosition: undefined })
        )
      ).toBe('unclassifiable')
      expect(classifyCoverRoute(callService('cover.set_cover_position'), context())).toBe(
        'unclassifiable'
      )
      expect(
        classifyCoverRoute(callService('cover.set_cover_position', { position: '80' }), context())
      ).toBe('unclassifiable')
    })

    it('cannot be classified while the state is indeterminate', () => {
      expect(
        classifyCoverRoute(
          callService('cover.set_cover_position', { position: 80 }),
          context({ isIndeterminate: true })
        )
      ).toBe('unclassifiable')
    })
  })

  it('holds everything it cannot classify, and only lets `not-opening` through', () => {
    expect(requiresCoverConfirmation('opening')).toBe(true)
    expect(requiresCoverConfirmation('unclassifiable')).toBe(true)
    expect(requiresCoverConfirmation('not-opening')).toBe(false)
  })
})

describe('coverGateApplies', () => {
  it('needs both the option and a perimeter device class', () => {
    expect(coverGateApplies('garage', options())).toBe(true)
    expect(coverGateApplies('garage', options({ confirmOpen: false }))).toBe(false)
    // The device class is the half that cannot be configured on: a stray
    // `confirmOpen` in a blind's config must not put a dialog on its slider.
    expect(coverGateApplies('blind', options())).toBe(false)
    expect(coverGateApplies(undefined, options())).toBe(false)
  })
})
