import {
  AppWindow,
  Blinds,
  Columns2,
  DoorClosed,
  DoorOpen,
  Fence,
  InspectionPanel,
  PanelBottomClose,
  PanelBottomDashed,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightDashed,
  PanelRightOpen,
  PanelTopClose,
  PanelTopDashed,
  PanelTopOpen,
  Scroll,
  Warehouse,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { targetsEntity } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import { isSecurityCover, type CoverOptions, type CoverStateLabelStyle } from '~/store/coverOptions'
import type { DomainColorName } from '~/theme/tokens'

/**
 * Everything the cover card's options RESOLVE TO: the position it operates on,
 * the glyph, the state text, the tint, which buttons are held back, and which
 * routes the `confirmOpen` gate stops.
 *
 * One module and — for the card's rendered state — one derivation, for the
 * reason the binary sensor has one: `invertPosition` moves the readout, the
 * slider, the state line and the button disabling together, so an option that
 * could move one of them without the others would be a card that disagrees with
 * itself about which way its blind is facing
 * (docs/specs/entity-cards/options/cover.md — "Inverted position display").
 *
 * The option *contract* — keys, defaults, validation — is `~/store/coverOptions`.
 */

/**
 * Home Assistant's `CoverEntityFeature` bits.
 *
 * `STOP_TILT` is `64` and `SET_TILT_POSITION` is `128`
 * (docs/specs/entity-cards/options/cover.md — "Options"). The card shipped with
 * `SET_TILT_POSITION = 64`, which is the stop-tilt bit: a cover advertising only
 * a tilt-stop button rendered a tilt *slider* that commits
 * `set_cover_tilt_position` to an entity that does not support it, while every
 * cover that really does support tilt positioning (bit 128) rendered no slider
 * at all unless it happened to advertise stop-tilt too.
 */
export const COVER_FEATURE = {
  OPEN: 1,
  CLOSE: 2,
  SET_POSITION: 4,
  STOP: 8,
  OPEN_TILT: 16,
  CLOSE_TILT: 32,
  STOP_TILT: 64,
  SET_TILT_POSITION: 128,
} as const

/**
 * The attributes this card reads, typed as what they are on the wire — unknown.
 *
 * Home Assistant's own integrations publish `current_position` as an integer
 * `0…100`, but the value reaching a card is whatever an integration, a template
 * or a REST sensor put there: absent, `null`, a string, `NaN`, `-5`, `150`.
 * Every consumer downstream of it is intolerant in a different way — Radix's
 * slider positions its thumb from `value / max` (`NaN%` for a non-number),
 * the readout interpolates it into text ("NaN% OPEN"), and the disable rule
 * compares it to `0` and `100`. So the shapes are narrowed once, here.
 */
export interface CoverAttributes {
  current_position?: unknown
  current_tilt_position?: unknown
  position?: unknown
  tilt_position?: unknown
  supported_features?: unknown
  device_class?: unknown
  friendly_name?: unknown
  [key: string]: unknown
}

/**
 * A percentage this card can operate on, or nothing.
 *
 * Clamped rather than rejected when out of range: an integration reporting
 * `104` means "fully open" by any reading, and a cover that renders no position
 * at all because one is slightly out of range is worse than one that reads
 * `100%`. Rounded because the whole surface is integer percent — the slider
 * steps by one, and `33.333% OPEN` is not a state line.
 */
function readPercent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(100, Math.max(0, Math.round(value)))
}

/** `current_position`, with the `position` fallback the option doc names. */
export function readCoverPosition(attributes: CoverAttributes | undefined): number | undefined {
  return readPercent(attributes?.current_position) ?? readPercent(attributes?.position)
}

/** `current_tilt_position`, with the `tilt_position` fallback. */
export function readCoverTiltPosition(attributes: CoverAttributes | undefined): number | undefined {
  return readPercent(attributes?.current_tilt_position) ?? readPercent(attributes?.tilt_position)
}

/**
 * The advertised feature bits, as an integer.
 *
 * Strictly numeric: JavaScript's `&` would happily coerce the string `"255"`
 * into a full feature set, and an entity whose `supported_features` arrives as
 * a string is an entity nothing else about is trustworthy either. An absent or
 * unusable value advertises nothing, which degrades the card to state and name
 * rather than offering controls the entity may not implement.
 */
export function readSupportedFeatures(attributes: CoverAttributes | undefined): number {
  const raw = attributes?.supported_features
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0
}

/** Whether the entity can be sent to a position — what gates the slider option. */
export function coverSupportsPosition(attributes: CoverAttributes | undefined): boolean {
  return (readSupportedFeatures(attributes) & COVER_FEATURE.SET_POSITION) !== 0
}

/** Whether the entity advertises any tilt bit — what gates the tilt option. */
export function coverSupportsTilt(attributes: CoverAttributes | undefined): boolean {
  const features = readSupportedFeatures(attributes)
  return (
    (features &
      (COVER_FEATURE.OPEN_TILT |
        COVER_FEATURE.CLOSE_TILT |
        COVER_FEATURE.STOP_TILT |
        COVER_FEATURE.SET_TILT_POSITION)) !==
    0
  )
}

/** The entity's `device_class`, when it published a usable one. */
export function readCoverDeviceClass(attributes: CoverAttributes | undefined): string | undefined {
  const raw = attributes?.device_class
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

/**
 * The boundary conversion, both directions.
 *
 * `invertPosition` declares the *entity's* scale reversed, so everything the
 * user sees and everything the card commits passes through here exactly once:
 * `effective = 100 − raw` on the way in, `raw = 100 − effective` on the way
 * out. They are the same arithmetic, written twice only because the call sites
 * read in opposite directions.
 */
export function toEffectivePosition(raw: number, invert: boolean): number {
  return invert ? 100 - raw : raw
}

export function toRawPosition(effective: number, invert: boolean): number {
  return invert ? 100 - effective : effective
}

/**
 * The device-class glyph table — data, not branches
 * (docs/changes/0019 — "Device-class icon mapping is data").
 *
 * Every row is a pair, because the option doc requires open and closed variants
 * of each class and a moving cover uses the open variant. The generic row is
 * the fallback for an unmapped or absent class, and is also the whole table
 * when `deviceClassIcon` is `false`.
 */
export type CoverGlyph = ComponentType<{ size?: number }>

export interface CoverGlyphPair {
  open: CoverGlyph
  closed: CoverGlyph
}

export const GENERIC_COVER_GLYPHS: CoverGlyphPair = { open: Blinds, closed: PanelTopClose }

export const COVER_DEVICE_CLASS_GLYPHS: Readonly<Record<string, CoverGlyphPair>> = {
  garage: { open: Warehouse, closed: InspectionPanel },
  gate: { open: PanelLeftOpen, closed: Fence },
  door: { open: DoorOpen, closed: DoorClosed },
  window: { open: AppWindow, closed: PanelLeftClose },
  blind: { open: PanelTopOpen, closed: PanelTopDashed },
  shade: { open: Scroll, closed: PanelBottomDashed },
  curtain: { open: PanelRightOpen, closed: PanelRightClose },
  shutter: { open: Columns2, closed: PanelRightDashed },
  awning: { open: PanelBottomOpen, closed: PanelBottomClose },
}

/** The state a cover presents as, once its position has had its say. */
export type CoverPresentedState = 'opening' | 'closing' | 'open' | 'closed' | 'unknown' | string

export interface CoverPresentation {
  /** What the card presents the cover as doing. */
  state: CoverPresentedState
  isMoving: boolean
  /** `true` for `unknown` — the state no control may act on. */
  isIndeterminate: boolean
  /** The position the user sees and the card commits against; `undefined` for a binary cover. */
  effectivePosition: number | undefined
  /** The tilt position the tilt slider shows, on its own un-inverted scale. */
  tiltPosition: number | undefined
  /** The state-line text, already cased the way the card renders it. */
  label: string
  /** Which style the label was resolved with, after the capability-derived default. */
  labelStyle: CoverStateLabelStyle
  icon: CoverGlyph
  color: DomainColorName
  /** Whether the shell paints the active tint — an open or moving cover. */
  isActive: boolean
  /** Open is held back here; see the disabling rule below. */
  isFullyOpen: boolean
  /** Close is held back here. */
  isFullyClosed: boolean
}

export interface CoverPresentationInput {
  /** The entity's raw state string. Never remapped by `invertPosition`. */
  state: string
  attributes: CoverAttributes | undefined
  options: CoverOptions
}

/**
 * Resolve everything the card renders from one reading of the entity.
 *
 * **The position decides, wherever there is one.** `coverState` reads `open` at
 * any position above zero, so gating the Open button on the state string left a
 * cover at 60% marked open and unable to be driven further open. The same
 * reasoning applies to the state line and the tint, and applying it in one place
 * is what keeps them from disagreeing: an inverted cover at raw `100` reports
 * state `open` while showing `0%`, and only a position-first derivation gets the
 * label, the tint and the disabled Close button to say the same thing. State
 * strings are still never *remapped* — a binary cover, which has no position,
 * presents exactly the state it reports.
 */
export function resolveCoverPresentation({
  state,
  attributes,
  options,
}: CoverPresentationInput): CoverPresentation {
  const rawPosition = readCoverPosition(attributes)
  const effectivePosition =
    rawPosition === undefined ? undefined : toEffectivePosition(rawPosition, options.invertPosition)
  const hasPosition = effectivePosition !== undefined

  const presented: CoverPresentedState =
    state === 'opening' || state === 'closing' || state === 'unknown'
      ? state
      : hasPosition
        ? effectivePosition > 0
          ? 'open'
          : 'closed'
        : state

  const isMoving = presented === 'opening' || presented === 'closing'
  const isIndeterminate = presented === 'unknown'
  const isActive = isMoving || presented === 'open'

  /*
   * The capability-derived default (no stored `stateLabels`): a cover is positional
   * when it supports set-position or reports a position at all, and binary
   * otherwise. Choosing `percent` on a binary cover is inert-safe by
   * construction — with no position to print, the percent branch has nothing to
   * say and the open/closed wording is what remains.
   */
  const isPositional =
    hasPosition || (readSupportedFeatures(attributes) & COVER_FEATURE.SET_POSITION) !== 0
  const labelStyle: CoverStateLabelStyle =
    options.stateLabels ?? (isPositional ? 'percent' : 'open-closed')

  const label = isMoving
    ? presented.toUpperCase()
    : labelStyle === 'percent' && effectivePosition !== undefined
      ? effectivePosition === 100
        ? 'OPEN'
        : effectivePosition === 0
          ? 'CLOSED'
          : `${effectivePosition}% OPEN`
      : presented.toUpperCase()

  /*
   * Which `--liebe-c-*` triplet the cover's rendered state resolves to.
   *
   * Covers are the `cool` row of the domain-colour table, so every state that
   * carries meaning — moving, or open to any degree — resolves there; a closed
   * cover carries no state and so no hue. Nothing here reaches for `ok`, which
   * the table reserves for locked/home/secure/fan.
   */
  const color: DomainColorName = isActive ? 'cool' : 'default'

  const deviceClass = readCoverDeviceClass(attributes)
  /*
   * `Object.hasOwn`, not a bare index. The table is a plain object, so
   * `COVER_DEVICE_CLASS_GLYPHS['constructor']` resolves to a function off
   * `Object.prototype` — and `device_class` is a free-text attribute a template
   * cover can put anything in. The fallback would then not be the generic pair
   * but `createElement(Object, …)`, which is a crashed card rather than a wrong
   * glyph.
   */
  const glyphs =
    options.deviceClassIcon && deviceClass && Object.hasOwn(COVER_DEVICE_CLASS_GLYPHS, deviceClass)
      ? COVER_DEVICE_CLASS_GLYPHS[deviceClass]
      : GENERIC_COVER_GLYPHS
  // A moving cover takes the open variant: it is on its way to or from open,
  // and freezing it on the closed glyph would read as a cover that has stopped.
  const icon = isActive ? glyphs.open : glyphs.closed

  return {
    state: presented,
    isMoving,
    isIndeterminate,
    effectivePosition,
    tiltPosition: readCoverTiltPosition(attributes),
    label,
    labelStyle,
    icon,
    color,
    isActive,
    /*
     * Position-based disabling, in effective terms so that what is enabled
     * always agrees with what the user reads. State-based disabling applies
     * only where there is no position — a binary garage door, where the state
     * genuinely is the whole story.
     */
    isFullyOpen: hasPosition ? effectivePosition === 100 : presented === 'open',
    isFullyClosed: hasPosition ? effectivePosition === 0 : presented === 'closed',
  }
}

/**
 * What a route does to the effective opening.
 *
 * `unclassifiable` is not a third outcome for the gate to weigh — it is gated
 * exactly like `opening`. It exists as its own value so the tests can pin *why*
 * a route was held (an indeterminate cover, a toggle with no position to
 * compare) rather than only that it was.
 */
export type CoverRouteDirection = 'opening' | 'not-opening' | 'unclassifiable'

export interface CoverRouteContext {
  entityId: string
  /** The entity's state is `unknown` or `unavailable`: no direction is knowable. */
  isIndeterminate: boolean
  /** The current effective position, when the entity reports one. */
  effectivePosition: number | undefined
  invertPosition: boolean
}

/** The services whose effect is "open this cover", in either spelling. */
function opensCover(serviceDomain: string, service: string, entityDomain: string): boolean {
  if (serviceDomain === entityDomain && service === 'open_cover') return true
  // The generic aliases are the same command by another name: on a cover,
  // `homeassistant.turn_on` calls `open_cover`.
  return (
    (serviceDomain === 'homeassistant' || serviceDomain === entityDomain) && service === 'turn_on'
  )
}

function togglesCover(serviceDomain: string, service: string, entityDomain: string): boolean {
  return (
    (serviceDomain === 'homeassistant' || serviceDomain === entityDomain) && service === 'toggle'
  )
}

/**
 * Whether a `cover.toggle` would increase the opening.
 *
 * Home Assistant's cover toggle opens a *closed* cover and closes anything else,
 * so the only route that can be waved through is the one that provably closes.
 * Two things stop it being provable, and the option doc names both as cases the
 * gate must resolve conservatively: no position to compare against, and an
 * inverted scale — where the integration's own `is_closed` is computed from the
 * raw position the user is not looking at, so the direction the card would
 * predict is not the direction the cover would take.
 */
function toggleDirection(context: CoverRouteContext): CoverRouteDirection {
  if (context.invertPosition || context.effectivePosition === undefined) return 'unclassifiable'
  return context.effectivePosition === 0 ? 'opening' : 'not-opening'
}

/**
 * Whether a `set_cover_position` payload increases the opening.
 *
 * The payload is in the *entity's* scale — that is what `invertPosition` means —
 * so it is converted to the effective scale before being compared with where
 * the cover is now. A payload with no usable position, or a cover with no
 * current position to compare it against, cannot be classified.
 */
function positionDirection(
  data: Record<string, unknown> | undefined,
  context: CoverRouteContext
): CoverRouteDirection {
  const raw = data?.position
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'unclassifiable'
  if (context.effectivePosition === undefined) return 'unclassifiable'

  const target = toEffectivePosition(
    Math.min(100, Math.max(0, Math.round(raw))),
    context.invertPosition
  )
  return target > context.effectivePosition ? 'opening' : 'not-opening'
}

/**
 * Classify a resolved action by what it would do to this cover's opening
 * (docs/specs/entity-cards/options/cover.md — `confirmOpen`).
 *
 * By effect, never by service name alone: the gate is un-bypassable only if
 * `tapAction: toggle`, a `call-service` on `cover.open_cover`, and the generic
 * `homeassistant.turn_on` alias all arrive at the same answer. Anything that
 * does not actuate this cover — `more-info`, `navigate`, `none`, a service
 * aimed at another entity, tilt — is `not-opening`: confirming it would train
 * the user to dismiss the dialog that matters.
 */
export function classifyCoverRoute(
  action: ResolvedCardAction,
  context: CoverRouteContext
): CoverRouteDirection {
  const entityDomain = context.entityId.split('.')[0]

  if (action === 'toggle') {
    if (context.isIndeterminate) return 'unclassifiable'
    return toggleDirection(context)
  }

  if (typeof action !== 'object' || action.action !== 'call-service') return 'not-opening'
  if (!targetsEntity(action.data, context.entityId)) return 'not-opening'

  const [serviceDomain, service] = action.service.split('.')

  if (opensCover(serviceDomain, service, entityDomain)) return 'opening'

  if (togglesCover(serviceDomain, service, entityDomain)) {
    if (context.isIndeterminate) return 'unclassifiable'
    return toggleDirection(context)
  }

  if (serviceDomain === entityDomain && service === 'set_cover_position') {
    if (context.isIndeterminate) return 'unclassifiable'
    return positionDirection(action.data, context)
  }

  return 'not-opening'
}

/**
 * Whether the `confirmOpen` gate applies to this card at all.
 *
 * Two conditions, and the device class is the one that cannot be configured
 * away: the option is offered only for the perimeter openings, so a `confirmOpen`
 * left in the config of a blind does not put a dialog in front of its slider.
 */
export function coverGateApplies(deviceClass: string | undefined, options: CoverOptions): boolean {
  return options.confirmOpen && isSecurityCover(deviceClass)
}

/** Whether a classified route has to be confirmed. */
export function requiresCoverConfirmation(direction: CoverRouteDirection): boolean {
  return direction !== 'not-opening'
}
