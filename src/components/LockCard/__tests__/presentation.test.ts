import { describe, it, expect } from 'vitest'
import { DoorOpen, Lock, LockOpen, TriangleAlert } from 'lucide-react'
import {
  LOCK_STATE,
  classifyLockRoute,
  lockConfirmPrompt,
  requiresLockConfirmation,
  resolveDoorFragment,
  resolveLockPresentation,
  resolveLockToggle,
  type LockRouteDirection,
} from '../presentation'
import { LOCK_OPTION_DEFAULTS } from '~/store/lockOptions'
import type { HassEntity } from '~/store/entityTypes'
import type { ResolvedCardAction } from '~/store/cardActions'

const ENTITY_ID = 'lock.front_door'

const bothGates = { confirmUnlock: true, confirmLock: true }
const neitherGate = { confirmUnlock: false, confirmLock: false }

describe('resolveLockPresentation', () => {
  /*
   * Home Assistant's `LockState` in full (components/lock/const.py, 2026.7.2).
   * The table is asserted as a table rather than one case per `it`, because what
   * matters about it is that every state has a defined row — a missing case, not
   * a missing branch, is how this card would fail.
   */
  it.each([
    [LOCK_STATE.LOCKED, 'Locked', 'ok', Lock, true],
    [LOCK_STATE.UNLOCKED, 'Unlocked', 'alert', LockOpen, true],
    [LOCK_STATE.LOCKING, 'Locking…', 'alert', Lock, true],
    [LOCK_STATE.UNLOCKING, 'Unlocking…', 'ok', LockOpen, true],
    [LOCK_STATE.OPENING, 'Opening…', 'ok', DoorOpen, true],
    [LOCK_STATE.OPEN, 'Open', 'alert', DoorOpen, true],
    [LOCK_STATE.JAMMED, 'Jammed', 'alert', TriangleAlert, true],
  ])('renders %s as "%s" in %s', (state, label, color, icon, isActive) => {
    const presentation = resolveLockPresentation({ state })

    expect(presentation.label).toBe(label)
    expect(presentation.color).toBe(color)
    expect(presentation.icon).toBe(icon)
    expect(presentation.isActive).toBe(isActive)
    expect(presentation.isIndeterminate).toBe(false)
  })

  it('marks only jammed as a danger state', () => {
    for (const state of Object.values(LOCK_STATE)) {
      expect(resolveLockPresentation({ state }).isDanger).toBe(state === LOCK_STATE.JAMMED)
    }
  })

  it('marks the three in-flight states as transitional', () => {
    const transitional = Object.values(LOCK_STATE).filter(
      (state) => resolveLockPresentation({ state }).isTransitional
    )

    expect(transitional).toEqual([LOCK_STATE.LOCKING, LOCK_STATE.UNLOCKING, LOCK_STATE.OPENING])
  })

  /*
   * The enablement columns, which are the safety-critical part of the table.
   * Read as three rules that must not be collapsed into one:
   *  - the resting states disable the pill that matches them;
   *  - the transitional states disable the direction in progress and leave the
   *    INVERSE live, so an unwanted movement can be reversed;
   *  - the indeterminate states disable BOTH, because neither matches a state
   *    the card cannot know.
   * `jammed` is in none of the three and leaves both live: it is neither locked
   * nor unlocked, and a jam is exactly when someone needs to try the mechanism.
   */
  it.each([
    [LOCK_STATE.LOCKED, false, true],
    [LOCK_STATE.UNLOCKED, true, false],
    [LOCK_STATE.LOCKING, false, true],
    [LOCK_STATE.UNLOCKING, true, false],
    [LOCK_STATE.OPENING, true, false],
    [LOCK_STATE.OPEN, true, false],
    [LOCK_STATE.JAMMED, true, true],
    ['unavailable', false, false],
    ['unknown', false, false],
  ])('in %s allows lock=%s unlock=%s', (state, canLock, canUnlock) => {
    const presentation = resolveLockPresentation({ state })

    expect(presentation.canLock).toBe(canLock)
    expect(presentation.canUnlock).toBe(canUnlock)
  })

  it.each(['unavailable', 'unknown', '', 'PENDING', 'locked ', 'Locked'])(
    'treats %j as indeterminate rather than guessing',
    (state) => {
      const presentation = resolveLockPresentation({ state })

      expect(presentation.isIndeterminate).toBe(true)
      expect(presentation.state).toBe('unknown')
      expect(presentation.canLock).toBe(false)
      expect(presentation.canUnlock).toBe(false)
      expect(presentation.isActive).toBe(false)
      expect(presentation.isDanger).toBe(false)
    }
  )

  it('does not resolve a state off Object.prototype', () => {
    // The table is a plain object and the state string comes off the wire, so
    // `constructor` would otherwise resolve to a function and render as a card
    // that crashed rather than one with an odd label.
    expect(resolveLockPresentation({ state: 'constructor' }).isIndeterminate).toBe(true)
    expect(resolveLockPresentation({ state: 'toString' }).isIndeterminate).toBe(true)
  })
})

describe('resolveLockToggle', () => {
  it.each([
    [LOCK_STATE.LOCKED, 'unlock'],
    [LOCK_STATE.UNLOCKED, 'lock'],
    [LOCK_STATE.OPEN, 'lock'],
    [LOCK_STATE.LOCKING, 'none'],
    [LOCK_STATE.UNLOCKING, 'none'],
    [LOCK_STATE.OPENING, 'none'],
    [LOCK_STATE.JAMMED, 'more-info'],
    ['unavailable', 'none'],
    ['unknown', 'none'],
    ['nonsense', 'none'],
  ])('resolves a configured toggle in %s to %s', (state, expected) => {
    expect(resolveLockToggle(state)).toBe(expected)
  })
})

describe('classifyLockRoute', () => {
  const classify = (action: ResolvedCardAction, state: string = LOCK_STATE.LOCKED) =>
    classifyLockRoute(action, { entityId: ENTITY_ID, state })

  it('classifies a bare toggle by the state it would act on', () => {
    expect(classify('toggle', LOCK_STATE.LOCKED)).toBe('unlocking')
    expect(classify('toggle', LOCK_STATE.UNLOCKED)).toBe('locking')
    expect(classify('toggle', LOCK_STATE.OPEN)).toBe('locking')
  })

  it('passes a toggle that dispatches nothing, in a state it recognises', () => {
    for (const state of [LOCK_STATE.LOCKING, LOCK_STATE.UNLOCKING, LOCK_STATE.OPENING]) {
      expect(classify('toggle', state)).toBe('neutral')
    }
    expect(classify('toggle', LOCK_STATE.JAMMED)).toBe('neutral')
  })

  it('holds a toggle in a state it does NOT recognise', () => {
    // The fail-safe direction, and the reason the two cases above are separate:
    // both resolve the toggle to "dispatch nothing", but only the recognised
    // ones have a proof behind them.
    expect(classify('toggle', 'unavailable')).toBe('unclassifiable')
    expect(classify('toggle', 'unknown')).toBe('unclassifiable')
    expect(classify('toggle', 'wedged')).toBe('unclassifiable')
  })

  it('classifies the lock domain services by direction', () => {
    expect(classify({ action: 'call-service', service: 'lock.unlock' })).toBe('unlocking')
    expect(classify({ action: 'call-service', service: 'lock.lock' })).toBe('locking')
  })

  it('gates lock.open with lock.unlock', () => {
    // Unlatching is the MORE consequential operation, and the built-in control
    // for it is deferred — so a configured route is the only way to reach it,
    // and it must not be the ungated way.
    expect(classify({ action: 'call-service', service: 'lock.open' })).toBe('unlocking')
  })

  it('holds the generic aliases rather than guessing their direction', () => {
    for (const service of [
      'homeassistant.turn_on',
      'homeassistant.turn_off',
      'homeassistant.toggle',
      'lock.toggle',
    ]) {
      expect(classify({ action: 'call-service', service })).toBe('unclassifiable')
    }
  })

  it('passes actions that do not actuate this lock', () => {
    expect(classify('more-info')).toBe('neutral')
    expect(classify('none')).toBe('neutral')
    expect(classify({ action: 'navigate', target: 'kitchen' })).toBe('neutral')
    expect(classify({ action: 'call-service', service: 'light.turn_on' })).toBe('neutral')
    expect(classify({ action: 'call-service', service: 'lock.some_custom_service' })).toBe(
      'neutral'
    )
  })

  it('passes a service aimed at a different entity', () => {
    expect(
      classify({
        action: 'call-service',
        service: 'lock.unlock',
        data: { entity_id: 'lock.back_door' },
      })
    ).toBe('neutral')
  })

  it('holds a service whose target LIST includes this lock', () => {
    // The shape that slipped past the switch card's gate: a non-string
    // `entity_id` read as "aimed elsewhere".
    expect(
      classify({
        action: 'call-service',
        service: 'lock.unlock',
        data: { entity_id: ['lock.back_door', ENTITY_ID] },
      })
    ).toBe('unlocking')
  })

  it('holds a service with no explicit target, which lands on this lock', () => {
    expect(classify({ action: 'call-service', service: 'lock.unlock', data: {} })).toBe('unlocking')
  })
})

describe('requiresLockConfirmation', () => {
  it('gates unlocking on confirmUnlock and locking on confirmLock', () => {
    expect(requiresLockConfirmation('unlocking', { confirmUnlock: true, confirmLock: false })).toBe(
      true
    )
    expect(requiresLockConfirmation('unlocking', { confirmUnlock: false, confirmLock: true })).toBe(
      false
    )
    expect(requiresLockConfirmation('locking', { confirmUnlock: false, confirmLock: true })).toBe(
      true
    )
    expect(requiresLockConfirmation('locking', { confirmUnlock: true, confirmLock: false })).toBe(
      false
    )
  })

  it('never gates a route that does not actuate this lock', () => {
    expect(requiresLockConfirmation('neutral', bothGates)).toBe(false)
  })

  it('gates an unclassifiable route whenever EITHER gate is on', () => {
    expect(requiresLockConfirmation('unclassifiable', bothGates)).toBe(true)
    expect(
      requiresLockConfirmation('unclassifiable', { confirmUnlock: true, confirmLock: false })
    ).toBe(true)
    expect(
      requiresLockConfirmation('unclassifiable', { confirmUnlock: false, confirmLock: true })
    ).toBe(true)
  })

  it('respects a household that switched both gates off', () => {
    // The one case an unclassifiable route passes: nothing is gated on this
    // card at all, so holding it would be a dialog nobody asked for.
    expect(requiresLockConfirmation('unclassifiable', neitherGate)).toBe(false)
  })

  it('gates the unlock direction at the shipped defaults', () => {
    expect(requiresLockConfirmation('unlocking', LOCK_OPTION_DEFAULTS)).toBe(true)
    expect(requiresLockConfirmation('locking', LOCK_OPTION_DEFAULTS)).toBe(false)
    // An unconfigured card still holds an ambiguous route, because
    // `confirmUnlock` is on.
    expect(requiresLockConfirmation('unclassifiable', LOCK_OPTION_DEFAULTS)).toBe(true)
  })

  /*
   * The property the whole gate rests on, stated once: `neutral` is the only
   * direction that passes with a gate on. Written as an exhaustive sweep rather
   * than another example so that a direction added later cannot default to
   * "passes" without this failing.
   */
  it('confirms every direction except the one proven harmless', () => {
    const directions: LockRouteDirection[] = ['unlocking', 'locking', 'neutral', 'unclassifiable']

    const passed = directions.filter((direction) => !requiresLockConfirmation(direction, bothGates))

    expect(passed).toEqual(['neutral'])
  })
})

describe('lockConfirmPrompt', () => {
  it('names each gated direction', () => {
    expect(lockConfirmPrompt('unlocking')).toEqual({ verb: 'Unlock', gerund: 'unlocking' })
    expect(lockConfirmPrompt('locking')).toEqual({ verb: 'Lock', gerund: 'locking' })
  })

  it('asks the stronger question for an ambiguous route', () => {
    // If the card cannot tell which way a route goes, the dialog has to name the
    // direction that would matter.
    expect(lockConfirmPrompt('unclassifiable')).toEqual({ verb: 'Unlock', gerund: 'unlocking' })
  })

  it('has nothing to say about a route it does not gate', () => {
    expect(lockConfirmPrompt('neutral')).toBeUndefined()
  })
})

describe('resolveDoorFragment', () => {
  const sensor = (state: string, entityId = 'binary_sensor.front_door'): HassEntity =>
    ({ entity_id: entityId, state, attributes: {} }) as unknown as HassEntity

  it('reads a binary sensor as the door position', () => {
    expect(resolveDoorFragment('binary_sensor.front_door', sensor('on'))).toEqual({
      label: 'Door open',
      isOpen: true,
    })
    expect(resolveDoorFragment('binary_sensor.front_door', sensor('off'))).toEqual({
      label: 'Door closed',
      isOpen: false,
    })
  })

  it('renders nothing when the option is unset', () => {
    expect(resolveDoorFragment('', undefined)).toBeUndefined()
    // Even if an entity somehow arrives alongside the empty default.
    expect(resolveDoorFragment('', sensor('on'))).toBeUndefined()
  })

  it('renders nothing for an id that resolves to no entity', () => {
    expect(resolveDoorFragment('binary_sensor.deleted', undefined)).toBeUndefined()
  })

  it.each(['unavailable', 'unknown', '', 'open', 'true', 'ON'])(
    'renders nothing for a sensor reading %j',
    (state) => {
      // Never guess a door position: printing "Door closed" for a sensor that
      // did not say so is the one output this fragment must not produce.
      expect(resolveDoorFragment('binary_sensor.front_door', sensor(state))).toBeUndefined()
    }
  )

  it.each(['sensor.front_door', 'light.porch', 'cover.garage', 'input_boolean.guest'])(
    'renders nothing for %s, which is not a door sensor',
    (entityId) => {
      // A `light.porch` reporting `on` means the porch light is lit, not that a
      // door is open. The picker narrows to binary_sensor; a hand-written
      // document does not have to.
      expect(resolveDoorFragment(entityId, sensor('on', entityId))).toBeUndefined()
    }
  )

  it('renders nothing when pointed at the lock itself', () => {
    // Falls out of the domain check rather than needing a rule of its own: a
    // `lock.` id names no binary sensor, so a card configured to watch itself
    // cannot read its own `locked` as a door position.
    expect(resolveDoorFragment(ENTITY_ID, sensor('on', ENTITY_ID))).toBeUndefined()
  })
})
