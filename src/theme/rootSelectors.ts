/**
 * The two class names the theming contract makes public, in one place because
 * three unrelated modules have to agree on them: the CSS that declares the
 * token contract, the component that stamps them, and the sanitizer that
 * rewrites user selectors against them.
 *
 * Both are contract in the sense docs/specs/theming/index.md
 * ("Configuration & selection") means: renaming either is a breaking change
 * with a migration note, because user CSS is written against them.
 */

/**
 * The Liebe theme root — the element `--liebe-*` is declared on, the element
 * carrying `data-liebe-theme` / `data-appearance`, and the element a theme or a
 * user stylesheet MUST declare token overrides on.
 *
 * It is always stamped on a Radix `<Theme>`, and that is load-bearing rather
 * than incidental: almost every `--liebe-*` value aliases a Radix token, and a
 * `var()` inside a custom property substitutes at the element that declares it,
 * so a root without Radix's own variables would compute the whole contract to
 * nothing (src/styles/tokens.css says the same at length).
 */
export const LIEBE_ROOT_CLASS = 'liebe-root'

/**
 * The document-level container every Liebe overlay portals into.
 *
 * It carries {@link LIEBE_ROOT_CLASS} as well, so overlays inherit the active
 * tokens; the extra name exists because the mirrored user layer is scoped to
 * it, and that scoping is what makes mirroring arbitrary author CSS into the
 * Home Assistant document safe at all (src/theme/customCss.ts).
 */
export const PORTAL_ROOT_CLASS = 'liebe-portal-root'
