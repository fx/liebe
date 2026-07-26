import { Theme } from '@radix-ui/themes'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useCameraFullscreenActive, CAMERA_FULLSCREEN_Z_INDEX } from '~/store/cameraFullscreenStore'
import { applyThemeCssToRootOf } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID, getThemeOrDefault, type ThemeAppearance } from '~/theme/themeRegistry'

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
 *  - **Theme layer injection.** The active theme's CSS is injected into the
 *    root this tree is mounted in — the shadow root in Home Assistant, the
 *    document in the workshop — so switching themes applies live.
 */
export function LiebeThemeProvider({
  children,
  appearance,
  themeId = DEFAULT_THEME_ID,
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
  const { id: activeThemeId, css: themeCss } = getThemeOrDefault(themeId)

  // A layout effect, so the theme layer is in the root before the browser
  // paints the tree it styles. The `<style>` is keyed to the root rather than
  // to this component and is deliberately left in place on unmount: it belongs
  // to the panel's root, and removing it would strip the theme from a tree that
  // is only remounting.
  useLayoutEffect(() => {
    applyThemeCssToRootOf(themeRoot.current, themeCss)
  }, [themeCss])

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
      {children}
    </Theme>
  )
}
