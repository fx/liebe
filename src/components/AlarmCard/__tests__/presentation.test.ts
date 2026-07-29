import { describe, it, expect } from 'vitest'
import {
  ALARM_FEATURE,
  ALARM_STATE,
  classifyAlarmRoute,
  codeRequiredToArm,
  codeRequiredToDisarm,
  keypadFormat,
  keypadShownFor,
  readAlarmFeatures,
  readCodeFormat,
  requiresAlarmConfirmation,
  resolveAlarmPresentation,
  resolveArmModes,
  type AlarmAttributes,
  type AlarmRouteDirection,
} from '../presentation'
import { ALARM_OPTION_DEFAULTS } from '~/store/alarmOptions'
import type { ResolvedCardAction } from '~/store/cardActions'

const ENTITY_ID = 'alarm_control_panel.house'

const bothGates = { confirmArm: true, confirmDisarm: true }
const neitherGate = { confirmArm: false, confirmDisarm: false }

/** Everything except TRIGGER — what a fully capable panel advertises. */
const ALL_ARM_BITS =
  ALARM_FEATURE.ARM_HOME |
  ALARM_FEATURE.ARM_AWAY |
  ALARM_FEATURE.ARM_NIGHT |
  ALARM_FEATURE.ARM_VACATION

describe('the feature bits', () => {
  it('match Home Assistant, including the one that is easy to guess wrong', () => {
    // TRIGGER takes 8, so ARM_VACATION is 32 — not the 8 a reasonable person
    // would assume from the order the modes are usually listed in.
    expect(ALARM_FEATURE).toEqual({
      ARM_HOME: 1,
      ARM_AWAY: 2,
      ARM_NIGHT: 4,
      TRIGGER: 8,
      ARM_CUSTOM_BYPASS: 16,
      ARM_VACATION: 32,
    })
  })

  it.each([
    [undefined, 0],
    ['63', 0],
    [null, 0],
    [Number.NaN, 0],
    [63, 63],
    [63.7, 63],
  ])('reads %j as %i', (raw, expected) => {
    expect(readAlarmFeatures({ supported_features: raw } as AlarmAttributes)).toBe(expected)
  })
})

describe('resolveAlarmPresentation', () => {
  it.each([
    [ALARM_STATE.DISARMED, 'Disarmed', 'default', false],
    [ALARM_STATE.ARMED_HOME, 'Armed home', 'ok', true],
    [ALARM_STATE.ARMED_AWAY, 'Armed away', 'ok', true],
    [ALARM_STATE.ARMED_NIGHT, 'Armed night', 'ok', true],
    [ALARM_STATE.ARMED_VACATION, 'Armed vacation', 'ok', true],
    [ALARM_STATE.ARMED_CUSTOM_BYPASS, 'Armed custom bypass', 'ok', true],
    [ALARM_STATE.ARMING, 'Arming…', 'light', true],
    [ALARM_STATE.PENDING, 'Pending…', 'light', true],
    [ALARM_STATE.DISARMING, 'Disarming…', 'ok', true],
    [ALARM_STATE.TRIGGERED, 'TRIGGERED', 'alert', true],
  ])('renders %s as "%s" in %s', (state, label, color, isActive) => {
    const presentation = resolveAlarmPresentation({ state })

    expect(presentation.label).toBe(label)
    expect(presentation.color).toBe(color)
    expect(presentation.isActive).toBe(isActive)
    expect(presentation.isIndeterminate).toBe(false)
  })

  it('marks only triggered as a danger state', () => {
    for (const state of Object.values(ALARM_STATE)) {
      expect(resolveAlarmPresentation({ state }).isDanger).toBe(state === ALARM_STATE.TRIGGERED)
    }
  })

  it('marks arming and pending as the countdown', () => {
    const countdown = Object.values(ALARM_STATE).filter(
      (state) => resolveAlarmPresentation({ state }).isCountdown
    )

    expect(countdown).toEqual([ALARM_STATE.PENDING, ALARM_STATE.ARMING])
  })

  /*
   * The control model, which is the safety-critical part.
   *
   * Arm pills exist ONLY while disarmed; Disarm exists in every other state.
   * Disarm stays ENABLED through arming and pending — the exit countdown is
   * exactly when someone needs to stop it — and disables only during
   * `disarming`, its own command already in flight.
   */
  it.each([
    [ALARM_STATE.DISARMED, true, false, false],
    [ALARM_STATE.ARMED_AWAY, false, true, true],
    [ALARM_STATE.ARMED_HOME, false, true, true],
    [ALARM_STATE.ARMING, false, true, true],
    [ALARM_STATE.PENDING, false, true, true],
    [ALARM_STATE.TRIGGERED, false, true, true],
    [ALARM_STATE.DISARMING, false, true, false],
    // Indeterminate renders BOTH, and both disabled — the spec asks for
    // controls that are visibly unusable rather than controls that vanish.
    ['unavailable', true, true, false],
    ['unknown', true, true, false],
  ])('in %s: armPills=%s disarm=%s canDisarm=%s', (state, showArmPills, showDisarm, canDisarm) => {
    const presentation = resolveAlarmPresentation({ state })

    expect(presentation.showArmPills).toBe(showArmPills)
    expect(presentation.showDisarm).toBe(showDisarm)
    expect(presentation.canDisarm).toBe(canDisarm)
  })

  it('keeps Disarm live through the whole exit countdown', () => {
    // Stated on its own because it is the requirement a blanket `busy` flag
    // would break, and the change doc calls it out twice.
    for (const state of [ALARM_STATE.ARMING, ALARM_STATE.PENDING]) {
      expect(resolveAlarmPresentation({ state }).canDisarm).toBe(true)
    }
  })

  it.each(['unavailable', 'unknown', '', 'ARMED_AWAY', 'armed', 'constructor'])(
    'treats %j as indeterminate rather than guessing',
    (state) => {
      const presentation = resolveAlarmPresentation({ state })

      expect(presentation.isIndeterminate).toBe(true)
      // Rendered but inert: what matters is that neither can fire.
      expect(presentation.canDisarm).toBe(false)
      expect(presentation.canArm).toBe(false)
    }
  )

  it('never classifies an indeterminate panel as merely non-disarmed', () => {
    // The naive `state !== 'disarmed'` reading would offer a live Disarm
    // against a panel whose state the card does not know.
    const unavailable = resolveAlarmPresentation({ state: 'unavailable' })

    expect(unavailable.canDisarm).toBe(false)
  })
})

describe('resolveArmModes', () => {
  const withFeatures = (features: number) => ({ supported_features: features }) as AlarmAttributes

  it('offers every supported mode in the default order when nothing is stored', () => {
    expect(resolveArmModes(withFeatures(ALL_ARM_BITS), undefined)).toEqual([
      'away',
      'home',
      'night',
      'vacation',
    ])
  })

  it('offers only the modes the panel advertises', () => {
    expect(
      resolveArmModes(withFeatures(ALARM_FEATURE.ARM_HOME | ALARM_FEATURE.ARM_AWAY), undefined)
    ).toEqual(['away', 'home'])
  })

  it('keeps the stored order', () => {
    expect(resolveArmModes(withFeatures(ALL_ARM_BITS), ['night', 'away'])).toEqual([
      'night',
      'away',
    ])
  })

  it('drops a stored mode the panel does not support', () => {
    // The exported-dashboard case: configuration can never create capability.
    expect(
      resolveArmModes(withFeatures(ALARM_FEATURE.ARM_AWAY), ['vacation', 'away', 'night'])
    ).toEqual(['away'])
  })

  it('distinguishes an empty stored list from nothing stored', () => {
    // `[]` is a user who hid every mode; `undefined` is a card nobody has
    // configured, which shows everything.
    expect(resolveArmModes(withFeatures(ALL_ARM_BITS), [])).toEqual([])
    expect(resolveArmModes(withFeatures(ALL_ARM_BITS), undefined)).toHaveLength(4)
  })

  it('offers nothing for a panel advertising no arm bits', () => {
    // TRIGGER alone is not an arm mode.
    expect(resolveArmModes(withFeatures(ALARM_FEATURE.TRIGGER), undefined)).toEqual([])
    expect(resolveArmModes(undefined, undefined)).toEqual([])
  })
})

describe('the code requirements', () => {
  it.each([
    ['number', 'number'],
    ['text', 'text'],
    [null, undefined],
    [undefined, undefined],
    ['', undefined],
    ['^\\d{4}$', undefined],
    [4, undefined],
  ])('reads code_format %j as %j', (raw, expected) => {
    expect(readCodeFormat({ code_format: raw } as AlarmAttributes)).toBe(expected)
  })

  it('needs a code to disarm exactly when the panel publishes a format', () => {
    expect(codeRequiredToDisarm({ code_format: 'number' } as AlarmAttributes)).toBe(true)
    expect(codeRequiredToDisarm({ code_format: null } as AlarmAttributes)).toBe(false)
    expect(codeRequiredToDisarm(undefined)).toBe(false)
  })

  it('needs BOTH a format and code_arm_required to demand a code for arming', () => {
    expect(
      codeRequiredToArm({ code_format: 'number', code_arm_required: true } as AlarmAttributes)
    ).toBe(true)
    expect(
      codeRequiredToArm({ code_format: 'number', code_arm_required: false } as AlarmAttributes)
    ).toBe(false)
  })

  it('never demands an arming code from a panel that has no code at all', () => {
    /*
     * The trap: HA's `_attr_code_arm_required` defaults to `True`, and
     * `state_attributes` publishes it unconditionally — so a codeless panel
     * reports `code_arm_required: true` alongside `code_format: null`. Reading
     * that flag alone would open a keypad on a panel with no code, making it
     * impossible to arm.
     */
    expect(
      codeRequiredToArm({ code_format: null, code_arm_required: true } as AlarmAttributes)
    ).toBe(false)
  })

  it('leaves the panel default standing when code_arm_required is unreadable', () => {
    // Only an explicit `false` waives it.
    expect(codeRequiredToArm({ code_format: 'number' } as AlarmAttributes)).toBe(true)
    expect(
      codeRequiredToArm({ code_format: 'number', code_arm_required: 'no' } as AlarmAttributes)
    ).toBe(true)
  })
})

describe('keypadShownFor', () => {
  it.each([
    ['auto', true, true],
    ['auto', false, false],
    ['always', true, true],
    ['always', false, true],
    ['never', true, false],
    ['never', false, false],
  ] as const)('%s with codeRequired=%s shows %s', (showKeypad, codeRequired, shown) => {
    expect(keypadShownFor(showKeypad, codeRequired)).toBe(shown)
  })
})

describe('keypadFormat', () => {
  it('follows the panel', () => {
    expect(keypadFormat({ code_format: 'text' } as AlarmAttributes)).toBe('text')
    expect(keypadFormat({ code_format: 'number' } as AlarmAttributes)).toBe('number')
  })

  it('defaults a codeless panel to the digit pad', () => {
    // Reachable through `showKeypad: always`. Alarm codes are overwhelmingly
    // numeric, and the spec asks for a deterministic choice rather than none.
    expect(keypadFormat({ code_format: null } as AlarmAttributes)).toBe('number')
    expect(keypadFormat(undefined)).toBe('number')
  })
})

describe('classifyAlarmRoute', () => {
  const classify = (action: ResolvedCardAction) =>
    classifyAlarmRoute(action, { entityId: ENTITY_ID })

  it('classifies disarm and every arm service', () => {
    expect(classify({ action: 'call-service', service: 'alarm_control_panel.alarm_disarm' })).toBe(
      'disarming'
    )
    for (const service of [
      'alarm_arm_away',
      'alarm_arm_home',
      'alarm_arm_night',
      'alarm_arm_vacation',
      'alarm_arm_custom_bypass',
    ]) {
      expect(classify({ action: 'call-service', service: `alarm_control_panel.${service}` })).toBe(
        'arming'
      )
    }
  })

  it('leaves toggle neutral, because the family resolves it to more-info', () => {
    // There is no sane toggle for a panel — disarm to WHICH arm mode? — so the
    // family defines it as opening the details, which actuates nothing.
    expect(classify('toggle')).toBe('neutral')
  })

  it('holds the generic aliases rather than guessing their direction', () => {
    for (const service of [
      'homeassistant.turn_on',
      'homeassistant.turn_off',
      'homeassistant.toggle',
    ]) {
      expect(classify({ action: 'call-service', service })).toBe('unclassifiable')
    }
  })

  it('passes actions that do not arm or disarm this panel', () => {
    expect(classify('more-info')).toBe('neutral')
    expect(classify('none')).toBe('neutral')
    expect(classify({ action: 'navigate', target: 'home' })).toBe('neutral')
    expect(classify({ action: 'call-service', service: 'light.turn_on' })).toBe('neutral')
    // Raising the alarm is consequential but it is not lowering the security of
    // the house, and the spec asks for gates on arming and disarming only.
    expect(classify({ action: 'call-service', service: 'alarm_control_panel.alarm_trigger' })).toBe(
      'neutral'
    )
  })

  it('passes a service aimed at a different panel', () => {
    expect(
      classify({
        action: 'call-service',
        service: 'alarm_control_panel.alarm_disarm',
        data: { entity_id: 'alarm_control_panel.garage' },
      })
    ).toBe('neutral')
  })

  it('holds a service whose target list includes this panel', () => {
    expect(
      classify({
        action: 'call-service',
        service: 'alarm_control_panel.alarm_disarm',
        data: { entity_id: ['alarm_control_panel.garage', ENTITY_ID] },
      })
    ).toBe('disarming')
  })
})

describe('requiresAlarmConfirmation', () => {
  it('gates disarming by default and arming only on request', () => {
    expect(requiresAlarmConfirmation('disarming', ALARM_OPTION_DEFAULTS, false)).toBe(true)
    expect(requiresAlarmConfirmation('arming', ALARM_OPTION_DEFAULTS, false)).toBe(false)
    expect(requiresAlarmConfirmation('arming', { ...bothGates }, false)).toBe(true)
  })

  it('never gates a route that does not actuate this panel', () => {
    expect(requiresAlarmConfirmation('neutral', bothGates, false)).toBe(false)
  })

  it('gates an unclassifiable route whenever either gate is on', () => {
    expect(requiresAlarmConfirmation('unclassifiable', bothGates, false)).toBe(true)
    expect(
      requiresAlarmConfirmation('unclassifiable', { confirmArm: false, confirmDisarm: true }, false)
    ).toBe(true)
    expect(
      requiresAlarmConfirmation('unclassifiable', { confirmArm: true, confirmDisarm: false }, false)
    ).toBe(true)
    expect(requiresAlarmConfirmation('unclassifiable', neitherGate, false)).toBe(false)
  })

  it('never confirms on top of a keypad', () => {
    /*
     * The keypad IS the confirmation. Two prompts for one intent is how a
     * confirmation becomes something people click through — and this is the
     * case where the literal "when a code is required" reading and the reason
     * behind it come apart: `showKeypad: always` on a codeless panel presents a
     * keypad for a transition that needs no code.
     */
    for (const direction of ['arming', 'disarming', 'unclassifiable'] as AlarmRouteDirection[]) {
      expect(requiresAlarmConfirmation(direction, bothGates, true)).toBe(false)
    }
  })

  it('confirms every direction except the one proven harmless', () => {
    const directions: AlarmRouteDirection[] = ['arming', 'disarming', 'neutral', 'unclassifiable']

    const passed = directions.filter(
      (direction) => !requiresAlarmConfirmation(direction, bothGates, false)
    )

    expect(passed).toEqual(['neutral'])
  })
})
