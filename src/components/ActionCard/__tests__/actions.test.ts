import { describe, expect, it } from 'vitest'
import type { ResolvedCardAction } from '~/store/cardActions'
import {
  ACTION_CARD_DOMAINS,
  confirmPromptFor,
  formatLastActivated,
  isActionInert,
  isActionRunning,
  isPrimaryRoute,
  readActivationTimestamp,
  resolveDomainAction,
  resolvePrimaryCommand,
} from '../actions'

/**
 * The action family's per-domain rules.
 *
 * The service names in the first block are the defect this whole change exists
 * to fix, so they are asserted literally rather than derived from the map: a
 * test that read the map back would agree with any typo the map contained. Each
 * was checked against a running Home Assistant 2026.7.2 — see the module header.
 */
describe('per-domain action map', () => {
  it('serves exactly the four domains the registry maps to this card', () => {
    expect(ACTION_CARD_DOMAINS).toEqual(['scene', 'script', 'button', 'input_button'])
  })

  it.each([
    ['scene.movie_night', 'turn_on'],
    ['script.water_garden', 'turn_on'],
    ['button.restart_bridge', 'press'],
    ['input_button.doorbell_test', 'press'],
  ])('activates %s with the domain service %s', (entityId, service) => {
    const domain = entityId.split('.')[0]

    expect(resolvePrimaryCommand(entityId, 'off')).toEqual({
      domain,
      service,
      stopping: false,
    })
  })

  it('never resolves a toggle for any domain it serves', () => {
    /*
     * The regression this pins: `scene.toggle`, `button.toggle` and
     * `input_button.toggle` are not registered services, and Home Assistant
     * answers HTTP 400 for each. The fallback card dispatches exactly those.
     */
    for (const domain of ACTION_CARD_DOMAINS) {
      const command = resolvePrimaryCommand(`${domain}.thing`, 'unknown_state')
      expect(command?.service).not.toBe('toggle')
    }
  })

  it('stops a running script with turn_off rather than starting it again', () => {
    expect(resolvePrimaryCommand('script.water_garden', 'on')).toEqual({
      domain: 'script',
      service: 'turn_off',
      stopping: true,
    })
  })

  it('runs an idle script with turn_on', () => {
    expect(resolvePrimaryCommand('script.water_garden', 'off')).toEqual({
      domain: 'script',
      service: 'turn_on',
      stopping: false,
    })
  })

  it('has no command for a domain the family does not serve', () => {
    expect(resolvePrimaryCommand('light.kitchen', 'on')).toBeUndefined()
    expect(resolveDomainAction('light')).toBeUndefined()
  })
})

describe('isActionRunning', () => {
  it('is true only for a script reporting on', () => {
    expect(isActionRunning('script', 'on')).toBe(true)
    expect(isActionRunning('script', 'off')).toBe(false)
  })

  it('is false for the fire-and-forget domains, whose state is a timestamp', () => {
    // `on` is not a state these ever report — but if one did, it is a timestamp
    // slot holding a surprise, not a run in progress.
    expect(isActionRunning('scene', 'on')).toBe(false)
    expect(isActionRunning('button', 'on')).toBe(false)
    expect(isActionRunning('input_button', 'on')).toBe(false)
  })

  it('is false for a domain the family does not serve', () => {
    expect(isActionRunning('light', 'on')).toBe(false)
  })
})

/**
 * The `unknown` rule is the sharpest thing in this file. A never-activated
 * scene, button or input_button reports `unknown` *forever* until something
 * activates it — so treating `unknown` as inert would make every freshly created
 * one permanently unusable.
 */
describe('isActionInert', () => {
  it.each(['scene', 'button', 'input_button'])(
    'keeps a never-activated %s activatable at unknown',
    (domain) => {
      expect(isActionInert(domain, 'unknown')).toBe(false)
      expect(resolvePrimaryCommand(`${domain}.fresh`, 'unknown')).toBeDefined()
    }
  )

  it('treats unknown as inert for script, whose state is genuinely on/off', () => {
    expect(isActionInert('script', 'unknown')).toBe(true)
    expect(resolvePrimaryCommand('script.water_garden', 'unknown')).toBeUndefined()
  })

  it.each(ACTION_CARD_DOMAINS)('is inert for an unavailable %s', (domain) => {
    expect(isActionInert(domain, 'unavailable')).toBe(true)
    expect(resolvePrimaryCommand(`${domain}.thing`, 'unavailable')).toBeUndefined()
  })

  it('is inert for a domain the family does not serve', () => {
    expect(isActionInert('light', 'on')).toBe(true)
  })

  it('stays active for an arbitrary state string on a timestamp domain', () => {
    // A scene's state is whatever Home Assistant put there; only `unavailable`
    // and the never-activated `unknown` carry meaning to this card.
    expect(isActionInert('scene', '2026-07-25T11:00:00.000Z')).toBe(false)
    expect(isActionInert('scene', '')).toBe(false)
  })
})

/**
 * The gate's coverage is the point: a family rule REPLACES the shell's generic
 * on/off gate rather than joining it, so anything the generic one caught and
 * this one misses is a `confirm` that silently does not confirm.
 */
describe('isPrimaryRoute', () => {
  const callService = (service: string, data?: Record<string, unknown>): ResolvedCardAction => ({
    action: 'call-service',
    service,
    ...(data ? { data } : {}),
  })

  it('gates the resolved toggle literal', () => {
    expect(isPrimaryRoute('toggle', 'scene.movie_night')).toBe(true)
  })

  it.each([
    ['scene.movie_night', 'scene.turn_on'],
    ['script.water_garden', 'script.turn_on'],
    ['script.water_garden', 'script.turn_off'],
    ['script.water_garden', 'script.toggle'],
    ['button.restart_bridge', 'button.press'],
    ['input_button.doorbell_test', 'input_button.press'],
  ])('gates %s reached directly by %s', (entityId, service) => {
    expect(isPrimaryRoute(callService(service), entityId)).toBe(true)
  })

  it.each(['homeassistant.toggle', 'homeassistant.turn_on', 'homeassistant.turn_off'])(
    'gates the generic alias %s, which the replaced gate also caught',
    (service) => {
      expect(isPrimaryRoute(callService(service), 'script.reset_all_devices')).toBe(true)
    }
  )

  it('leaves unrelated homeassistant services ungated', () => {
    expect(isPrimaryRoute(callService('homeassistant.update_entity'), 'scene.movie_night')).toBe(
      false
    )
  })

  it.each(['more-info', 'none'] as const)('leaves %s ungated', (action) => {
    expect(isPrimaryRoute(action, 'scene.movie_night')).toBe(false)
  })

  it('leaves navigate ungated', () => {
    expect(isPrimaryRoute({ action: 'navigate', target: 'kitchen' }, 'scene.movie_night')).toBe(
      false
    )
  })

  it('leaves a non-primary service on the entity’s own domain ungated', () => {
    // `scene.apply` and `scene.reload` are real services that are not this
    // card's action; gating them would train the user to dismiss the dialog.
    expect(isPrimaryRoute(callService('scene.reload'), 'scene.movie_night')).toBe(false)
    expect(isPrimaryRoute(callService('input_button.reload'), 'input_button.doorbell_test')).toBe(
      false
    )
  })

  it('leaves a service aimed at another entity ungated', () => {
    expect(
      isPrimaryRoute(
        callService('scene.turn_on', { entity_id: 'scene.something_else' }),
        'scene.movie_night'
      )
    ).toBe(false)
  })

  it('gates a list target that happens to include this entity', () => {
    // The hole the shell's gate had once: a non-string target read as "aimed
    // elsewhere" and waved through.
    expect(
      isPrimaryRoute(
        callService('scene.turn_on', { entity_id: ['scene.other', 'scene.movie_night'] }),
        'scene.movie_night'
      )
    ).toBe(true)
  })

  it('leaves a service on an unrelated domain ungated', () => {
    expect(isPrimaryRoute(callService('light.turn_on'), 'scene.movie_night')).toBe(false)
  })

  it('fails toward asking for a domain the map does not know', () => {
    /*
     * The card should never be registered for `siren`, but if it renders one,
     * a same-domain service reaching the entity is confirmed rather than waved
     * through: the two errors are not symmetric.
     */
    expect(isPrimaryRoute(callService('siren.turn_on'), 'siren.alarm')).toBe(true)
    expect(isPrimaryRoute(callService('siren.some_service'), 'siren.alarm')).toBe(true)
  })
})

describe('confirmPromptFor', () => {
  it('names the action per domain', () => {
    expect(confirmPromptFor('scene', 'unknown')?.verb).toBe('Activate')
    expect(confirmPromptFor('script', 'off')?.verb).toBe('Run')
    expect(confirmPromptFor('button', 'unknown')?.verb).toBe('Press')
    expect(confirmPromptFor('input_button', 'unknown')?.verb).toBe('Press')
  })

  it('names the stop when a tap would stop a running script', () => {
    expect(confirmPromptFor('script', 'on')).toEqual({ verb: 'Stop', gerund: 'stopping' })
  })

  it('has no wording for a domain the family does not serve', () => {
    expect(confirmPromptFor('light', 'on')).toBeUndefined()
  })
})

/**
 * The shapes `showLastActivated` has to survive. Every one of these is a real
 * payload: `last_triggered` is `null` on a script that never ran, `unknown` is
 * the state of a scene that never ran, and a config or integration can put
 * anything at all in either slot.
 */
describe('readActivationTimestamp', () => {
  const iso = '2026-07-25T11:00:00.000Z'

  it('reads the state for the timestamp domains', () => {
    expect(readActivationTimestamp('scene', iso, {})).toBe(Date.parse(iso))
    expect(readActivationTimestamp('button', iso, {})).toBe(Date.parse(iso))
    expect(readActivationTimestamp('input_button', iso, {})).toBe(Date.parse(iso))
  })

  it('reads last_triggered for script, not its on/off state', () => {
    expect(readActivationTimestamp('script', 'on', { last_triggered: iso })).toBe(Date.parse(iso))
  })

  it.each([
    ['a missing attribute', {}],
    ['a null attribute, which is what a never-run script reports', { last_triggered: null }],
    ['an undefined attribute', { last_triggered: undefined }],
    ['a numeric attribute', { last_triggered: 1_760_000_000 }],
    ['an unparseable string', { last_triggered: 'never' }],
    ['an empty string', { last_triggered: '' }],
    ['the literal unknown', { last_triggered: 'unknown' }],
  ])('has no timestamp for a script with %s', (_label, attributes) => {
    expect(readActivationTimestamp('script', 'off', attributes)).toBeUndefined()
  })

  it('has no timestamp when the attribute bag itself is absent', () => {
    expect(readActivationTimestamp('script', 'off', undefined)).toBeUndefined()
  })

  it.each(['unknown', 'unavailable', '', 'not a date'])(
    'has no timestamp for a scene whose state is %s',
    (state) => {
      expect(readActivationTimestamp('scene', state, {})).toBeUndefined()
    }
  )

  it('has no timestamp for a domain the family does not serve', () => {
    expect(readActivationTimestamp('light', iso, {})).toBeUndefined()
  })
})

describe('formatLastActivated', () => {
  const now = Date.parse('2026-07-25T12:00:00.000Z')

  it('renders Never rather than a broken time when there is no timestamp', () => {
    expect(formatLastActivated(undefined, now)).toBe('Never')
  })

  it.each([
    [0, 'just now'],
    [30_000, 'just now'],
    [60_000, '1 min ago'],
    [59 * 60_000, '59 min ago'],
    [60 * 60_000, '1 h ago'],
    [2 * 60 * 60_000, '2 h ago'],
    [23 * 60 * 60_000, '23 h ago'],
    [24 * 60 * 60_000, '1 d ago'],
    [10 * 24 * 60 * 60_000, '10 d ago'],
  ])('renders %i ms ago as %s', (elapsed, expected) => {
    expect(formatLastActivated(now - elapsed, now)).toBe(expected)
  })

  it('reads a future timestamp as just now rather than a negative time', () => {
    // A browser clock disagreeing with Home Assistant's, not an activation that
    // has not happened yet.
    expect(formatLastActivated(now + 60_000, now)).toBe('just now')
  })
})
