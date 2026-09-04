/**
 * The custom-CSS sanitizer.
 *
 * User CSS is the one untrusted input the theming engine takes, and it arrives
 * by two routes: typed into the editor, and — the reason this is a sanitizer
 * rather than a warning — carried in an imported YAML configuration, which
 * applies immediately. A shared dashboard that merely *warned* about a remote
 * reference would already have made the request by the time anyone read the
 * warning.
 *
 * It enforces one invariant, stated by docs/specs/theming/index.md
 * ("Configuration & selection"):
 *
 *   > No declaration may cause the panel to fetch a resource whose resolved
 *   > source is anything other than same-origin or `data:`, and no declaration
 *   > may import external CSS.
 *
 * The invariant binds the **computed result**, not the authored text, so this
 * module is deliberately not a list of forbidden constructs. Three consequences
 * shape the implementation:
 *
 *  1. **Every reference is resolved, not pattern-matched.** Anything that could
 *     name a resource — the contents of a `url()` token and *every string
 *     literal*, at any function nesting depth — is CSS-unescaped and resolved
 *     against the document base before it is judged. A plain string like
 *     `"Segoe UI"` resolves same-origin and passes; `"//evil.com/x"` resolves
 *     off-origin and does not. Judging strings rather than first deciding
 *     whether a string "looks like a URL" is what makes `image-set()`, `src()`,
 *     `image()`, `cross-fade()` and whatever CSS adds next fall out of the rule
 *     instead of needing to be listed in it.
 *  2. **Cleanliness is transitive over `var()`.** A definition is a reference:
 *     base and theme CSS consume `--liebe-*` tokens in fetch-capable positions,
 *     so `--liebe-card-bg: var(--ha-image)` fetches with no user-authored
 *     consumer at all. A property is clean only if its own value is clean and
 *     every property it references is clean; cleanliness propagates outward
 *     from the values that are clean on their own, which leaves reference
 *     cycles unclean because nothing in one is ever reached.
 *  3. **Values that come from outside the panel are opaque.** Whatever Home
 *     Assistant's document supplies is beyond this module's sight, so it is
 *     unclean wherever it appears: custom properties Liebe does not define, the
 *     CSS-wide keywords (`inherit`, `unset`, `revert`, `revert-layer`), and
 *     `all`. `background-image: inherit` and `--x: inherit` are the same defect
 *     in different clothes — neither contains a URL, and both can resolve to
 *     one.
 *
 * Structure is handled the same way. The sheet is parsed to an AST and
 * re-serialised inside `@layer liebe-user`, never string-concatenated, because
 * deliberately unbalanced input would otherwise close the generated block and
 * leave an *unlayered* rule outranking every layer. Input that cannot be parsed
 * at all is rejected wholesale; the caller keeps the last good CSS applied
 * rather than injecting anything raw.
 *
 * Cost is bounded for the same reason. Sanitisation happens synchronously
 * inside the panel's render, on input an imported dashboard supplies, so *how
 * long it takes* and *how deep it recurses* are part of the threat model: a
 * sanitizer that overflows the stack has not rejected the sheet, it has taken
 * the panel down with it. Every descent is therefore
 * depth-capped (`MAX_NESTING_DEPTH`) and fails closed at the cap, and the
 * `var()` closure is dependency-driven rather than swept to a fixpoint, so a
 * large sheet costs time proportional to what it says rather than to its square.
 */

import postcss, {
  list,
  type AtRule,
  type ChildNode,
  type Container,
  type Document,
  type Node,
  type Root,
  type Rule,
} from 'postcss'
import { LAYER_ORDER_STATEMENT, USER_LAYER } from './cssLayers'
import { LIEBE_INSTANCE_ATTRIBUTE, LIEBE_ROOT_CLASS, PORTAL_ROOT_CLASS } from './rootSelectors'

/**
 * The token namespace Liebe defines and therefore vouches for.
 *
 * `var()` may reach a value this module cannot see, so a reference is only
 * clean when the referenced property is one the user defined here (and that
 * survived sanitisation) or one of Liebe's own tokens. That is exactly the
 * public contract custom CSS is written against — the design-system token
 * contract is `--liebe-*`, while Radix's own variables are vendor internals the
 * theming spec explicitly declines to promise — so the rule costs users nothing
 * they were entitled to, and closes the door on `--ha-*` and on any property an
 * enclosing document might supply.
 */
const ENGINE_TOKEN_PREFIX = '--liebe-'

/**
 * Keywords whose computed value is taken from outside the declaration — and,
 * inside a panel embedded in someone else's document, from outside the panel.
 * `initial` is absent on purpose: it resolves to the property's own initial
 * value and can launder nothing.
 */
const OPAQUE_KEYWORDS: ReadonlySet<string> = new Set(['inherit', 'unset', 'revert', 'revert-layer'])

/**
 * How deep this module will follow nesting — of functions inside a value, and
 * of blocks inside the sheet — before it stops reading and fails closed.
 *
 * One number for both, because both bound the same thing: the recursion this
 * module and postcss's own stringifier do per level. Neither had a bound, and
 * both are reachable from an imported dashboard, which applies immediately:
 * `a(a(a(…)))` twenty thousand deep overflowed the stack inside `scanValue`,
 * and twenty thousand nested `@media` blocks parsed fine (postcss's parser is
 * iterative) and then overflowed on the first `walk`. Either throw escapes
 * `sanitizeCustomCss` into the `useMemo` that calls it, so the panel fails to
 * render at all — a sanitizer crashing the app on hostile input is the one
 * failure mode it exists to prevent.
 *
 * 32 is far past anything CSS is written with: the deepest real values nest
 * four or five (`linear-gradient(color-mix(in srgb, var(--a, rgb(…)), …), …)`),
 * and the deepest real block nesting — `@layer` around `@media` around
 * `@supports` around a rule around its own nested rules — about eight. It is
 * also shallow enough that the recursion is trivially safe on any stack.
 */
const MAX_NESTING_DEPTH = 32

export interface CustomCssResult {
  /**
   * CSS ready to inject, already wrapped in `@layer liebe-user`. Empty when the
   * input was empty, when nothing survived, or when the input was rejected.
   */
  css: string
  /**
   * The same sheet, rewritten so nothing in it can match outside the
   * `liebe-portal-root` container — what the engine injects into the Home
   * Assistant document so overlays get the user layer too. Empty exactly when
   * `css` is. See {@link scopeToPortalRoot}.
   *
   * Unkeyed: it matches every panel's container, which is how the single-panel
   * case has always worked. The engine keys it to one panel's container with
   * {@link scopePortalCssToInstance} before injecting a document-level mirror.
   */
  portalCss: string
  /** Everything stripped or rejected, named — one sentence each. */
  notices: string[]
  /**
   * True when the input could not be parsed and nothing may be applied — the
   * caller keeps the last good CSS rather than injecting a repair attempt.
   */
  rejected: boolean
}

export interface SanitizeCustomCssOptions {
  /**
   * Base the references are resolved against. Defaults to the document's own
   * base URL, which is what the browser would resolve them against.
   */
  baseUrl?: string
}

/* ------------------------------------------------------------------ *
 * CSS escapes
 * ------------------------------------------------------------------ */

// A CSS escape: `\` followed by up to six hex digits and an optional trailing
// whitespace terminator, or by any single character.
const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|[\s\S])/g
const ESCAPE_AT_START = /^\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\r\n\f])?|[\s\S])/

const REPLACEMENT_CHARACTER = '�'
const MAX_CODE_POINT = 0x10ffff

/**
 * Resolves CSS escape sequences to the characters they denote.
 *
 * Escapes are why a syntactic scan cannot work: `\75 rl(…)` is `url(…)`,
 * `\69 mport` is `import`, and `\/\/evil.com` is `//evil.com`. Every name and
 * every reference is unescaped before it is compared or resolved, so the
 * spelling stops mattering.
 */
export function unescapeCss(text: string): string {
  return text.replace(CSS_ESCAPE, (match: string, hex: string | undefined) => {
    // No hex digits: the escape stands for the single character after the
    // backslash, whatever it is.
    if (hex === undefined) return match.slice(1)
    const code = Number.parseInt(hex, 16)
    // Per CSS tokenisation, null / surrogate / out-of-range escapes are the
    // replacement character rather than an error.
    const isSurrogate = code >= 0xd800 && code <= 0xdfff
    if (code === 0 || isSurrogate || code > MAX_CODE_POINT) return REPLACEMENT_CHARACTER
    return String.fromCodePoint(code)
  })
}

/* ------------------------------------------------------------------ *
 * Value scanning
 * ------------------------------------------------------------------ */

/** Everything in one value that could reach a resource. */
export interface ValueReferences {
  /** Unescaped text of every `url()` token and every string literal. */
  resources: string[]
  /** Custom properties the value reads through `var()`. */
  variables: string[]
  /**
   * The value contains something whose computed result this module cannot see:
   * a CSS-wide keyword, or syntax it could not read to the end.
   */
  opaque: boolean
  /**
   * The value nests functions deeper than `MAX_NESTING_DEPTH`, so the scan
   * stopped before the bottom.
   *
   * Distinct from `opaque` only so the editor can name what actually happened;
   * both are unclean, and for the same underlying reason — part of this value
   * was never read.
   */
  tooDeep: boolean
}

function emptyReferences(): ValueReferences {
  return { resources: [], variables: [], opaque: false, tooDeep: false }
}

/** Identifier characters, including the non-ASCII range CSS allows unescaped. */
function isIdentCharacter(character: string): boolean {
  return /[\w-]/.test(character) || character.charCodeAt(0) >= 0x80
}

/** Length of the escape sequence starting at `start` (the backslash). */
function escapeLength(text: string, start: number): number {
  const [match] = text.slice(start).match(ESCAPE_AT_START) ?? []
  // A trailing backslash escapes nothing; consuming it as one character keeps
  // the scan moving.
  return match?.length ?? 1
}

interface ScanCursor {
  /** Raw text consumed, escapes still in place. */
  raw: string
  /** Index just past what was consumed. */
  next: number
  /** False when the construct ran off the end of the input. */
  closed: boolean
}

/** Reads a quoted string, returning its raw (still escaped) contents. */
function readString(text: string, start: number): ScanCursor {
  const quote = text[start]
  let index = start + 1
  let raw = ''

  while (index < text.length) {
    const character = text[index]
    if (character === '\\') {
      const length = escapeLength(text, index)
      raw += text.slice(index, index + length)
      index += length
      continue
    }
    if (character === quote) return { raw, next: index + 1, closed: true }
    raw += character
    index += 1
  }

  // Unterminated: the value does not mean what it reads, so the caller treats
  // it as opaque rather than guessing where the string was meant to close.
  return { raw, next: index, closed: false }
}

/** Reads an identifier (escapes included), returning its raw text. */
function readIdent(text: string, start: number): ScanCursor {
  let index = start
  let raw = ''

  while (index < text.length) {
    const character = text[index]
    if (character === '\\') {
      const length = escapeLength(text, index)
      raw += text.slice(index, index + length)
      index += length
      continue
    }
    if (!isIdentCharacter(character)) break
    raw += character
    index += 1
  }

  return { raw, next: index, closed: true }
}

/**
 * Reads a function's arguments, given the index of its opening parenthesis.
 * Strings are skipped whole so a `)` inside one cannot close the function.
 */
function readArguments(text: string, open: number): ScanCursor {
  let index = open + 1
  let depth = 1
  let raw = ''

  while (index < text.length) {
    const character = text[index]

    if (character === '\\') {
      const length = escapeLength(text, index)
      raw += text.slice(index, index + length)
      index += length
      continue
    }

    if (character === '"' || character === "'") {
      const string = readString(text, index)
      raw += text.slice(index, string.next)
      if (!string.closed) return { raw, next: string.next, closed: false }
      index = string.next
      continue
    }

    if (character === '(') depth += 1
    if (character === ')') {
      depth -= 1
      if (depth === 0) return { raw, next: index + 1, closed: true }
    }

    raw += character
    index += 1
  }

  return { raw, next: index, closed: false }
}

/** Index of the first top-level comma, or -1. Used to split `var()`. */
function topLevelComma(text: string): number {
  let depth = 0
  let index = 0

  while (index < text.length) {
    const character = text[index]
    if (character === '\\') {
      index += escapeLength(text, index)
      continue
    }
    if (character === '"' || character === "'") {
      index = readString(text, index).next
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) return index
    index += 1
  }

  return -1
}

function mergeReferences(into: ValueReferences, from: ValueReferences): void {
  into.resources.push(...from.resources)
  into.variables.push(...from.variables)
  into.opaque ||= from.opaque
  into.tooDeep ||= from.tooDeep
}

function stripQuotes(text: string): string {
  const quote = text[0]
  if ((quote === '"' || quote === "'") && text.length > 1 && text.endsWith(quote)) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Collects every reference a value makes.
 *
 * Function names are unescaped and lower-cased before they are recognised, and
 * anything that is not `url()` or `var()` is descended into rather than
 * classified — an unknown function's arguments are scanned by exactly the same
 * rules, so a fetch expressed through a construct this module has never heard
 * of is still judged by the strings and URLs it must ultimately contain.
 *
 * Descent stops at `MAX_NESTING_DEPTH` and marks the value `tooDeep` rather
 * than recursing on: the unread remainder could contain anything, so the value
 * is unclean and the editor is told why.
 */
export function scanValue(value: string): ValueReferences {
  return scanValueAtDepth(value, 0)
}

function scanValueAtDepth(value: string, depth: number): ValueReferences {
  const references = emptyReferences()
  let index = 0

  // Read one level down, or — at the cap — refuse to and say so. Flagged only
  // where the descent would actually have happened, so a value that merely
  // *sits* at the cap without nesting further is still judged normally.
  const descend = (nested: string) => {
    if (depth < MAX_NESTING_DEPTH) mergeReferences(references, scanValueAtDepth(nested, depth + 1))
    else references.tooDeep = true
  }

  while (index < value.length) {
    const character = value[index]

    if (character === '"' || character === "'") {
      const string = readString(value, index)
      references.resources.push(unescapeCss(string.raw))
      if (!string.closed) references.opaque = true
      index = string.next
      continue
    }

    if (character === '\\' || isIdentCharacter(character)) {
      const ident = readIdent(value, index)
      const name = unescapeCss(ident.raw).toLowerCase()

      if (value[ident.next] !== '(') {
        if (OPAQUE_KEYWORDS.has(name)) references.opaque = true
        index = ident.next
        continue
      }

      const args = readArguments(value, ident.next)
      if (!args.closed) references.opaque = true

      if (name === 'url') {
        // `url()` is the one place a reference may be unquoted, so its argument
        // is taken whole rather than tokenised. It is a leaf — nothing inside it
        // is a nested value — so it costs no depth.
        references.resources.push(unescapeCss(stripQuotes(args.raw.trim())))
      } else if (name === 'var') {
        const comma = topLevelComma(args.raw)
        const referenced = (comma === -1 ? args.raw : args.raw.slice(0, comma)).trim()
        // Custom property names are case-sensitive; only function names are not.
        references.variables.push(unescapeCss(referenced))
        // The fallback is a value in its own right and is judged as one.
        if (comma !== -1) descend(args.raw.slice(comma + 1))
      } else {
        descend(args.raw)
      }

      index = args.next
      continue
    }

    index += 1
  }

  return references
}

/* ------------------------------------------------------------------ *
 * Judging references
 * ------------------------------------------------------------------ */

/**
 * Whether a reference resolves somewhere the panel may fetch from: same-origin
 * or `data:`, per the invariant. Everything else — other schemes, opaque
 * origins, and anything that will not resolve at all — is not.
 */
function resolvesLocally(reference: string, baseUrl: string): boolean {
  const text = reference.trim()
  // Nothing to fetch. (`url()` with an empty argument resolves to the document
  // itself, which is same-origin anyway.)
  if (text === '') return true

  try {
    const base = new URL(baseUrl)
    const resolved = new URL(text, base)
    if (resolved.protocol === 'data:') return true
    // An opaque origin ("null") compares equal to itself, which under a `file:`
    // base would make every off-host reference look same-origin. Requiring a
    // real origin keeps the comparison meaningful.
    return resolved.origin !== 'null' && resolved.origin === base.origin
  } catch {
    return false
  }
}

/** Whether a `var()` target is one this module can vouch for. */
type VariablePredicate = (name: string) => boolean

/**
 * The reason a value is unclean, or `null` when it is clean.
 *
 * A reason rather than a boolean because the spec requires the editor to name
 * everything stripped: a silent drop and a remote fetch are both failures.
 */
function judgeValue(
  references: ValueReferences,
  isCleanVariable: VariablePredicate,
  baseUrl: string
): string | null {
  if (references.tooDeep) {
    return `it nests functions more than ${MAX_NESTING_DEPTH} levels deep, so it was not read to the end`
  }

  if (references.opaque) {
    return 'it takes its value from outside the dashboard'
  }

  const remote = references.resources.find((resource) => !resolvesLocally(resource, baseUrl))
  if (remote !== undefined) {
    return `it references "${remote}", which is not part of this dashboard`
  }

  const unknown = references.variables.find((name) => !isCleanVariable(name))
  if (unknown !== undefined) {
    return `it reads ${unknown}, which is not a Liebe token and is not defined by this stylesheet`
  }

  return null
}

function isEngineToken(name: string): boolean {
  return name.startsWith(ENGINE_TOKEN_PREFIX)
}

function isCustomProperty(property: string): boolean {
  return property.startsWith('--')
}

/* ------------------------------------------------------------------ *
 * Sanitisation
 * ------------------------------------------------------------------ */

function defaultBaseUrl(): string {
  // `about:blank` resolves nothing, so a caller outside a document that
  // supplies no base fails closed rather than trusting relative references.
  return typeof document === 'undefined' ? 'about:blank' : document.baseURI
}

/** A node scheduled for removal, with the sentence explaining why. */
interface Removal {
  node: ChildNode
  notice: string
}

function describeAtRule(atRule: AtRule): string {
  return `@${atRule.name} ${atRule.params}`.trim()
}

/**
 * Whether the sheet nests blocks deeper than this module will walk.
 *
 * postcss's parser is iterative and will happily build a tree twenty thousand
 * blocks deep, but everything downstream of it recurses once per level —
 * `walk`, and the stringifier that writes the sheet back out — so such a sheet
 * parses cleanly and then overflows the stack on the first pass over it. The
 * check itself therefore walks the tree with an explicit stack: a recursive
 * depth check would be the very crash it is here to prevent.
 */
function exceedsNestingLimit(root: Root): boolean {
  const pending: Array<{ node: Container; depth: number }> = [{ node: root, depth: 0 }]

  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const { node, depth } = current
    if (depth > MAX_NESTING_DEPTH) return true
    // `nodes` is undefined on a statement at-rule (`@layer a, b;`), which has no
    // block to descend into.
    for (const child of node.nodes ?? []) {
      if (child.type === 'rule' || child.type === 'atrule') {
        pending.push({ node: child, depth: depth + 1 })
      }
    }
  }

  return false
}

/**
 * Whether a container was left empty by the removals.
 *
 * `nodes === undefined` is a statement at-rule (`@layer a, b;`) rather than an
 * empty block, and has nothing to prune.
 */
function isEmptied(node: ChildNode): boolean {
  return (node.type === 'rule' || node.type === 'atrule') && node.nodes?.length === 0
}

/** One custom property the sheet defines. */
interface PropertyDefinition {
  /**
   * The property name exactly as authored, escapes intact.
   *
   * Kept beside the unescaped name because the two answer different questions:
   * identity is the unescaped name (`--x` and `--\78` are one property), but
   * anything this module *writes back out* has to be the authored spelling.
   * `--x\7d` unescapes to `--x}`, and emitting that would close the rule and
   * then the layer block — the exact escape the AST round-trip exists to
   * prevent, reintroduced by a string concatenation.
   */
  authored: string
  /** Every value the property is defined with, anywhere in the sheet. */
  values: ValueReferences[]
}

/**
 * The custom properties this sheet defines — the raw material of the
 * transitive-cleanliness closure and of the root guards.
 */
function collectDefinitions(root: Root) {
  const definitions = new Map<string, PropertyDefinition>()

  root.walkDecls((declaration) => {
    const property = unescapeCss(declaration.prop)
    if (!isCustomProperty(property)) return

    const references = scanValue(declaration.value)
    const existing = definitions.get(property)
    if (existing) existing.values.push(references)
    else definitions.set(property, { authored: declaration.prop, values: [references] })
  })

  return definitions
}

/**
 * Closes cleanliness over `var()` chains.
 *
 * A name becomes clean when one of its definitions is clean under the names
 * already known to be clean. Monotone, so it terminates — and a reference cycle
 * never enters, which is exactly why cycles are unclean.
 *
 * Dependency-driven rather than swept to a fixpoint. A value that is not yet
 * clean is parked against the one name it is waiting on and re-judged only when
 * that name becomes clean, so each value is judged about once per `var()` it
 * makes. The equivalent sweep-until-nothing-changes loop re-judges every
 * definition on every pass, and a chain written back-to-front — `--v0:
 * var(--v1)` before `--v1`, which any generator emitting in source order
 * produces — advances by one name per pass, making the cost quadratic in the
 * number of definitions: 24k of them (a 560 KB sheet, well within what an
 * imported dashboard may carry) took 27 seconds of blocked main thread, in a
 * `useMemo` during render. Same answer, linear in the sheet.
 */
function resolveCleanNames(
  definitions: Map<string, PropertyDefinition>,
  baseUrl: string
): ReadonlySet<string> {
  const cleanNames = new Set<string>()
  const isCleanVariable: VariablePredicate = (name) => isEngineToken(name) || cleanNames.has(name)

  /** Values parked against a name, by the name they are waiting on. */
  const waiting = new Map<string, Array<{ name: string; references: ValueReferences }>>()
  /** Names newly proven clean, whose dependents have yet to be re-judged. */
  const settled: string[] = []

  const consider = (name: string, references: ValueReferences) => {
    if (cleanNames.has(name)) return

    if (judgeValue(references, isCleanVariable, baseUrl) === null) {
      cleanNames.add(name)
      settled.push(name)
      return
    }

    // Park it against the first name it reads that is not clean yet. A value
    // held back by anything else — an off-origin reference, an opaque keyword —
    // has no unclean variable to wait on and is simply dropped from the search:
    // nothing that happens later can make it clean.
    const blocker = references.variables.find((referenced) => !isCleanVariable(referenced))
    if (blocker === undefined) return

    const parked = waiting.get(blocker)
    if (parked) parked.push({ name, references })
    else waiting.set(blocker, [{ name, references }])
  }

  for (const [name, { values }] of definitions) {
    for (const references of values) consider(name, references)
  }

  for (let name = settled.pop(); name !== undefined; name = settled.pop()) {
    const parked = waiting.get(name)
    if (parked === undefined) continue
    waiting.delete(name)
    for (const { name: dependent, references } of parked) consider(dependent, references)
  }

  return cleanNames
}

/**
 * Pins every custom property the sheet defines to the guaranteed-invalid value
 * at the panel's own roots, ahead of the sheet itself.
 *
 * Cleanliness is a property of a *name*, but a definition is scoped to the
 * elements its selector matches — so `.never { --x: red }` makes `--x` clean
 * while leaving `.liebe-root { background: var(--x) }` reading whatever the
 * enclosing Home Assistant document happens to inherit into `--x`. That is the
 * same laundering the CSS-wide keywords do, wearing a third disguise, and
 * chasing it by analysing which selectors match which elements would be a
 * different (and much worse) job.
 *
 * Declaring the name at the root closes it instead: `initial` on a custom
 * property is the guaranteed-invalid value, a declaration always beats an
 * inherited value, and a `var()` reading it can only resolve to its own
 * fallback — never to something from outside. The user's own definitions still
 * win wherever they apply, because `:where()` costs no specificity and the
 * guard is emitted first.
 *
 * `--liebe-*` is deliberately excluded at `.liebe-root`: those are declared by
 * the base token sheet on that very element, and a user-layer `initial` would
 * beat the whole token contract. Nothing declares them on the shadow host, so
 * the host guard is free to cover them.
 *
 * Names are written back in their **authored** spelling. This is the one place
 * the module composes CSS text rather than serialising an AST, and an unescaped
 * name would be a layer escape of its own making: `--x\7d` means the property
 * `--x}`, and pasting that between a `{` and a `}` closes the rule, then the
 * layer block. The authored form round-trips by construction — postcss read it
 * as one property token, so re-emitting it is one property token again.
 */
function guardRules(definitions: Map<string, PropertyDefinition>): string {
  if (definitions.size === 0) return ''

  const rootPins = pinnedNames(definitions, (name) => !isEngineToken(name))

  // Two rules rather than one selector list: `:host` is invalid outside a
  // shadow root (the workshop, tests) and would take the whole list down with
  // it, while as its own rule it is simply dropped where it does not apply.
  return [
    `:host { ${pinnedNames(definitions, () => true)} }`,
    rootPins && `:where(.${LIEBE_ROOT_CLASS}) { ${rootPins} }`,
  ]
    .filter(Boolean)
    .join('\n')
}

function pinnedNames(
  definitions: Map<string, PropertyDefinition>,
  include: (name: string) => boolean
): string {
  return [...definitions]
    .filter(([name]) => include(name))
    .map(([, { authored }]) => `${authored}: initial;`)
    .join(' ')
}

/**
 * The same guard for the document-level container.
 *
 * It closes the same hole for the same reason — the container is a root the
 * sheet's own `var()`s resolve against, so a name the sheet defines only under
 * a selector that never matches would otherwise read whatever the Home
 * Assistant document inherits into it. No `:host` counterpart: there is no
 * shadow host out here. `--liebe-*` is excluded for the reason it is excluded
 * at `.liebe-root` — the container declares the token contract too, and pinning
 * those to `initial` would erase it.
 */
function portalGuardRules(definitions: Map<string, PropertyDefinition>): string {
  const pins = pinnedNames(definitions, (name) => !isEngineToken(name))
  return pins ? `:where(.${PORTAL_ROOT_CLASS}) { ${pins} }` : ''
}

/* ------------------------------------------------------------------ *
 * Scoping the document-level mirror
 * ------------------------------------------------------------------ */

/**
 * At-rules that merely group other rules conditionally, and so carry nothing of
 * their own out of the container.
 *
 * The mirror keeps these and drops every other at-rule, which is the second
 * half of containment and the half selector rewriting cannot do. Rewriting a
 * selector bounds what a rule may *match*; it says nothing about an at-rule
 * that registers a **document-global name** and thereby reaches the frontend
 * without matching anything: `@property --primary-color { syntax: '<length>' }`
 * makes Home Assistant's own `--primary-color: #03a9f4` invalid at computed
 * value time, `@keyframes` and `@font-face` shadow an animation or a family the
 * frontend already uses, `@page` is not scoped to anything at all.
 *
 * An allowlist rather than a blocklist, so a construct CSS has not shipped yet
 * is contained by default. The cost is real and small: a user animation does
 * not play inside an overlay, and a user `@font-face` does not load for one —
 * the latter costing nothing, since a shadow root does not load `@font-face`
 * declared in it either and the panel has never had them.
 */
const GROUPING_AT_RULES: ReadonlySet<string> = new Set([
  'container',
  'layer',
  'media',
  'scope',
  'starting-style',
  'supports',
])

/**
 * Whether this rule's selector is absolute rather than relative to an enclosing
 * one.
 *
 * Only those get rewritten. A rule nested inside another rule is already
 * bounded by whatever its parent was rewritten to, and a `@keyframes` step
 * (`from`, `50%`) is not a selector at all — rewriting one would turn the
 * animation into rules that match nothing.
 *
 * The whole ancestor chain, not the immediate parent: a conditional group may
 * sit between a rule and the rule it is nested in — `.a { @media … { & .b {} } }`
 * — and `& .b` is no more absolute for having an `@media` above it. Checking one
 * level would rewrite it to `.liebe-portal-root:is(& .b)`, which is not a
 * selector and drops the rule from the mirror entirely.
 */
function isScopableRule(rule: Rule): boolean {
  for (let node: Container | Document | undefined = rule.parent; node; node = node.parent) {
    if (node.type === 'rule') return false
  }
  return true
}

/**
 * Rewrites one selector so its subject can only ever be the container or
 * something inside it.
 *
 * Two forms per selector, because user CSS is documented to target
 * `.liebe-root` and the container carries that class: `:is(…)` prefixed by the
 * container matches the container itself, and the descendant form matches
 * everything below it. The subject is what the ancestor constraint binds, so
 * `.a > .b` is covered in both directions — including the case where the
 * container is the `.a`.
 *
 * Rewritten per comma-separated selector rather than by wrapping the whole list
 * in one `:is()`. `:is()` takes the specificity of its most specific argument,
 * so wrapping `.a, #b` once would silently lend `#b`'s specificity to the `.a`
 * branch and reorder the user's own rules against each other. One selector per
 * `:is()` keeps the shift a constant single class for every rule.
 *
 * `:is()` is also forgiving, which is the safe direction here: a selector the
 * document cannot parse — `:host` out of a shadow root, most obviously — is
 * dropped from the match rather than taking the rule with it.
 *
 * With an instance token the scope carries it on both prefixes, so a keyed
 * sheet matches one panel's container and its descendants and nothing else —
 * including not the other panel's container. Without one the scope is the bare
 * container class, the historical shape matching every panel's container.
 */
function scopeSelector(selector: string, instance?: string): string {
  const scope = instance
    ? `.${PORTAL_ROOT_CLASS}[${LIEBE_INSTANCE_ATTRIBUTE}="${instance}"]`
    : `.${PORTAL_ROOT_CLASS}`
  return list
    .comma(selector)
    .flatMap((part) => {
      const { subject, pseudoElement } = splitPseudoElement(part)
      return [`${scope}:is(${subject})${pseudoElement}`, `${scope} :is(${subject})${pseudoElement}`]
    })
    .join(', ')
}

/**
 * The pseudo-elements CSS still accepts with one colon. Nothing else may be
 * written that way, so the one-colon form is only a pseudo-element for these
 * four names — every other `:name` is a pseudo-CLASS and belongs inside the
 * `:is()` with the rest of the selector.
 */
const LEGACY_PSEUDO_ELEMENTS = ['before', 'after', 'first-line', 'first-letter']

/**
 * Splits a selector into the element it selects and the pseudo-element it then
 * addresses on it, if any.
 *
 * `:is()` accepts pseudo-classes and rejects pseudo-elements, and it is
 * FORGIVING — so `:is(.liebe-card::before)` is not an error, it is a selector
 * list with its only entry dropped, matching nothing. Wrapping a selector whole
 * would therefore silently take every `::before` and `::after` rule out of the
 * mirror, which is most of what a theme-shaped stylesheet is made of: the
 * selector contract exists partly so a theme can hang decoration on pseudo-
 * elements. Splitting the tail off and re-attaching it outside the `:is()`
 * keeps the rule meaning what it said, on a subject the container still bounds.
 *
 * Scanned rather than matched with a pattern, because a `::` may sit inside
 * `:not(…)`, an attribute value or a string, where it is not the subject's
 * pseudo-element. Only a depth-zero one is. The LAST one wins: a user-action
 * pseudo-class may legally follow (`::before:hover`), and it belongs with the
 * pseudo-element rather than with the subject.
 */
function splitPseudoElement(part: string): { subject: string; pseudoElement: string } {
  const at = pseudoElementIndex(part)
  const subject = (at === -1 ? part : part.slice(0, at)).trim()

  return {
    // `*` for a selector that is nothing BUT a pseudo-element (`::selection`,
    // which is valid on its own): `:is()` may not be empty.
    subject: subject === '' ? '*' : subject,
    pseudoElement: at === -1 ? '' : part.slice(at),
  }
}

/** Index at which the subject's pseudo-element begins, or -1. */
function pseudoElementIndex(part: string): number {
  let depth = 0
  let found = -1

  for (let index = 0; index < part.length; index += 1) {
    const character = part[index]

    if (character === '\\') {
      index += 1
    } else if (character === '"' || character === "'") {
      index = readString(part, index).next - 1
    } else if (character === '(' || character === '[') {
      depth += 1
    } else if (character === ')' || character === ']') {
      depth -= 1
    } else if (character === ':' && depth === 0) {
      if (part[index + 1] === ':') {
        found = index
        index += 1
      } else if (startsLegacyPseudoElement(part.slice(index + 1))) {
        found = index
      }
    }
  }

  return found
}

function startsLegacyPseudoElement(rest: string): boolean {
  const lowered = rest.toLowerCase()
  return LEGACY_PSEUDO_ELEMENTS.some(
    (name) => lowered.startsWith(name) && !/[\w-]/.test(lowered[name.length] ?? '')
  )
}

/**
 * The sheet as it may be injected into the Home Assistant document.
 *
 * This is what makes mirroring the user layer safe at all. The layers the
 * engine mirrors today are first-party CSS whose every selector is Liebe's own;
 * user CSS is arbitrary author input, and the sanitizer judges what a
 * declaration may *fetch*, never what it may *match* — so an unmodified copy of
 * `body { display: none }` out of an imported dashboard would blank the
 * frontend around the panel. Every selector is therefore rewritten to a subject
 * inside the container, and everything that could reach outside without
 * matching is dropped (see {@link GROUPING_AT_RULES}).
 *
 * Takes the already-sanitised AST and works on a clone, so the in-panel sheet
 * is serialised from the tree the sanitizer produced rather than from one this
 * has walked over.
 *
 * The dropped at-rules come back as notices. They are not removed from the
 * dashboard — only from overlays — and that asymmetry is exactly the kind of
 * thing an author cannot deduce: the animation plays on a card and not in a
 * dialog, with nothing said. The spec's rule that everything stripped is named
 * covers it.
 */
function scopeToPortalRoot(root: Root, instance?: string): { css: string; notices: string[] } {
  const scoped = root.clone()
  const notices: string[] = []

  const unscopable: AtRule[] = []
  scoped.walkAtRules((atRule) => {
    if (!GROUPING_AT_RULES.has(unescapeCss(atRule.name).toLowerCase())) unscopable.push(atRule)
  })
  for (const atRule of unscopable) {
    notices.push(
      `${describeAtRule(atRule)} applies to the dashboard but not inside dialogs and menus: it registers a name for the whole Home Assistant page, so it is not copied out of the panel.`
    )
    atRule.remove()
  }

  scoped.walkRules((rule) => {
    if (isScopableRule(rule)) rule.selector = scopeSelector(rule.selector, instance)
  })

  return { css: scoped.toString().trim(), notices }
}

/**
 * Keys an already-sanitized portal sheet to one panel's container.
 *
 * The engine calls this on `sanitizeCustomCss`'s `portalCss` with the panel's
 * mount token before injecting the document-level mirror, so two panels'
 * mirrors match only their own containers. Pass-through for an empty sheet —
 * nothing survived the scoping — and for a sheet already keyed to this
 * instance, which keeps the function idempotent across re-injection.
 *
 * Parsed, not textual: the sheet is re-parsed with postcss and only SELECTORS
 * are rewritten — declaration values (a `content: ".liebe-portal-root"` a
 * theme-shaped sheet paints into an `::after`, a `url()`, a custom property)
 * are never touched. Likewise the already-keyed check looks only for the
 * exact scope prefix this function emits
 * (`.liebe-portal-root[data-liebe-instance="…"]`), never for a bare mention
 * of the attribute: one unrelated authored rule naming the attribute must not
 * leave the rest of the sheet under the unkeyed scope matching both panels.
 */
export function scopePortalCssToInstance(portalCss: string, instance: string): string {
  if (portalCss === '') return portalCss
  const keyedPrefix = `.${PORTAL_ROOT_CLASS}[${LIEBE_INSTANCE_ATTRIBUTE}="${instance}"]`
  const keyedGuard = `:where(.${PORTAL_ROOT_CLASS}[${LIEBE_INSTANCE_ATTRIBUTE}="${instance}"])`
  const root = postcss.parse(portalCss)
  root.walkRules((rule) => {
    // The guard rule (`:where(.liebe-portal-root) { …: initial; }`) is a
    // SELECTOR too: unkeyed it pins the name on every panel's container, so
    // the first panel's guard would cover the second panel's lookups. Keyed
    // it pins only its own panel's container, like every other rule.
    if (rule.selector.trim() === `:where(.${PORTAL_ROOT_CLASS})`) {
      rule.selector = keyedGuard
      return
    }
    rule.selector = list
      .comma(rule.selector)
      .map((part) =>
        part.includes(keyedPrefix)
          ? part
          : part.split(`.${PORTAL_ROOT_CLASS}`).join(keyedPrefix)
      )
      .join(', ')
  })
  return root.toString()
}

/**
 * Sanitises user CSS and wraps it in the `liebe-user` cascade layer.
 *
 * The returned CSS is the only thing that may ever be injected as the user
 * layer: it is serialised from the parsed AST *inside* the layer block, so no
 * input can place a rule outside it.
 *
 * Two sheets come back from the one parse. `css` is for the root the panel is
 * mounted in, where the shadow boundary contains it; `portalCss` is the same
 * sheet rewritten for the Home Assistant document, where nothing else would
 * (see {@link scopeToPortalRoot}).
 */
export function sanitizeCustomCss(
  css: string,
  options: SanitizeCustomCssOptions = {}
): CustomCssResult {
  const baseUrl = options.baseUrl ?? defaultBaseUrl()

  if (css.trim() === '') return { css: '', portalCss: '', notices: [], rejected: false }

  let root: Root
  try {
    root = postcss.parse(css)
  } catch (error) {
    // postcss throws `CssSyntaxError`, whose message names the line it gave up
    // on — the most useful thing the editor can show about input it refused.
    const { message } = error as Error
    return {
      css: '',
      portalCss: '',
      notices: [`Custom CSS was not applied: ${message}.`],
      rejected: true,
    }
  }

  // Rejected wholesale rather than pruned, and before anything walks the tree:
  // the sheet is not something this module can read, which is the same answer
  // input it cannot parse gets.
  if (exceedsNestingLimit(root)) {
    return {
      css: '',
      portalCss: '',
      notices: [
        `Custom CSS was not applied: it nests rules more than ${MAX_NESTING_DEPTH} levels deep.`,
      ],
      rejected: true,
    }
  }

  const removals: Removal[] = []
  const removed = new Set<Node>()

  const isRemoved = (node: Node): boolean => {
    for (
      let current: Node | undefined = node;
      current;
      current = current.parent as Node | undefined
    ) {
      if (removed.has(current)) return true
    }
    return false
  }

  const drop = (node: ChildNode, notice: string) => {
    removals.push({ node, notice })
    removed.add(node)
  }

  // `@import` fetches by definition and cannot legally appear inside the layer
  // wrapper anyway, so it goes by name — before any value is judged.
  root.walkAtRules((atRule) => {
    if (unescapeCss(atRule.name).toLowerCase() === 'import') {
      drop(
        atRule,
        `Removed ${describeAtRule(atRule)}: custom CSS may not load external stylesheets.`
      )
    }
  })

  // Collected across the whole sheet, including inside at-rules that later
  // passes drop: a name is only ever made clean by a definition that is itself
  // clean, so counting one extra can add nothing unclean to the closure.
  const definitions = collectDefinitions(root)
  const cleanNames = resolveCleanNames(definitions, baseUrl)
  const isCleanVariable: VariablePredicate = (name) => isEngineToken(name) || cleanNames.has(name)

  // At-rule preludes are values too: `@supports (background: url(…))` names a
  // resource, and an at-rule this module has never seen is judged the same way
  // rather than trusted.
  root.walkAtRules((atRule) => {
    if (isRemoved(atRule) || atRule.params === '') return
    const reason = judgeValue(scanValue(atRule.params), isCleanVariable, baseUrl)
    if (reason) drop(atRule, `Removed ${describeAtRule(atRule)}: ${reason}.`)
  })

  root.walkDecls((declaration) => {
    if (isRemoved(declaration)) return
    const property = unescapeCss(declaration.prop)

    // `all` accepts nothing but CSS-wide keywords, every one of which resets
    // the element to values decided outside this stylesheet.
    if (property.toLowerCase() === 'all') {
      drop(
        declaration,
        'Removed `all`: it resets every property to values set outside the dashboard.'
      )
      return
    }

    const reason = judgeValue(scanValue(declaration.value), isCleanVariable, baseUrl)
    if (reason) drop(declaration, `Removed \`${property}\`: ${reason}.`)
  })

  for (const { node } of removals) node.remove()

  // Containers the removals emptied. Repeated, so a rule whose only child was
  // itself emptied goes too.
  for (let pruned = true; pruned; ) {
    pruned = false
    const empties: ChildNode[] = []
    root.walk((node) => {
      if (isEmptied(node)) empties.push(node)
    })
    for (const node of empties) {
      node.remove()
      pruned = true
    }
  }

  const portal = scopeToPortalRoot(root)

  // Deduplicated: the same mistake repeated twenty times is one thing to fix.
  const notices = [...new Set([...removals.map((removal) => removal.notice), ...portal.notices])]
  const body = root.toString().trim()

  if (body === '') return { css: '', portalCss: '', notices, rejected: false }

  // Guards first, so the sheet's own declarations win wherever they apply.
  // Every name the sheet mentioned, not only the ones that survived: a name
  // whose definition was just dropped is exactly the one that would otherwise
  // fall back to an inherited value.
  return {
    css: inUserLayer(guardRules(definitions), body),
    // Empty when nothing survived the scoping — a sheet of nothing but
    // `@keyframes` — rather than a layer block holding only guards nothing in
    // the document reads.
    portalCss: portal.css === '' ? '' : inUserLayer(portalGuardRules(definitions), portal.css),
    notices,
    rejected: false,
  }
}

/** One sheet, serialised inside the user layer with its guards ahead of it. */
function inUserLayer(guards: string, body: string): string {
  return `${LAYER_ORDER_STATEMENT}\n@layer ${USER_LAYER} {\n${guards}${guards && '\n'}${body}\n}\n`
}
