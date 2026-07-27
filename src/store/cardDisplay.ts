import { z } from 'zod'
import type { DomainColorName } from '~/theme/tokens'

/**
 * The card display contract — the persisted shape of `name`, `icon`,
 * `hideName`, `hideState` and `color` under `item.config`, and the rules for
 * resolving them into what the shell renders.
 *
 * Spec: docs/specs/entity-cards/options/common.md — "Universal options". Lives
 * beside `cardActions.ts` for the same two reasons: it is config validation
 * first (`configSchema.ts` gates imports with it), and a pure module keeps the
 * card graph free of another import edge (AGENTS.md, "Entity Card Registration").
 */

/**
 * The canonical `color` value list, persisted verbatim.
 *
 * `auto` keeps the card's own state-aware resolution (a thermostat stays `heat`
 * or `cool` as it switches); every other value pins that one `--liebe-c-*`
 * triplet for the card's active treatment. The list is exactly the domain
 * palette minus `brand`, which the design system reserves for the Liebe mark and
 * therefore does not offer as a card colour — `src/store/__tests__/cardDisplay.test.ts`
 * pins that correspondence, so a triplet added to the palette cannot silently
 * fail to become selectable here.
 *
 * `satisfies` is what makes the list more than a string array: every non-`auto`
 * entry must be a real triplet name, so a colour that `anatomy.css` has no
 * `[data-color]` rule for cannot be typed into it.
 */
export const CARD_COLOR_OPTIONS = [
  'auto',
  'light',
  'heat',
  'cool',
  'ok',
  'alert',
  'media',
  'vacuum',
  'water',
  'default',
] as const satisfies readonly ('auto' | DomainColorName)[]

export type CardColorOption = (typeof CARD_COLOR_OPTIONS)[number]

/**
 * The enum the import gate validates against. Deliberately closed: an option
 * whose values are an enum needs a canonical, schema-validated list, so a
 * mistyped `color: amber` fails at the gate naming the field rather than
 * rendering as an unexplained neutral card.
 */
export const cardColorSchema = z.enum(CARD_COLOR_OPTIONS)

export const CARD_DISPLAY_KEYS = ['name', 'icon', 'hideName', 'hideState', 'color'] as const

export type CardDisplayKey = (typeof CARD_DISPLAY_KEYS)[number]

/** The resolved display options, every key present. */
export interface CardDisplayOptions {
  /** Overrides the entity's friendly name when non-empty. */
  name: string
  /** Overrides the card's own icon when it names an icon this build has. */
  icon: string
  hideName: boolean
  hideState: boolean
  color: CardColorOption
}

/**
 * The stored defaults. All five are "leave the card alone": an unconfigured
 * card renders exactly what it rendered before the option existed.
 */
export const CARD_DISPLAY_DEFAULTS: Readonly<CardDisplayOptions> = {
  name: '',
  icon: '',
  hideName: false,
  hideState: false,
  color: 'auto',
}

/** The display-key fragment of `item.config`, merged into the item schema. */
export const cardDisplayConfigSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  hideName: z.boolean().optional(),
  hideState: z.boolean().optional(),
  color: cardColorSchema.optional(),
})

/**
 * Per-key schemas, so one bad value in a config that reached the store some
 * other way costs only its own key rather than the whole display surface.
 */
const displayKeySchemas: Readonly<Record<CardDisplayKey, z.ZodTypeAny>> = {
  name: z.string(),
  icon: z.string(),
  hideName: z.boolean(),
  hideState: z.boolean(),
  color: cardColorSchema,
}

export interface ReadCardDisplayOptions {
  /**
   * The entity is in a danger state — a jammed lock, a triggered alarm. Such a
   * card MUST NOT be configurable into looking calm, so the options that carry
   * the warning are suppressed while it holds (REVIEW.md — "Danger states must
   * not be configurable into looking calm"). See `applyDangerFloor`.
   */
  danger?: boolean
}

/**
 * What a danger state takes back from the user's configuration.
 *
 * Colour, the two hide flags and the icon are all *signalling*: between them
 * they are how a card says something is wrong, and a configuration that pins a
 * jammed lock to `ok`, hides its state line, or swaps its glyph would produce a
 * card that looks fine while the door is not. Those revert to what the card
 * itself renders.
 *
 * `name` is the exception and stays: it identifies the entity ("Back door")
 * rather than describing what it is doing, and a user who renamed a card still
 * needs to know which one is alarming.
 */
function applyDangerFloor(display: CardDisplayOptions): CardDisplayOptions {
  return {
    ...display,
    icon: CARD_DISPLAY_DEFAULTS.icon,
    hideName: CARD_DISPLAY_DEFAULTS.hideName,
    hideState: CARD_DISPLAY_DEFAULTS.hideState,
    color: CARD_DISPLAY_DEFAULTS.color,
  }
}

/**
 * Read the display options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate. As with
 * `readCardAction`, that is not the silent repair the config spec forbids —
 * imports are rejected by `dashboardConfigSchema` before they reach a card, and
 * nothing here writes back — it is the render path resolving a value it cannot
 * interpret for display only (docs/specs/dashboard-config — "Forward
 * Compatibility").
 */
export function readCardDisplay(
  config: Record<string, unknown> | undefined,
  { danger = false }: ReadCardDisplayOptions = {}
): CardDisplayOptions {
  const resolved = { ...CARD_DISPLAY_DEFAULTS }

  for (const key of CARD_DISPLAY_KEYS) {
    const raw = config?.[key]
    if (raw === undefined) continue

    const parsed = displayKeySchemas[key].safeParse(raw)
    // The cast is the price of iterating a heterogeneous record; the schema
    // above is what makes each value the type its key declares.
    if (parsed.success) (resolved as Record<CardDisplayKey, unknown>)[key] = parsed.data
  }

  return danger ? applyDangerFloor(resolved) : resolved
}

/**
 * Substitute the card's own state-derived colour for the stored `auto`.
 *
 * Everything else is a pin: the user asked for that triplet, and the card's
 * state no longer moves it.
 */
export function resolveCardColor(
  stored: CardColorOption,
  cardColor: DomainColorName
): DomainColorName {
  return stored === 'auto' ? cardColor : stored
}
