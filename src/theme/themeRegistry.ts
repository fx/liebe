/**
 * The built-in theme registry.
 *
 * A theme is data — an id, a human label, which appearances it supports, and
 * the CSS that is its entire payload (see docs/specs/theming/index.md, "Theme
 * model"). Never JavaScript: everything a theme does, it does by overriding
 * tokens and by scoped rules on the stable selector contract, which is what
 * makes adding one (change 0013) additive.
 *
 * Both surfaces read this module: the panel injects the active theme's `css`
 * into its shadow root, and the Storybook toolbar enumerates the registry
 * rather than a hardcoded list, so a theme registered here appears in the
 * workshop with no workshop changes.
 */

import defaultThemeCss from './themes/default.css?raw'

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
  /**
   * The theme's stylesheet, authored inside the `liebe-theme` layer and
   * injected as-is when the theme is active (`src/theme/styleInjection.ts`).
   * Imported raw rather than as a side-effecting `import './x.css'`, which
   * would apply every registered theme at once.
   */
  css: string
}

export const DEFAULT_THEME_ID = 'default'

// Frozen: `listThemes`/`getTheme` hand out the stored records themselves, so a
// caller mutating one would change appearance resolution for every other
// caller. Freezing keeps the registry the single source of truth without
// cloning on every lookup.
const builtInThemes: readonly ThemeDefinition[] = Object.freeze([
  Object.freeze<ThemeDefinition>({
    id: DEFAULT_THEME_ID,
    label: 'Default',
    appearances: 'both',
    css: defaultThemeCss,
  }),
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
 * The theme to actually render for `id`.
 *
 * An unregistered id is a configuration written against a build that has a
 * theme this one does not (an import from a newer Liebe, a theme removed
 * between versions). Rendering the Default theme keeps that dashboard usable
 * and styled, where an empty theme layer would leave it on bare base tokens.
 */
export function getThemeOrDefault(id: string): ThemeDefinition {
  // The registry always carries Default — `listThemes` is asserted to — so the
  // fallback is named rather than positional.
  return getTheme(id) ?? getTheme(DEFAULT_THEME_ID)!
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
