import { Theme } from '@radix-ui/themes'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useCameraFullscreenActive, CAMERA_FULLSCREEN_Z_INDEX } from '~/store/cameraFullscreenStore'
import { sanitizeCustomCss } from '~/theme/customCss'
import { registerThemeFonts } from '~/theme/fontRegistration'
import { applyThemeCssToRootOf, applyUserCssToRootOf } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID, getThemeOrDefault, type ThemeAppearance } from '~/theme/themeRegistry'
import { PortalHost } from './ui/portals'

export interface LiebeThemeProviderProps {
  children: ReactNode
  /**
   * Resolved appearance for the Radix `Theme`. The panel passes what
   * `useThemeSelection` resolved; the Storybook preview passes the appearance
   * chosen in the toolbar. Left undefined, Radix inherits from the surrounding
   * document and nothing is stamped — the appearance is then not this tree's to
   * claim.
   */
  appearance?: ThemeAppearance
  /**
   * Id of the theme to apply. Unregistered ids fall back to Default
   * (`getThemeOrDefault`), so an imported configuration naming a theme this
   * build does not have still renders.
   */
  themeId?: string
  /**
   * The configuration's custom CSS, as authored. Sanitized here rather than
   * anywhere upstream: this is the injection point, and an imported YAML
   * applies its custom CSS the moment it loads, so the boundary has to be where
   * the CSS reaches the DOM and not where a user typed it.
   */
  customCss?: string
}

/**
 * The panel's provider shell, importable in isolation.
 *
 * This is deliberately free of bootstrap side effects (no custom-element
 * registration, no router, no Home Assistant connection) so surfaces that are
 * not the panel — today the Storybook preview — can render components inside
 * exactly the same provider stack the panel uses. See
 * docs/specs/storybook/index.md ("Global decorators & toolbar").
 *
 * It owns two halves of the theming contract (docs/specs/theming —
 * "Application mechanism"):
 *
 *  - **Root stamping.** `data-liebe-theme`, `data-appearance` and the
 *    `liebe-root` class go on the Radix theme root, and not on a wrapper,
 *    because that is the element the token sheets declare `--liebe-*` on. A
 *    `var()` in a custom property substitutes at the element that declares it,
 *    and a derived companion (`--liebe-c-light-tint`) only re-derives where its
 *    base is overridden on the *same* element — so a theme or user rule keyed
 *    off a stamp on any other element would leave the companions behind on the
 *    old hue. `liebe-root` is the selector user CSS is documented to target;
 *    `.radix-themes` is a vendor name and not ours to promise.
 *  - **Theme and user layer injection.** The active theme's CSS and the
 *    sanitized custom CSS are injected into the root this tree is mounted in —
 *    the shadow root in Home Assistant, the document in the workshop — so
 *    switching themes and editing custom CSS apply live.
 *
 * It also mounts the `PortalHost` overlays land in, and mounts it INSIDE the
 * theme root rather than beside it. Both halves of that placement are
 * load-bearing: inside the shadow root, so the injected layers reach an open
 * dialog without anything being mirrored into the Home Assistant document; and
 * inside `liebe-root` specifically, because that is the element the `--liebe-*`
 * contract is declared on and an overlay portalled anywhere else would inherit
 * none of it.
 */
export function LiebeThemeProvider({
  children,
  appearance,
  themeId = DEFAULT_THEME_ID,
  customCss = '',
}: LiebeThemeProviderProps) {
  // This is the ROOT Theme (data-is-root-theme="true"), so it establishes a
  // stacking context (`position: relative; z-index: 0`) that would otherwise
  // cap the camera card's in-place fullscreen overlay below Home Assistant's
  // chrome. While any camera overlay is open, lift this ancestor's stacking so
  // the overlay paints over HA's header/sidebar — WITHOUT moving the stream
  // node. See docs/changes/0008-camera-fullscreen-no-dom-move.md.
  const cameraFullscreenActive = useCameraFullscreenActive()

  const themeRoot = useRef<HTMLDivElement>(null)
  // Stamped from the theme that is actually rendered, not from what was asked
  // for: an unregistered id falls back to Default, and a stamp naming the
  // missing theme would leave that theme's scoped rules addressing a palette
  // nothing here renders.
  const activeTheme = getThemeOrDefault(themeId)
  const { id: activeThemeId, css: themeCss } = activeTheme

  // A layout effect, so the theme layer is in the root before the browser
  // paints the tree it styles. The `<style>` is keyed to the root rather than
  // to this component and is deliberately left in place on unmount: it belongs
  // to the panel's root, and removing it would strip the theme from a tree that
  // is only remounting.
  useLayoutEffect(() => {
    applyThemeCssToRootOf(themeRoot.current, themeCss)
  }, [themeCss])

  // A theme's bundled typeface goes into the OWNING DOCUMENT, not into the root
  // the theme layer lands in: a shadow root does not load `@font-face` declared
  // inside it (docs/specs/theming — "Application mechanism"). `ownerDocument` is
  // the Home Assistant document in the panel and the preview document in the
  // workshop, which is the one place both can see. Registration is idempotent
  // and outlives the switch away, so remounting the panel neither stacks sheets
  // nor re-fetches the font.
  useLayoutEffect(() => {
    registerThemeFonts(activeTheme, themeRoot.current?.ownerDocument)
  }, [activeTheme])

  // Parsing is not free, and the same CSS arrives on every render of every
  // consumer of the store.
  const sanitized = useMemo(() => sanitizeCustomCss(customCss), [customCss])

  useLayoutEffect(() => {
    // Input the sanitizer could not parse leaves the last good user layer in
    // place: a half-typed rule in the editor must not strip the styling the
    // dashboard is already wearing. The editor is where the rejection is
    // reported (`sanitizeCustomCss` returns the notices).
    if (sanitized.rejected) return
    applyUserCssToRootOf(themeRoot.current, sanitized.css)
  }, [sanitized])

  return (
    <Theme
      ref={themeRoot}
      className="liebe-root"
      data-liebe-theme={activeThemeId}
      data-appearance={appearance}
      appearance={appearance}
      style={
        cameraFullscreenActive
          ? { position: 'relative', zIndex: CAMERA_FULLSCREEN_Z_INDEX }
          : undefined
      }
    >
      <PortalHost>{children}</PortalHost>
    </Theme>
  )
}
