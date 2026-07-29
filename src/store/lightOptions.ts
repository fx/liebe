import { z } from 'zod'

/**
 * The light card's own stored options, and the migration off the shipped
 * `enableBrightness` key.
 *
 * Spec: docs/specs/entity-cards/options/light.md — "Brightness
 * (`showBrightnessSlider`)" and its "Backward compatibility" note. Lives beside
 * `cardDisplay.ts` / `cardActions.ts` for the same reason: it is config
 * handling, the loader (`persistence.ts`) is its main caller, and a pure module
 * keeps the card graph free of another import edge (AGENTS.md — "Entity Card
 * Registration").
 */

/** The current key. Everything downstream of the loader reads only this one. */
export const SHOW_BRIGHTNESS_SLIDER_KEY = 'showBrightnessSlider'

/** Whether the icon tint and slider fill follow the bulb's own colour. */
export const USE_LIGHT_COLOR_KEY = 'useLightColor'

/**
 * The key Liebe shipped first. Read on the way in and dropped there, so it is
 * never written back and never reaches a card or a configuration form — the
 * rename is a loader concern, not a dual-key read scattered through render code
 * (common contract, convention 1: "renames require a config migration in the
 * loader").
 */
const LEGACY_ENABLE_BRIGHTNESS_KEY = 'enableBrightness'

/**
 * Rewrite one light card's stored config from `enableBrightness` to
 * `showBrightnessSlider`, preserving semantics exactly: the old card showed the
 * slider unless the key was literally `false`, so anything else — `true`, and
 * equally a junk `1` or `"yes"` from a hand-edited YAML — migrates to `true`.
 * The result is a real boolean either way.
 *
 * Only that one key is touched. Everything else the config carries, including
 * keys this build has never heard of, is copied across untouched, because a
 * document a newer Liebe wrote has to survive a round-trip through this one
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * Returns the config unchanged, by reference, when there is nothing to migrate
 * — which is every load after the first, and every config written since.
 */
export function migrateLightCardConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!(LEGACY_ENABLE_BRIGHTNESS_KEY in config)) return config

  const { [LEGACY_ENABLE_BRIGHTNESS_KEY]: legacy, ...rest } = config

  // Both keys present means a config that has already been migrated once and
  // then had the legacy key put back by hand or by an older build's export. The
  // current key is the one the user last edited through the form, so it wins
  // and the legacy one is simply dropped.
  if (SHOW_BRIGHTNESS_SLIDER_KEY in rest) return rest

  return { ...rest, [SHOW_BRIGHTNESS_SLIDER_KEY]: legacy !== false }
}

/**
 * Whether the brightness slider is enabled for this card.
 *
 * Default `true`: an unconfigured card keeps the slider it has always had. A
 * value that is not a boolean resolves to the default rather than being
 * rejected — the render path resolves what it cannot interpret, and imports are
 * gated upstream (docs/specs/dashboard-config/index.md — "Forward
 * Compatibility"), the same rule `readCardDisplay` follows.
 *
 * Whether the slider can appear at all is the entity's business, not this
 * option's (common contract, convention 3).
 */
export function readShowBrightnessSlider(config: Record<string, unknown> | undefined): boolean {
  return config?.[SHOW_BRIGHTNESS_SLIDER_KEY] !== false
}

/**
 * Whether the card's tint follows the bulb's own colour.
 *
 * Default `true`: a colour bulb showing its colour is the researched common case
 * (docs/specs/entity-cards/options/light.md — "Light-color theming"). Like the
 * slider option, a non-boolean resolves to the default rather than being
 * rejected — the render path resolves what it cannot interpret.
 *
 * This governs only what the card OFFERS. Whether the offered colour is used is
 * the shell's decision: `resolveCardHue` in `GridCard.tsx` composes it against a
 * danger state and an explicit universal `color`, both of which outrank it. The
 * card deliberately does not re-apply that precedence — a second opinion on it
 * here is how the icon and the slider come to disagree.
 */
export function readUseLightColor(config: Record<string, unknown> | undefined): boolean {
  return config?.[USE_LIGHT_COLOR_KEY] !== false
}

/**
 * The light fragment of `item.config`, merged into the item schema.
 *
 * The light keys join the validated set for the reason its siblings give: both
 * are booleans whose wrong value looks like a working card rather than a
 * rejected document. `showBrightnessSlider: "false"` is a string, so it is not
 * `false`, so the reader above resolves it to `true` — a dashboard that asked to
 * hide the slider silently keeps it. Telling the author beats quietly
 * disagreeing with them, and the render path stays tolerant either way for the
 * values that reach localStorage by some other route
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
export const lightOptionsConfigSchema = z.object({
  [SHOW_BRIGHTNESS_SLIDER_KEY]: z.boolean().optional(),
  [USE_LIGHT_COLOR_KEY]: z.boolean().optional(),
})
