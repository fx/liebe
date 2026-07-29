/**
 * The media player's `supported_features` bits, and the attribute shapes the
 * card reads them out of.
 *
 * Separate from `presentation.ts` (what the card shows) and from
 * `~/store/mediaPlayerOptions.ts` (the stored contract) because it is neither:
 * it is what the entity says it can do, which is the input every option is
 * gated against — an option can only ever hide a capability, never add one
 * (docs/specs/entity-cards/options/common.md, convention 3).
 */

/**
 * Home Assistant's `MediaPlayerEntityFeature` bits, in full.
 *
 * Transcribed from `homeassistant/components/media_player/const.py` in the
 * running Home Assistant 2026.7.2, not from memory and not from another card:
 * this is the largest feature mask in Home Assistant, and the cover card shipped
 * an off-by-one-bit error (`STOP_TILT`/`SET_TILT_POSITION`) that every test
 * agreed with because the tests used the same wrong constants.
 *
 * Listed in full even though this PR gates on six of them, for the reason the
 * fan card's table records: a table that stops early reads as though the bits
 * above it were free. Note the gap — there is no `64`.
 */
export const MEDIA_PLAYER_FEATURE = {
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
} as const

/**
 * The attributes this card reads, typed as what they are on the wire.
 *
 * `unknown` rather than the convenient types, because every one of them is
 * optional on a real player and several arrive from integrations that publish
 * whatever they like: a receiver sitting in `on` with nothing playing publishes
 * no `media_title`, no `media_artist` and no `entity_picture` at all, and
 * `supported_features` can be absent entirely.
 */
export interface MediaPlayerAttributes {
  media_title?: unknown
  media_artist?: unknown
  media_series_title?: unknown
  app_name?: unknown
  entity_picture?: unknown
  source?: unknown
  source_list?: unknown
  volume_level?: unknown
  is_volume_muted?: unknown
  media_position?: unknown
  media_position_updated_at?: unknown
  media_duration?: unknown
  group_members?: unknown
  supported_features?: unknown
  friendly_name?: unknown
  [key: string]: unknown
}

/**
 * The advertised features this card gates on, as **booleans**.
 *
 * Booleans at the point they are derived, not the masked bits: React prints a
 * numeric `0` as the text "0", so the moment one of these gates JSX with `&&`
 * it stamps a stray zero on the card.
 *
 * Only the bits something in this family consults are named. The volume and
 * seek bits are here because the state they gate is decided in this PR even
 * though the controls arrive in the next one — a reader asking "can this
 * entity do X" should not have to know which PR drew the control.
 */
export interface MediaPlayerFeatures {
  /** Accepts `media_player.media_pause`. */
  pause: boolean
  /** Accepts `media_player.media_play`. */
  play: boolean
  /** Accepts `media_player.turn_on`. */
  turnOn: boolean
  /** Accepts `media_player.media_previous_track`. */
  previousTrack: boolean
  /** Accepts `media_player.media_next_track`. */
  nextTrack: boolean
  /** Accepts `media_player.volume_set` — a real slider. */
  volumeSet: boolean
  /** Accepts `media_player.volume_up` / `volume_down` — steppers only. */
  volumeStep: boolean
  /** Accepts `media_player.volume_mute`. */
  volumeMute: boolean
  /** Accepts `media_player.media_seek`. */
  seek: boolean
  /** Accepts `media_player.select_source`. */
  selectSource: boolean
}

/**
 * Read the feature mask.
 *
 * Strictly numeric, so a `supported_features` arriving as the string `"16384"`
 * advertises nothing rather than being coerced by `&` into a feature set nothing
 * verified. `Math.trunc` because a float mask is not a mask.
 */
export function readMediaPlayerMask(attributes: MediaPlayerAttributes | undefined): number {
  const raw = attributes?.supported_features
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0
}

export function readMediaPlayerFeatures(
  attributes: MediaPlayerAttributes | undefined
): MediaPlayerFeatures {
  const mask = readMediaPlayerMask(attributes)

  return {
    pause: (mask & MEDIA_PLAYER_FEATURE.PAUSE) !== 0,
    play: (mask & MEDIA_PLAYER_FEATURE.PLAY) !== 0,
    turnOn: (mask & MEDIA_PLAYER_FEATURE.TURN_ON) !== 0,
    previousTrack: (mask & MEDIA_PLAYER_FEATURE.PREVIOUS_TRACK) !== 0,
    nextTrack: (mask & MEDIA_PLAYER_FEATURE.NEXT_TRACK) !== 0,
    volumeSet: (mask & MEDIA_PLAYER_FEATURE.VOLUME_SET) !== 0,
    volumeStep: (mask & MEDIA_PLAYER_FEATURE.VOLUME_STEP) !== 0,
    volumeMute: (mask & MEDIA_PLAYER_FEATURE.VOLUME_MUTE) !== 0,
    seek: (mask & MEDIA_PLAYER_FEATURE.SEEK) !== 0,
    selectSource: (mask & MEDIA_PLAYER_FEATURE.SELECT_SOURCE) !== 0,
  }
}
