import { describe, it, expect } from 'vitest'
import { readVacuumFeatures, VACUUM_ACTIVITY } from '../features'
import {
  areCommandsBlocked,
  hasRunControl,
  isDockDisabled,
  isVacuumActive,
  LOW_BATTERY_PERCENT,
  resolveVacuumBattery,
  resolveVacuumColor,
  resolveVacuumCommandButton,
  resolveVacuumPrimaryAction,
  resolveVacuumStateText,
  VACUUM_COMMAND_SERVICE,
} from '../presentation'

/**
 * The assertions below are written from
 * `docs/specs/entity-cards/options/vacuum.md` — its primary-action table, its
 * feature-gating GIVENs and its Commands rules — not from what the resolvers
 * return. Where the doc is silent (`paused` without `START`, a state outside
 * `VacuumActivity`) the expectation states the rule the doc's own reasoning
 * implies, and says so, rather than transcribing the branch that happens to
 * catch it (REVIEW.md — "Tests Pin Intent, Not Implementation").
 */

/** Masks by capability, as sums of the bits Home Assistant publishes. */
const MASK = {
  /** PAUSE | STOP | RETURN_HOME | FAN_SPEED | LOCATE | START — the full surface. */
  full: 4 | 8 | 16 | 32 | 512 | 8192,
  /** START | STOP — can be started and stopped, cannot pause. */
  noPause: 8192 | 8,
  /** START only. */
  startOnly: 8192,
  /** PAUSE only — can pause, cannot start. */
  pauseOnly: 4,
  /** RETURN_HOME only — no run control at all. */
  dockOnly: 16,
  /** Nothing at all. */
  none: 0,
} as const

const featuresOf = (mask: number) => readVacuumFeatures({ supported_features: mask })

/** The six activity states plus the two core ones the matrix covers. */
const EVERY_STATE = [...Object.values(VACUUM_ACTIVITY), 'unavailable', 'unknown'] as const

describe('resolveVacuumPrimaryAction', () => {
  /** The option doc's table, read straight off it, for a fully capable vacuum. */
  it.each([
    ['docked', 'start'],
    ['idle', 'start'],
    ['cleaning', 'pause'],
    ['paused', 'start'],
    ['returning', 'more-info'],
    ['error', 'more-info'],
  ] as const)('resolves %s to %s on a vacuum supporting everything', (state, expected) => {
    expect(resolveVacuumPrimaryAction(state, featuresOf(MASK.full))).toBe(expected)
  })

  /** Rung 1: nothing is commanded, however many bits are retained. */
  it.each(['unavailable', 'unknown'])('is inert in %s regardless of retained bits', (state) => {
    expect(resolveVacuumPrimaryAction(state, featuresOf(MASK.full))).toBe('none')
  })

  /*
   * The feature-gated fallthroughs, which the option doc spells out as GIVENs
   * and the change doc names as the part most likely to go wrong.
   */

  it('falls a cleaning vacuum without PAUSE through to stop when STOP is supported', () => {
    expect(resolveVacuumPrimaryAction('cleaning', featuresOf(MASK.noPause))).toBe('stop')
  })

  it('falls a cleaning vacuum with neither PAUSE nor STOP through to more-info', () => {
    expect(resolveVacuumPrimaryAction('cleaning', featuresOf(MASK.startOnly))).toBe('more-info')
  })

  it.each(['docked', 'idle'])('falls %s without START through to more-info', (state) => {
    expect(resolveVacuumPrimaryAction(state, featuresOf(MASK.pauseOnly))).toBe('more-info')
  })

  /**
   * The doc's GIVENs cover `cleaning` and `docked`/`idle` and leave `paused`
   * implicit. The general rule it states — "a state whose service the entity
   * does not support falls through" — plus the resume row (`paused` →
   * `vacuum.start`) gives only one answer: without `START` there is no resume,
   * so the tap inspects.
   */
  it('falls paused without START through to more-info, by the doc general rule', () => {
    expect(resolveVacuumPrimaryAction('paused', featuresOf(MASK.pauseOnly))).toBe('more-info')
  })

  /**
   * **No fallthrough may reach another state's command.** This is the property
   * that makes the chain safe rather than merely terminating: a `cleaning`
   * vacuum that cannot pause or stop must never resolve to `start`, which would
   * answer "stop please" by restarting the run.
   */
  it('never resolves a cleaning vacuum to start, whatever it fails to support', () => {
    for (const mask of Object.values(MASK)) {
      expect(resolveVacuumPrimaryAction('cleaning', featuresOf(mask))).not.toBe('start')
    }
  })

  /**
   * `VacuumActivity` belongs to Home Assistant, so a state outside it is a
   * question of when, not if — an upstream addition, or an integration
   * publishing its own. It must land on inspection, which commands nothing,
   * rather than on whichever branch is last.
   */
  it.each(['mowing', 'constructor', '__proto__', ''])(
    'resolves the unrecognised state %p to more-info',
    (state) => {
      expect(resolveVacuumPrimaryAction(state, featuresOf(MASK.full))).toBe('more-info')
    }
  )

  /** Total over every state × every capability shape: an answer always exists. */
  it('resolves to one of the four answers for every state and capability shape', () => {
    for (const state of EVERY_STATE) {
      for (const mask of Object.values(MASK)) {
        expect(['start', 'pause', 'stop', 'more-info', 'none']).toContain(
          resolveVacuumPrimaryAction(state, featuresOf(mask))
        )
      }
    }
  })

  /** Every command the machine can yield maps to a real vacuum service. */
  it('maps every command to its service', () => {
    expect(VACUUM_COMMAND_SERVICE).toEqual({ start: 'start', pause: 'pause', stop: 'stop' })
  })
})

describe('resolveVacuumCommandButton', () => {
  it.each([
    ['docked', 'start', 'Start'],
    ['idle', 'start', 'Start'],
    ['cleaning', 'pause', 'Pause'],
    ['paused', 'start', 'Resume'],
  ] as const)('drives %s to %s labelled %s', (state, command, label) => {
    expect(resolveVacuumCommandButton(state, featuresOf(MASK.full))).toMatchObject({
      command,
      label,
      disabled: false,
    })
  })

  /**
   * The one deliberate divergence from the tap, and the reason this is a
   * separate resolver: mid-return the *tap* inspects while the *button* offers
   * the explicit interruption.
   */
  it('offers Pause on the button while returning, where the tap opens details', () => {
    const features = featuresOf(MASK.full)

    expect(resolveVacuumCommandButton('returning', features)).toMatchObject({
      command: 'pause',
      label: 'Pause',
      disabled: false,
    })
    expect(resolveVacuumPrimaryAction('returning', features)).toBe('more-info')
  })

  it('disables the returning button when PAUSE is absent', () => {
    expect(resolveVacuumCommandButton('returning', featuresOf(MASK.startOnly))).toMatchObject({
      command: null,
      disabled: true,
    })
  })

  it('drives a cleaning vacuum without PAUSE to stop', () => {
    expect(resolveVacuumCommandButton('cleaning', featuresOf(MASK.noPause))).toMatchObject({
      command: 'stop',
      label: 'Stop',
      disabled: false,
    })
  })

  it('disables a cleaning vacuum with neither PAUSE nor STOP', () => {
    expect(resolveVacuumCommandButton('cleaning', featuresOf(MASK.startOnly))).toMatchObject({
      command: null,
      disabled: true,
    })
  })

  /**
   * "No physical command may dispatch from an indeterminate or failed state" —
   * the option doc puts `error` alongside the two unresponsive states, even
   * though the entity is actively reporting `error` and the tap still escalates
   * to `more-info`.
   */
  it.each(['unavailable', 'unknown', 'error'])('disables the button in %s', (state) => {
    expect(resolveVacuumCommandButton(state, featuresOf(MASK.full))).toMatchObject({
      command: null,
      disabled: true,
    })
  })

  it('disables a startable state when START is absent', () => {
    expect(resolveVacuumCommandButton('docked', featuresOf(MASK.dockOnly))).toMatchObject({
      command: null,
      disabled: true,
    })
  })

  /** A disabled button still names what it would do; it never goes blank. */
  it('always carries a label and a glyph, in every state and shape', () => {
    for (const state of EVERY_STATE) {
      for (const mask of Object.values(MASK)) {
        const button = resolveVacuumCommandButton(state, featuresOf(mask))

        expect(button.label).not.toBe('')
        expect(['play', 'pause', 'stop']).toContain(button.glyph)
        // A disabled button must never carry a command, or a caller that
        // ignored `disabled` would dispatch from a state that forbids it.
        if (button.disabled) expect(button.command).toBeNull()
      }
    }
  })

  /**
   * A state this build has never modelled must not get a live Start button. The
   * tap already routes an unrecognised state to `more-info`; a button that
   * dispatched `vacuum.start` from it would be the one control contradicting
   * that, and it would do so on the exact input nobody reasoned about.
   */
  it.each(['mowing', 'constructor', ''])(
    'disables the button in the unrecognised state %p rather than offering Start',
    (state) => {
      expect(resolveVacuumCommandButton(state, featuresOf(MASK.full))).toMatchObject({
        command: null,
        disabled: true,
      })
    }
  )
})

describe('hasRunControl', () => {
  it.each([
    ['START alone', MASK.startOnly, true],
    ['PAUSE alone', MASK.pauseOnly, true],
    ['STOP with START', MASK.noPause, true],
    ['RETURN_HOME alone', MASK.dockOnly, false],
    ['nothing', MASK.none, false],
  ] as const)('is %s → %s', (_label, mask, expected) => {
    expect(hasRunControl(featuresOf(mask))).toBe(expected)
  })
})

describe('isDockDisabled', () => {
  /** Nothing to return: it is already there, or already on its way. */
  it.each(['docked', 'returning'])('disables the dock button in %s', (state) => {
    expect(isDockDisabled(state)).toBe(true)
  })

  it.each(['unavailable', 'unknown', 'error'])('disables the dock button in %s too', (state) => {
    expect(isDockDisabled(state)).toBe(true)
  })

  it.each(['cleaning', 'idle', 'paused'])('leaves the dock button live in %s', (state) => {
    expect(isDockDisabled(state)).toBe(false)
  })
})

describe('areCommandsBlocked', () => {
  it.each(['unavailable', 'unknown', 'error'])('blocks commands in %s', (state) => {
    expect(areCommandsBlocked(state)).toBe(true)
  })

  it.each(['docked', 'idle', 'cleaning', 'paused', 'returning'])(
    'allows commands in %s',
    (state) => {
      expect(areCommandsBlocked(state)).toBe(false)
    }
  )
})

describe('resolveVacuumStateText', () => {
  it.each([
    ['docked', 'Docked'],
    ['idle', 'Idle'],
    ['cleaning', 'Cleaning'],
    ['paused', 'Paused'],
    ['returning', 'Returning'],
  ] as const)('labels %s as %s', (state, expected) => {
    expect(resolveVacuumStateText(state, {})).toBe(expected)
  })

  it('surfaces the error attribute as the state line', () => {
    expect(resolveVacuumStateText('error', { error: 'Main brush stuck' })).toBe('Main brush stuck')
  })

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['a number', 7],
    ['an object', { message: 'stuck' }],
  ])('falls back to Error when the error attribute is %s', (_label, error) => {
    expect(resolveVacuumStateText('error', { error })).toBe('Error')
  })

  it('falls back to Error for an entity with no attributes at all', () => {
    expect(resolveVacuumStateText('error', undefined)).toBe('Error')
  })

  /**
   * The `status` attribute is deliberately not consulted. `VacuumEntityFeature.
   * STATUS` is deprecated upstream and unsupported by `StateVacuumEntity`, so a
   * card reading it would be reading something modern integrations do not
   * publish — and the change doc's summary, which says the error state surfaces
   * `status`, is the document that is wrong here rather than the option doc.
   */
  it('ignores a status attribute even when the entity publishes one', () => {
    expect(resolveVacuumStateText('error', { status: 'Brush jam', error: undefined })).toBe('Error')
  })

  /**
   * The label table is keyed by the entity's state, so any string reaches it and
   * a plain object answers for its prototype. `constructor` would otherwise put
   * a function on the card — the third instance of this shape in the repo, after
   * the weather artwork map and the climate `hvacModeConfig`.
   */
  it.each(['constructor', '__proto__', 'toString'])(
    'prints the unrecognised state %p rather than a prototype member',
    (state) => {
      expect(resolveVacuumStateText(state, {})).toBe(state)
    }
  )

  it('prints an unrecognised state as published', () => {
    expect(resolveVacuumStateText('mowing', {})).toBe('mowing')
  })
})

describe('resolveVacuumBattery', () => {
  /**
   * Sensor first, attribute second — the option doc's order, and the one that
   * matters: `battery_level` stops working in Core 2026.8, so a resolver that
   * preferred it would go blank on migrated integrations.
   */
  it('prefers the battery sensor over the deprecated attribute', () => {
    expect(resolveVacuumBattery({ battery_level: 12 }, '87')).toEqual({ percent: 87, low: false })
  })

  it('falls back to the legacy attribute when no sensor is supplied', () => {
    expect(resolveVacuumBattery({ battery_level: 64 })).toEqual({ percent: 64, low: false })
  })

  it('reads a sensor state, which is always a string on the wire', () => {
    expect(resolveVacuumBattery(undefined, '5')).toEqual({ percent: 5, low: true })
  })

  /** The option doc's threshold, asserted on both sides of the boundary. */
  it.each([
    [0, true],
    [19, true],
    [19.6, false],
    [20, false],
    [21, false],
    [100, false],
  ])('marks %i%% low=%s', (raw, low) => {
    expect(resolveVacuumBattery(undefined, raw)).toEqual({ percent: Math.round(raw), low })
  })

  it('pins the threshold the doc names', () => {
    expect(LOW_BATTERY_PERCENT).toBe(20)
  })

  it('rounds a fractional reading to whole percent', () => {
    expect(resolveVacuumBattery(undefined, 86.4)).toEqual({ percent: 86, low: false })
  })

  /**
   * Nothing resolves rather than zero resolving. `Number(null)` is `0`, so a
   * resolver that coerced would report a vacuum with no battery source as flat —
   * which is a false alarm the amber emphasis would make loud.
   */
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '  '],
    ['not a number', 'unknown'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -1],
    ['over 100', 101],
    ['an object', {}],
    ['an array', [50]],
    ['a boolean', true],
  ])('resolves nothing when the reading is %s', (_label, raw) => {
    expect(resolveVacuumBattery({ battery_level: raw }, raw)).toBeUndefined()
  })

  it('resolves nothing for an entity with neither source', () => {
    expect(resolveVacuumBattery(undefined)).toBeUndefined()
    expect(resolveVacuumBattery({})).toBeUndefined()
  })
})

describe('resolveVacuumColor', () => {
  /** Alert overrides the domain colour — the option doc's error scenario. */
  it('renders error in alert, not the vacuum token', () => {
    expect(resolveVacuumColor('error')).toBe('alert')
  })

  it.each(['cleaning', 'returning'])('tints %s with the vacuum token', (state) => {
    expect(resolveVacuumColor(state)).toBe('vacuum')
  })

  it.each(['docked', 'idle', 'paused', 'unavailable', 'unknown', 'mowing'])(
    'leaves %s neutral',
    (state) => {
      expect(resolveVacuumColor(state)).toBe('default')
    }
  )
})

describe('isVacuumActive', () => {
  /** `returning` is active: the vacuum is moving, which is what the tint says. */
  it.each(['cleaning', 'returning'])('reads %s as active', (state) => {
    expect(isVacuumActive(state)).toBe(true)
  })

  it.each(['docked', 'idle', 'paused', 'error', 'unavailable', 'unknown'])(
    'reads %s as inactive',
    (state) => {
      expect(isVacuumActive(state)).toBe(false)
    }
  )
})
