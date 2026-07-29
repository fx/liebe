import type { DomainColorName } from '~/theme/tokens'
import type { MediaArtworkMode } from '~/store/mediaPlayerOptions'
import type { CardTier } from '~/utils/cardTier'
import type { MediaPlayerAttributes, MediaPlayerFeatures } from './features'

/**
 * What the media player card shows, decided away from JSX.
 *
 * Every function here is pure and takes the entity's state and attributes
 * explicitly, because each answer is needed by more than one tier and by the
 * tests that pin them: the state line is identical between the compact line and
 * the split title/artist lines, and the primary action is shared by the body tap
 * and the transport's play/pause button — the option doc requires one resolver
 * so the two can never diverge for the same state
 * (docs/specs/entity-cards/options/media-player.md).
 */

/**
 * Home Assistant's `MediaPlayerState` members, transcribed from
 * `homeassistant/components/media_player/const.py` (2026.7.2), plus the two core
 * states every entity can take.
 *
 * The enum is **seven** members, not the two a media card is usually written
 * for. `on` and `standby` are the ones cards routinely forget, and `buffering`
 * is emphatically not `playing` — it is a distinct member, and the precedence
 * table below treats it as such.
 *
 * `unavailable` and `unknown` are NOT in `MediaPlayerState`: they come from
 * `homeassistant.const` and can replace any entity's state. They are listed here
 * because the precedence table's first rung is about them.
 */
export const MEDIA_PLAYER_STATES = [
  'off',
  'on',
  'idle',
  'playing',
  'paused',
  'standby',
  'buffering',
] as const

export type MediaPlayerState = (typeof MEDIA_PLAYER_STATES)[number]

/**
 * The states the option doc groups as "not playing anything worth showing", for
 * `collapseWhenIdle`.
 *
 * `standby` rides with `off` here and in the primary-action table, exactly as
 * the option doc specifies. Home Assistant 2026.7.2 marks `MediaPlayerState.
 * STANDBY` deprecated for 2026.8.0 in favour of `OFF`/`IDLE`, which changes
 * nothing for this card: a deprecated member is one integrations are asked to
 * stop *publishing*, not one a frontend may stop *reading*, and entities
 * publishing it keep arriving until every integration has migrated.
 */
const IDLE_STATES: readonly string[] = ['idle', 'off', 'standby']

/** The states with no meaningful command behind them, whatever bits are retained. */
const UNRESPONSIVE_STATES: readonly string[] = ['unavailable', 'unknown']

/** A trimmed, non-empty string, or nothing.
 *
 * Every attribute this card reads is optional on a real player, and several
 * arrive empty rather than absent — an integration between tracks publishes
 * `media_title: ''` as readily as it omits the key. Both mean "no title", and a
 * card that told them apart would render a blank line for one of them.
 * Non-strings are rejected outright rather than stringified: a `media_title` of
 * `0` is a broken integration, and printing "0" onto the card hides that.
 */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** The separator the option doc specifies between title and artist. */
const ARTIST_SEPARATOR = ' — '

export interface MediaStateLine {
  /** The single, compact line — `glance` and `tall`. */
  line: string
  /** The name-style line of the split form — `row` and `full`. */
  primary: string
  /**
   * The muted line of the split form — `row` and `full`.
   *
   * **Total, never optional.** The card renders this field directly, so an
   * `undefined` here is a blank second line on the tile, and the case that
   * produced one was not exotic: a title with no `media_artist` is what a
   * podcast, a radio stream and a TV app all publish. Making the field optional
   * moved the fallback to every caller and then relied on each of them
   * remembering — the render path did not, and neither would the next one.
   */
  secondary: string
  /** Which rung of the fallback chain produced this. */
  source: 'title' | 'app' | 'state'
}

/**
 * The state line, resolved once for every tier.
 *
 * The option doc's chain, in order: `media_title` (appending
 * ` — ${media_artist}` when the artist is present), else `app_name` — a
 * streaming app on a TV with no track metadata — else the raw entity state.
 *
 * **Two forms, one chain.** `glance` and `tall` have room for one line and take
 * `line`; `row` and `full` give title and artist their own lines and take
 * `primary`/`secondary`. They are resolved together rather than by two functions
 * so the rungs cannot drift apart.
 *
 * Where the split form needs a reading the doc leaves implicit: with no
 * `media_title` there is no track to put in the name-style line, so it holds the
 * **entity name** and the muted line carries the chain's fallback. That is the
 * ordinary name-over-state card every other family renders, which is what a
 * receiver sitting in `on` with no media session should look like — the
 * alternative, a lone "on" with nothing naming the device, is strictly less
 * informative. `hideName` governs that entity name and never the track title,
 * as the doc states; the shell applies it, so it is not consulted here.
 */
export function resolveMediaStateLine(
  state: string,
  attributes: MediaPlayerAttributes | undefined,
  friendlyName: string
): MediaStateLine {
  const title = text(attributes?.media_title)
  const app = text(attributes?.app_name)

  if (title) {
    const artist = text(attributes?.media_artist)
    return {
      /*
       * The compact line is the title alone without an artist — the doc's chain
       * for `glance` and `tall` is `media_title` plus the artist when there is
       * one, and nothing else belongs on a single line beside a track name.
       */
      line: artist ? `${title}${ARTIST_SEPARATOR}${artist}` : title,
      primary: title,
      /*
       * The split form has a second line to fill whether or not an artist
       * exists, so it continues down the same chain rather than rendering
       * blank: a podcast episode shows "Spotify", a radio stream with no app
       * shows its state. Both are strictly more informative than the empty line
       * this used to produce, and neither invents anything the entity did not
       * publish.
       */
      secondary: artist ?? app ?? state,
      source: 'title',
    }
  }

  if (app) {
    return { line: app, primary: friendlyName, secondary: app, source: 'app' }
  }

  return { line: state, primary: friendlyName, secondary: state, source: 'state' }
}

/** The services `tapAction: default` and the play/pause button can resolve to. */
export type MediaPrimaryService = 'turn_on' | 'media_pause' | 'media_play'

/**
 * What a tap does, by state — the option doc's precedence table, first match
 * wins, `null` meaning inert.
 *
 *   1. `unavailable`/`unknown` → inert, regardless of retained feature bits.
 *   2. `off`/`standby`        → `turn_on` when `TURN_ON`, else inert.
 *   3. `playing`              → `media_pause` when `PAUSE`, else inert.
 *   4. anything else          → `media_play` when `PLAY`, else inert.
 *
 * Two rungs are easy to get wrong and are the reason this is a table rather than
 * a pair of ternaries. **`playing` without `PAUSE` is inert, not `media_play`** —
 * it must not fall through to rung 4, because resuming a playing entity is not
 * the operation the tap declined to perform. And `standby` is grouped with
 * `off`, so `TURN_ON` beats `media_play` for a device advertising both.
 *
 * `buffering` and `on` reach rung 4 and resolve to `media_play`: neither is
 * `playing`, so neither can pause.
 */
export function resolveMediaPrimaryAction(
  state: string,
  features: MediaPlayerFeatures
): MediaPrimaryService | null {
  if (UNRESPONSIVE_STATES.includes(state)) return null
  if (state === 'off' || state === 'standby') return features.turnOn ? 'turn_on' : null
  if (state === 'playing') return features.pause ? 'media_pause' : null
  return features.play ? 'media_play' : null
}

/**
 * Whether the card renders its minimal idle presentation: icon circle, name and
 * state line only — no artwork, no transport.
 *
 * The card does NOT resize (option doc — "Interaction with grid sizing"): the
 * grid span, and therefore the tier, is untouched, and only the content
 * simplifies. So this gates what the tiers put in their slots, never the tier
 * itself.
 */
export function shouldCollapseIdle(state: string, collapseWhenIdle: boolean): boolean {
  return collapseWhenIdle && IDLE_STATES.includes(state)
}

/**
 * How artwork renders at this tier, after the option doc's degradation rule.
 *
 * `background` is "only meaningful with room for overlay": below `full` it MUST
 * degrade to `thumbnail` rather than render an illegible postage stamp, and the
 * stored option value is unaffected — a card resized from 2×2 to 2×1 still says
 * `background` in its config.
 *
 * This build degrades `background` at **every** tier, because the full-bleed
 * form is change 0023 PR 2. That is the seam rather than a stub: PR 2 changes
 * the `full` arm of this function and nothing else, and the below-`full`
 * degradation it must not break is already pinned by tests here.
 */
export function resolveArtworkPresentation(
  mode: MediaArtworkMode,
  _tier: CardTier
): 'thumbnail' | 'none' {
  return mode === 'none' ? 'none' : 'thumbnail'
}

/**
 * The artwork URL, or nothing.
 *
 * Returned **as the integration supplies it** and never rewritten: usually an
 * authenticated, HA-proxied relative path (`/api/media_player_proxy/...`), but
 * integrations that flag artwork remotely accessible publish an absolute
 * external URL, which Home Assistant's own frontend renders directly. Artwork is
 * content from the user's own integration, deliberately outside the theming
 * no-external-fetch boundary, which governs CSS the panel injects
 * (docs/changes/0023 — "Artwork is content, not chrome").
 *
 * Presence is re-evaluated per render rather than remembered, because artwork
 * comes and goes with the media session. A URL that 404s is NOT handled here —
 * that is a load failure the element reports, and the card falls back to the
 * icon on it.
 */
export function resolveArtworkUrl(
  attributes: MediaPlayerAttributes | undefined
): string | undefined {
  return text(attributes?.entity_picture)
}

/**
 * The colour triplet the card resolves to.
 *
 * Indigo (`--liebe-c-media`) while playing, per the option doc's active tint
 * pattern; neutral otherwise. `buffering` is deliberately not tinted: the doc
 * ties the tint to `playing`, and a card that pulsed indigo on every rebuffer
 * would be reporting the network rather than the music.
 */
export function resolveMediaColor(state: string): DomainColorName {
  return state === 'playing' ? 'media' : 'default'
}

/** Whether the tile reads as "on" for the shell's active treatment. */
export function isMediaActive(state: string): boolean {
  return state === 'playing'
}
