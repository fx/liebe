/**
 * Document-level `@font-face` registration for themes that bundle a typeface.
 *
 * Everything else a theme does, it does inside the panel's shadow root. Fonts
 * cannot: a shadow root does not load `@font-face` rules declared inside it, so
 * a theme that shipped its face in its own payload would render in the fallback
 * family and nothing would say why (docs/specs/theming/index.md, "Application
 * mechanism"). The face is therefore registered in the *owning document* — Home
 * Assistant's document in the panel, the preview document in the workshop —
 * where it is visible to the shadow tree below it.
 *
 * The theme stays data: it carries the `@font-face` text (`fontFaces` on the
 * registry record) and this module injects it. The only thing done to that text
 * is substituting the asset base, which cannot be baked in because the panel is
 * served from a different directory in dev, in the workshop, and in a Home
 * Assistant install.
 */

import type { ThemeDefinition } from './themeRegistry'

/** The `data-liebe` slot marking a document-level font registration. */
export const FONT_STYLE_SLOT = 'fonts'

/**
 * The token a theme's font sheet writes where the asset directory belongs.
 *
 * Named after the global it is replaced with (`src/panel.ts` publishes
 * `window.__LIEBE_ASSET_BASE_URL__`) so the two are greppable together — the
 * sheet says what it wants, and this module is the only place that resolves it.
 */
export const ASSET_BASE_PLACEHOLDER = '__LIEBE_ASSET_BASE_URL__'

/**
 * Where bundled assets live, as the panel published it.
 *
 * `/` is the fallback for the same reason `WeatherCard` uses it: a tree
 * rendered outside the panel bootstrap (a test, a bare page) has no published
 * base, and resolving against the origin root is the best available guess.
 */
function assetBaseUrl(): string {
  return window.__LIEBE_ASSET_BASE_URL__ ?? '/'
}

/**
 * Registers `theme`'s bundled `@font-face` rules in `doc`.
 *
 * Idempotent, which matters more here than for the theme layer: the panel
 * remounts its React tree on reconnect (docs/specs/panel-lifecycle/), and a
 * fresh `<style>` per mount would re-declare the face — and, in engines that do
 * not dedupe an identical `src`, re-fetch the file — on every remount. The
 * element is found by its slot and theme id, and its text is only written when
 * it would actually change.
 *
 * Registrations are deliberately NOT removed when a theme is switched away
 * from. An unused `@font-face` costs nothing (a browser downloads a face only
 * when something renders in it), while removing and re-adding one on every
 * switch would drop the loaded font and fetch it again on the way back.
 *
 * Returns the `<style>` element, or `null` when there is nothing to register —
 * a theme with no bundled font, or a tree that is not in a document yet.
 */
export function registerThemeFonts(
  theme: ThemeDefinition,
  doc: Document | null | undefined
): HTMLStyleElement | null {
  if (!theme.fontFaces || !doc) return null

  const css = theme.fontFaces.split(ASSET_BASE_PLACEHOLDER).join(assetBaseUrl())
  const existing = doc.head.querySelector<HTMLStyleElement>(
    `style[data-liebe="${FONT_STYLE_SLOT}"][data-liebe-theme="${theme.id}"]`
  )

  if (existing) {
    // A changed asset base (the panel served from a new directory after an
    // upgrade) is the only way the text moves under an existing registration.
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }

  const style = doc.createElement('style')
  style.setAttribute('data-liebe', FONT_STYLE_SLOT)
  style.setAttribute('data-liebe-theme', theme.id)
  style.textContent = css
  doc.head.appendChild(style)

  return style
}
