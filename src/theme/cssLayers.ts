/**
 * The cascade-layer machinery of the theming engine.
 *
 * Everything the panel styles itself with lands in one of three layers —
 * `liebe-base` (tokens, component sheets, the vendored Radix stylesheet),
 * `liebe-theme` (the active theme) and `liebe-user` (custom CSS) — and a later
 * layer wins regardless of selector specificity. Source order alone could not
 * deliver that: a theme rule scoped to an appearance would outrank a less
 * specific user override. See docs/specs/theming/index.md, "Application
 * mechanism".
 *
 * These are pure text transforms with no DOM dependency, because they run in
 * two places: the build (the Vite plugin in `vite/baselineCssPlugin.ts` wraps
 * the sheets the panel ships, including the ones from `node_modules` that
 * cannot be authored inside a layer) and the browser (`styleInjection.ts` wraps
 * the theme payload it injects into the shadow root).
 */

/** Baseline: tokens, component sheets, vendored stylesheets. */
export const BASE_LAYER = 'liebe-base'
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
const IMPORTANT_DECLARATION = /([;{]\s*|^\s*)(--[\w-]+|[-\w]+)(\s*:\s*[^;{}]*?)!\s*important/gi

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

/**
 * Wraps a sheet in `layer`, unless it already declares layers of its own.
 *
 * Liebe's own sheets are authored inside their layer and are returned
 * unchanged; vendored sheets and any future unlayered CSS get wrapped. The
 * order statement is prepended either way, so a root that only ever sees this
 * one sheet still gets the order right.
 */
export function wrapInLayer(css: string, layer: string): string {
  if (/@layer\b/i.test(css)) return css

  const [charset] = css.match(LEADING_CHARSET) ?? []
  const body = charset ? css.slice(charset.length) : css

  return `${charset ?? ''}${LAYER_ORDER_STATEMENT}\n@layer ${layer} {\n${body}\n}\n`
}

/**
 * Baseline treatment for one stylesheet: importance-free for themable
 * properties, and inside `liebe-base`.
 */
export function prepareBaselineCss(css: string): string {
  return wrapInLayer(stripThemableImportance(css), BASE_LAYER)
}
