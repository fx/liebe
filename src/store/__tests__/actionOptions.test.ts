import { describe, expect, it } from 'vitest'
import {
  ACTION_OPTION_DEFAULTS,
  ACTION_OPTION_KEYS,
  actionOptionsConfigSchema,
  readActionOptions,
} from '../actionOptions'

/**
 * The action family's option contract (docs/specs/entity-cards/options/scene.md).
 *
 * The reader's job is to never crash a dashboard over a value that reached
 * localStorage some other way — imports are rejected by `dashboardConfigSchema`
 * long before a card renders — while never inventing a `confirm` a document did
 * not ask for.
 */
describe('readActionOptions', () => {
  it('defaults both keys to leaving the card as it was', () => {
    expect(readActionOptions(undefined)).toEqual({ confirm: false, showLastActivated: false })
    expect(ACTION_OPTION_DEFAULTS).toEqual({ confirm: false, showLastActivated: false })
  })

  it('exposes exactly the two keys the option doc names', () => {
    expect([...ACTION_OPTION_KEYS]).toEqual(['confirm', 'showLastActivated'])
  })

  it('reads stored values back', () => {
    expect(readActionOptions({ confirm: true, showLastActivated: true })).toEqual({
      confirm: true,
      showLastActivated: true,
    })
  })

  it('ignores keys belonging to other cards', () => {
    expect(readActionOptions({ speedControl: 'slider', invertPosition: true })).toEqual(
      ACTION_OPTION_DEFAULTS
    )
  })

  it.each([
    ['a string', 'true'],
    ['a number', 1],
    ['null', null],
    ['an object', {}],
    ['an array', []],
  ])('falls back to the default when confirm is %s', (_label, value) => {
    /*
     * `confirm: "true"` is the case that matters: it is a truthy string, so a
     * reader that passed it through unvalidated would be right by accident,
     * and `confirm: "false"` — also truthy — would gate a card whose author
     * asked for no gate. Validating means both land on the documented default.
     */
    expect(readActionOptions({ confirm: value }).confirm).toBe(false)
  })

  it('costs only its own key when one value is bad', () => {
    expect(readActionOptions({ confirm: 'yes', showLastActivated: true })).toEqual({
      confirm: false,
      showLastActivated: true,
    })
  })
})

describe('actionOptionsConfigSchema', () => {
  it('accepts both keys as optional booleans', () => {
    expect(actionOptionsConfigSchema.safeParse({}).success).toBe(true)
    expect(actionOptionsConfigSchema.safeParse({ confirm: true }).success).toBe(true)
    expect(
      actionOptionsConfigSchema.safeParse({ confirm: false, showLastActivated: true }).success
    ).toBe(true)
  })

  it.each(['confirm', 'showLastActivated'])(
    'rejects a non-boolean %s at the import gate',
    (key) => {
      // Rejected rather than defaulted here, so the author of the document is told
      // rather than quietly disagreed with.
      expect(actionOptionsConfigSchema.safeParse({ [key]: 'true' }).success).toBe(false)
    }
  )

  it('declares confirm itself rather than leaning on the switch card’s schema', () => {
    // The two families name the option independently; a later change to the
    // switch surface must not take this one's validation with it.
    expect(actionOptionsConfigSchema.shape.confirm).toBeDefined()
  })
})
