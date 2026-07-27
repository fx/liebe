import { describe, it, expect } from 'vitest'
import {
  ENTITY_LINK_DEFAULT,
  entityIdSchema,
  entityLinkSchema,
  numberArraySchema,
  numberEntrySchema,
  orderedSelectionSchema,
  readEntityLink,
  readNumberArray,
  readOrderedSelection,
  readStoredList,
} from '../configControls'

/**
 * The value contracts behind the shared non-scalar config controls. The split
 * that matters here is schemas versus readers: the schemas are what the import
 * gate rejects a bad config with, and the readers are what the render path
 * survives one with — resolving what this build understands and leaving
 * everything else exactly as stored (docs/specs/dashboard-config/index.md —
 * "Forward Compatibility").
 */
describe('entity link', () => {
  it.each([
    ['', 'nothing linked'],
    ['binary_sensor.driveway_motion', 'an entity id'],
    ['sensor.gone_away', 'an id no instance may currently have'],
  ])('accepts %s (%s)', (value) => {
    expect(entityLinkSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    ['binary_sensor'],
    ['Binary_Sensor.Motion'],
    ['sensor.'],
    ['sensor.a.b'],
    // The same forms Home Assistant's own `valid_entity_id` refuses: a leading,
    // trailing, or doubled underscore in either segment.
    ['sensor._motion'],
    ['sensor.motion_'],
    ['_sensor.motion'],
    ['sensor__aux.motion'],
    ['sensor.front__door'],
  ])('rejects the malformed id %s', (value) => {
    expect(entityIdSchema.safeParse(value).success).toBe(false)
  })

  /*
   * The pattern is a restatement of Home Assistant's own `valid_entity_id`,
   * written without lookbehind so it parses on engines that lack it (Safari
   * before 16.4, where a lookbehind literal is a module-killing syntax error
   * rather than a validation quirk). "Restatement" is only true if it is
   * checked, so these tests run Core's pattern beside ours and require them to
   * agree — including on the strings a hand-edited config is most likely to
   * contain.
   *
   * Core's regex is built with `new RegExp` from a string on purpose: as a
   * literal it would be parsed at module load, which is precisely the failure
   * the production pattern exists to avoid.
   */
  const HA_VALID_ENTITY_ID = new RegExp(
    String.raw`^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$`
  )
  const accepts = (value: string) => entityIdSchema.safeParse(value).success

  it.each([
    // Accepted shapes.
    ['sensor.motion', 'the ordinary case'],
    ['binary_sensor.driveway_motion', 'underscores in both segments'],
    ['a.b', 'single-character segments'],
    ['1.2', 'digits only'],
    ['sensor2.motion_3', 'digits mixed in'],
    ['a_1.b_2', 'an underscore between a letter and a digit'],
    // Leading underscore.
    ['_sensor.motion', 'a leading underscore on the domain'],
    ['sensor._motion', 'a leading underscore on the object id'],
    ['__sensor.motion', 'a doubled leading underscore'],
    // Trailing underscore.
    ['sensor_.motion', 'a trailing underscore on the domain'],
    ['sensor.motion_', 'a trailing underscore on the object id'],
    ['sensor.motion__', 'a doubled trailing underscore'],
    // Doubled underscore, in either segment and longer runs of it.
    ['sensor__aux.motion', 'a doubled underscore in the domain'],
    ['sensor.front__door', 'a doubled underscore in the object id'],
    ['sensor.mot___ion', 'a tripled underscore'],
    ['_._', 'nothing but underscores'],
    ['sensor._', 'an object id that is one underscore'],
    // Empty segments, missing and extra separators.
    ['', 'the empty string'],
    ['.', 'a bare dot'],
    ['.motion', 'an empty domain'],
    ['sensor.', 'an empty object id'],
    ['sensor', 'no dot at all'],
    ['sensor.a.b', 'two dots'],
    ['sensor..motion', 'a doubled dot'],
    // Characters outside the alphabet.
    ['Sensor.Motion', 'uppercase in both segments'],
    ['sensor.Motion', 'uppercase in the object id'],
    ['SENSOR.MOTION', 'all uppercase'],
    ['sensor.motión', 'a non-ASCII letter'],
    ['sensör.motion', 'a non-ASCII letter in the domain'],
    ['sensor.日本', 'a non-Latin script'],
    ['sensor.mot ion', 'a space'],
    ['sensor.motion-1', 'a hyphen'],
    // Anchoring: `$` in JavaScript stops at the end of input, with no
    // concession for a trailing newline. Both patterns must agree on that too.
    ['sensor.motion\n', 'a trailing newline'],
    ['\nsensor.motion', 'a leading newline'],
    ['sensor.motion\nlight.kitchen', 'two ids on separate lines'],
  ])('agrees with Home Assistant on %s (%s)', (value) => {
    expect(accepts(value)).toBe(HA_VALID_ENTITY_ID.test(value))
  })

  it('agrees with Home Assistant on every short string over the relevant alphabet', () => {
    // The named cases above say what each category is; this says the two
    // patterns are the same function. Four characters — a letter, a digit, the
    // underscore, and the separator — generate every structural arrangement
    // that matters, and exhausting lengths 1 through 5 covers all 1364 of them.
    const alphabet = ['a', '1', '_', '.']
    let strings = ['']
    const divergent: string[] = []

    for (let length = 1; length <= 5; length++) {
      strings = strings.flatMap((prefix) => alphabet.map((character) => prefix + character))
      for (const value of strings) {
        if (accepts(value) !== HA_VALID_ENTITY_ID.test(value)) divergent.push(value)
      }
    }

    expect(divergent).toEqual([])
  })

  it('reads a stored id verbatim, including one this instance cannot resolve', () => {
    // Whether the entity exists is a question for the machine rendering the
    // card, not for the config: a shared dashboard lands on instances that name
    // their sensors differently, and the link must survive the trip.
    expect(readEntityLink({ motionEntity: 'binary_sensor.not_here' }, 'motionEntity')).toBe(
      'binary_sensor.not_here'
    )
  })

  it.each([
    ['an absent key', undefined],
    ['a malformed id', 'binary_sensor'],
    ['a value that is not a string', 42],
  ])('resolves %s to nothing linked', (_case, stored) => {
    expect(readEntityLink({ doorEntity: stored }, 'doorEntity')).toBe(ENTITY_LINK_DEFAULT)
    expect(readEntityLink(undefined, 'doorEntity')).toBe(ENTITY_LINK_DEFAULT)
  })
})

describe('number array', () => {
  const percent = { min: 1, max: 100, integer: true }

  it('accepts a fractional value when the option is not restricted to integers', () => {
    expect(numberEntrySchema().safeParse(3.5).success).toBe(true)
  })

  it.each([
    ['a fraction', 3.5],
    ['zero, below the floor', 0],
    ['a value over the ceiling', 101],
    ['not a number', NaN],
    ['infinite', Infinity],
  ])('rejects %s as a percentage entry', (_case, value) => {
    expect(numberEntrySchema(percent).safeParse(value).success).toBe(false)
  })

  it('validates the whole array for the import gate', () => {
    expect(numberArraySchema(percent).safeParse([20, 50, 100]).success).toBe(true)
    expect(numberArraySchema(percent).safeParse([20, 150]).success).toBe(false)
    expect(numberArraySchema(percent).safeParse(['20']).success).toBe(false)
  })

  it('reads a stored list as a list, and anything else as empty', () => {
    expect(readStoredList([1, 'two'])).toEqual([1, 'two'])
    expect(readStoredList('20,50')).toEqual([])
  })

  it('keeps the usable entries in stored order and leaves the stored value alone', () => {
    const stored = [50, 150, 'ten', 20]
    const config = { brightnessPresets: stored }

    expect(readNumberArray(config, 'brightnessPresets', percent)).toEqual([50, 20])
    // The render path resolves; it does not repair. Rewriting here would turn
    // merely opening a dashboard into an edit of somebody else's config.
    expect(stored).toEqual([50, 150, 'ten', 20])
  })

  it('reads an absent key as no values', () => {
    expect(readNumberArray({}, 'brightnessPresets', percent)).toEqual([])
    expect(readNumberArray(undefined, 'brightnessPresets')).toEqual([])
  })
})

describe('ordered selection', () => {
  const ARM_MODES = ['away', 'home', 'night', 'vacation'] as const
  const schema = orderedSelectionSchema(ARM_MODES)

  it('accepts any subset, in any order', () => {
    expect(schema.safeParse(['night', 'away']).success).toBe(true)
    expect(schema.safeParse([]).success).toBe(true)
  })

  it('rejects a value outside the canonical list', () => {
    expect(schema.safeParse(['away', 'armed_custom_bypass']).success).toBe(false)
  })

  it('rejects a repeated value, since order is meaningful and repetition is not', () => {
    const parsed = schema.safeParse(['away', 'away'])
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].message).toBe('each option may be listed only once')
  })

  it('reads the stored order, ignoring what this build cannot use', () => {
    const stored = ['night', 'armed_custom_bypass', 7, 'night', 'away']
    const config = { armModes: stored }

    expect(readOrderedSelection(config, 'armModes', ARM_MODES)).toEqual(['night', 'away'])
    expect(stored).toEqual(['night', 'armed_custom_bypass', 7, 'night', 'away'])
  })

  it('reads an absent key as nothing selected', () => {
    expect(readOrderedSelection({}, 'armModes', ARM_MODES)).toEqual([])
    expect(readOrderedSelection(undefined, 'armModes', ARM_MODES)).toEqual([])
  })
})
