/**
 * The cascade-layer machinery of the theming engine.
 *
 * Everything the panel styles itself with lands in one of three layers —
 * `liebe-base` (tokens and component sheets), `liebe-theme` (the active theme)
 * and `liebe-user` (custom CSS) — and a later layer wins regardless of selector
 * specificity. Source order alone could not deliver that: a theme rule scoped to
 * an appearance would outrank a less specific user override.
 *
 * The baseline is itself three tiers, because "the baseline" spans CSS with
 * opposite needs: the universal reset has to lose to everything, a vendored
 * component sheet has to lose to Liebe's own rules, and Liebe's own rules have to
 * win. Specificity cannot express that — a reset is deliberately weakest and a
 * vendor sheet's class selectors are strongest — so the order runs
 * `liebe-base.reset` → `liebe-base.vendor` → `liebe-base` itself. See
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
 * The sub-layer of the baseline that holds a vendored stylesheet something
 * first-party has to outrank. `DEMOTED_VENDOR_PACKAGES` below is the list, and
 * it is Radix Themes alone — the other vendored sheets the panel imports stay in
 * `liebe-base`, where specificity decides them against Liebe's own rules.
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
 * A sub-layer rather than a fourth top-level layer, because the three layers the
 * theming contract names are what a theme and a user reason about, and the
 * baseline's internal tiering is not theirs to know: everything here still loses
 * to `liebe-theme` and `liebe-user` as one block.
 */
export const VENDOR_LAYER = `${BASE_LAYER}.vendor`
/**
 * The universal reset, one tier below the vendored sheets.
 *
 * It has to be below them, because a reset is zero-specificity by design and
 * relies on losing: `* { padding: 0; margin: 0 }` in the same layer as a
 * component sheet would zero every padding that sheet declares — the reason it
 * was layered in the first place ([0010](docs/changes/0010-…)) was that
 * unlayered, it did exactly that to the card anatomy. Sitting it in `liebe-base`
 * once the vendored sheets moved beneath would have done the same to Radix, and
 * measurably did: table cells lost 16px of padding and inline code 5px, across
 * 156 of the workshop's 622 stories.
 *
 * So the baseline is three tiers rather than two — reset, then vendored, then
 * Liebe's own — and each wins only over the one before it.
 */
export const RESET_LAYER = `${BASE_LAYER}.reset`
/** The active theme's token overrides and scoped rules. */
export const THEME_LAYER = 'liebe-theme'
/** User-authored custom CSS — the last word on every token. */
export const USER_LAYER = 'liebe-user'

/**
 * Establishes the layer order. Repeated in every sheet and every injected
 * `<style>`: the first declaration a root sees fixes the order, and which sheet
 * that is depends on bundling and load order, so each one has to carry it.
 *
 * The baseline's sub-layers are named here too, and for the same reason: a
 * sub-layer's position within its parent is fixed by first appearance as well,
 * so leaving them out would order the reset and the vendored sheets by whichever
 * of the two happened to be bundled first. One statement settles both levels.
 */
export const LAYER_ORDER_STATEMENT = `@layer ${RESET_LAYER}, ${VENDOR_LAYER}, ${BASE_LAYER}, ${THEME_LAYER}, ${USER_LAYER};`

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
 * A top-level `@property` block — a registration, which is not a rule to layer.
 *
 * `@property` gives a custom property a syntax, an inherit flag and an initial
 * value. It declares no style, so there is nothing in it for a theme to want to
 * outrank — and it is a **top-level** at-rule: nested inside `@layer`, a parser
 * is entitled to ignore it, which silently leaves the property unregistered and
 * any transition on it inert. So it is the one construct this module hoists out
 * of the wrapper rather than enclosing (docs/specs/theming — "Application
 * mechanism"; the shipped case is the icon-only tile's tint colour).
 */
const PROPERTY_RULE = /@property\s+[^{};]+\{[^{}]*\}/gi

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
 *
 * `@property` registrations are read past rather than counted against the
 * sheet: see `PROPERTY_RULE`. They are the reason a Liebe sheet can be
 * "fully layered" while text sits outside the block.
 */
export function isFullyLayered(css: string): boolean {
  let depth = 0
  let pending = ''

  for (const character of css.replace(COMMENT, '').replace(PROPERTY_RULE, '')) {
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
 *
 * `@property` registrations are lifted OUT of the wrapper before it goes on,
 * and that is not a nicety: wrapping one puts it inside `@layer`, where a
 * parser may ignore it — so a registration that is correct in the source would
 * arrive at the browser unregistered, and the only symptom is a transition that
 * silently does not run. Source-level placement is therefore not sufficient on
 * its own; `__tests__/cssLayers.test.ts` pins the shipped shape.
 */
export function wrapInLayer(css: string, layer: string): string {
  const layered = isFullyLayered(css)
  if (layered && css.includes(LAYER_ORDER_STATEMENT)) return css

  const { charset, body } = splitCharset(css)
  const registrations = body.match(PROPERTY_RULE) ?? []
  const withoutRegistrations = registrations.length ? body.replace(PROPERTY_RULE, '') : body
  const rules = layered ? withoutRegistrations : `@layer ${layer} {\n${withoutRegistrations}\n}\n`
  const hoisted = registrations.length ? `${registrations.join('\n')}\n` : ''

  return `${charset}${LAYER_ORDER_STATEMENT}\n${hoisted}${rules}`
}

/**
 * A sheet split around a leading `@charset`, which is only honoured as the very
 * first thing in a sheet and so has to stay ahead of anything prepended.
 */
function splitCharset(css: string): { charset: string; body: string } {
  const [charset] = css.match(LEADING_CHARSET) ?? []
  return charset ? { charset, body: css.slice(charset.length) } : { charset: '', body: css }
}

/**
 * Baseline treatment for one stylesheet: importance-free for themable
 * properties, and inside `liebe-base`.
 */
export function prepareBaselineCss(css: string): string {
  return wrapInLayer(stripThemableImportance(css), BASE_LAYER)
}

/**
 * Baseline treatment for a vendored stylesheet: the same, one tier lower.
 *
 * Separate from `prepareBaselineCss` rather than a parameter, because which of
 * the two a sheet gets is not a caller's option — it follows from where the
 * sheet came from, which is what `isDemotedVendorSheet` answers.
 *
 * The wrapper is unconditional here, where `wrapInLayer` hands an already-layered
 * sheet back untouched. That shortcut is right for Liebe's own sheets, which are
 * authored in the layer they belong to, and wrong for a dependency, because the
 * layer a dependency authored is *its* layer: a package that starts shipping
 * `@layer their-name { … }` would have that name registered in whatever position
 * it was first seen — after `liebe-user` in the common case — and its ordinary
 * declarations would then outrank the theme and the user. Wrapping it anyway
 * nests their layer inside `liebe-base.vendor`, which keeps their internal order
 * intact and contains the lot.
 */
export function prepareVendorCss(css: string): string {
  const { charset, body } = splitCharset(stripThemableImportance(css))

  return `${charset}${LAYER_ORDER_STATEMENT}\n@layer ${VENDOR_LAYER} {\n${body}\n}\n`
}

/**
 * The vendored packages whose stylesheets sit below Liebe's own baseline, by
 * package root.
 *
 * A list rather than "everything under node_modules", and the difference is not
 * caution — it is what demotion actually does. Demoting a sheet does not only
 * let Liebe's rules win where they were losing usefully; it activates EVERY
 * first-party rule that was losing to it, including rules written years ago
 * against a cascade in which they never applied and which nobody has ever seen
 * render.
 *
 * `react-grid-layout` is the instance that made the point, and is now the
 * instance that shows what joining costs. Its handle rules are
 * `.react-grid-item > .react-resizable-handle.react-resizable-handle-s`, three
 * class selectors deep, while `GridLayoutSection.css` styles the same handles as
 * `.react-resizable-handle-s` — so the sheet won every property both set and
 * Liebe's version had never rendered, the coarse-pointer touch floor included.
 * When [0036](../../docs/changes/0036-theming-contract-gaps.md) PR 1 first tried
 * demoting it, the south handle went from a 28×28 rotated square to a 40×20 bar
 * shifted 16px left and the east handle from 28×28 to 20×40 — enough for a
 * handle to cover a card's action button and swallow its click — so it stayed
 * out until the reconciliation had been done and measured.
 *
 * PR 5 did that work: the vendor's own centring (`margin-left: -10px`) and
 * rotations are neutralised where Liebe positions the same handle itself, so
 * exactly one set of geometry applies. `tests/e2e/grid-handle-geometry.spec.ts`
 * is the evidence, and it is e2e because none of this is a text fact — the
 * stylesheet said `32×32` throughout the years the handle measured 20×20.
 *
 * So a package joins this list when something needs to outrank it and the
 * consequences have been measured. Radix Themes is here because the 44px touch
 * floor is written on bare element selectors that its `.rt-reset` outranks;
 * `react-grid-layout` and `react-resizable` are here because the same floor,
 * written for the grid's handles, is one class shallower than either ships.
 *
 * Both grid packages, not one: `react-resizable` styles `.react-resizable-handle`
 * and `react-grid-layout` styles `.react-grid-item > .react-resizable-handle`,
 * so demoting either alone leaves the other unlayered and still winning.
 */
const DEMOTED_VENDOR_PACKAGES = ['@radix-ui/themes', 'react-grid-layout', 'react-resizable']

/**
 * Whether a stylesheet belongs in the layer below Liebe's own baseline.
 *
 * Matched on the resolved path rather than the import specifier, because that is
 * what a bundler hands a transform: `import '@radix-ui/themes/styles.css'`
 * arrives as an absolute path. Windows separators are normalised first.
 */
export function isDemotedVendorSheet(id: string): boolean {
  const path = id.replaceAll('\\', '/')
  return DEMOTED_VENDOR_PACKAGES.some((pkg) => path.includes(`/node_modules/${pkg}/`))
}
