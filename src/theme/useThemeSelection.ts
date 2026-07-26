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
import { resolveThemeAppearance } from './appearance'
import { getThemeOrDefault, type ThemeAppearance } from './themeRegistry'

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
  /** The configuration's custom CSS, as authored — sanitized at injection. */
  customCss: string
}

/**
 * Resolves what to render from the dashboard configuration's `theme` object.
 *
 * The id is the theme that actually renders rather than the one that was asked
 * for: a configuration naming a theme this build does not have falls back to
 * Default, and everything downstream (the root stamp, the injected layer) must
 * agree about which that is.
 */
export function useThemeSelection(): ThemeSelection {
  const { id, appearance, customCss } = useStore(dashboardStore, (state) => state.theme)
  const prefersDark = usePrefersDark()

  const theme = getThemeOrDefault(id)

  return {
    themeId: theme.id,
    appearance: resolveThemeAppearance(theme, appearance, { prefersDark }),
    customCss,
  }
}
