import { describe, it, expect } from 'vitest'
import {
  MEDIA_PLAYER_CARD_VERSION,
  MEDIA_PLAYER_OPTION_DEFAULTS,
  MEDIA_PLAYER_OPTION_KEYS,
  configPredatesMediaPlayerCard,
  mediaPlayerOptionsConfigSchema,
  pinLegacyMediaPlayerAction,
  readMediaPlayerOptions,
} from '../mediaPlayerOptions'

describe('readMediaPlayerOptions', () => {
  it('returns the option doc defaults for an unconfigured card', () => {
    expect(readMediaPlayerOptions({})).toEqual({
      artworkMode: 'thumbnail',
      showVolume: 'slider',
      showTransport: true,
      showSourcePicker: false,
      showProgress: false,
      collapseWhenIdle: false,
      showGroupControls: false,
    })
  })

  it('returns the defaults when there is no config at all', () => {
    expect(readMediaPlayerOptions(undefined)).toEqual(MEDIA_PLAYER_OPTION_DEFAULTS)
  })

  it('reads every stored key back', () => {
    expect(
      readMediaPlayerOptions({
        artworkMode: 'background',
        showVolume: 'buttons',
        showTransport: false,
        showSourcePicker: true,
        showProgress: true,
        collapseWhenIdle: true,
        showGroupControls: true,
      })
    ).toEqual({
      artworkMode: 'background',
      showVolume: 'buttons',
      showTransport: false,
      showSourcePicker: true,
      showProgress: true,
      collapseWhenIdle: true,
      showGroupControls: true,
    })
  })

  it.each(['background', 'thumbnail', 'none'] as const)('accepts artworkMode %s', (mode) => {
    expect(readMediaPlayerOptions({ artworkMode: mode }).artworkMode).toBe(mode)
  })

  it.each(['slider', 'buttons', 'none'] as const)('accepts showVolume %s', (style) => {
    expect(readMediaPlayerOptions({ showVolume: style }).showVolume).toBe(style)
  })

  /*
   * The render path declining to fail over a value that reached localStorage
   * some other way — imports are rejected by `dashboardConfigSchema` first. One
   * bad value costs only its own key.
   */
  it.each([
    ['artworkMode', 'cover', 'thumbnail'],
    ['showVolume', 'steppers', 'slider'],
    ['showTransport', 'yes', true],
    ['showSourcePicker', 1, false],
    ['showProgress', null, false],
    ['collapseWhenIdle', {}, false],
    ['showGroupControls', [], false],
  ] as const)('falls back to the default when %s is invalid', (key, stored, expected) => {
    expect(readMediaPlayerOptions({ [key]: stored })[key]).toBe(expected)
  })

  it('keeps the other keys when one is invalid', () => {
    expect(
      readMediaPlayerOptions({ artworkMode: 'nonsense', collapseWhenIdle: true })
    ).toMatchObject({ artworkMode: 'thumbnail', collapseWhenIdle: true })
  })

  it('ignores keys belonging to other card families', () => {
    expect(readMediaPlayerOptions({ hideName: true, speedControl: 'steps' })).toEqual(
      MEDIA_PLAYER_OPTION_DEFAULTS
    )
  })

  it('declares exactly the keys the option doc tables', () => {
    expect([...MEDIA_PLAYER_OPTION_KEYS].sort()).toEqual(
      [
        'artworkMode',
        'collapseWhenIdle',
        'showGroupControls',
        'showProgress',
        'showSourcePicker',
        'showTransport',
        'showVolume',
      ].sort()
    )
  })

  it('has a default and a schema for every declared key', () => {
    for (const key of MEDIA_PLAYER_OPTION_KEYS) {
      expect(MEDIA_PLAYER_OPTION_DEFAULTS).toHaveProperty(key)
      expect(mediaPlayerOptionsConfigSchema.shape).toHaveProperty(key)
    }
  })
})

describe('mediaPlayerOptionsConfigSchema', () => {
  /*
   * The import gate rejects rather than silently repairing: a closed enum's
   * wrong value looks like a working card, so its author has to be told.
   */
  it('rejects an artworkMode outside the closed set', () => {
    expect(mediaPlayerOptionsConfigSchema.safeParse({ artworkMode: 'cover' }).success).toBe(false)
  })

  it('rejects a showVolume outside the closed set', () => {
    expect(mediaPlayerOptionsConfigSchema.safeParse({ showVolume: 'steppers' }).success).toBe(false)
  })

  it('rejects a non-boolean where a boolean is declared', () => {
    expect(mediaPlayerOptionsConfigSchema.safeParse({ showTransport: 'true' }).success).toBe(false)
  })

  it('accepts a document that states nothing', () => {
    expect(mediaPlayerOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  /**
   * The reserved key still validates. A document written by a build that ships
   * the group controls must round-trip through this one — which is the whole
   * reason the key is in the contract while the behaviour is not.
   */
  it('accepts the reserved showGroupControls key', () => {
    expect(mediaPlayerOptionsConfigSchema.safeParse({ showGroupControls: true }).success).toBe(true)
  })
})

describe('pinLegacyMediaPlayerAction', () => {
  it('pins a pre-card media_player item to the power toggle it has always had', () => {
    expect(pinLegacyMediaPlayerAction('media_player', {})).toEqual({ tapAction: 'toggle' })
  })

  /**
   * A document already stating a `tapAction` is left alone — including one that
   * says `default`, which is a deliberate choice the user made and not an
   * absence to fill in.
   */
  it.each(['default', 'more-info', 'none', 'toggle'])(
    'leaves an item that already states tapAction %s untouched',
    (tapAction) => {
      const config = { tapAction }
      expect(pinLegacyMediaPlayerAction('media_player', config)).toBe(config)
    }
  )

  it.each(['light', 'switch', 'climate', 'camera'])('leaves a %s item alone', (domain) => {
    const config = {}
    expect(pinLegacyMediaPlayerAction(domain, config)).toBe(config)
  })

  it('preserves the keys already on the item', () => {
    expect(pinLegacyMediaPlayerAction('media_player', { hideName: true, futureKey: 7 })).toEqual({
      hideName: true,
      futureKey: 7,
      tapAction: 'toggle',
    })
  })

  /**
   * An own-property check rather than `in`: "does this document already say
   * something" is a question about the document, and answering it from the
   * prototype chain is the shape that has bitten this repo before.
   */
  it('pins an item whose config inherits tapAction from the prototype chain', () => {
    const config = Object.create({ tapAction: 'more-info' }) as Record<string, unknown>

    expect(pinLegacyMediaPlayerAction('media_player', config)).toMatchObject({
      tapAction: 'toggle',
    })
  })
})

describe('configPredatesMediaPlayerCard', () => {
  it.each(['1.0.0', '1.3.0', '1.3.9', '0.9.0'])('reports %s as predating the card', (version) => {
    expect(configPredatesMediaPlayerCard(version)).toBe(true)
  })

  it.each([MEDIA_PLAYER_CARD_VERSION, '1.4.1', '1.5.0', '2.0.0'])(
    'reports %s as current or newer',
    (version) => {
      expect(configPredatesMediaPlayerCard(version)).toBe(false)
    }
  )

  it.each([undefined, null, 42, 'beta'])('treats an undatable version (%s) as older', (version) => {
    expect(configPredatesMediaPlayerCard(version)).toBe(true)
  })

  /**
   * Markers are allocated in merge order and only ever move up. Sharing a number
   * with an earlier migration is not a merge conflict but a silent one: a
   * document stamped by whichever build ran first would no longer predate the
   * other's marker and would skip that migration entirely.
   */
  it('claims a marker above every migration that merged before it', () => {
    expect(MEDIA_PLAYER_CARD_VERSION).toBe('1.4.0')
    expect(configPredatesMediaPlayerCard('1.3.0')).toBe(true)
  })
})
