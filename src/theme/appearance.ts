/**
 * Appearance resolution.
 *
 * Two independent things decide what the panel renders in: what the user asked
 * for (`auto | dark | light`, persisted in the dashboard configuration) and
 * what the active theme is able to render (a `dark-only` theme forces its own).
 * `auto` follows the environment. See docs/specs/theming/index.md —
 * "Application mechanism".
 */

import { resolveAppearance, type ThemeAppearance, type ThemeDefinition } from './themeRegistry'

/** What the configuration stores: an explicit appearance, or "follow the environment". */
export type AppearancePreference = 'auto' | ThemeAppearance

/** Environment signals `auto` resolves against. */
export interface AppearanceSignals {
  /** `prefers-color-scheme: dark` — the baseline signal, always available. */
  prefersDark: boolean
  /**
   * Home Assistant's own theme darkness, when the panel can detect it.
   *
   * The hook for the spec's open question ("HA theme darkness detection"):
   * whether that is readable reliably across HA versions is unsettled, so
   * nothing supplies it yet and `auto` falls back to `prefers-color-scheme`.
   * When a detector lands it passes a boolean here and takes precedence — the
   * panel should look dark when the frontend around it is dark, whatever the OS
   * says.
   */
  hostDark?: boolean
}

/** Resolves the stored preference against the environment, ignoring the theme. */
export function resolveAppearancePreference(
  preference: AppearancePreference,
  { prefersDark, hostDark }: AppearanceSignals
): ThemeAppearance {
  if (preference !== 'auto') return preference
  return (hostDark ?? prefersDark) ? 'dark' : 'light'
}

/**
 * The appearance actually rendered: the resolved preference, unless the theme
 * only provides one appearance and forces it.
 */
export function resolveThemeAppearance(
  theme: ThemeDefinition | undefined,
  preference: AppearancePreference,
  signals: AppearanceSignals
): ThemeAppearance {
  return resolveAppearance(theme, resolveAppearancePreference(preference, signals))
}
