import { z } from 'zod'
import { configPredatesVersion } from './configVersion'

/**
 * The media player card's option contract — the persisted shape of
 * `artworkMode`, `showVolume`, `showTransport`, `showSourcePicker`,
 * `showProgress`, `collapseWhenIdle` and `showGroupControls` under
 * `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/media-player.md — "Options". Lives in
 * the store beside its siblings for the same two reasons: `configSchema.ts`
 * gates imports with it, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
 *
 * **The whole option surface is declared here, including the keys whose
 * behaviour lands later.** The stored contract is what a shared YAML is
 * validated against, and a document is written by whichever build the author
 * happened to run: rejecting `showProgress: true` because this build does not
 * draw the bar yet would fail a document that is valid against the option doc.
 * Which keys currently *do* something is a property of the renderer, recorded
 * per key below, not of the contract.
 */

/** How `entity_picture` artwork renders. */
export const MEDIA_ARTWORK_MODES = ['background', 'thumbnail', 'none'] as const
export type MediaArtworkMode = (typeof MEDIA_ARTWORK_MODES)[number]

/** The volume control's presentation, before feature gating degrades it. */
export const MEDIA_VOLUME_STYLES = ['slider', 'buttons', 'none'] as const
export type MediaVolumeStyle = (typeof MEDIA_VOLUME_STYLES)[number]

export interface MediaPlayerOptions {
  /**
   * `background` is accepted by the contract and **degrades to `thumbnail`** in
   * this build — the full-bleed form is change 0023 PR 2. The degradation is not
   * a placeholder: the option doc requires exactly this fallback at every tier
   * below `full`, so PR 2 adds a branch rather than changing one
   * (`resolveArtworkPresentation` in `../components/MediaPlayerCard/presentation`).
   */
  artworkMode: MediaArtworkMode
  /** Reserved by this build; the volume control is change 0023 PR 2. */
  showVolume: MediaVolumeStyle
  /** Live: gates the transport cluster. */
  showTransport: boolean
  /** Reserved by this build; the source select is change 0023 PR 2. */
  showSourcePicker: boolean
  /** Reserved by this build; the progress bar is change 0023 PR 2. */
  showProgress: boolean
  /** Live: collapses `idle`/`off`/`standby` to the minimal presentation. */
  collapseWhenIdle: boolean
  /**
   * Reserved and deliberately **inert** — the option doc's own MAY/later path,
   * resolved that way by change 0023. The key exists so a document carrying it
   * round-trips; the configuration form must not offer a dead toggle.
   */
  showGroupControls: boolean
}

export const MEDIA_PLAYER_OPTION_KEYS = [
  'artworkMode',
  'showVolume',
  'showTransport',
  'showSourcePicker',
  'showProgress',
  'collapseWhenIdle',
  'showGroupControls',
] as const

export type MediaPlayerOptionKey = (typeof MEDIA_PLAYER_OPTION_KEYS)[number]

/**
 * The stored defaults, from the option doc's table.
 *
 * `thumbnail` because it works at every tier and never compromises text
 * contrast; `background` is the deliberate showcase choice. `showTransport` is
 * the only control on by default — transport is the reason a media card exists —
 * while the source picker, progress and group controls are off because most
 * cards on a dashboard are speakers where each would be noise
 * (docs/specs/entity-cards/options/common.md — "Defaults are the researched
 * common case").
 */
export const MEDIA_PLAYER_OPTION_DEFAULTS: Readonly<MediaPlayerOptions> = {
  artworkMode: 'thumbnail',
  showVolume: 'slider',
  showTransport: true,
  showSourcePicker: false,
  showProgress: false,
  collapseWhenIdle: false,
  showGroupControls: false,
}

const artworkModeSchema = z.enum(MEDIA_ARTWORK_MODES)
const volumeStyleSchema = z.enum(MEDIA_VOLUME_STYLES)

/**
 * The media player fragment of `item.config`, merged into the item schema.
 *
 * The two enums are validated at the gate rather than waved through for the
 * reason the sibling fragments record: a closed enum's wrong value looks like a
 * working card. `artworkMode: cover` would quietly render the thumbnail the
 * document did not ask for, and `showVolume: steppers` — a spelling no build has
 * — would silently take the slider. Both are documents whose author needs
 * telling (docs/specs/entity-cards/options/media-player.md).
 */
export const mediaPlayerOptionsConfigSchema = z.object({
  artworkMode: artworkModeSchema.optional(),
  showVolume: volumeStyleSchema.optional(),
  showTransport: z.boolean().optional(),
  showSourcePicker: z.boolean().optional(),
  showProgress: z.boolean().optional(),
  collapseWhenIdle: z.boolean().optional(),
  showGroupControls: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const mediaPlayerKeySchemas: Readonly<Record<MediaPlayerOptionKey, z.ZodTypeAny>> = {
  artworkMode: artworkModeSchema,
  showVolume: volumeStyleSchema,
  showTransport: z.boolean(),
  showSourcePicker: z.boolean(),
  showProgress: z.boolean(),
  collapseWhenIdle: z.boolean(),
  showGroupControls: z.boolean(),
}

/**
 * Read the media player options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as every sibling reader, and for the same reason: imports are
 * rejected by `dashboardConfigSchema` before a card renders, so this is the
 * render path declining to fail over a value that reached localStorage some
 * other way (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 * The stored document is never written back, so a round trip preserves whatever
 * its author wrote.
 */
export function readMediaPlayerOptions(
  config: Record<string, unknown> | undefined
): MediaPlayerOptions {
  const read = <K extends MediaPlayerOptionKey>(key: K): MediaPlayerOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return MEDIA_PLAYER_OPTION_DEFAULTS[key]

    const parsed = mediaPlayerKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as MediaPlayerOptions[K])
      : (MEDIA_PLAYER_OPTION_DEFAULTS[key] as MediaPlayerOptions[K])
  }

  return {
    artworkMode: read('artworkMode'),
    showVolume: read('showVolume'),
    showTransport: read('showTransport'),
    showSourcePicker: read('showSourcePicker'),
    showProgress: read('showProgress'),
    collapseWhenIdle: read('collapseWhenIdle'),
    showGroupControls: read('showGroupControls'),
  }
}

/**
 * The version documents carrying pinned media player taps are stamped with.
 *
 * `1.4.0` because change 0017's `CLIMATE_VARIANT_VERSION` claims `1.3.0` and
 * merges first. Markers are allocated in merge order and only ever move up: two
 * migrations sharing a number is not a merge conflict but a silent one — a
 * document stamped by whichever build ran first would no longer *predate* the
 * other's marker and would skip that migration entirely
 * (`climateOptions.ts` — `CLIMATE_VARIANT_VERSION`).
 */
export const MEDIA_PLAYER_CARD_VERSION = '1.4.0'

/** Whether a stored document was written before the media player card existed. */
export function configPredatesMediaPlayerCard(version: unknown): boolean {
  return configPredatesVersion(version, MEDIA_PLAYER_CARD_VERSION)
}

/**
 * Pin one pre-card `media_player` item to the power toggle its tap has always
 * performed.
 *
 * This is convention 7 at its sharpest. Before this change there was no
 * `media_player` entry in `domainToCard`, so every placed media player rendered
 * the **fallback** card, whose body tap is `homeassistant.toggle` — power. This
 * build gives the domain a card whose `default` tap is play/pause. Without a pin,
 * upgrading would silently repurpose a tap that has always cut power into one
 * that pauses, on cards the user placed and never reconfigured.
 *
 * The pin writes the universal `tapAction: 'toggle'` rather than a
 * family-specific key, because "keep toggling power" is exactly what that
 * universal value already means — there is no new option to pin to, only the
 * old behaviour to name explicitly (docs/changes/0023 — "Legacy pinning").
 *
 * Returns the config unchanged, by reference, when nothing applies: a document
 * already stating a `tapAction`, a card of another domain, every load after the
 * first.
 */
export function pinLegacyMediaPlayerAction(
  domain: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (domain !== 'media_player') return config
  /*
   * An own-property check rather than `in`, as the climate pin does: "does this
   * document already say something" is a question about the document, and a
   * migration answering it from the prototype chain is a bug waiting for a key
   * named like one of `Object.prototype`'s.
   */
  if (Object.prototype.hasOwnProperty.call(config, 'tapAction')) return config

  return { ...config, tapAction: 'toggle' }
}
