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
 *     every property it references is clean; the closure is computed to a
 *     fixpoint, which leaves reference cycles unclean because they never reach
 *     one.
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
 */

import postcss, { type AtRule, type ChildNode, type Node, type Root } from 'postcss'
import { LAYER_ORDER_STATEMENT, USER_LAYER } from './cssLayers'

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

export interface CustomCssResult {
  /**
   * CSS ready to inject, already wrapped in `@layer liebe-user`. Empty when the
   * input was empty, when nothing survived, or when the input was rejected.
   */
  css: string
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
}

function emptyReferences(): ValueReferences {
  return { resources: [], variables: [], opaque: false }
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
 */
export function scanValue(value: string): ValueReferences {
  const references = emptyReferences()
  let index = 0

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
        // is taken whole rather than tokenised.
        references.resources.push(unescapeCss(stripQuotes(args.raw.trim())))
      } else if (name === 'var') {
        const comma = topLevelComma(args.raw)
        const referenced = (comma === -1 ? args.raw : args.raw.slice(0, comma)).trim()
        // Custom property names are case-sensitive; only function names are not.
        references.variables.push(unescapeCss(referenced))
        // The fallback is a value in its own right and is judged as one.
        if (comma !== -1) mergeReferences(references, scanValue(args.raw.slice(comma + 1)))
      } else {
        mergeReferences(references, scanValue(args.raw))
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
 * already known to be clean; the loop runs to a fixpoint. Monotone, so it
 * terminates — and a reference cycle never enters, which is exactly why cycles
 * are unclean.
 */
function resolveCleanNames(
  definitions: Map<string, PropertyDefinition>,
  baseUrl: string
): ReadonlySet<string> {
  const cleanNames = new Set<string>()
  const isCleanVariable: VariablePredicate = (name) => isEngineToken(name) || cleanNames.has(name)

  for (let changed = true; changed; ) {
    changed = false
    for (const [name, { values }] of definitions) {
      if (cleanNames.has(name)) continue
      if (values.some((references) => judgeValue(references, isCleanVariable, baseUrl) === null)) {
        cleanNames.add(name)
        changed = true
      }
    }
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

  const pin = (include: (name: string) => boolean) =>
    [...definitions]
      .filter(([name]) => include(name))
      .map(([, { authored }]) => `${authored}: initial;`)
      .join(' ')

  const rootPins = pin((name) => !isEngineToken(name))

  // Two rules rather than one selector list: `:host` is invalid outside a
  // shadow root (the workshop, tests) and would take the whole list down with
  // it, while as its own rule it is simply dropped where it does not apply.
  return [`:host { ${pin(() => true)} }`, rootPins && `:where(.liebe-root) { ${rootPins} }`]
    .filter(Boolean)
    .join('\n')
}

/**
 * Sanitises user CSS and wraps it in the `liebe-user` cascade layer.
 *
 * The returned CSS is the only thing that may ever be injected as the user
 * layer: it is serialised from the parsed AST *inside* the layer block, so no
 * input can place a rule outside it.
 */
export function sanitizeCustomCss(
  css: string,
  options: SanitizeCustomCssOptions = {}
): CustomCssResult {
  const baseUrl = options.baseUrl ?? defaultBaseUrl()

  if (css.trim() === '') return { css: '', notices: [], rejected: false }

  let root: Root
  try {
    root = postcss.parse(css)
  } catch (error) {
    // postcss throws `CssSyntaxError`, whose message names the line it gave up
    // on — the most useful thing the editor can show about input it refused.
    const { message } = error as Error
    return { css: '', notices: [`Custom CSS was not applied: ${message}.`], rejected: true }
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

  // Deduplicated: the same mistake repeated twenty times is one thing to fix.
  const notices = [...new Set(removals.map((removal) => removal.notice))]
  const body = root.toString().trim()

  if (body === '') return { css: '', notices, rejected: false }

  // Guards first, so the sheet's own declarations win wherever they apply.
  // Every name the sheet mentioned, not only the ones that survived: a name
  // whose definition was just dropped is exactly the one that would otherwise
  // fall back to an inherited value.
  const guards = guardRules(definitions)

  return {
    css: `${LAYER_ORDER_STATEMENT}\n@layer ${USER_LAYER} {\n${guards}${guards && '\n'}${body}\n}\n`,
    notices,
    rejected: false,
  }
}
