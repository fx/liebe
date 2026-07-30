/**
 * The cascade-layer machinery of the theming engine.
 *
 * Everything the panel styles itself with lands in one of three layers —
 * `liebe-base` (tokens and component sheets), `liebe-theme` (the active theme)
 * and `liebe-user` (custom CSS) — and a later layer wins regardless of selector
 * specificity. Source order alone could not deliver that: a theme rule scoped to
 * an appearance would outrank a less specific user override. Vendored sheets sit
 * in `liebe-base.vendor`, a sub-layer below the baseline's own rules. See
 * docs/specs/theming/index.md, "Application mechanism".
 *
 * These are pure text transforms with no DOM dependency, because they run in
 * two places: the build (the Vite plugin in `vite/baselineCssPlugin.ts` wraps
 * the sheets the panel ships, including the ones from `node_modules` that
 * cannot be authored inside a layer) and the browser (`styleInjection.ts` wraps
 * the theme payload it injects into the shadow root).
 *
 * They are deliberately lexical rather than a real CSS parse. Their input is
 * first-party or vendored CSS, where the worst a `{` inside a string can cost
 * is a redundant layer wrapper, and a parser in the panel bundle would be paid
 * for on every load. Untrusted input — the user's custom CSS — is a different
 * problem with a different answer: the theming spec requires it to be parsed
 * into an AST and re-serialised, which change 0012's PR 2 ships alongside the
 * sanitizer.
 */

/** Baseline: tokens and Liebe's own component sheets. */
export const BASE_LAYER = 'liebe-base'
/**
 * Vendored stylesheets — Radix Themes, react-grid-layout, react-resizable — as a
 * sub-layer of the baseline.
 *
 * A sub-layer loses to the declarations sitting directly in its parent
 * regardless of selector specificity, which is the whole point: Radix's
 * `.rt-reset { min-height: 0 }` is a class selector and `app.css`'s coarse-
 * pointer floor is a bare `button`, so with both in `liebe-base` the floor lost
 * every Radix control it was written for — a `size="3"` button measured 40px
 * with a computed `min-height` of `0px`, a text field 38px at `auto`. Below the
 * baseline, Liebe's own rules win by being where they are rather than by
 * out-specifying a vendor selector that changes on every upgrade.
 *
 * A sub-layer rather than a fourth top-level layer, because a layer's position
 * is fixed by the FIRST `@layer` statement a root sees: `liebe-vendor` named
 * only in a new order statement would sort *after* `liebe-user` in any root
 * where a sheet still carrying the three-layer statement loaded first — the
 * exact inversion of the fix, and invisible to a test that reads stylesheet
 * text. Nesting needs no order statement at all, so the three layers the
 * theming contract names stay the three layers themes and user CSS see.
 */
export const VENDOR_LAYER = `${BASE_LAYER}.vendor`
/** The active theme's token overrides and scoped rules. */
export const THEME_LAYER = 'liebe-theme'
/** User-authored custom CSS — the last word on every token. */
export const USER_LAYER = 'liebe-user'

/**
 * Establishes the layer order. Repeated in every sheet and every injected
 * `<style>`: the first declaration a root sees fixes the order, and which sheet
 * that is depends on bundling and load order, so each one has to carry it.
 */
export const LAYER_ORDER_STATEMENT = `@layer ${BASE_LAYER}, ${THEME_LAYER}, ${USER_LAYER};`

/**
 * Properties the token contract governs — colours, backgrounds, borders,
 * shadows, radii and typography (docs/specs/design-system/index.md).
 *
 * Prefix families rather than a flat list, because a shorthand and its
 * longhands are the same declaration wearing different names: leaving
 * `border-top-color` out while listing `border` would let importance survive on
 * half of a themed border.
 *
 * Deliberately NOT the same set as `GridCard`'s inline-style fence. That fence
 * answers "what may a caller set inline?", and so lets a card carry its data
 * through `background-image` (weather artwork) while fencing `padding` and
 * `outline` (the state rings). This set answers "what may a baseline
 * stylesheet declare as `!important`?", where every paint layer counts and
 * geometry the contract does not own does not.
 */
const THEMABLE_PROPERTY_PREFIXES = [
  'background',
  'border',
  'column-rule',
  'font',
  'outline',
  'text-decoration',
  'text-emphasis',
] as const

const THEMABLE_PROPERTIES: ReadonlySet<string> = new Set([
  // Resets every property there is, importance included.
  'all',
  'accent-color',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'box-shadow',
  'caret-color',
  'color',
  'fill',
  'filter',
  'letter-spacing',
  'line-height',
  'stroke',
  'text-shadow',
  'text-transform',
])

/**
 * Whether the token contract governs this property.
 *
 * Custom properties are themable by definition: they are the token channel
 * itself, so a `!important` one in the baseline would pin a token beyond the
 * reach of both later layers.
 */
export function isThemableProperty(property: string): boolean {
  const name = property.trim().toLowerCase()
  if (name.startsWith('--')) return true
  if (THEMABLE_PROPERTIES.has(name)) return true
  return THEMABLE_PROPERTY_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}-`)
  )
}

// A declaration ending in `!important`, captured as (opening delimiter,
// property, value). `[^;{}]` keeps the value inside its own declaration, so a
// following rule can never be swallowed into the match.
//
// The trailing lookahead is what makes `!important` a PRIORITY rather than
// three syllables of text. Without it the pattern matched the token anywhere in
// a value, quotes included, and rewrote `--label: "not !important"` to
// `--label: "not "` — silently mangling CSS that never asked for importance.
// That is not hypothetical for long: the custom-CSS editor feeds user input
// straight through here. A real priority is the last thing in its declaration,
// so it must be followed by the declaration's end — `;`, the rule's `}`, or the
// end of the sheet — and a token inside a value never is. When the lookahead
// fails the lazy value keeps growing and the regex looks for a LATER
// `!important` in the same declaration, so a genuine priority still strips even
// when the value quotes the word first.
const IMPORTANT_DECLARATION =
  /([;{]\s*|^\s*)(--[\w-]+|[-\w]+)(\s*:\s*[^;{}]*?)!\s*important(?=\s*(?:[;}]|$))/gi

/**
 * Removes `!important` from declarations of themable properties, leaving every
 * other important declaration untouched.
 *
 * Importance runs the layer order in reverse: an important declaration in
 * `liebe-base` beats important declarations in `liebe-theme` and `liebe-user`.
 * A baseline that is importance-free for themable properties is therefore what
 * makes the promised precedence hold in both directions — and it is why the
 * vendored Radix stylesheet has to be rewritten rather than merely layered.
 *
 * Radix's *behavioural* importance survives, because none of those properties
 * are themable: the ScrollArea viewport's `display: block`, Skeleton's
 * `visibility` / `pointer-events` / `user-select` / `cursor` / `animation`.
 * Nothing a theme needs to override, and stripping them would break scroll
 * layout and loading states.
 */
export function stripThemableImportance(css: string): string {
  return css.replace(IMPORTANT_DECLARATION, (match, opening, property, value: string) =>
    // `trimEnd` drops the space that separated the value from `!important`,
    // leaving the declaration spelled the way it would have been authored.
    isThemableProperty(property) ? `${opening}${property}${value.trimEnd()}` : match
  )
}

// A leading `@charset` rule, which must stay the very first thing in a sheet —
// including ahead of the layer wrapper.
const LEADING_CHARSET = /^\s*@charset\s+[^;]+;/i

const COMMENT = /\/\*[\s\S]*?\*\//g

/** Top-level statements that are allowed to sit outside a layer block. */
function isAllowedStatement(text: string): boolean {
  const statement = text.trim().toLowerCase()
  return statement === '' || statement.startsWith('@layer') || statement.startsWith('@charset')
}

/**
 * Whether every rule in a sheet is already inside a cascade layer.
 *
 * Deliberately structural rather than "does the text contain `@layer`": a sheet
 * that carries only the order statement, or one layered block followed by
 * ordinary rules, mentions `@layer` and is still mostly unlayered — and
 * unlayered author rules outrank every layer, which is the failure this whole
 * module exists to prevent. Being wrong in the safe direction costs only a
 * redundant wrapper (a nested layer still sorts inside its parent), so anything
 * this cannot read as fully enclosed is treated as not enclosed.
 */
export function isFullyLayered(css: string): boolean {
  let depth = 0
  let pending = ''

  for (const character of css.replace(COMMENT, '')) {
    if (character === '{') {
      if (depth === 0 && !pending.trim().toLowerCase().startsWith('@layer')) return false
      depth += 1
      pending = ''
    } else if (character === '}') {
      depth -= 1
      if (depth < 0) return false
      pending = ''
    } else if (depth === 0) {
      if (character !== ';') {
        pending += character
      } else if (isAllowedStatement(pending)) {
        pending = ''
      } else {
        return false
      }
    }
  }

  // Anything left over is a rule the sheet never closed, or a declaration
  // floating at the top level.
  return depth === 0 && isAllowedStatement(pending)
}

/**
 * Wraps a sheet in `layer`, unless every rule in it is already layered.
 *
 * Liebe's own sheets are authored inside their layer and are returned
 * unchanged; vendored sheets and any future unlayered CSS get wrapped. The
 * order statement is prepended either way, so a root that only ever sees this
 * one sheet still gets the order right.
 */
export function wrapInLayer(css: string, layer: string): string {
  const layered = isFullyLayered(css)
  if (layered && css.includes(LAYER_ORDER_STATEMENT)) return css

  const [charset] = css.match(LEADING_CHARSET) ?? []
  const body = charset ? css.slice(charset.length) : css
  const rules = layered ? body : `@layer ${layer} {\n${body}\n}\n`

  return `${charset ?? ''}${LAYER_ORDER_STATEMENT}\n${rules}`
}

/**
 * Baseline treatment for one stylesheet: importance-free for themable
 * properties, and inside `liebe-base`.
 */
export function prepareBaselineCss(css: string): string {
  return wrapInLayer(stripThemableImportance(css), BASE_LAYER)
}

/**
 * Baseline treatment for a vendored stylesheet: the same, one layer lower.
 *
 * Separate from `prepareBaselineCss` rather than a parameter, because which of
 * the two a sheet gets is not a caller's option — it follows from where the
 * sheet came from, which is what `isVendoredSheet` answers.
 */
export function prepareVendorCss(css: string): string {
  return wrapInLayer(stripThemableImportance(css), VENDOR_LAYER)
}

// A module id under a package directory. Matched on the path rather than on the
// import specifier because that is what a bundler hands a transform: `import
// '@radix-ui/themes/styles.css'` arrives resolved, as an absolute path.
const VENDORED_ID = /[\\/]node_modules[\\/]/

/**
 * Whether a stylesheet is vendored, and so belongs below Liebe's own baseline.
 *
 * The distinction is authorship, not content: a vendored sheet cannot be
 * authored inside a layer, cannot be asked to keep its selectors weak, and
 * changes shape on every upgrade — so it is the one that yields. Liebe's own
 * sheets are authored inside `liebe-base` and stay there.
 */
export function isVendoredSheet(id: string): boolean {
  return VENDORED_ID.test(id)
}
