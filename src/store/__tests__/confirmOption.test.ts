import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CONFIRM_DEFAULT, confirmOptionsConfigSchema, readCardConfirm } from '../confirmOption'
import { actionOptionsConfigSchema } from '../actionOptions'
import { switchOptionsConfigSchema } from '../switchOptions'
import { dashboardConfigSchema } from '../configSchema'

/**
 * The shared `confirm` gate.
 *
 * The cases below the reader are the point of the module: `configSchema.ts`
 * merges every family fragment into one item schema, and `zod.merge()` is
 * last-one-wins for an overlapping key, so two families declaring `confirm`
 * separately would mean whichever merged last silently governed it for both.
 */
describe('readCardConfirm', () => {
  it('answers the shell without it reading the rest of a card’s options', () => {
    expect(readCardConfirm({ confirm: true })).toBe(true)
    expect(readCardConfirm({ confirm: false })).toBe(false)
    expect(readCardConfirm(undefined)).toBe(false)
  })

  it('defaults off, so a card is gated only because a document asked', () => {
    expect(CONFIRM_DEFAULT).toBe(false)
    expect(readCardConfirm({})).toBe(false)
  })

  it.each([
    ['a truthy string', 'true'],
    ['a falsy-looking string', 'false'],
    ['a number', 1],
    ['null', null],
    ['an object', {}],
  ])('falls back to the default for %s', (_label, value) => {
    /*
     * `confirm: "false"` is the sharp one — a truthy string. A reader that
     * skipped validation would gate a card whose author asked for no gate, and
     * one that trusted the value would leave a well pump unguarded.
     */
    expect(readCardConfirm({ confirm: value })).toBe(CONFIRM_DEFAULT)
  })
})

describe('one definition of the gate', () => {
  it('is the same schema object in both families that offer it', () => {
    // Identity, not equivalence. Two structurally identical declarations would
    // pass an equivalence check and still be free to drift apart tomorrow;
    // sharing the object is what makes the merge below a no-op by construction.
    expect(actionOptionsConfigSchema.shape.confirm).toBe(confirmOptionsConfigSchema.shape.confirm)
    expect(switchOptionsConfigSchema.shape.confirm).toBe(confirmOptionsConfigSchema.shape.confirm)
  })

  it('validates the same whichever family fragment merges last', () => {
    const both = z.object({}).merge(switchOptionsConfigSchema).merge(actionOptionsConfigSchema)
    const reversed = z.object({}).merge(actionOptionsConfigSchema).merge(switchOptionsConfigSchema)

    for (const value of [true, false, 'true', 1, null, {}]) {
      expect(both.safeParse({ confirm: value }).success).toBe(
        reversed.safeParse({ confirm: value }).success
      )
    }
  })
})

/**
 * The effective validation an action card actually gets, asserted through the
 * whole merged item schema rather than through the family fragment.
 *
 * This is the case that would catch the coupling: a fragment-level test passes
 * even when another family's schema is the one governing the key at the gate.
 */
describe('confirm through the merged item schema', () => {
  function parse(entityId: string, config: Record<string, unknown>) {
    return dashboardConfigSchema.safeParse({
      version: '1.0.0',
      screens: [
        {
          id: 's',
          name: 'S',
          slug: 's',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            items: [{ id: 'i', type: 'entity', entityId, config, x: 0, y: 0, width: 2, height: 2 }],
          },
        },
      ],
    }).success
  }

  it.each(['scene.movie_night', 'script.water_garden', 'switch.well_pump'])(
    'accepts a boolean confirm on %s',
    (entityId) => {
      expect(parse(entityId, { confirm: true })).toBe(true)
      expect(parse(entityId, { confirm: false })).toBe(true)
    }
  )

  it.each(['scene.movie_night', 'script.water_garden', 'switch.well_pump'])(
    'rejects a non-boolean confirm on %s at the import gate',
    (entityId) => {
      // Rejected rather than defaulted, so the author of the document is told
      // rather than quietly disagreed with.
      expect(parse(entityId, { confirm: 'true' })).toBe(false)
    }
  )
})
