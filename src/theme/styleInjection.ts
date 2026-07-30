/**
 * Runtime style injection for the theme layer.
 *
 * The baseline (`liebe-base`) is bundled and linked into the shadow root at
 * startup; the theme layer is the one that has to change while the panel runs,
 * because switching themes applies live without a reload (docs/specs/theming —
 * "Application mechanism"). So the active theme's CSS is injected as a single
 * `<style data-liebe="theme">` element that is rewritten in place, rather than
 * imported statically like the baseline sheets.
 *
 * The host is whatever root the panel is rendered into: the shadow root in Home
 * Assistant, the document in the Storybook workshop and in unit tests. Both are
 * addressed through the same call so the workshop injects exactly what the
 * panel injects.
 *
 * **A known limit of the document-level mirror, which the user layer inherits
 * rather than introduces.** The slots below are keyed by name alone, so two
 * Liebe panels mounted in one Home Assistant document — the production and dev
 * panels side by side, which `panel_custom` allows and AGENTS.md describes for
 * development — share `style[data-liebe="theme"]` and `style[data-liebe="user"]`
 * and the last one to render wins for both. The mirrored rules match on
 * `.liebe-root` / `.liebe-portal-root`, which both panels carry, so one panel's
 * theme and custom CSS reach the other's overlays. Making the mirror
 * per-instance means an instance token on the slot AND on the container's
 * scope, for all three layers; it is a change to the mechanism rather than to
 * this call, and it is not what change 0036 PR 2 is.
 */

import { THEME_LAYER, wrapInLayer } from './cssLayers'

/** Roots a Liebe tree can be mounted in. */
export type StyleRoot = Document | ShadowRoot

/** The `data-liebe` value identifying each injected layer element. */
export const THEME_STYLE_SLOT = 'theme'
/** The user layer's slot — custom CSS, already sanitized and layer-wrapped. */
export const USER_STYLE_SLOT = 'user'

/** Narrowing for `Node.getRootNode()`, which is typed as a bare `Node`. */
export function isStyleRoot(node: Node | null | undefined): node is StyleRoot {
  return node instanceof Document || node instanceof ShadowRoot
}

/**
 * Where a `<style>` belongs in this root: a document keeps them in `<head>`,
 * a shadow root has no head and holds them directly.
 */
function styleHost(root: StyleRoot): Element | ShadowRoot {
  return root instanceof Document ? root.head : root
}

/**
 * Injects (or updates) one layer's `<style>` element in `root`.
 *
 * Idempotent by slot: the element is found by its `data-liebe` marker and
 * rewritten, so a theme switch swaps the CSS text of the element already in the
 * root instead of stacking sheets whose precedence would then depend on
 * insertion order.
 */
function applyLayerStyle(root: StyleRoot, slot: string, css: string): HTMLStyleElement {
  const host = styleHost(root)
  const selector = `style[data-liebe="${slot}"]`
  const existing = host.querySelector<HTMLStyleElement>(selector)
  const style = existing ?? host.ownerDocument.createElement('style')

  if (!existing) {
    style.setAttribute('data-liebe', slot)
    host.appendChild(style)
  }

  // Assigning identical text would still invalidate style resolution in some
  // engines; a theme selection that did not change should cost nothing.
  if (style.textContent !== css) style.textContent = css

  return style
}

/**
 * Applies a theme's CSS as the `liebe-theme` layer of `root`.
 *
 * Built-in themes are authored inside their layer, so `wrapInLayer` normally
 * only prepends the order statement — but it also means a theme payload that
 * forgot its `@layer` block cannot land unlayered and outrank everything.
 */
export function applyThemeCss(root: StyleRoot, css: string): HTMLStyleElement {
  return applyLayerStyle(root, THEME_STYLE_SLOT, wrapInLayer(css, THEME_LAYER))
}

/**
 * Applies sanitized custom CSS as the `liebe-user` layer of `root`.
 *
 * The CSS is taken exactly as `sanitizeCustomCss` produced it — already
 * serialised from an AST *inside* its layer block. Nothing here re-wraps or
 * repairs it, because there is only one thing that may be injected as the user
 * layer and this is not the module that decides what that is.
 */
export function applyUserCss(root: StyleRoot, css: string): HTMLStyleElement {
  return applyLayerStyle(root, USER_STYLE_SLOT, css)
}

/**
 * Applies a layer to whichever root `node` is mounted in — the caller's way in
 * from React, where the only handle on the root is an element inside it.
 *
 * A node that is in no document and no shadow root (a tree mid-mount, or one
 * rendered into a detached container) has nowhere to hold a stylesheet;
 * returning `null` rather than throwing keeps that a non-event, and the next
 * render in a real root injects.
 *
 * From a shadow root the layer is mirrored into the owning document as well,
 * because Radix dialogs and dropdowns portal out of the shadow root — into the
 * `liebe-portal-root` container (`src/components/ui/portals.tsx`), which is a
 * child of `document.body` and so outside every layer injected here. What gets
 * mirrored through THIS function is the *theme* layer, and only that:
 * `applyThemeCssToRootOf` is the sole caller. It is safe to copy as authored
 * because theme CSS is first-party and every rule in it is scoped to
 * `.liebe-root`, a class only Liebe's own trees carry.
 *
 * The user layer is mirrored too, and it is the one that could NOT be copied as
 * authored: its selectors are the user's, nothing scopes them to Liebe, and a
 * `body { display: none }` out of an imported configuration would restyle the
 * frontend around the panel. `applyUserCssToRootOf` therefore takes the two
 * sheets `sanitizeCustomCss` returns and sends the rewritten one outward, rather
 * than being rewired through this function — passing one sheet to both roots is
 * exactly the mistake that signature exists to make impossible. "The mirror
 * boundary" in `styleInjection.test.ts` pins the asymmetry.
 */
function applyLayerToRootOf(
  node: Node | null | undefined,
  css: string,
  apply: (root: StyleRoot, css: string) => HTMLStyleElement
): HTMLStyleElement | null {
  const root = node?.getRootNode()
  if (!isStyleRoot(root)) return null

  if (root instanceof ShadowRoot) apply(root.ownerDocument, css)
  return apply(root, css)
}

/** Applies a theme to whichever root `node` is mounted in. */
export function applyThemeCssToRootOf(
  node: Node | null | undefined,
  css: string
): HTMLStyleElement | null {
  return applyLayerToRootOf(node, css, applyThemeCss)
}

/**
 * Applies sanitized custom CSS to whichever root `node` is mounted in, and —
 * from a shadow root — the rewritten copy to the owning document.
 *
 * The two sheets are not interchangeable and that is the whole point of the
 * signature. `css` is the sheet as the user authored it, contained by the shadow
 * boundary. `portalCss` is the same sheet with every selector rewritten to a
 * subject inside `.liebe-portal-root`, which is what makes putting arbitrary
 * author CSS in the Home Assistant document safe at all: the sanitizer judges
 * what a declaration may *fetch*, never what it may *match*, so an unrewritten
 * `body { display: none }` from an imported configuration would blank the
 * frontend around the panel. Both come from one call to `sanitizeCustomCss`,
 * which is the only thing that may produce either.
 *
 * A document root gets `css` alone: there is no shadow boundary to cross, so the
 * document IS the panel's root — the workshop and unit tests — and the container
 * sits inside it with everything else.
 */
export function applyUserCssToRootOf(
  node: Node | null | undefined,
  css: string,
  portalCss: string
): HTMLStyleElement | null {
  const root = node?.getRootNode()
  if (!isStyleRoot(root)) return null

  if (root instanceof ShadowRoot) applyUserCss(root.ownerDocument, portalCss)
  return applyUserCss(root, css)
}
