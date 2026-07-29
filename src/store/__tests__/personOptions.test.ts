import { describe, it, expect } from 'vitest'
import {
  PERSON_OPTION_DEFAULTS,
  PERSON_OPTION_KEYS,
  personOptionsConfigSchema,
  readPersonOptions,
} from '../personOptions'

describe('readPersonOptions', () => {
  it('gives an unconfigured card both options on', () => {
    // The shipped defaults, asserted as the contract rather than read back from
    // the constant: a person card with neither is a contact photo, not a
    // presence card (docs/specs/entity-cards/options/person.md — "Options").
    expect(readPersonOptions(undefined)).toEqual({ showZone: true, showLastChanged: true })
    expect(readPersonOptions({})).toEqual({ showZone: true, showLastChanged: true })
  })

  it('reads what the user stored', () => {
    expect(readPersonOptions({ showZone: false, showLastChanged: false })).toEqual({
      showZone: false,
      showLastChanged: false,
    })
  })

  it('falls back to the default for a value that does not validate', () => {
    /*
     * `"no"` is the case worth naming: it is truthy, so a reader that trusted
     * the stored value would turn an option ON that its writer meant to turn
     * off, and one that coerced it would act on a value nobody wrote. Falling
     * back leaves the option where the document says it should be.
     */
    expect(readPersonOptions({ showZone: 'no' })).toEqual(PERSON_OPTION_DEFAULTS)
    expect(readPersonOptions({ showLastChanged: 1 })).toEqual(PERSON_OPTION_DEFAULTS)
    expect(readPersonOptions({ showZone: null })).toEqual(PERSON_OPTION_DEFAULTS)
  })

  it('costs a bad value only its own key', () => {
    expect(readPersonOptions({ showZone: 'no', showLastChanged: false })).toEqual({
      showZone: true,
      showLastChanged: false,
    })
  })
})

describe('the person config fragment', () => {
  it('declares exactly the keys the card reads', () => {
    // The fragment and the reader drifting apart is how an option becomes
    // unimportable while still having a control in the form.
    expect(Object.keys(personOptionsConfigSchema.shape).sort()).toEqual(
      [...PERSON_OPTION_KEYS].sort()
    )
  })

  it('accepts a partial config and rejects a wrong type', () => {
    expect(personOptionsConfigSchema.safeParse({}).success).toBe(true)
    expect(personOptionsConfigSchema.safeParse({ showZone: true }).success).toBe(true)
    expect(personOptionsConfigSchema.safeParse({ showZone: 'yes' }).success).toBe(false)
  })
})
