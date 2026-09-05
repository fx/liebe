import { describe, it, expect } from 'vitest'
import {
  CARD_ACTION_DEFAULTS,
  CARD_ACTION_KEYS,
  cardActionSchema,
  isParameterizedCardAction,
  readCardAction,
  resolveCardAction,
  retainedRetryAction,
} from '../cardActions'

/**
 * The serialized action contract. Every assertion here is about the *stored*
 * shape rather than about behavior, because these values travel between
 * versions in shared YAML exports — a config written by one version has to load
 * in another, so each action has exactly one spelling
 * (docs/specs/entity-cards/options/common.md — "Action type").
 */
describe('card action schema', () => {
  it.each(['default', 'toggle', 'more-info', 'none'])(
    'accepts the parameterless action %s as a bare string',
    (action) => {
      expect(cardActionSchema.parse(action)).toBe(action)
    }
  )

  it('accepts a navigate action carrying its target', () => {
    expect(cardActionSchema.parse({ action: 'navigate', target: 'kitchen' })).toEqual({
      action: 'navigate',
      target: 'kitchen',
    })
  })

  it('accepts a call-service action with and without data', () => {
    expect(cardActionSchema.parse({ action: 'call-service', service: 'light.turn_on' })).toEqual({
      action: 'call-service',
      service: 'light.turn_on',
    })
    expect(
      cardActionSchema.parse({
        action: 'call-service',
        service: 'script.turn_on',
        data: { variables: { level: 3 } },
      })
    ).toEqual({
      action: 'call-service',
      service: 'script.turn_on',
      data: { variables: { level: 3 } },
    })
  })

  it('rejects an unknown action identifier rather than falling back', () => {
    // The spec is explicit that a typo must not resolve to `default`: that turns
    // a misspelling into a card that works and does the wrong thing.
    expect(cardActionSchema.safeParse('toggel').success).toBe(false)
    expect(cardActionSchema.safeParse({ action: 'open-dialog', target: 'x' }).success).toBe(false)
  })

  it('rejects the object spelling of a parameterless action', () => {
    // One representation per action, or two exports of the same dashboard would
    // not compare equal.
    expect(cardActionSchema.safeParse({ action: 'toggle' }).success).toBe(false)
    expect(cardActionSchema.safeParse({ action: 'more-info' }).success).toBe(false)
  })

  it('rejects a parameterized action missing its required key', () => {
    expect(cardActionSchema.safeParse({ action: 'navigate' }).success).toBe(false)
    expect(cardActionSchema.safeParse({ action: 'navigate', target: '' }).success).toBe(false)
    expect(cardActionSchema.safeParse({ action: 'call-service' }).success).toBe(false)
  })

  it('rejects a service that is not domain.service', () => {
    expect(cardActionSchema.safeParse({ action: 'call-service', service: 'turn_on' }).success).toBe(
      false
    )
    expect(
      cardActionSchema.safeParse({ action: 'call-service', service: 'light.turn.on' }).success
    ).toBe(false)
  })

  it('rejects unknown keys inside an action object', () => {
    // `.strict()` rather than a passthrough: a mistyped `targets:` that rode
    // along would look configured and navigate nowhere.
    expect(
      cardActionSchema.safeParse({ action: 'navigate', target: 'kitchen', targets: 'kitchen' })
        .success
    ).toBe(false)
    expect(
      cardActionSchema.safeParse({
        action: 'call-service',
        service: 'light.turn_on',
        entity_id: 'light.x',
      }).success
    ).toBe(false)
  })

  it('uses the discriminator key `action`, not `type`', () => {
    expect(cardActionSchema.safeParse({ type: 'navigate', target: 'kitchen' }).success).toBe(false)
  })
})

describe('stored defaults', () => {
  it('stores the literal `default` for tap on every card', () => {
    expect(CARD_ACTION_DEFAULTS.tapAction).toBe('default')
    expect(CARD_ACTION_DEFAULTS.holdAction).toBe('more-info')
    expect(CARD_ACTION_DEFAULTS.doubleTapAction).toBe('none')
  })

  it('names exactly the three universal action keys', () => {
    expect([...CARD_ACTION_KEYS]).toEqual(['tapAction', 'holdAction', 'doubleTapAction'])
  })
})

describe('readCardAction', () => {
  it('returns the key default when the config has no value', () => {
    expect(readCardAction(undefined, 'tapAction')).toBe('default')
    expect(readCardAction({}, 'holdAction')).toBe('more-info')
    expect(readCardAction({}, 'doubleTapAction')).toBe('none')
  })

  it('returns a stored action that validates', () => {
    expect(readCardAction({ tapAction: 'toggle' }, 'tapAction')).toBe('toggle')
    expect(
      readCardAction({ holdAction: { action: 'navigate', target: 'x' } }, 'holdAction')
    ).toEqual({ action: 'navigate', target: 'x' })
  })

  it('falls back to the key default for a value that does not validate', () => {
    // The render path refusing to crash a dashboard over a value localStorage
    // acquired some other way — imports are already rejected at the gate.
    expect(readCardAction({ tapAction: 'nonsense' }, 'tapAction')).toBe('default')
    expect(readCardAction({ holdAction: { action: 'navigate' } }, 'holdAction')).toBe('more-info')
  })
})

describe('resolveCardAction', () => {
  it('substitutes the card default for the literal `default`', () => {
    expect(resolveCardAction('default', 'toggle')).toBe('toggle')
    expect(resolveCardAction('default', 'more-info')).toBe('more-info')
  })

  it('leaves every other action untouched', () => {
    expect(resolveCardAction('none', 'toggle')).toBe('none')
    expect(resolveCardAction({ action: 'navigate', target: 'x' }, 'more-info')).toEqual({
      action: 'navigate',
      target: 'x',
    })
  })
})

describe('isParameterizedCardAction', () => {
  it('separates the object actions from the bare-string ones', () => {
    expect(isParameterizedCardAction('toggle')).toBe(false)
    expect(isParameterizedCardAction({ action: 'navigate', target: 'x' })).toBe(true)
    expect(isParameterizedCardAction({ action: 'call-service', service: 'light.turn_on' })).toBe(
      true
    )
  })
})

describe('retainedRetryAction', () => {
  it('replays the retained target inside the payload, never the current entity', () => {
    // The retry must repeat what was dispatched: the failed command's own
    // `entityId` travels as `data.entity_id`, so the shell's current entity
    // cannot hijack it after an A→B recycle.
    expect(
      retainedRetryAction({
        command: { domain: 'switch', service: 'toggle', entityId: 'switch.a' },
        retryable: true,
      })
    ).toEqual({
      action: 'call-service',
      service: 'switch.toggle',
      data: { entity_id: 'switch.a' },
    })
  })

  it('lets an explicit data.entity_id win over the implicit one', () => {
    // Mirrors `HassService.buildServiceData`: explicit data spreads over the
    // implicit target.
    expect(
      retainedRetryAction({
        command: {
          domain: 'button',
          service: 'press',
          entityId: 'button.a',
          data: { entity_id: 'button.b' },
        },
        retryable: true,
      })
    ).toEqual({
      action: 'call-service',
      service: 'button.press',
      data: { entity_id: 'button.b' },
    })
  })

  it('carries extra payload keys alongside the target', () => {
    expect(
      retainedRetryAction({
        command: {
          domain: 'light',
          service: 'turn_on',
          entityId: 'light.desk',
          data: { brightness: 130 },
        },
        retryable: true,
      })
    ).toEqual({
      action: 'call-service',
      service: 'light.turn_on',
      data: { entity_id: 'light.desk', brightness: 130 },
    })
  })

  it('returns nothing without a retryable failure', () => {
    expect(retainedRetryAction(null)).toBeUndefined()
    expect(retainedRetryAction(undefined)).toBeUndefined()
    expect(
      retainedRetryAction({
        command: { domain: 'switch', service: 'toggle', entityId: 'switch.a' },
        retryable: false,
      })
    ).toBeUndefined()
  })

  it('withholds a code-bearing command even when marked retryable', () => {
    // CodeRabbit Major on cardActions.ts:183 — defense in depth beside the
    // hook's non-retryable retention: a stale retryable flag must not route a
    // keypad credential through generic Retry after the keypad closes.
    expect(
      retainedRetryAction({
        command: {
          domain: 'alarm_control_panel',
          service: 'alarm_disarm',
          entityId: 'alarm_control_panel.house',
          data: { code: '1234' },
        },
        retryable: true,
      })
    ).toBeUndefined()
  })
})

describe('retainedRetryAction targetless shapes', () => {
  it('omits data entirely for a targetless command with no payload', () => {
    // Scene/notification-style commands aim at nothing observable; the retry
    // replays them bare rather than inventing a target.
    expect(
      retainedRetryAction({ command: { domain: 'notify', service: 'persistent' }, retryable: true })
    ).toEqual({ action: 'call-service', service: 'notify.persistent' })
  })

  it('carries a dataless target as entity_id alone', () => {
    expect(
      retainedRetryAction({
        command: { domain: 'homeassistant', service: 'toggle', entityId: 'light.desk' },
        retryable: true,
      })
    ).toEqual({
      action: 'call-service',
      service: 'homeassistant.toggle',
      data: { entity_id: 'light.desk' },
    })
  })

  it('keeps data without a target untouched', () => {
    expect(
      retainedRetryAction({
        command: { domain: 'script', service: 'turn_on', data: { variables: { x: 1 } } },
        retryable: true,
      })
    ).toEqual({
      action: 'call-service',
      service: 'script.turn_on',
      data: { variables: { x: 1 } },
    })
  })
})
