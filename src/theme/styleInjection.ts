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
 */

import { THEME_LAYER, wrapInLayer } from './cssLayers'

/** Roots a Liebe tree can be mounted in. */
export type StyleRoot = Document | ShadowRoot

/** The `data-liebe` value identifying each injected layer element. */
export const THEME_STYLE_SLOT = 'theme'

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
 * Applies a theme to whichever root `node` is mounted in — the caller's way in
 * from React, where the only handle on the root is an element inside it.
 *
 * A node that is in no document and no shadow root (a tree mid-mount, or one
 * rendered into a detached container) has nowhere to hold a stylesheet;
 * returning `null` rather than throwing keeps that a non-event, and the next
 * render in a real root injects.
 *
 * From a shadow root the theme is mirrored into the owning document as well,
 * because Radix dialogs and dropdowns portal to `document.body` — outside the
 * shadow root and its layers. The mirror is inert elsewhere in the Home
 * Assistant frontend: theme CSS is scoped to the Radix theme root, a class only
 * Liebe's own trees carry. It is a stopgap for the portal host the theming spec
 * calls for ("Portalled UI MUST stay inside the token scope"), not a
 * replacement for it.
 */
export function applyThemeCssToRootOf(
  node: Node | null | undefined,
  css: string
): HTMLStyleElement | null {
  const root = node?.getRootNode()
  if (!isStyleRoot(root)) return null

  if (root instanceof ShadowRoot) applyThemeCss(root.ownerDocument, css)
  return applyThemeCss(root, css)
}
