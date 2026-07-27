import { z } from 'zod'

/**
 * The cover card's option contract — the persisted shape of
 * `showPositionSlider`, `showButtons`, `showTiltControls`, `invertPosition`,
 * `deviceClassIcon`, `stateLabels` and `confirmOpen` under `item.config`, and
 * the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/cover.md. Lives in the store beside
 * `cardDisplay.ts` for the same two reasons as its siblings: `configSchema.ts`
 * gates imports with it, and a pure module keeps the card graph free of another
 * import edge (AGENTS.md — "Entity Card Registration").
 *
 * This module is the contract only. What the options RESOLVE TO on screen —
 * which glyph, which state text, which position the card operates on, and which
 * routes the confirmation gate holds — is
 * `src/components/CoverCard/presentation.ts`, because that is presentation and
 * action classification rather than config validation.
 */

/**
 * How the state line renders a position. The key being **absent** is the third
 * state and the default: derive the style from the entity — `percent` for a
 * positional cover, `open-closed` for a binary one.
 *
 * Absence rather than a sentinel value, for the reason `input_number`'s control
 * style uses absence (docs/changes/0022): the stored contract has one spelling
 * for "follow the entity", and a form that could only write one of the two
 * concrete styles would pin every garage door to a percentage the moment its
 * form was opened and saved. `COVER_STATE_LABELS_AUTO` is the form's spelling
 * of that absence, and never reaches `item.config`.
 */
export type CoverStateLabelStyle = 'percent' | 'open-closed'

/**
 * The configuration form's value for "derive it from the entity", which the
 * form's `clearValue` turns back into an absent key on save. Form-only: it is
 * not part of the stored contract, and a hand-written document carrying it
 * resolves through the same path as any other unrecognised value — the
 * entity-derived default it was asking for.
 */
export const COVER_STATE_LABELS_AUTO = 'auto'

export interface CoverOptions {
  /** Renders the position slider, where set-position (bit 4) is supported. */
  showPositionSlider: boolean
  /** Renders the open / stop / close row at the `full` tier. */
  showButtons: boolean
  /** Renders the tilt controls at the `full` tier, where tilt is supported. */
  showTiltControls: boolean
  /** Declares the entity's position scale reversed (`0` = open). */
  invertPosition: boolean
  /** Picks the default glyph pair from the entity's `device_class`. */
  deviceClassIcon: boolean
  /** Position display style on the state line; `undefined` derives it. */
  stateLabels: CoverStateLabelStyle | undefined
  /** Confirmation gate on opening routes; only offered for security classes. */
  confirmOpen: boolean
}

export const COVER_OPTION_KEYS = [
  'showPositionSlider',
  'showButtons',
  'showTiltControls',
  'invertPosition',
  'deviceClassIcon',
  'stateLabels',
  'confirmOpen',
] as const

export type CoverOptionKey = (typeof COVER_OPTION_KEYS)[number]

/**
 * The stored defaults — every one of them "leave the card as it shipped".
 *
 * `confirmOpen` defaults to `true` even though the form offers it only for the
 * three security device classes: the gate has to hold for a garage door whose
 * card has never been configured, which is precisely the card an accidental tap
 * would otherwise open (docs/specs/entity-cards/options/cover.md — `confirmOpen`).
 */
export const COVER_OPTION_DEFAULTS: Readonly<CoverOptions> = {
  showPositionSlider: true,
  showButtons: true,
  showTiltControls: true,
  invertPosition: false,
  deviceClassIcon: true,
  stateLabels: undefined,
  confirmOpen: true,
}

/**
 * The device classes the option doc treats as security openings: their cards
 * default to `more-info` rather than `toggle`, and they are the only ones
 * offered — and gated by — `confirmOpen`.
 */
export const COVER_SECURITY_DEVICE_CLASSES = ['garage', 'gate', 'door'] as const

export type CoverSecurityDeviceClass = (typeof COVER_SECURITY_DEVICE_CLASSES)[number]

/** Whether a `device_class` names one of the perimeter openings. */
export function isSecurityCover(deviceClass: string | undefined): boolean {
  return (COVER_SECURITY_DEVICE_CLASSES as readonly string[]).includes(deviceClass ?? '')
}

const coverStateLabelStyleSchema = z.enum(['percent', 'open-closed'])

/** The cover fragment of `item.config`, merged into the item schema. */
export const coverOptionsConfigSchema = z.object({
  showPositionSlider: z.boolean().optional(),
  showButtons: z.boolean().optional(),
  showTiltControls: z.boolean().optional(),
  invertPosition: z.boolean().optional(),
  deviceClassIcon: z.boolean().optional(),
  stateLabels: coverStateLabelStyleSchema.optional(),
  confirmOpen: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const coverKeySchemas: Readonly<Record<CoverOptionKey, z.ZodTypeAny>> = {
  showPositionSlider: z.boolean(),
  showButtons: z.boolean(),
  showTiltControls: z.boolean(),
  invertPosition: z.boolean(),
  deviceClassIcon: z.boolean(),
  stateLabels: coverStateLabelStyleSchema,
  confirmOpen: z.boolean(),
}

/**
 * Read the cover options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility"). For
 * `confirmOpen` that fallback is also the safe direction: a `confirmOpen: "no"`
 * that nobody validated leaves the gate closed rather than open.
 */
export function readCoverOptions(config: Record<string, unknown> | undefined): CoverOptions {
  const read = <K extends CoverOptionKey>(key: K): CoverOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return COVER_OPTION_DEFAULTS[key]

    const parsed = coverKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as CoverOptions[K])
      : (COVER_OPTION_DEFAULTS[key] as CoverOptions[K])
  }

  return {
    showPositionSlider: read('showPositionSlider'),
    showButtons: read('showButtons'),
    showTiltControls: read('showTiltControls'),
    invertPosition: read('invertPosition'),
    deviceClassIcon: read('deviceClassIcon'),
    stateLabels: read('stateLabels'),
    confirmOpen: read('confirmOpen'),
  }
}
