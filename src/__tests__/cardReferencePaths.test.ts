import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, basename } from 'node:path'

/**
 * Every path `docs/specs/entity-cards/card-reference.md` cites must resolve.
 *
 * That document is the only spec here that names implementation files, and the
 * per-card detail it gets from doing so is its value — so change
 * `docs/changes/0041-card-conventions-and-reference.md` settled that the paths
 * stay and something has to verify them. This is that something.
 *
 * It exists because the failure had already happened four times in one wave of
 * card restructuring with nothing going red: `BinarySensorCard.tsx`,
 * `CoverCard.tsx`, `FanCard.tsx` and `SensorCard.tsx` each became a folder, and
 * the document went on naming the file. A stale path is worse than no path,
 * because the reader it is written for is exactly the one who cannot tell it is
 * wrong. Fixing the four instances fixes today; this fixes the next rename.
 *
 * The same check refuses **line** citations, which the change retired for the
 * opposite reason: nothing can usefully verify one. A line reference stays
 * resolvable and becomes wrong the moment a function moves within its file, so
 * the precision it advertises is what makes it mislead.
 *
 * **What this does NOT cover**, stated so nobody reads it as more than it is:
 *
 * - Only this one document. `docs/specs/entity-cards/index.md`, `navigation`,
 *   `panel-lifecycle` and others still carry `path:line` citations; retiring
 *   those is not this change's decision to make, and an allowlist of documents
 *   permitted to rot would defeat the point of the check.
 * - Whether a citation points at the **right** file. A path that resolves can
 *   still be cited for a claim the file does not support; only a reader can
 *   catch that.
 *
 * It deliberately does **not** accept a bare filename resolved by basename.
 * The document used to name helpers relative to a folder given in the
 * surrounding prose (`format.ts` under `src/components/SensorCard/`), and a
 * basename looked up anywhere under `src/` is a check that passes for the wrong
 * reason: `presentation.ts` and `index.tsx` each exist a dozen times over, so
 * deleting the cited one still resolves a namesake. Those citations were rooted
 * instead, and this requires that every later one is too.
 */

/**
 * Indirected through a parameter, as `hooks/__tests__/noRetryingDispatch.test.ts`
 * and `store/__tests__/configSchema.keyCollisions.test.ts` do and for the same
 * reason: Vite rewrites a LITERAL `new URL('./x', import.meta.url)` into an
 * asset reference, which is no longer a `file:` URL and cannot be read.
 */
function resolve(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

const REPO_ROOT = resolve('../../')
const REFERENCE = 'docs/specs/entity-cards/card-reference.md'

/** Top-level directories a citation may be rooted at. */
const ROOTS = ['src', 'app', 'public', 'scripts', 'tests', 'ha', 'docs', '.storybook']

/** A code span holding nothing but path characters. */
const PATH_SHAPED = /^[\w./*~@-]+$/

/** A file extension the repo actually uses, so prose is not mistaken for a file. */
const FILE_EXTENSION = /\.(tsx?|css|js|mjs|md|json|ya?ml|sh)$/

const source = readFileSync(join(REPO_ROOT, REFERENCE), 'utf8')

/** Every inline code span, in document order, duplicates included. */
function codeSpans(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim())
}

/** Whether `token` is cited from the repo root rather than as a bare filename. */
function isRooted(token: string): boolean {
  return ROOTS.some((root) => token === root || token.startsWith(`${root}/`))
}

/**
 * Whether a rooted citation resolves on disk **as the kind it claims to be**.
 *
 * A trailing `/` claims a directory and anything else claims a file, and the
 * check is on the kind rather than on mere existence — `existsSync` alone is
 * equally happy with a file sitting where the document says a folder is, which
 * would make this assert something weaker than the sentence above it. That is
 * the same defect as the document claiming things the tree does not support,
 * one level up, and the whole point of the check is to fail on exactly that.
 *
 * A citation may carry a `*` — the document cites `__tests__/LightCard*.test.tsx`
 * as a set — which is matched against the parent directory's entries, and the
 * matched entry has to be the claimed kind too.
 */
function rootedResolves(token: string): boolean {
  const claimsDirectory = token.endsWith('/')
  const path = claimsDirectory ? token.slice(0, -1) : token

  const isClaimedKind = (absolute: string): boolean => {
    if (!existsSync(absolute)) return false
    const stats = statSync(absolute)
    return claimsDirectory ? stats.isDirectory() : stats.isFile()
  }

  if (!path.includes('*')) return isClaimedKind(join(REPO_ROOT, path))

  const parent = join(REPO_ROOT, dirname(path))
  if (!existsSync(parent) || !statSync(parent).isDirectory()) return false
  const pattern = new RegExp(
    `^${basename(path)
      .split('*')
      .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`
  )
  return readdirSync(parent).some(
    (entry) => pattern.test(entry) && isClaimedKind(join(parent, entry))
  )
}

describe(`${REFERENCE} path citations`, () => {
  const spans = codeSpans(source)

  it('cites at least one rooted path, so a passing run means something', () => {
    // Without this, deleting every citation would turn the checks below into
    // assertions over an empty list — green, and guarding nothing.
    expect(spans.filter(isRooted).length).toBeGreaterThan(20)
  })

  it('resolves every rooted file and folder it cites', () => {
    const stale = [...new Set(spans.filter(isRooted))].filter((token) => !rootedResolves(token))
    expect(stale).toEqual([])
  })

  it('names every file from the repo root rather than relative to its section', () => {
    const bare = [...new Set(spans)].filter(
      (token) => !isRooted(token) && PATH_SHAPED.test(token) && FILE_EXTENSION.test(token)
    )
    expect(bare).toEqual([])
  })

  /*
   * The resolver's own negatives, asserted directly.
   *
   * Every check above passes by finding nothing, so on a correct document not
   * one of `rootedResolves`'s rejection paths ever runs — the kind comparison
   * included. A guard whose failure path is never executed is a guard nobody has
   * seen work, which is how the weaker `existsSync` version read as correct.
   */
  describe('rootedResolves', () => {
    const FILE = 'src/components/LightCard/index.tsx'
    const FOLDER = 'src/components/LightCard'

    it('accepts each kind cited as itself', () => {
      expect(rootedResolves(FILE)).toBe(true)
      expect(rootedResolves(`${FOLDER}/`)).toBe(true)
      expect(rootedResolves('src/components/__tests__/LightCard*.test.tsx')).toBe(true)
    })

    it('rejects a citation whose kind disagrees with the tree', () => {
      // A file cited as a folder, and a folder cited as a file — both of which
      // plain existence checks accept.
      expect(rootedResolves(`${FILE}/`)).toBe(false)
      expect(rootedResolves(FOLDER)).toBe(false)
      expect(rootedResolves('src/components/__tests__/LightCard*.test.tsx/')).toBe(false)
    })

    it('rejects a path that is not there at all', () => {
      expect(rootedResolves('src/components/LightCard/bulbColor.ts')).toBe(false)
      expect(rootedResolves('src/components/NoSuchCard/')).toBe(false)
    })

    it('rejects a glob that matches nothing, or whose parent is not a folder', () => {
      expect(rootedResolves('src/components/LightCard/nothingMatches*.ts')).toBe(false)
      expect(rootedResolves(`${FILE}/*.ts`)).toBe(false)
      expect(rootedResolves('src/components/NoSuchCard/*.ts')).toBe(false)
    })
  })

  it('cites no line numbers', () => {
    /*
     * Three grammars, not one, because a line locator has more than one spelling
     * and only two of them were ever used here.
     *
     * `appended` covers what a path can carry: `:384`, `:384-390`, an editor's
     * `:384:12`, and GitHub's `#L384` / `#L384-L390`. `parenthesised` covers the
     * bare number trailing a claim, matched where it OPENS or FOLLOWS a comma
     * inside the parenthesis — the form `(2×1, `128`)`, a dimension and a
     * locator sharing one parenthesis, is how a citation survived the first
     * sweep of this document. `prose` covers the spelling neither of those sees,
     * a locator written as words; it requires a digit after "line", so the
     * document's state lines, graph lines and recency lines are untouched.
     */
    const appended = [...new Set(spans)].filter((token) =>
      /^[\w./*~@-]+\.[a-z]+(?::\d+(?::\d+)?(?:-\d+)?|#L\d+(?:-L?\d+)?)$/.test(token)
    )
    const parenthesised = [...source.matchAll(/[(,]\s*`\d+(?:-\d+)?`\)/g)].map((match) => match[0])
    const prose = [...source.matchAll(/\blines?\s+\d+/gi)].map((match) => match[0])
    expect({ appended, parenthesised, prose }).toEqual({
      appended: [],
      parenthesised: [],
      prose: [],
    })
  })
})
