/**
 * Minimal built-in theme registry.
 *
 * A theme is data — an id, a human label, and which appearances it supports
 * (see docs/specs/theming/index.md, "Theme model"). Only `default` exists
 * today; the Storybook theme toolbar enumerates this registry rather than a
 * hardcoded list, so themes registered by later changes appear in the workshop
 * with no workshop changes. Change 0012 adopts this module as the runtime
 * registry and extends each entry with its CSS payload.
 */

/** Appearances a theme is able to render in. */
export type ThemeAppearanceSupport = 'both' | 'dark-only' | 'light-only'

/** A resolved appearance — what the Radix `Theme` is actually rendered with. */
export type ThemeAppearance = 'dark' | 'light'

export interface ThemeDefinition {
  /** Stable identifier, stamped as `data-liebe-theme` by the theming engine. */
  id: string
  /** Human-readable name shown in pickers and the Storybook toolbar. */
  label: string
  /** Which appearances this theme provides token sets for. */
  appearances: ThemeAppearanceSupport
}

export const DEFAULT_THEME_ID = 'default'

// Frozen: `listThemes`/`getTheme` hand out the stored records themselves, so a
// caller mutating one would change appearance resolution for every other
// caller. Freezing keeps the registry the single source of truth without
// cloning on every lookup.
const builtInThemes: readonly ThemeDefinition[] = Object.freeze([
  Object.freeze<ThemeDefinition>({ id: DEFAULT_THEME_ID, label: 'Default', appearances: 'both' }),
])

/** All registered themes, in registration order. */
export function listThemes(): ThemeDefinition[] {
  return [...builtInThemes]
}

/** Look up a single theme, or `undefined` when the id is not registered. */
export function getTheme(id: string): ThemeDefinition | undefined {
  return builtInThemes.find((theme) => theme.id === id)
}

/**
 * Resolve the appearance a theme renders in.
 *
 * Single-appearance themes force theirs, which is what lets the appearance
 * control be shown as forced rather than lying about the rendered result. An
 * unknown theme (`undefined`) keeps the requested appearance.
 */
export function resolveAppearance(
  theme: ThemeDefinition | undefined,
  requested: ThemeAppearance
): ThemeAppearance {
  if (theme?.appearances === 'dark-only') return 'dark'
  if (theme?.appearances === 'light-only') return 'light'
  return requested
}

/** Whether the appearance control should be interactive for this theme. */
export function supportsAppearanceChoice(theme: ThemeDefinition | undefined): boolean {
  return theme === undefined || theme.appearances === 'both'
}
