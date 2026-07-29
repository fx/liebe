import { describe, it, expect } from 'vitest'
import {
  VACUUM_CARD_VERSION,
  VACUUM_OPTION_DEFAULTS,
  VACUUM_OPTION_KEYS,
  configPredatesVacuumCard,
  pinLegacyVacuumAction,
  readVacuumOptions,
  vacuumOptionsConfigSchema,
} from '../vacuumOptions'
import { MEDIA_PLAYER_CARD_VERSION } from '../mediaPlayerOptions'

/**
 * Written against `docs/specs/entity-cards/options/vacuum.md` — its Options
 * table is the source for every default below, not the constant they are read
 * from (REVIEW.md — "Tests Pin Intent, Not Implementation").
 */
describe('VACUUM_OPTION_DEFAULTS', () => {
  it('matches the option doc table', () => {
    expect(VACUUM_OPTION_DEFAULTS).toEqual({
      showCommands: true,
      showBattery: true,
      showFanSpeed: true,
      showLocate: false,
      showStats: false,
    })
  })

  /** The two the doc turns off, called out so a flipped default fails by name. */
  it('keeps locate and stats off, because both are occasional', () => {
    expect(VACUUM_OPTION_DEFAULTS.showLocate).toBe(false)
    expect(VACUUM_OPTION_DEFAULTS.showStats).toBe(false)
  })

  it('declares exactly the five keys the doc specifies', () => {
    expect([...VACUUM_OPTION_KEYS]).toEqual([
      'showCommands',
      'showBattery',
      'showFanSpeed',
      'showLocate',
      'showStats',
    ])
  })
})

describe('readVacuumOptions', () => {
  it('takes the defaults for a card with no config at all', () => {
    expect(readVacuumOptions(undefined)).toEqual(VACUUM_OPTION_DEFAULTS)
    expect(readVacuumOptions({})).toEqual(VACUUM_OPTION_DEFAULTS)
  })

  it('reads a stored value over the default', () => {
    expect(readVacuumOptions({ showCommands: false, showLocate: true })).toMatchObject({
      showCommands: false,
      showLocate: true,
    })
  })

  /**
   * One bad key costs only itself. A document with a hand-edited
   * `showCommands: "false"` must still render its other options as written,
   * rather than being thrown back to defaults wholesale.
   */
  it('falls back per key, leaving the siblings alone', () => {
    expect(readVacuumOptions({ showCommands: 'false', showLocate: true })).toMatchObject({
      showCommands: true,
      showLocate: true,
    })
  })

  it.each([
    ['a string', 'false'],
    ['a number', 0],
    ['null', null],
    ['an object', {}],
    ['an array', [true]],
  ])('falls back to the default when a value is %s', (_label, raw) => {
    for (const key of VACUUM_OPTION_KEYS) {
      expect(readVacuumOptions({ [key]: raw })[key]).toBe(VACUUM_OPTION_DEFAULTS[key])
    }
  })

  /** Every key is readable and independently overridable. */
  it('reads every key from storage', () => {
    const inverted = Object.fromEntries(
      VACUUM_OPTION_KEYS.map((key) => [key, !VACUUM_OPTION_DEFAULTS[key]])
    )

    expect(readVacuumOptions(inverted)).toEqual(inverted)
  })
})

describe('vacuumOptionsConfigSchema', () => {
  it('accepts the full option surface', () => {
    expect(
      vacuumOptionsConfigSchema.safeParse({
        showCommands: true,
        showBattery: false,
        showFanSpeed: true,
        showLocate: true,
        showStats: false,
      }).success
    ).toBe(true)
  })

  it('accepts a document stating none of the keys', () => {
    expect(vacuumOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  /**
   * Rejected at the gate rather than waved through: all five read "not the
   * disabling value" as enabled, so `showCommands: "false"` would silently keep
   * a cluster its author asked to hide.
   */
  it.each(VACUUM_OPTION_KEYS)('rejects a non-boolean %s at the import gate', (key) => {
    expect(vacuumOptionsConfigSchema.safeParse({ [key]: 'false' }).success).toBe(false)
  })
})

describe('VACUUM_CARD_VERSION', () => {
  /**
   * Markers are allocated in merge order and only ever move up. Two migrations
   * sharing a number is not a merge conflict but a silent one — a document
   * stamped by whichever build ran first would no longer *predate* the other's
   * marker and would skip that migration entirely.
   *
   * Asserted as a relation to the previous marker rather than as the literal
   * `'1.5.0'`, so it stays true when the next family bumps it and fails loudly
   * if two families ever claim one number.
   */
  it('sits above the media player marker it follows', () => {
    expect(configPredatesVacuumCard(MEDIA_PLAYER_CARD_VERSION)).toBe(true)
    expect(VACUUM_CARD_VERSION).not.toBe(MEDIA_PLAYER_CARD_VERSION)
  })

  it('does not treat its own marker as older than itself', () => {
    expect(configPredatesVacuumCard(VACUUM_CARD_VERSION)).toBe(false)
  })

  it.each([
    ['an older document', '1.0.0', true],
    ['the previous marker', '1.4.0', true],
    ['a newer document', '2.0.0', false],
    ['a much newer document', '1.9.0', false],
  ])('reads %s as predating=%s', (_label, version, expected) => {
    expect(configPredatesVacuumCard(version)).toBe(expected)
  })

  /**
   * A document Liebe cannot date reads as old, so an existing card is pinned to
   * the control it already renders. Skipping the pin would silently change how a
   * placed card is operated, which is the unrecoverable direction.
   */
  it.each([
    ['missing', undefined],
    ['not a string', 4],
    ['unparseable', 'beta'],
    ['null', null],
  ])('reads a %s version as predating the card', (_label, version) => {
    expect(configPredatesVacuumCard(version)).toBe(true)
  })
})

describe('pinLegacyVacuumAction', () => {
  /**
   * Convention 7 at its sharpest. Before this change every placed vacuum
   * rendered the **fallback** card, whose body tap is `homeassistant.toggle` —
   * power. This build gives the domain a card whose default tap starts a
   * cleaning run. Without the pin, upgrading would repurpose a tap that has
   * always cut power into one that sends the vacuum out.
   */
  it('pins a pre-card vacuum item to the toggle its tap has always performed', () => {
    expect(pinLegacyVacuumAction('vacuum', {})).toEqual({ tapAction: 'toggle' })
  })

  it('keeps the rest of the stored config intact', () => {
    expect(pinLegacyVacuumAction('vacuum', { showBattery: false })).toEqual({
      showBattery: false,
      tapAction: 'toggle',
    })
  })

  /** A document that already states a tap is a document that has been configured. */
  it.each([
    ['default', 'default'],
    ['more-info', 'more-info'],
    ['none', 'none'],
  ])('leaves an item already stating tapAction: %s alone', (_label, tapAction) => {
    const config = { tapAction }

    expect(pinLegacyVacuumAction('vacuum', config)).toBe(config)
  })

  /**
   * An own-property check, not `in`: "does this document already say something"
   * is a question about the document, and answering it from the prototype chain
   * is a bug waiting for a key named like one of `Object.prototype`'s.
   */
  it('pins an item whose config merely inherits tapAction from the prototype', () => {
    const config = Object.create({ tapAction: 'more-info' }) as Record<string, unknown>

    expect(pinLegacyVacuumAction('vacuum', config)).toMatchObject({ tapAction: 'toggle' })
  })

  it.each(['light', 'media_player', 'lock', 'switch'])('leaves a %s item alone', (domain) => {
    const config = {}

    expect(pinLegacyVacuumAction(domain, config)).toBe(config)
  })

  /** Returned by reference when nothing applies, so callers can compare cheaply. */
  it('returns the same object when it changes nothing', () => {
    const config = { tapAction: 'default' }

    expect(pinLegacyVacuumAction('vacuum', config)).toBe(config)
  })
})
