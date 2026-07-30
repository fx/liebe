import { z } from 'zod'

/**
 * The cover card's option contract — the persisted shape of
 * `showPositionSlider`, `showButtons`, `showTiltControls`, `invertPosition`,
 * `deviceClassIcon`, `stateLabelStyle` and `confirmOpen` under `item.config`,
 * and the rules for reading them back, plus the legacy `stateLabels` rename.
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
 * form was opened and saved. `COVER_STATE_LABEL_STYLE_AUTO` is the form's
 * spelling of that absence, and never reaches `item.config`.
 */
export type CoverStateLabelStyle = 'percent' | 'open-closed'

/**
 * The configuration form's value for "derive it from the entity", which the
 * form's `clearValue` turns back into an absent key on save. Form-only: it is
 * not part of the stored contract, and a hand-written document carrying it
 * resolves through the same path as any other unrecognised value — the
 * entity-derived default it was asking for.
 */
export const COVER_STATE_LABEL_STYLE_AUTO = 'auto'

/** The current key for the style selector. */
export const COVER_STATE_LABEL_STYLE_KEY = 'stateLabelStyle'

/**
 * What this option was called before change 0038, and still is in every stored
 * document written by an earlier build.
 *
 * The rename is the whole of that change: `stateLabels` was declared by this
 * family as a style enum *and* by `switchOptions.ts` as the
 * `{ onLabel, offLabel }` text pair the switch and fallback cards document, and
 * `configSchema.ts` merges both fragments into one item schema where
 * `zod.merge()` is last-one-wins — so the cover's enum governed the key for
 * every family and a switch card carrying its own documented labels was
 * rejected outright by the import gate
 * (docs/changes/0038-option-key-collision.md).
 */
export const LEGACY_COVER_STATE_LABELS_KEY = 'stateLabels'

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
  stateLabelStyle: CoverStateLabelStyle | undefined
  /** Confirmation gate on opening routes; only offered for security classes. */
  confirmOpen: boolean
}

export const COVER_OPTION_KEYS = [
  'showPositionSlider',
  'showButtons',
  'showTiltControls',
  'invertPosition',
  'deviceClassIcon',
  'stateLabelStyle',
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
  stateLabelStyle: undefined,
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

/**
 * The two concrete styles. Exported because the import gate has to keep
 * accepting them under the *legacy* key as well: the loader migration below runs
 * after `dashboardConfigSchema`, so a shared document written before the rename
 * would be rejected before it could be migrated (see `./configSchema`).
 */
export const coverStateLabelStyleSchema = z.enum(['percent', 'open-closed'])

/** The cover fragment of `item.config`, merged into the item schema. */
export const coverOptionsConfigSchema = z.object({
  showPositionSlider: z.boolean().optional(),
  showButtons: z.boolean().optional(),
  showTiltControls: z.boolean().optional(),
  invertPosition: z.boolean().optional(),
  deviceClassIcon: z.boolean().optional(),
  stateLabelStyle: coverStateLabelStyleSchema.optional(),
  confirmOpen: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const coverKeySchemas: Readonly<Record<CoverOptionKey, z.ZodTypeAny>> = {
  showPositionSlider: z.boolean(),
  showButtons: z.boolean(),
  showTiltControls: z.boolean(),
  invertPosition: z.boolean(),
  deviceClassIcon: z.boolean(),
  stateLabelStyle: coverStateLabelStyleSchema,
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
    stateLabelStyle: read('stateLabelStyle'),
    confirmOpen: read('confirmOpen'),
  }
}

/**
 * The cover card's legacy `stateLabels` → `stateLabelStyle` rename, applied at
 * the loader so a card and its configuration form only ever see the current key
 * (common contract, convention 1 — the same job the weather card's
 * `preset` → `variant` rename does).
 *
 * **Keyed on the stored value's shape as well as the card's domain**, which is
 * what makes it not a blanket key rewrite. `stateLabels` is still a live,
 * documented option for the switch and fallback cards, as the
 * `{ onLabel, offLabel }` text pair — the very configurations change 0038 exists
 * to unbreak — so renaming the key wherever it appears would destroy them.
 * Only a **string** on a **cover** card is this option; anything else is left
 * exactly where it is, like every other key from a document Liebe cannot fully
 * interpret (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 * Any string, not only the two legal ones: an unrecognised style is still this
 * option being addressed, and `readCoverOptions` resolves what it cannot
 * interpret rather than the loader silently dropping it.
 *
 * Unconditional rather than version-keyed, like the other two renames: a rename
 * has no default to pin, so there is no newly added card whose absent key could
 * be mistaken for a legacy one (convention 7's cutoff rule is about pinning).
 * The legacy key is never written back — it is removed here, and nothing
 * downstream writes it.
 *
 * Returns the config unchanged, by reference, when no rename applies.
 */
export function migrateCoverCardConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { [LEGACY_COVER_STATE_LABELS_KEY]: legacy, ...rest } = config
  if (typeof legacy !== 'string') return config

  // Both keys present means a config migrated once already and then given the
  // legacy key back by hand or by an older build's export. The current key is
  // the one the form last wrote, so it wins and the legacy one is dropped —
  // the rule the light card's rename follows.
  if (COVER_STATE_LABEL_STYLE_KEY in rest) return rest

  return { ...rest, [COVER_STATE_LABEL_STYLE_KEY]: legacy }
}
