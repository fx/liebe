import { describe, it, expect } from 'vitest'
import { domainColors } from '~/theme/tokens'
import type { HassEntity } from '~/store/entityTypes'
import {
  PERSON_AVATAR_SCALES,
  resolveAvatarHue,
  resolvePersonInitials,
  resolvePersonPicture,
  resolvePersonPresence,
  resolveZoneLabel,
  zoneEntityIdForState,
} from '../presentation'

/** A zone entity, or any entity whose attributes are all this test cares about. */
function entityWith(attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: 'zone.work',
    state: 'zoning',
    attributes: attributes as HassEntity['attributes'],
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

describe('resolvePersonPresence', () => {
  it('names the two states Home Assistant defines', () => {
    expect(resolvePersonPresence('home')).toBe('home')
    expect(resolvePersonPresence('not_home')).toBe('away')
  })

  it('treats every other state as a zone', () => {
    // The vocabulary belongs to the user, not to this build: a zone can be
    // called anything, so "not one of the two literals" is the whole rule.
    for (const state of ['Work', 'School', 'the_gym', 'Оффис']) {
      expect(resolvePersonPresence(state)).toBe('zone')
    }
  })

  it('holds the states that are the absence of a location', () => {
    // `None` from a person with no usable tracker reaches a card as `unknown`;
    // an entity that has gone away reaches it as `unavailable`. Neither is a
    // place, so neither may resolve to the zone treatment.
    expect(resolvePersonPresence('unknown')).toBe('unknown')
    expect(resolvePersonPresence('unavailable')).toBe('unknown')
    expect(resolvePersonPresence('')).toBe('unknown')
  })
})

describe('zoneEntityIdForState', () => {
  it('slugifies a zone name into its entity id', () => {
    expect(zoneEntityIdForState('Work')).toBe('zone.work')
    expect(zoneEntityIdForState('Work Office')).toBe('zone.work_office')
    expect(zoneEntityIdForState("Nan's House")).toBe('zone.nan_s_house')
  })

  it('asks for nothing when the state is not a zone', () => {
    // `''` is what makes the lookup safe to run unconditionally: the hook reads
    // an absent key and never subscribes, so hook order does not depend on
    // where somebody is.
    expect(zoneEntityIdForState('home')).toBe('')
    expect(zoneEntityIdForState('not_home')).toBe('')
    expect(zoneEntityIdForState('unknown')).toBe('')
    expect(zoneEntityIdForState('unavailable')).toBe('')
  })

  it('asks for nothing when a zone name slugifies to nothing', () => {
    // A name that is entirely punctuation would otherwise produce `zone.`, which
    // names no entity and would subscribe to a key that can never arrive.
    expect(zoneEntityIdForState('!!!')).toBe('')
    expect(zoneEntityIdForState('   ')).toBe('')
  })

  it('keeps a zone named after a prototype property out of the prototype', () => {
    /*
     * A zone may legally be called "constructor", and reading a plain object at
     * a user-supplied key is a bug this repo has shipped three times
     * (`CONDITION_BACKGROUNDS`, `hvacModeConfig`, the lock's state table).
     *
     * The id must therefore stay prefixed rather than being reduced to the bare
     * word: `entities['zone.constructor']` is a miss, where
     * `entities['constructor']` is a function.
     */
    expect(zoneEntityIdForState('constructor')).toBe('zone.constructor')
    // `__proto__` loses its underscores to the same trimming Home Assistant's
    // own slugify applies. That is incidental: the prefix is what makes both
    // safe, and `zone.proto` would be as safe as `zone.__proto__`.
    expect(zoneEntityIdForState('__proto__')).toBe('zone.proto')
  })
})

describe('resolveZoneLabel', () => {
  it('reads the two defined states as words, not as raw state', () => {
    expect(resolveZoneLabel('home', undefined)).toBe('Home')
    expect(resolveZoneLabel('not_home', undefined)).toBe('Away')
  })

  it('says Unknown when presence is indeterminate', () => {
    expect(resolveZoneLabel('unknown', undefined)).toBe('Unknown')
  })

  it('prefers the zone entity’s friendly name over the reported state', () => {
    /*
     * The two disagree after a rename: Home Assistant updates the zone entity
     * immediately, while trackers keep reporting the old name until they next
     * move. The entity is the one the user edited, so it wins.
     */
    expect(resolveZoneLabel('work', entityWith({ friendly_name: 'The Office' }))).toBe('The Office')
  })

  it('falls back to the state, title-cased, when no zone entity answers', () => {
    // A tracker reporting a zone from another instance, or one deleted since,
    // still names somewhere worth showing — and showing `work_office` raw would
    // look like a bug in the card rather than a zone nobody renamed.
    expect(resolveZoneLabel('work_office', undefined)).toBe('Work Office')
    expect(resolveZoneLabel('constructor', undefined)).toBe('Constructor')
  })

  it('falls back when the zone entity has no usable name', () => {
    expect(resolveZoneLabel('work', entityWith({}))).toBe('Work')
    expect(resolveZoneLabel('work', entityWith({ friendly_name: '   ' }))).toBe('Work')
  })
})

describe('resolvePersonPicture', () => {
  it('reads a published photo path', () => {
    expect(resolvePersonPicture(entityWith({ entity_picture: '/api/image/serve/abc' }))).toBe(
      '/api/image/serve/abc'
    )
  })

  it('reads a person with no photo as having none, though the key is present', () => {
    /*
     * The shape that makes this a value check rather than a key check: the
     * person component sets the attribute unconditionally from config
     * (`self._attr_entity_picture = self._config.get(CONF_PICTURE)`), so every
     * person who has never been given a photo publishes the key holding `None`.
     * That is the common case, and a card testing for the key would render
     * `<img src="null">` on it.
     */
    expect(resolvePersonPicture(entityWith({ entity_picture: null }))).toBeUndefined()
    expect(resolvePersonPicture(entityWith({ entity_picture: '' }))).toBeUndefined()
    expect(resolvePersonPicture(entityWith({ entity_picture: '   ' }))).toBeUndefined()
    expect(resolvePersonPicture(entityWith({}))).toBeUndefined()
    expect(resolvePersonPicture(undefined)).toBeUndefined()
  })
})

describe('resolvePersonInitials', () => {
  it('takes the first letters of up to two name words', () => {
    expect(resolvePersonInitials('person.jane_doe', 'Jane Doe')).toBe('JD')
    expect(resolvePersonInitials('person.jane', 'Jane')).toBe('J')
    expect(resolvePersonInitials('person.jane_van_doe', 'Jane van Doe')).toBe('JV')
  })

  it('reads the entity id when there is no friendly name', () => {
    // Underscores are word breaks here too, which is the difference between
    // "JD" and the "P" that splitting the whole entity id would give. A person
    // created in YAML need not have a friendly name; one created in the UI does.
    expect(resolvePersonInitials('person.jane_doe', undefined)).toBe('JD')
    expect(resolvePersonInitials('person.jane_doe', '   ')).toBe('JD')
  })

  it('reads names outside the Latin alphabet', () => {
    // The shapes a Latin-only assumption gets wrong: a cased non-Latin script,
    // and a script with no case distinction at all — which is returned
    // unchanged rather than dropped.
    expect(resolvePersonInitials('person.maria', 'Мария Иванова')).toBe('МИ')
    expect(resolvePersonInitials('person.li', '李 明')).toBe('李明')
  })

  it('takes a whole character, not half a surrogate pair', () => {
    // `charAt(0)` on an astral character yields a lone high surrogate, which
    // renders as a replacement glyph. This is why the resolver iterates code
    // points.
    expect(resolvePersonInitials('person.math', '𝒥ane 𝒟oe')).toBe('𝒥𝒟')
  })

  it('yields nothing when there is nothing to derive', () => {
    // Not a neutral default standing in for a decision: there is genuinely no
    // letter here, and the card is specified to render its glyph in that case.
    expect(resolvePersonInitials('person.', '')).toBe('')
    expect(resolvePersonInitials('person', undefined)).toBe('')
  })
})

describe('resolveAvatarHue', () => {
  it('gives the same person the same colour, every time', () => {
    // The option doc's actual requirement — stable "across sessions, screens,
    // and exports" — which is why this is a pure function of the id and nothing
    // else. A memoised random would satisfy a within-run comparison and fail
    // the requirement.
    expect(resolveAvatarHue('person.jane_doe')).toBe(resolveAvatarHue('person.jane_doe'))
  })

  it('keeps the colours it has already assigned', () => {
    /*
     * Golden values, deliberately. Changing the hash or reordering the palette
     * would repaint every avatar on every existing dashboard — the exact promise
     * "the same person always gets the same colour across sessions" makes — so
     * the algorithm is pinned rather than merely its determinism. This test
     * failing means that promise is being broken, which is a decision to take
     * knowingly rather than a test to update.
     */
    expect(resolveAvatarHue('person.jane_doe')).toBe('var(--gold-9)')
    expect(resolveAvatarHue('person.marian')).toBe('var(--brown-9)')
    expect(resolveAvatarHue('person.alex')).toBe('var(--gold-9)')
  })

  it('separates ids that are anagrams of one another', () => {
    /*
     * The property that distinguishes a hash from a sum of character codes: a
     * sum gives every one of these pairs the same colour, and two housemates
     * whose ids are anagrams is likelier than a hash collision.
     *
     * Asserted over a set rather than one pair, because with eight colours any
     * single pair may legitimately collide — "all of them collide" is the
     * failure worth naming, and it is what a sum produces. This caught a real
     * one: plain FNV-1a separated only three of these eight, because its low
     * bits carry the tail of the id rather than the whole of it.
     */
    const anagrams = [
      ['person.raj', 'person.jar'],
      ['person.abc', 'person.cba'],
      ['person.stop', 'person.tops'],
      ['person.dale', 'person.deal'],
      ['person.evil', 'person.vile'],
      ['person.lion', 'person.loin'],
      ['person.stream', 'person.master'],
      ['person.listen', 'person.silent'],
    ]

    const separated = anagrams.filter(([a, b]) => resolveAvatarHue(a) !== resolveAvatarHue(b))

    expect(separated).toHaveLength(anagrams.length)
  })

  it('uses the whole palette rather than a corner of it', () => {
    // A hash whose index came off its low bits would leave buckets empty and
    // crowd others; an even spread is what makes eight colours worth having.
    const assigned = new Set(
      Array.from({ length: 2000 }, (_, index) => resolveAvatarHue(`person.p${index}`))
    )

    expect(assigned.size).toBe(PERSON_AVATAR_SCALES.length)
  })

  it('only ever answers with a colour from the palette', () => {
    const palette = new Set(PERSON_AVATAR_SCALES.map((scale) => `var(--${scale}-9)`))

    for (const id of ['person.a', 'person.b', 'person.jane_doe', 'person.', 'person.ᴀ']) {
      expect(palette).toContain(resolveAvatarHue(id))
    }
  })

  it('spreads a household across more than one colour', () => {
    const household = ['person.jane', 'person.marian', 'person.alex', 'person.sam', 'person.robin']
    const assigned = new Set(household.map(resolveAvatarHue))

    // Not "all distinct" — eight buckets cannot promise that for an arbitrary
    // household, and asserting it would pin the sample rather than the rule.
    // What must hold is that the function distinguishes at all.
    expect(assigned.size).toBeGreaterThan(1)
  })

  it('draws only from hues the design system has not reserved', () => {
    /*
     * The rule behind the palette rather than the palette itself: an avatar in
     * green or red would read as the badge dot's home/away, and one in amber or
     * sky as a domain state the person is not in
     * (docs/specs/design-system — "Domain color discipline").
     *
     * Written against the token table so that reserving a new domain hue there
     * fails here, rather than silently colliding with an identity colour.
     */
    const reserved = new Set<string>(domainColors.map((color) => color.scale))

    expect(PERSON_AVATAR_SCALES.filter((scale) => reserved.has(scale))).toEqual([])
  })
})
