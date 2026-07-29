import { describe, it, expect } from 'vitest'
import { createMediaPlayerEntity } from '~/test/fixtures'
import {
  MEDIA_PLAYER_FEATURE,
  readMediaPlayerFeatures,
  readMediaPlayerMask,
  type MediaPlayerAttributes,
} from '../features'

/**
 * The `supported_features` bits, pinned against the values read out of Home
 * Assistant's own source.
 *
 * This file exists because of a specific, shipped defect: the cover card's
 * `COVER_FEATURE` map had `STOP_TILT` and `SET_TILT_POSITION` transposed, and
 * **every test agreed with it**, because the tests were written from the same
 * map they were meant to check. A test that reads the constant it is verifying
 * proves only that the file is self-consistent.
 *
 * So the literals below are written out by hand, transcribed from
 * `homeassistant/components/media_player/const.py` in the Home Assistant 2026.7.2
 * container this repo's e2e stack runs (`class MediaPlayerEntityFeature`). If a
 * bit here is wrong, the fix is to re-read that file, not to make this match
 * `features.ts`.
 */
describe('MEDIA_PLAYER_FEATURE', () => {
  it('matches MediaPlayerEntityFeature bit for bit', () => {
    expect(MEDIA_PLAYER_FEATURE).toEqual({
      PAUSE: 1,
      SEEK: 2,
      VOLUME_SET: 4,
      VOLUME_MUTE: 8,
      PREVIOUS_TRACK: 16,
      NEXT_TRACK: 32,
      TURN_ON: 128,
      TURN_OFF: 256,
      PLAY_MEDIA: 512,
      VOLUME_STEP: 1024,
      SELECT_SOURCE: 2048,
      STOP: 4096,
      CLEAR_PLAYLIST: 8192,
      PLAY: 16384,
      SHUFFLE_SET: 32768,
      SELECT_SOUND_MODE: 65536,
      BROWSE_MEDIA: 131072,
      REPEAT_SET: 262144,
      GROUPING: 524288,
      MEDIA_ANNOUNCE: 1048576,
      MEDIA_ENQUEUE: 2097152,
      SEARCH_MEDIA: 4194304,
    })
  })

  /**
   * The two bits this card's behaviour hinges on hardest, asserted separately so
   * a failure names which one moved rather than diffing a 22-key object.
   *
   * `PLAY` is 16384 and NOT 64 — there is no bit 64 in the enum at all, and the
   * gap between `NEXT_TRACK` (32) and `TURN_ON` (128) is exactly where a
   * transcription that assumed contiguous doubling would put it.
   */
  it('places PLAY at 16384 and TURN_ON at 128, with nothing at 64', () => {
    expect(MEDIA_PLAYER_FEATURE.PLAY).toBe(16384)
    expect(MEDIA_PLAYER_FEATURE.TURN_ON).toBe(128)
    expect(Object.values(MEDIA_PLAYER_FEATURE)).not.toContain(64)
  })
})

/**
 * The default fixture's mask, pinned against the bits it claims to advertise.
 *
 * `createMediaPlayerEntity` writes `supported_features` as a bare literal and its
 * doc comment lists the bits in prose; this is the only thing holding the two
 * together. It was not always here, and in its absence the literal and the prose
 * disagreed for three bits — TURN_ON, TURN_OFF and VOLUME_MUTE were documented
 * and clear — while the fixture's own comment claimed a test like this one
 * existed.
 *
 * That mattered beyond the comment. The `Off` story takes the fixture unmodified
 * and asserts the card's `Turn on` button, which `resolveMediaPrimaryAction`
 * cannot produce without bit 128: the assertion was false, and passed nowhere
 * because Storybook's play functions run in neither `npm test` nor CI.
 *
 * Written as a sum of **named members** rather than as `19903`, so a wrong bit
 * fails here by name instead of as a mismatch between two opaque numbers — and
 * so an edit to either the fixture or the constants breaks this loudly.
 */
describe('createMediaPlayerEntity', () => {
  it('advertises exactly the bits its doc comment claims', () => {
    const {
      PAUSE,
      SEEK,
      VOLUME_SET,
      VOLUME_MUTE,
      PREVIOUS_TRACK,
      NEXT_TRACK,
      TURN_ON,
      TURN_OFF,
      VOLUME_STEP,
      SELECT_SOURCE,
      PLAY,
    } = MEDIA_PLAYER_FEATURE

    expect(createMediaPlayerEntity().attributes.supported_features).toBe(
      PAUSE |
        SEEK |
        VOLUME_SET |
        VOLUME_MUTE |
        PREVIOUS_TRACK |
        NEXT_TRACK |
        TURN_ON |
        TURN_OFF |
        VOLUME_STEP |
        SELECT_SOURCE |
        PLAY
    )
  })

  /**
   * The gates the fixture is relied on for, read through the card's own reader
   * rather than asserted as arithmetic. `turnOn` is the one that was false while
   * every consumer assumed it true.
   */
  it('lights every gate this card reads, through readMediaPlayerFeatures', () => {
    const features = readMediaPlayerFeatures(
      createMediaPlayerEntity().attributes as MediaPlayerAttributes
    )

    expect(features).toEqual({
      pause: true,
      play: true,
      turnOn: true,
      previousTrack: true,
      nextTrack: true,
      volumeSet: true,
      volumeStep: true,
      volumeMute: true,
      seek: true,
      selectSource: true,
    })
  })
})

describe('readMediaPlayerMask', () => {
  it('reads a numeric mask', () => {
    expect(readMediaPlayerMask({ supported_features: 16385 })).toBe(16385)
  })

  it('truncates a float rather than masking against a fraction', () => {
    expect(readMediaPlayerMask({ supported_features: 16384.7 })).toBe(16384)
  })

  it.each([
    ['a string', '16384'],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an array', [16384]],
  ])('advertises nothing when supported_features is %s', (_label, raw) => {
    expect(readMediaPlayerMask({ supported_features: raw })).toBe(0)
  })

  it('advertises nothing for an entity with no attributes at all', () => {
    expect(readMediaPlayerMask(undefined)).toBe(0)
  })
})

describe('readMediaPlayerFeatures', () => {
  const featuresOf = (supported_features: unknown) =>
    readMediaPlayerFeatures({ supported_features } as MediaPlayerAttributes)

  it('reports every gate false for an entity advertising nothing', () => {
    expect(featuresOf(0)).toEqual({
      pause: false,
      play: false,
      turnOn: false,
      previousTrack: false,
      nextTrack: false,
      volumeSet: false,
      volumeStep: false,
      volumeMute: false,
      seek: false,
      selectSource: false,
    })
  })

  /**
   * One case per gate, each with **only** that bit set, so a gate reading the
   * wrong bit fails rather than being carried by a neighbour in a combined mask.
   */
  it.each([
    ['pause', 1],
    ['seek', 2],
    ['volumeSet', 4],
    ['volumeMute', 8],
    ['previousTrack', 16],
    ['nextTrack', 32],
    ['turnOn', 128],
    ['volumeStep', 1024],
    ['selectSource', 2048],
    ['play', 16384],
  ] as const)('reads %s from bit %i alone', (gate, bit) => {
    const features = featuresOf(bit)

    expect(features[gate]).toBe(true)
    // Nothing else lights up from a single bit.
    expect(Object.values(features).filter(Boolean)).toHaveLength(1)
  })

  it('reads several bits from a combined mask', () => {
    // PAUSE | PREVIOUS_TRACK | NEXT_TRACK | PLAY
    const features = featuresOf(1 | 16 | 32 | 16384)

    expect(features).toMatchObject({
      pause: true,
      previousTrack: true,
      nextTrack: true,
      play: true,
      turnOn: false,
      volumeSet: false,
    })
  })

  /**
   * Booleans, never the masked bits. React renders a numeric `0` as the text
   * "0", so a gate returning `mask & BIT` would stamp a stray zero onto the card
   * the moment it gated JSX with `&&`.
   */
  it('returns booleans rather than masked bits', () => {
    for (const value of Object.values(featuresOf(16384))) {
      expect(typeof value).toBe('boolean')
    }
  })

  it('ignores bits this card does not gate on', () => {
    // GROUPING alone — reserved by the option doc, gated by nothing here.
    expect(Object.values(featuresOf(524288)).filter(Boolean)).toHaveLength(0)
  })
})
