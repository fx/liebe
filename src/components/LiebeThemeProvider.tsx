import { Theme } from '@radix-ui/themes'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PortalHost } from '~/components/ui/portals'
import { useCameraFullscreenActive, CAMERA_FULLSCREEN_Z_INDEX } from '~/store/cameraFullscreenStore'
import { sanitizeCustomCss } from '~/theme/customCss'
import { registerThemeFonts } from '~/theme/fontRegistration'
import { LIEBE_ROOT_CLASS } from '~/theme/rootSelectors'
import { applyThemeCssToRootOf, applyUserCssToRootOf } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID, getThemeOrDefault, type ThemeAppearance } from '~/theme/themeRegistry'

/**
 * The panel mount's document-mirror key, stable for the lifetime of the host
 * element rather than of one React mount.
 *
 * Threaded from the custom element (`src/panel.ts` stamps its own identity on
 * the element and passes it through `PanelApp`), because the provider cannot
 * discover its own host: `document.querySelector('liebe-panel,
 * liebe-panel-dev')` returns the FIRST host in the document, so two mounted
 * panels would read and share ONE attribute — the exact "last panel wins"
 * collision the keying exists to end. Each custom element instead mints its
 * own token once (in its constructor, before any render) and hands that same
 * token to every React tree it mounts, across reconnects and StrictMode
 * remounts alike — while the mirror `<style>`s and font registrations
 * deliberately outlive unmount, so a per-mount token would orphan a stale
 * keyed set per cycle. A tree with no key (unit tests, the workshop document
 * root) falls back to a per-component token, unique per tree like before.
 */
function usePanelInstanceKey(explicit?: string): string {
  const [key] = useState(
    () => explicit ?? `p${Math.random().toString(36).slice(2, 10)}`
  )
  return key
}
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
  /**
   * The document-mirror key for this panel, threaded from the custom element
   * (`src/panel.ts` mints one identity per element and passes it through
   * `PanelApp`). Required in the panel; omitted in trees with no custom
   * element above them (unit tests, the workshop), where the provider mints a
   * per-component fallback instead.
   */
  instanceKey?: string
}

/**
 * The panel's provider shell, importable in isolation.
 *
 * This is deliberately free of bootstrap side effects (no custom-element
 * registration, no router, no Home Assistant connection) so surfaces that are
 * not the panel — today the Storybook preview — can render components inside
 * exactly the same provider stack the panel uses. See
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
 *  - **The portal container.** `PortalHost` mounts the `liebe-portal-root`
 *    container every overlay portals into, stamped from the same values as the
 *    root above so a theme's scoped rules reach a dialog exactly as they reach
 *    the dashboard (src/components/ui/portals.tsx).
 */
export function LiebeThemeProvider({
  children,
  appearance,
  themeId = DEFAULT_THEME_ID,
  customCss = '',
  instanceKey,
}: LiebeThemeProviderProps) {
  // This is the ROOT Theme (data-is-root-theme="true"), so it establishes a
  // stacking context (`position: relative; z-index: 0`) that would otherwise
  // cap the camera card's in-place fullscreen overlay below Home Assistant's
  // chrome. While any camera overlay is open, lift this ancestor's stacking so
  // the overlay paints over HA's header/sidebar — WITHOUT moving the stream
  // node. See docs/changes/0008-camera-fullscreen-no-dom-move.md.
  const cameraFullscreenActive = useCameraFullscreenActive()

  const themeRoot = useRef<HTMLDivElement>(null)
  // The document-level mirror's instance key: threaded from the custom element
  // (one identity per `<liebe-panel>` / `<liebe-panel-dev>`, via `PanelApp`),
  // falling back to a per-component token where no element exists (unit
  // tests, the workshop). The SAME token goes to the container below and to
  // every mirror write, which is what makes one panel's sheets match only its
  // own container — the slot alone leaves both sheets matching both
  // containers, and the scope alone leaves them overwriting one element.
  const instance = usePanelInstanceKey(instanceKey)
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
    applyThemeCssToRootOf(themeRoot.current, themeCss, instance)
  }, [themeCss, instance])

  // A theme's bundled typeface goes into the OWNING DOCUMENT, not into the root
  // the theme layer lands in: a shadow root does not load `@font-face` declared
  // inside it (docs/specs/theming — "Application mechanism"). `ownerDocument` is
  // the Home Assistant document in the panel and the preview document in the
  // workshop, which is the one place both can see. Registration is idempotent
  // and outlives the switch away, so remounting the panel neither stacks sheets
  // nor re-fetches the font.
  useLayoutEffect(() => {
    registerThemeFonts(activeTheme, themeRoot.current?.ownerDocument, instance)
  }, [activeTheme, instance])

  // Parsing is not free, and the same CSS arrives on every render of every
  // consumer of the store.
  const sanitized = useMemo(() => sanitizeCustomCss(customCss), [customCss])

  useLayoutEffect(() => {
    // Input the sanitizer could not parse leaves the last good user layer in
    // place: a half-typed rule in the editor must not strip the styling the
    // dashboard is already wearing. The editor is where the rejection is
    // reported (`sanitizeCustomCss` returns the notices).
    if (sanitized.rejected) return
    applyUserCssToRootOf(themeRoot.current, sanitized.css, sanitized.portalCss, instance)
  }, [sanitized, instance])

  return (
    <Theme
      ref={themeRoot}
      className={LIEBE_ROOT_CLASS}
      data-liebe-theme={activeThemeId}
      data-appearance={appearance}
      appearance={appearance}
      style={
        cameraFullscreenActive
          ? { position: 'relative', zIndex: CAMERA_FULLSCREEN_Z_INDEX }
          : undefined
      }
    >
      {/*
       * Inside the theme root rather than around it, so the container it mounts
       * inherits this tree's React context — including Radix's own theme
       * context, which is what makes it a NESTED theme and so free of the root
       * theme's stacking context.
       */}
      <PortalHost themeId={activeThemeId} appearance={appearance} instance={instance}>
        {children}
      </PortalHost>
    </Theme>
  )
}
