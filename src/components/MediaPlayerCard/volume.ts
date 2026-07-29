import type { MediaVolumeStyle } from '~/store/mediaPlayerOptions'
import type { MediaPlayerAttributes, MediaPlayerFeatures } from './features'

/**
 * The volume control: which form it takes, and how an optimistic drag settles
 * back onto the truth.
 *
 * Both halves are pure and live here rather than in the card, because both are
 * rules with more cases than a reader can hold: the presentation is a
 * four-rung degradation ladder over three independent feature bits, and the
 * reconciliation is a small state machine whose whole purpose is to be correct
 * in the cases nobody exercises by hand.
 */

/**
 * What the card actually renders, after feature gating.
 *
 * Distinct from the stored `showVolume` option: the option says what the user
 * asked for, this says what the entity can do about it. An option can only ever
 * hide a capability, never add one (common contract, convention 3), so every
 * transition below is a *downgrade*.
 */
export type VolumePresentation = 'slider' | 'buttons' | 'mute-only' | 'none'

/**
 * The degradation ladder from the option doc's `showVolume` section.
 *
 *   `none`                            → nothing, whatever the entity supports
 *   no VOLUME_SET/STEP/MUTE           → nothing, whatever the option says
 *   `slider` + VOLUME_SET             → the slider
 *   `slider` + only VOLUME_STEP       → **buttons**, automatically; the stored
 *                                        option stays `slider`, the entity
 *                                        simply cannot do better
 *   `slider` + only VOLUME_MUTE       → mute alone; no slider, no steppers
 *   `buttons` + VOLUME_STEP or _SET   → buttons
 *   `buttons` + only VOLUME_MUTE      → mute alone
 *
 * The `buttons`-with-only-`VOLUME_SET` rung is the one worth naming: the option
 * doc allows steppers to be built from "stepped `volume_set`", so a player that
 * can be set but not stepped still gets steppers rather than being pushed down
 * to mute-only.
 */
export function resolveVolumePresentation(
  option: MediaVolumeStyle,
  features: MediaPlayerFeatures
): VolumePresentation {
  if (option === 'none') return 'none'

  const { volumeSet, volumeStep, volumeMute } = features
  if (!volumeSet && !volumeStep && !volumeMute) return 'none'

  if (option === 'slider') {
    if (volumeSet) return 'slider'
    if (volumeStep) return 'buttons'
    return 'mute-only'
  }

  return volumeStep || volumeSet ? 'buttons' : 'mute-only'
}

/**
 * How far a stepper moves a player that has no `volume_up`/`volume_down`.
 *
 * 0.1 because that is the increment Home Assistant's own `volume_up` applies,
 * so a card falling back to stepped `volume_set` moves the volume by the same
 * amount the real service would have.
 */
export const VOLUME_STEP_FRACTION = 0.1

/** `volume_level` as a 0–1 fraction, or `undefined` when the entity has none. */
export function readVolumeLevel(attributes: MediaPlayerAttributes | undefined): number | undefined {
  const raw = attributes?.volume_level
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  return Math.min(1, Math.max(0, raw))
}

/** Whether the player reports itself muted. Only a real `true` counts. */
export function isVolumeMuted(attributes: MediaPlayerAttributes | undefined): boolean {
  return attributes?.is_volume_muted === true
}

/**
 * A committed volume the entity has not confirmed yet.
 *
 * The card shows `sent` while this stands, which is deliberately a claim the
 * entity has not made — the point of an optimistic control. `baseline` is what
 * the entity read at the moment of sending, and it is what makes the lie
 * *terminable*: any movement away from it is the truth arriving.
 */
export interface PendingVolume {
  /** The value dispatched, and displayed until the entity answers. */
  sent: number
  /** The entity's `volume_level` when it was dispatched; `undefined` if it had none. */
  baseline: number | undefined
}

/**
 * Whether a pending volume still stands, given what the entity now reports.
 *
 * **The reconciliation rule, stated once:** the optimistic value is dropped as
 * soon as the entity's `volume_level` differs from the baseline it had when the
 * command went out — whatever it changed *to*.
 *
 * Accepting any movement, rather than only movement to `sent`, is what makes
 * this correct for the case that actually bites: a receiver with a volume cap
 * answers a request for 1.0 with 0.8. Waiting for an exact match would leave the
 * card insisting on 1.0 forever, which is the "never reconciles" failure. And
 * dropping the value on *every* incoming state update — including the ones that
 * report the volume unchanged — would be the "snaps back mid-drag" failure,
 * which is why the baseline comparison is here rather than a bare "did a state
 * update arrive".
 *
 * Two cases this cannot settle on its own, both handled by the card:
 *   - the dispatch **fails** — the card drops the pending value immediately,
 *     since nothing is coming;
 *   - the entity **never moves** (a no-op command, or a device that answers
 *     nothing) — the card drops it on the acknowledgement timeout, so the card
 *     cannot go on lying indefinitely.
 */
export function pendingVolumeStillStands(
  pending: PendingVolume,
  entityVolume: number | undefined
): boolean {
  return entityVolume === pending.baseline
}

/**
 * The volume to draw, in the order the card trusts its sources.
 *
 * An in-progress drag beats everything: while a finger is down, incoming state
 * updates must not move the thumb out from under it. A committed-but-unconfirmed
 * value beats the entity for the window described above. Otherwise the entity is
 * the truth.
 */
export function resolveDisplayVolume(
  entityVolume: number | undefined,
  dragValue: number | null,
  pending: PendingVolume | null
): number {
  if (dragValue !== null) return dragValue
  if (pending) return pending.sent
  return entityVolume ?? 0
}

/** A 0–1 fraction as the 0–100 the slider and its readout work in. */
export function volumeToPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100)
}

/**
 * A 0–100 slider value back to the 0–1 `volume_set` takes.
 *
 * Rounded to three decimals so the payload is the value the user chose rather
 * than a float artefact: `0.42`, never `0.42000000000000004`. That matters
 * beyond tidiness — the dispatch guard keys on `JSON.stringify(data)`, so two
 * spellings of one value would be two different commands to it.
 */
export function percentToVolume(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 1000
}

/**
 * The volume a stepper should ask for, when it has to build the step out of
 * `volume_set` because the entity has no `volume_up`/`volume_down`.
 *
 * Clamped into 0–1 so the ends of the range are reachable but never exceeded.
 */
export function steppedVolume(current: number, direction: 1 | -1): number {
  const next = current + direction * VOLUME_STEP_FRACTION
  return Math.round(Math.min(1, Math.max(0, next)) * 1000) / 1000
}

/**
 * The sources a picker can offer: `source_list` filtered to strings.
 *
 * Filtered rather than trusted, for the reason the fan card's preset reader
 * records: the list arrives from an integration and a non-string member is an
 * option with no label. One reader, shared by the card and the config form, so
 * the form cannot offer a control the card would render empty.
 */
export function readSourceList(attributes: MediaPlayerAttributes | undefined): string[] {
  const raw = attributes?.source_list
  if (!Array.isArray(raw)) return []
  return raw.filter((source): source is string => typeof source === 'string' && source !== '')
}

/** The currently selected source, when the entity names one this card can match. */
export function readCurrentSource(
  attributes: MediaPlayerAttributes | undefined
): string | undefined {
  const raw = attributes?.source
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

/**
 * Whether a source picker can render at all: the entity advertises
 * `SELECT_SOURCE` **and** publishes a list with something in it.
 *
 * The bit without a list is a control with nothing in it — the exact shape that
 * offered the fan card's preset option to a fan that could never show one.
 */
export function canSelectSource(
  attributes: MediaPlayerAttributes | undefined,
  features: MediaPlayerFeatures
): boolean {
  return features.selectSource && readSourceList(attributes).length > 0
}
