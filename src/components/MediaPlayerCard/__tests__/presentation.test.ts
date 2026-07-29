import { describe, it, expect } from 'vitest'
import { readMediaPlayerFeatures } from '../features'
import {
  MEDIA_PLAYER_STATES,
  isMediaActive,
  resolveArtworkPresentation,
  resolveArtworkUrl,
  resolveMediaColor,
  resolveMediaPrimaryAction,
  resolveMediaStateLine,
  shouldCollapseIdle,
} from '../presentation'
import type { CardTier } from '~/utils/cardTier'

const NAME = 'Living Room Speaker'

/** Feature booleans from a raw mask, so these tests state bits the way HA does. */
const withFeatures = (mask: number) => readMediaPlayerFeatures({ supported_features: mask })

describe('resolveMediaStateLine', () => {
  /*
   * The inputs are almost all optional, and the shapes below are enumerated from
   * the CONSUMER — what the card asks this for at each tier — rather than from
   * the happy path. A real player omits any of them, and a receiver sitting in
   * `on` with nothing playing publishes none of them, which is the case that
   * makes the last rung load-bearing rather than theoretical.
   */

  it('takes media_title, appending the artist', () => {
    expect(
      resolveMediaStateLine(
        'playing',
        { media_title: 'Espresso Bongo', media_artist: 'Jimmy Smith' },
        NAME
      )
    ).toEqual({
      line: 'Espresso Bongo — Jimmy Smith',
      primary: 'Espresso Bongo',
      secondary: 'Jimmy Smith',
      source: 'title',
    })
  })

  it('takes media_title alone when there is no artist', () => {
    expect(resolveMediaStateLine('playing', { media_title: 'Espresso Bongo' }, NAME)).toEqual({
      line: 'Espresso Bongo',
      primary: 'Espresso Bongo',
      secondary: undefined,
      source: 'title',
    })
  })

  it('falls back to app_name — a TV with no track metadata', () => {
    expect(resolveMediaStateLine('playing', { app_name: 'Netflix' }, NAME)).toEqual({
      line: 'Netflix',
      primary: NAME,
      secondary: 'Netflix',
      source: 'app',
    })
  })

  it('falls back to the raw state when the entity publishes nothing', () => {
    expect(resolveMediaStateLine('on', {}, NAME)).toEqual({
      line: 'on',
      primary: NAME,
      secondary: 'on',
      source: 'state',
    })
  })

  it('falls back to the raw state for an entity with no attributes at all', () => {
    expect(resolveMediaStateLine('idle', undefined, NAME).line).toBe('idle')
  })

  /**
   * Empty and whitespace-only are ABSENT, not present-and-blank. An integration
   * between tracks publishes `media_title: ''` as readily as it omits the key,
   * and a card that told them apart would render a blank line for one of them.
   */
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('treats a %s media_title as absent and falls through', (_label, media_title) => {
    expect(
      resolveMediaStateLine('playing', { media_title, app_name: 'Spotify' }, NAME)
    ).toMatchObject({ line: 'Spotify', source: 'app' })
  })

  it('treats an empty app_name as absent and falls through to the state', () => {
    expect(resolveMediaStateLine('paused', { app_name: '  ' }, NAME)).toMatchObject({
      line: 'paused',
      source: 'state',
    })
  })

  /**
   * Non-strings are rejected rather than stringified: a `media_title` of `0` is
   * a broken integration, and printing "0" onto the card hides that.
   */
  it.each([
    ['a number', 0],
    ['null', null],
    ['an array', ['Espresso Bongo']],
    ['an object', { title: 'Espresso Bongo' }],
    ['a boolean', true],
  ])('rejects %s as a media_title', (_label, media_title) => {
    expect(resolveMediaStateLine('playing', { media_title }, NAME).source).toBe('state')
  })

  it('drops a non-string artist rather than appending it', () => {
    expect(
      resolveMediaStateLine('playing', { media_title: 'Espresso Bongo', media_artist: 7 }, NAME)
    ).toMatchObject({ line: 'Espresso Bongo', secondary: undefined })
  })

  it('trims surrounding whitespace off both parts', () => {
    expect(
      resolveMediaStateLine(
        'playing',
        { media_title: '  Espresso Bongo ', media_artist: ' Jimmy Smith  ' },
        NAME
      ).line
    ).toBe('Espresso Bongo — Jimmy Smith')
  })

  /**
   * The split form's fallback: with no track there is nothing for the name-style
   * line, so it holds the entity name and the muted line carries the chain's
   * answer. That is the ordinary name-over-state card, which is what a receiver
   * in `on` should look like rather than a bare "on" naming no device.
   */
  it('puts the entity name in the primary line whenever there is no track', () => {
    expect(resolveMediaStateLine('on', { app_name: 'Netflix' }, NAME).primary).toBe(NAME)
    expect(resolveMediaStateLine('idle', {}, NAME).primary).toBe(NAME)
  })
})

describe('resolveMediaPrimaryAction', () => {
  const ALL = 1 | 128 | 16384 // PAUSE | TURN_ON | PLAY

  /** Rung 1: nothing is commanded, however many bits are retained. */
  it.each(['unavailable', 'unknown'])('is inert in %s regardless of retained bits', (state) => {
    expect(resolveMediaPrimaryAction(state, withFeatures(ALL))).toBeNull()
  })

  /** Rung 2, and the reason `standby` is grouped with `off`. */
  it.each(['off', 'standby'])('turns %s on when TURN_ON is supported', (state) => {
    expect(resolveMediaPrimaryAction(state, withFeatures(128))).toBe('turn_on')
  })

  it.each(['off', 'standby'])('is inert in %s without TURN_ON', (state) => {
    expect(resolveMediaPrimaryAction(state, withFeatures(1 | 16384))).toBeNull()
  })

  /**
   * TURN_ON takes precedence over `media_play` for a standby entity advertising
   * both — the ordering rule the option doc calls out explicitly, and the one a
   * table written as ternaries gets wrong.
   */
  it('prefers turn_on over media_play in standby when both are supported', () => {
    expect(resolveMediaPrimaryAction('standby', withFeatures(128 | 16384))).toBe('turn_on')
  })

  /** Rung 3. */
  it('pauses while playing when PAUSE is supported', () => {
    expect(resolveMediaPrimaryAction('playing', withFeatures(1))).toBe('media_pause')
  })

  /**
   * The rung most likely to be written as a fallthrough, and the option doc
   * forbids it in as many words: resuming a playing entity is not the operation
   * the tap declined to perform.
   */
  it('is inert while playing without PAUSE — never media_play', () => {
    expect(resolveMediaPrimaryAction('playing', withFeatures(16384))).toBeNull()
  })

  /** Rung 4 — and `buffering` and `on` are not `playing`. */
  it.each(['paused', 'idle', 'on', 'buffering'])(
    'plays from %s when PLAY is supported',
    (state) => {
      expect(resolveMediaPrimaryAction(state, withFeatures(16384))).toBe('media_play')
    }
  )

  it.each(['paused', 'idle', 'on', 'buffering'])('is inert in %s without PLAY', (state) => {
    expect(resolveMediaPrimaryAction(state, withFeatures(1 | 128))).toBeNull()
  })

  /**
   * Totality: every state Home Assistant can publish resolves to something, and
   * nothing throws. A media card that forgot `on` or `standby` is the common
   * defect this pins against.
   */
  it('answers for every MediaPlayerState plus the two core states', () => {
    for (const state of [...MEDIA_PLAYER_STATES, 'unavailable', 'unknown']) {
      expect(() => resolveMediaPrimaryAction(state, withFeatures(ALL))).not.toThrow()
    }
  })

  it('covers all seven MediaPlayerState members', () => {
    expect([...MEDIA_PLAYER_STATES].sort()).toEqual(
      ['buffering', 'idle', 'off', 'on', 'paused', 'playing', 'standby'].sort()
    )
  })
})

describe('shouldCollapseIdle', () => {
  it.each(['idle', 'off', 'standby'])('collapses %s when the option is on', (state) => {
    expect(shouldCollapseIdle(state, true)).toBe(true)
  })

  it.each(['playing', 'paused', 'on', 'buffering'])('never collapses %s', (state) => {
    expect(shouldCollapseIdle(state, true)).toBe(false)
  })

  it('collapses nothing when the option is off', () => {
    expect(shouldCollapseIdle('idle', false)).toBe(false)
  })
})

describe('resolveArtworkPresentation', () => {
  const TIERS: CardTier[] = ['glance', 'row', 'tall', 'full']

  it.each(TIERS)('keeps thumbnail at %s', (tier) => {
    expect(resolveArtworkPresentation('thumbnail', tier)).toBe('thumbnail')
  })

  it.each(TIERS)('keeps none at %s', (tier) => {
    expect(resolveArtworkPresentation('none', tier)).toBe('none')
  })

  /**
   * The degradation the option doc requires: background is "only meaningful with
   * room for overlay", so below `full` it MUST become the thumbnail rather than
   * render an illegible postage stamp.
   */
  it.each(['glance', 'row', 'tall'] as CardTier[])(
    'degrades background to thumbnail at %s',
    (tier) => {
      expect(resolveArtworkPresentation('background', tier)).toBe('thumbnail')
    }
  )

  /** …and takes effect at `full`, which is the only tier with room for it. */
  it('applies background at full', () => {
    expect(resolveArtworkPresentation('background', 'full')).toBe('background')
  })

  /**
   * The stored option is untouched by the degradation, which is what lets a card
   * resized down and back up return to the background form without being
   * reconfigured (the option doc's resize scenario).
   */
  it('degrades without the tier changing what background means at full', () => {
    expect(resolveArtworkPresentation('background', 'row')).toBe('thumbnail')
    expect(resolveArtworkPresentation('background', 'full')).toBe('background')
  })
})

describe('resolveArtworkUrl', () => {
  it('returns a relative HA-proxied path unchanged', () => {
    expect(resolveArtworkUrl({ entity_picture: '/api/media_player_proxy/media_player.x' })).toBe(
      '/api/media_player_proxy/media_player.x'
    )
  })

  /** Integrations flagging artwork remotely accessible publish an absolute URL. */
  it('returns an absolute external URL unchanged', () => {
    expect(resolveArtworkUrl({ entity_picture: 'https://cdn.example/art.jpg' })).toBe(
      'https://cdn.example/art.jpg'
    )
  })

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '  '],
    ['a number', 42],
    ['null', null],
  ])('reports no artwork when entity_picture is %s', (_label, entity_picture) => {
    expect(resolveArtworkUrl({ entity_picture })).toBeUndefined()
  })

  it('reports no artwork for an entity with no attributes', () => {
    expect(resolveArtworkUrl(undefined)).toBeUndefined()
  })
})

describe('resolveMediaColor / isMediaActive', () => {
  it('tints indigo while playing', () => {
    expect(resolveMediaColor('playing')).toBe('media')
    expect(isMediaActive('playing')).toBe(true)
  })

  /**
   * `buffering` is deliberately not tinted: the option doc ties the active
   * pattern to `playing`, and a card that pulsed indigo on every rebuffer would
   * be reporting the network rather than the music.
   */
  it.each(['paused', 'idle', 'off', 'standby', 'on', 'buffering', 'unknown'])(
    'stays neutral in %s',
    (state) => {
      expect(resolveMediaColor(state)).toBe('default')
      expect(isMediaActive(state)).toBe(false)
    }
  )
})
