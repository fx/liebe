import type { CameraStatus } from './CameraControls'

/**
 * What the camera's presentation options resolve to on screen.
 *
 * The contract they are read from is `src/store/cameraOptions.ts`; this module
 * is the other half — pure functions, no React — so the composition rules
 * (docs/specs/entity-cards/options/camera.md, "Rules") are unit-testable
 * without rendering a stream.
 */

export interface CameraOverlayInput {
  /**
   * Whether the card is actually showing a picture to draw the band over — a
   * camera with stream support, no surfaced error, and a stream surface on
   * screen at all. A card showing its icon tile (no `SUPPORT_STREAM`), its
   * error-and-Retry branch, or a degraded tier's still thumbnail has no feed, so
   * the name goes back to the status pill or the tile's own meta instead of
   * disappearing with the band.
   */
  hasFeed: boolean
  /** The stored `showNameOverlay`. */
  showNameOverlay: boolean
  /** The universal `hideName`, already through the shell's danger floor. */
  hideName: boolean
  /** The universal `hideState`, likewise. */
  hideState: boolean
}

export interface CameraOverlayLayout {
  /** Whether the gradient band is drawn at all. */
  visible: boolean
  showName: boolean
  showState: boolean
}

/**
 * Compose `showNameOverlay` with the two universal hide flags.
 *
 * The option doc settles the interaction rather than leaving it to whichever
 * flag the card happens to read last: `hideName` drops the name line,
 * `hideState` drops the state line, and hiding BOTH collapses the overlay
 * entirely — an empty gradient band over the feed is not a layout, it is a
 * smudge, so the feed fills the card as if `showNameOverlay` were `false`.
 */
export function resolveCameraOverlay({
  hasFeed,
  showNameOverlay,
  hideName,
  hideState,
}: CameraOverlayInput): CameraOverlayLayout {
  const showName = hasFeed && showNameOverlay && !hideName
  const showState = hasFeed && showNameOverlay && !hideState
  return { visible: showName || showState, showName, showState }
}

/** The live-badge variants; `null` is "no badge, the status pill speaks". */
export type CameraLiveBadgeVariant = 'live' | 'recording'

export interface CameraLiveBadgeInput {
  /** The stored `showLiveBadge`. */
  showLiveBadge: boolean
  /**
   * Whether a stream element is actually mounted (`streamEnabled` in the card).
   *
   * This is what keeps the badge honest, and it is NOT implied by the status:
   * `deriveCameraStatus` reports `recording` from the raw entity state alone, so
   * a camera whose element could not be bootstrapped — the still-image fallback
   * — reaches a live status with nothing but a periodically refreshed snapshot
   * on screen. A snapshot must never carry a `LIVE` label
   * (docs/specs/entity-cards/options/camera.md, `showLiveBadge`), and neither
   * must the icon tile of a camera with no stream support at all.
   */
  streamMounted: boolean
  /** The status the camera-streaming machine resolved, unchanged. */
  status: CameraStatus
}

/**
 * Which badge, if any, presents the status machine's live states.
 *
 * The badge SUBSUMES those states rather than joining them (change 0021's
 * design decision): where it renders, the status pill drops its own live label,
 * so live-ness is never claimed twice. Non-live states — `CONNECTING`,
 * `NO SIGNAL`, `UNAVAILABLE`, errors — are camera-streaming's to communicate and
 * are left entirely alone. `recording` keeps a variant of its own so the
 * distinction the pill drew survives the subsumption.
 */
export function resolveCameraLiveBadge({
  showLiveBadge,
  streamMounted,
  status,
}: CameraLiveBadgeInput): CameraLiveBadgeVariant | null {
  if (!showLiveBadge || !streamMounted) return null
  if (status === 'recording') return 'recording'
  if (status === 'streaming') return 'live'
  return null
}

/** Badge wording per variant — `REC` is the broadcast convention, and short. */
export const CAMERA_LIVE_BADGE_LABELS: Readonly<Record<CameraLiveBadgeVariant, string>> = {
  live: 'LIVE',
  recording: 'REC',
}

/**
 * The overlay's state line: the ENTITY's state, sentence-cased.
 *
 * Deliberately not the status pill's label. The pill reports the health of the
 * stream pipeline (`CONNECTING`, `NO SIGNAL`); the state line reports what the
 * entity says it is doing, which is what `hideState` hides on every other card
 * — and what change 0021's motion line joins in the same area.
 */
export function cameraStateText(state: string): string {
  const words = state.split('_').filter(Boolean)
  if (words.length === 0) return ''
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export interface CameraMotionInput {
  /** The stored `showLastMotion`. */
  showLastMotion: boolean
  /**
   * The linked sensor's CURRENT state, or `undefined` when `motionEntity` names
   * nothing, names an entity this Home Assistant does not have, or the entity
   * has not arrived yet. All three omit the line rather than erroring the camera
   * card (docs/specs/entity-cards/options/camera.md).
   */
  motionState: string | undefined
  /**
   * How long the sensor has held its clear state, already formatted by the
   * shared `formatSince` helper (`for 12 min`), or `null` when there is no
   * usable `last_changed` to measure from.
   */
  since: string | null
}

/**
 * The overlay's motion line.
 *
 * "Clear for X" rather than "Motion X ago": `last_changed` measures how long the
 * sensor has been in its CURRENT state, and after a Home Assistant restart or an
 * `unavailable`→`off` recovery it marks that transition rather than a motion
 * event. Reading it as "motion 3 h ago" would invent an event that never
 * happened; "clear for 3 h" is true in every one of those cases. Finding the
 * real last `on` would need a history fetch, which is out of scope.
 *
 * Every state that is neither `on` nor `off` — `unavailable`, `unknown`, a
 * missing entity — omits the line. A camera card must never take on a linked
 * sensor's error state.
 */
export function resolveCameraMotionLine({
  showLastMotion,
  motionState,
  since,
}: CameraMotionInput): string | null {
  if (!showLastMotion) return null
  if (motionState === 'on') return 'Motion detected'
  // No duration to show is not a reason to drop the fact that it is clear, and
  // it is certainly not a reason to guess one.
  if (motionState === 'off') return since ? `Clear ${since}` : 'Clear'
  return null
}

/**
 * The name the card shows, in the universal option's precedence order.
 *
 * An empty `friendly_name` is treated as absent rather than rendered: a nameless
 * band over a feed identifies nothing, so the entity id — which always exists —
 * stands in, exactly as the pill has always done.
 */
export function resolveCameraName(
  overrideName: string,
  entity: { entity_id: string; attributes: { friendly_name?: string } }
): string {
  return overrideName || entity.attributes.friendly_name || entity.entity_id
}
