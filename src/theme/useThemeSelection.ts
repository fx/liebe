/**
 * What the panel renders with: the configured theme and the appearance it
 * resolves to right now.
 *
 * The panel is the only caller — the Storybook workshop drives the same
 * provider from its toolbar instead, which is what makes the toolbar a stand-in
 * for the configuration rather than a second theming path.
 */

import { useSyncExternalStore } from 'react'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '~/store/dashboardStore'
import { resolveThemeAppearance, type AppearancePreference } from './appearance'
import { DEFAULT_THEME_ID, getThemeOrDefault, type ThemeAppearance } from './themeRegistry'

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function darkSchemeQuery(): MediaQueryList | undefined {
  // `matchMedia` is missing in some embedding environments (and in bare test
  // DOMs); the panel renders light there rather than failing to render.
  return window.matchMedia?.(DARK_SCHEME_QUERY)
}

function subscribeToDarkScheme(onChange: () => void): () => void {
  const query = darkSchemeQuery()
  if (!query) return () => {}

  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readDarkScheme(): boolean {
  return darkSchemeQuery()?.matches ?? false
}

/**
 * Live `prefers-color-scheme: dark`.
 *
 * `useSyncExternalStore` rather than state-plus-effect: the media query is
 * external state, and reading it in a subscription keeps the first render from
 * showing the wrong appearance and then correcting itself. No server snapshot —
 * the panel only ever renders in a browser, inside a custom element.
 */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeToDarkScheme, readDarkScheme)
}

export interface ThemeSelection {
  /** Id of the active theme — stamped as `data-liebe-theme`. */
  themeId: string
  /** Appearance actually rendered, after the theme has had its say. */
  appearance: ThemeAppearance
}

/**
 * Resolves the active theme and appearance from the dashboard configuration.
 *
 * The configuration still stores appearance as the scalar `theme` field; change
 * 0012's PR 2 replaces it with `theme.{id, appearance, customCss}` and migrates
 * existing dashboards, at which point the theme id stops being pinned to the
 * default here. Everything downstream of this hook already takes both.
 */
export function useThemeSelection(): ThemeSelection {
  const preference: AppearancePreference = useStore(dashboardStore, (state) => state.theme)
  const prefersDark = usePrefersDark()

  const theme = getThemeOrDefault(DEFAULT_THEME_ID)

  return {
    themeId: theme.id,
    appearance: resolveThemeAppearance(theme, preference, { prefersDark }),
  }
}
