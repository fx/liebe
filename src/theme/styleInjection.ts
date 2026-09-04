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
 * **Two panels, one document.** The document-level mirror is keyed per panel
 * instance, not by slot name alone (change 0036 PR 7): `panel_custom` lets the
 * production and dev panels mount side by side, and the panel resists removal,
 * so both can live in one Home Assistant document at once. Every mirror
 * element carries `data-liebe-instance="<token>"` alongside its slot, generated
 * per panel mount (`src/theme/rootSelectors.ts`), and each panel's container
 * carries the same token — so the last panel to render rewrites only its own
 * element, and each panel's mirrored rules match only its own container. The
 * user layer inherits the scoping rather than introducing it: theme CSS is
 * first-party, but its rules match on `.liebe-root` too, which both panels
 * carry, so a slot alone would still leave both sheets matching both
 * containers.
 */

import { scopePortalCssToInstance } from './customCss'
import { THEME_LAYER, wrapInLayer } from './cssLayers'
import { LIEBE_INSTANCE_ATTRIBUTE } from './rootSelectors'

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
 * Idempotent by slot — and, where the document holds mirrors for more than one
 * panel, by slot AND instance: the element is found by its `data-liebe` marker
 * plus `data-liebe-instance` when an instance token is given, and rewritten, so
 * a theme switch swaps the CSS text of the element already in the root instead
 * of stacking sheets whose precedence would then depend on insertion order. A
 * second panel's mirror with a different token is a different element and is
 * never touched. Omitting the token keeps the historical slot-only lookup,
 * which is what the in-shadow-root sheets and the document-root workshop still
 * use — those roots belong to exactly one panel, so there is nothing to tell
 * apart in them.
 */
function applyLayerStyle(
  root: StyleRoot,
  slot: string,
  css: string,
  instance?: string
): HTMLStyleElement {
  const host = styleHost(root)
  const selector = instance
    ? `style[data-liebe="${slot}"][${LIEBE_INSTANCE_ATTRIBUTE}="${instance}"]`
    : `style[data-liebe="${slot}"]`
  const existing = host.querySelector<HTMLStyleElement>(selector)
  const style = existing ?? host.ownerDocument.createElement('style')

  if (!existing) {
    style.setAttribute('data-liebe', slot)
    if (instance) style.setAttribute(LIEBE_INSTANCE_ATTRIBUTE, instance)
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
 * The instance token keys the DOCUMENT-level mirror element; the in-root sheet
 * belongs to exactly one panel and takes none.
 */
export function applyThemeCss(
  root: StyleRoot,
  css: string,
  instance?: string
): HTMLStyleElement {
  return applyLayerStyle(root, THEME_STYLE_SLOT, wrapInLayer(css, THEME_LAYER), instance)
}

/**
 * Applies sanitized custom CSS as the `liebe-user` layer of `root`.
 *
 * The CSS is taken exactly as `sanitizeCustomCss` produced it — already
 * serialised from an AST *inside* its layer block. Nothing here re-wraps or
 * repairs it, because there is only one thing that may be injected as the user
 * layer and this is not the module that decides what that is.
 */
export function applyUserCss(
  root: StyleRoot,
  css: string,
  instance?: string
): HTMLStyleElement {
  return applyLayerStyle(root, USER_STYLE_SLOT, css, instance)
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
 * because theme CSS is first-party — but only once keyed: every rule in it
 * matches on `.liebe-root`, which both panels' containers carry, so an
 * unkeyed mirror would style the other panel's overlays too. The keying
 * happens in `applyThemeCssToRootOf`, which scopes the mirrored copy to this
 * panel's own container before it leaves the shadow root.
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
/**
 * Keys a theme sheet's mirrored copy to one panel's container.
 *
 * Every first-party theme rule is scoped to `.liebe-root` (and LCARS adds
 * `.liebe-portal-root`-adjacent hooks), which both panels' containers carry —
 * so the slot key alone would leave both sheets matching both containers. The
 * replacement binds each of those subjects to the panel's own instance token,
 * the same boundary `scopePortalCssToInstance` keys the user layer at. The
 * in-shadow-root sheet is never keyed: that root belongs to exactly one panel.
 *
 * Textual for the same reason the user-layer keying is: the payload is an
 * opaque string here, and the two selectors it keys are emitted in exactly one
 * shape each (`:where(.liebe-root)`, `.liebe-root`, `.liebe-portal-root`).
 * Grouping at-rules pass through untouched — only the subjects move.
 */
function keyThemeCssToInstance(css: string, instance: string): string {
  const key = `[${LIEBE_INSTANCE_ATTRIBUTE}="${instance}"]`
  // The `:where()` form first, parked under a sentinel while the bare form
  // keys: the bare replacement would otherwise run again inside the rewritten
  // `:where(.liebe-root[…])` and stack a second attribute
  // (`:where(.liebe-root[…][…])`). Re-keying an already-keyed sheet is a
  // no-op twice over: the sentinel restores the parked form untouched, and
  // the bare passes only match subjects NOT already carrying the key, so a
  // second pass finds no unkeyed subject left to bind.
  const keyedWhere = `:where(.liebe-root${key})`
  const keyedPortal = `.liebe-portal-root${key}`
  const keyedRoot = `.liebe-root${key}`
  const SENTINEL = 'LIEBEKEYEDWHERE'
  const UNKEYED_PORTAL = /\.liebe-portal-root(?!\[[^\]]*data-liebe-instance)/g
  const UNKEYED_ROOT = /\.liebe-root(?!\[[^\]]*data-liebe-instance)/g
  const keyed = css
    .split(':where(.liebe-root)')
    .join(keyedWhere)
    .split(keyedWhere)
    .join(SENTINEL)
    .replace(UNKEYED_PORTAL, keyedPortal)
    .replace(UNKEYED_ROOT, keyedRoot)
    .split(SENTINEL)
    .join(keyedWhere)
  // The font token rides the same mirror: each panel's `@font-face` registers
  // a per-instance family (`fontRegistration.ts`), and the theme payload is
  // what names it — so the mirrored copy names the instance family while the
  // in-shadow-root sheet keeps the global one its own registration serves.
  // Keyed on the `--liebe-font-family` token declaration rather than on a
  // hardcoded family name, so a future bundled face keys the same way without
  // this module learning its name; the `var()`-valued numeric token follows
  // the family token and needs no rewrite of its own.
  return keyed.replace(/--liebe-font-family(\s*:\s*)(['"]?)([A-Za-z][\w-]*)\2/, (_m, sep: string, q: string, fam: string) => `--liebe-font-family${sep}${q}${fam}__${instance}${q}`)
}

/**
 * Applies a theme to whichever root `node` is mounted in, keying the
 * document-level mirror to this panel's container.
 *
 * The in-root sheet is the theme CSS as authored; the mirrored copy is the
 * same sheet with every `.liebe-root` / `.liebe-portal-root` subject further
 * bound to `data-liebe-instance="<token>"`, so it matches only this panel's
 * container. Keyed textually here rather than re-derived from the registry,
 * because the theme payload is an opaque string by the time it arrives — and
 * because the user layer's keying lives in `sanitizeCustomCss`'s own output
 * (`scopePortalCssToInstance`), so both mirrors key the same way at the same
 * boundary. A document root takes the sheet as-is: the workshop renders one
 * panel, and its container sits inside that document with everything else.
 */
export function applyThemeCssToRootOf(
  node: Node | null | undefined,
  css: string,
  instance?: string
): HTMLStyleElement | null {
  const root = node?.getRootNode()
  if (!isStyleRoot(root)) return null

  if (root instanceof ShadowRoot) {
    applyThemeCss(root.ownerDocument, instance ? keyThemeCssToInstance(css, instance) : css, instance)
  }
  return applyThemeCss(root, css)
}

/**
 * Applies sanitized custom CSS to whichever root `node` is mounted in, and —
 * from a shadow root — the rewritten copy to the owning document, keyed to
 * this panel's container.
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
 * `instance` keys the outward copy to this panel's container
 * (`scopePortalCssToInstance`), the same boundary at which the theme mirror is
 * keyed — a slot alone leaves both sheets matching both containers, and a scope
 * alone leaves them overwriting one element, so the two halves land together.
 *
 * A document root gets `css` alone: there is no shadow boundary to cross, so the
 * document IS the panel's root — the workshop and unit tests — and the container
 * sits inside it with everything else.
 */
export function applyUserCssToRootOf(
  node: Node | null | undefined,
  css: string,
  portalCss: string,
  instance?: string
): HTMLStyleElement | null {
  const root = node?.getRootNode()
  if (!isStyleRoot(root)) return null

  if (root instanceof ShadowRoot) {
    applyUserCss(
      root.ownerDocument,
      instance ? scopePortalCssToInstance(portalCss, instance) : portalCss,
      instance
    )
  }
  return applyUserCss(root, css)
}
