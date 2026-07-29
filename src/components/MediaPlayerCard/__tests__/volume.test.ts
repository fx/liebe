import { describe, it, expect } from 'vitest'
import { readMediaPlayerFeatures } from '../features'
import {
  VOLUME_STEP_FRACTION,
  canSelectSource,
  isVolumeMuted,
  optimisticVolumeStillStands,
  percentToVolume,
  readCurrentSource,
  readSourceList,
  readVolumeLevel,
  resolveDisplayVolume,
  resolveVolumePresentation,
  steppedVolume,
  volumeToPercent,
} from '../volume'

/** Feature booleans from a raw mask, so these state bits the way HA does. */
const withFeatures = (mask: number) => readMediaPlayerFeatures({ supported_features: mask })

const VOLUME_SET = 4
const VOLUME_MUTE = 8
const VOLUME_STEP = 1024
const SELECT_SOURCE = 2048

describe('resolveVolumePresentation', () => {
  /*
   * The degradation ladder. Every rung is a case a real integration produces:
   * Chromecasts set, some AVRs only step, and a handful of TV integrations
   * advertise nothing but mute.
   */

  it('renders the slider when the player can set volume', () => {
    expect(resolveVolumePresentation('slider', withFeatures(VOLUME_SET))).toBe('slider')
  })

  /**
   * The automatic degradation the option doc calls for by name: the stored
   * option stays `slider`, and the entity is what cannot do better.
   */
  it('degrades a slider to buttons for a step-only player', () => {
    expect(resolveVolumePresentation('slider', withFeatures(VOLUME_STEP))).toBe('buttons')
  })

  it('degrades further to mute-only for a player advertising only VOLUME_MUTE', () => {
    expect(resolveVolumePresentation('slider', withFeatures(VOLUME_MUTE))).toBe('mute-only')
  })

  it('renders nothing when the player has no volume feature at all', () => {
    expect(resolveVolumePresentation('slider', withFeatures(0))).toBe('none')
    expect(resolveVolumePresentation('buttons', withFeatures(0))).toBe('none')
  })

  it('renders nothing when the option says none, however capable the player', () => {
    expect(
      resolveVolumePresentation('none', withFeatures(VOLUME_SET | VOLUME_STEP | VOLUME_MUTE))
    ).toBe('none')
  })

  it('renders buttons when asked, for a stepping player', () => {
    expect(resolveVolumePresentation('buttons', withFeatures(VOLUME_STEP))).toBe('buttons')
  })

  /**
   * The rung worth naming: the option doc allows steppers built from "stepped
   * `volume_set`", so a player that can be set but not stepped still gets
   * working buttons rather than being pushed down to mute-only.
   */
  it('renders buttons for a set-only player asked for buttons', () => {
    expect(resolveVolumePresentation('buttons', withFeatures(VOLUME_SET))).toBe('buttons')
  })

  it('degrades buttons to mute-only for a mute-only player', () => {
    expect(resolveVolumePresentation('buttons', withFeatures(VOLUME_MUTE))).toBe('mute-only')
  })

  it('prefers the slider when a player advertises everything', () => {
    expect(
      resolveVolumePresentation('slider', withFeatures(VOLUME_SET | VOLUME_STEP | VOLUME_MUTE))
    ).toBe('slider')
  })
})

describe('readVolumeLevel', () => {
  it('reads a fraction', () => {
    expect(readVolumeLevel({ volume_level: 0.42 })).toBe(0.42)
  })

  it('clamps a value outside 0–1 rather than trusting it', () => {
    expect(readVolumeLevel({ volume_level: 1.5 })).toBe(1)
    expect(readVolumeLevel({ volume_level: -0.2 })).toBe(0)
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', '0.42'],
    ['NaN', Number.NaN],
  ])('reports no volume for %s', (_label, volume_level) => {
    expect(readVolumeLevel({ volume_level })).toBeUndefined()
  })

  it('reports no volume for an entity with no attributes', () => {
    expect(readVolumeLevel(undefined)).toBeUndefined()
  })
})

describe('isVolumeMuted', () => {
  it('is true only for a real boolean true', () => {
    expect(isVolumeMuted({ is_volume_muted: true })).toBe(true)
  })

  it.each([false, 'true', 1, undefined, null])('is false for %s', (is_volume_muted) => {
    expect(isVolumeMuted({ is_volume_muted })).toBe(false)
  })
})

describe('the optimistic volume', () => {
  /*
   * The reconciliation, which is what makes an optimistic control safe to ship.
   * The card shows a value the entity has not confirmed; these pin how that
   * claim ends — and that an uncommitted drag never ends by itself.
   */

  const committed = (value: number, baseline: number | undefined) => ({
    value,
    baseline,
    committed: true,
  })
  const dragging = (value: number, baseline: number | undefined) => ({
    value,
    baseline,
    committed: false,
  })

  it('stands while the entity has not moved off the baseline', () => {
    expect(optimisticVolumeStillStands(committed(0.8, 0.4), 0.4)).toBe(true)
  })

  it('is dropped the moment the entity moves to the value that was sent', () => {
    expect(optimisticVolumeStillStands(committed(0.8, 0.4), 0.8)).toBe(false)
  })

  /**
   * The case that makes "any movement" the right rule rather than "movement to
   * the value sent": a receiver with a volume cap answers a request for 1.0 with
   * 0.8. An exact-match rule would leave the card insisting on 1.0 forever.
   */
  it('is dropped when the entity answers with something else entirely', () => {
    expect(optimisticVolumeStillStands(committed(1, 0.4), 0.8)).toBe(false)
  })

  it('is dropped when the entity stops reporting a volume at all', () => {
    expect(optimisticVolumeStillStands(committed(0.8, 0.4), undefined)).toBe(false)
  })

  it('stands for a player that had no volume when the command went out', () => {
    expect(optimisticVolumeStillStands(committed(0.8, undefined), undefined)).toBe(true)
  })

  /**
   * The anti-snap-back rule. Nothing has been dispatched during a drag, so there
   * is no truth to arrive — an incoming state update from another client must
   * not move the thumb out from under the user's finger.
   */
  it('always stands while uncommitted, whatever the entity reports', () => {
    expect(optimisticVolumeStillStands(dragging(0.9, 0.2), 0.2)).toBe(true)
    expect(optimisticVolumeStillStands(dragging(0.9, 0.2), 0.5)).toBe(true)
    expect(optimisticVolumeStillStands(dragging(0.9, 0.2), undefined)).toBe(true)
  })

  describe('resolveDisplayVolume', () => {
    it('shows an optimistic value over the entity', () => {
      expect(resolveDisplayVolume(0.2, committed(0.5, 0.2))).toBe(0.5)
      expect(resolveDisplayVolume(0.2, dragging(0.9, 0.2))).toBe(0.9)
    })

    it('shows the entity when nothing is outstanding', () => {
      expect(resolveDisplayVolume(0.2, null)).toBe(0.2)
    })

    it('shows zero for a player reporting no volume', () => {
      expect(resolveDisplayVolume(undefined, null)).toBe(0)
    })

    /** A drag to silence is a real value, not an absent one. */
    it('shows a dragged zero rather than falling through to the entity', () => {
      expect(resolveDisplayVolume(0.7, dragging(0, 0.7))).toBe(0)
    })
  })
})

describe('volume conversions', () => {
  it.each([
    [0, 0],
    [0.42, 42],
    [1, 100],
  ])('shows %f as %i%%', (fraction, percent) => {
    expect(volumeToPercent(fraction)).toBe(percent)
  })

  it.each([
    [0, 0],
    [42, 0.42],
    [100, 1],
  ])('sends %i%% as %f', (percent, fraction) => {
    expect(percentToVolume(percent)).toBe(fraction)
  })

  /**
   * Not `0.42000000000000004`. Beyond tidiness: the dispatch guard keys on
   * `JSON.stringify(data)`, so two spellings of one value would be two different
   * commands to it.
   */
  it('produces a clean decimal rather than a float artefact', () => {
    expect(String(percentToVolume(42))).toBe('0.42')
    expect(String(percentToVolume(7))).toBe('0.07')
  })

  it('round-trips every whole percent', () => {
    for (let percent = 0; percent <= 100; percent++) {
      expect(volumeToPercent(percentToVolume(percent))).toBe(percent)
    }
  })

  it('clamps out-of-range input at both ends', () => {
    expect(percentToVolume(140)).toBe(1)
    expect(percentToVolume(-20)).toBe(0)
    expect(volumeToPercent(2)).toBe(100)
    expect(volumeToPercent(-1)).toBe(0)
  })
})

describe('steppedVolume', () => {
  /*
   * Written as literals rather than as `0.4 - VOLUME_STEP_FRACTION`, because in
   * IEEE 754 that expression *is* 0.30000000000000004 — the artefact the
   * rounding exists to remove. Computing the expectation the same way the code
   * would have without rounding is a test that agrees with the bug.
   */
  it('steps up and down by Home Assistant’s own increment', () => {
    expect(VOLUME_STEP_FRACTION).toBe(0.1)
    expect(steppedVolume(0.4, 1)).toBe(0.5)
    expect(steppedVolume(0.4, -1)).toBe(0.3)
  })

  it('stops at the ends of the range rather than passing them', () => {
    expect(steppedVolume(0.95, 1)).toBe(1)
    expect(steppedVolume(0.05, -1)).toBe(0)
  })

  it('produces a clean decimal', () => {
    expect(String(steppedVolume(0.7, 1))).toBe('0.8')
  })
})

describe('source reading', () => {
  it('reads the list', () => {
    expect(readSourceList({ source_list: ['Spotify', 'Radio'] })).toEqual(['Spotify', 'Radio'])
  })

  /** A non-string member is an option with no label — the fan-preset defect. */
  it('filters out members it could not label', () => {
    expect(readSourceList({ source_list: ['Spotify', 1, null, '', 'Radio'] })).toEqual([
      'Spotify',
      'Radio',
    ])
  })

  it.each([
    ['absent', undefined],
    ['not a list', 'Spotify'],
    ['an empty list', []],
  ])('reads no sources when source_list is %s', (_label, source_list) => {
    expect(readSourceList({ source_list })).toEqual([])
  })

  it('reads the current source', () => {
    expect(readCurrentSource({ source: 'Radio' })).toBe('Radio')
  })

  it.each([undefined, '', 42, null])('reports no current source for %s', (source) => {
    expect(readCurrentSource({ source })).toBeUndefined()
  })
})

describe('canSelectSource', () => {
  const list = { source_list: ['Spotify', 'Radio'] }

  it('is true with the bit and a list', () => {
    expect(canSelectSource(list, withFeatures(SELECT_SOURCE))).toBe(true)
  })

  it('is false without the bit, however long the list', () => {
    expect(canSelectSource(list, withFeatures(0))).toBe(false)
  })

  /** The bit without a list is a picker with nothing to pick. */
  it('is false with the bit and no list', () => {
    expect(canSelectSource({ source_list: [] }, withFeatures(SELECT_SOURCE))).toBe(false)
  })

  it('is false with the bit and a list of nothing labellable', () => {
    expect(canSelectSource({ source_list: [1, null] }, withFeatures(SELECT_SOURCE))).toBe(false)
  })
})
