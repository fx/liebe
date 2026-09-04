/**
 * The two class names the theming contract makes public, plus the attribute
 * that tells one panel's document-level mirror from another's, in one place
 * because several unrelated modules have to agree on them: the CSS that
 * declares the token contract, the components that stamp them, the sanitizer
 * that rewrites user selectors against them, and the injection that keys the
 * mirror slots with them.
 *
 * The classes are contract in the sense docs/specs/theming/index.md
 * ("Configuration & selection") means: renaming either is a breaking change
 * with a migration note, because user CSS is written against them. The
 * attribute is mechanism, not contract: its value is generated per panel mount
 * and no author CSS may rely on it — only on the guarantee that two panels'
 * mirrors never share one.
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

/**
 * The attribute that keys one panel's document-level mirror.
 *
 * `panel_custom` lets the production and dev panels mount side by side, and
 * the panel resists removal, so both can live in one Home Assistant document
 * at once. The mirror slots (`style[data-liebe]`, the font registration) used
 * to be keyed by NAME alone, so the last panel to render won for both — and
 * the mirrored rules match on `.liebe-root` / `.liebe-portal-root`, which both
 * panels' containers carry, so one panel's theme and custom CSS styled the
 * other's overlays. Every mirror element and every portal container therefore
 * carries this attribute with a per-mount token (change 0036 PR 7):
 * `style[data-liebe="theme"][data-liebe-instance="<token>"]` is rewritten in
 * place by the panel that owns it and never touched by the other, and each
 * container's mirrored rules are additionally scoped to that container's own
 * token, so a sheet only ever matches the overlays of the panel that mirrored
 * it. The token is generated at mount, never authored: no theme or user
 * stylesheet may select on it.
 */
export const LIEBE_INSTANCE_ATTRIBUTE = 'data-liebe-instance'
