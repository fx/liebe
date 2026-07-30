import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ESLint } from 'eslint'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

/**
 * The effect hooks must be called through the imported binding, and this is
 * what proves the ban is doing the job it was added for.
 *
 * `react-hooks/set-state-in-effect` is set to `error`
 * (`eslint.config.js`, change 0003) and **cannot see `React.useEffect(...)`**.
 * Its validation pass reads the *receiver* of a method call where it means the
 * callee, so for `React.useEffect(fn)` it asks whether `React` — an object — is
 * an effect hook, and gets `false`. Five call sites in this repo were written
 * that way and had therefore never been reported by a rule that has been at
 * `error` for months, including `GridCard`'s `setDetailFor(null)`. See
 * docs/changes/0040-test-harness-reliability.md, PR 3.
 *
 * The fix is a `no-restricted-syntax` ban on the member-call form, which routes
 * every effect through the binding the rule *can* see. That is a lint config
 * change, and a lint config change is exactly the kind of thing that gets
 * quietly reverted, narrowed by a later selector edit, or defeated by a plugin
 * upgrade — with nothing going red, because the only symptom is a rule that
 * stops finding things. This spec is what goes red instead.
 *
 * It lints through **the repo's own `eslint.config.js`** rather than a
 * reconstruction of it. A test that builds its own config would keep passing
 * after someone deleted the rule from the real one, which would make it worse
 * than no test: it would report the gate as working precisely when it was not.
 *
 * The assertions are deliberately different in kind:
 *
 *  1. The ban fires on `React.useEffect`. This is the gate.
 *  2. `set-state-in-effect` fires on the imported form. This is why the ban is
 *     the right fix rather than a style preference — the rule genuinely works
 *     once the call reaches it.
 *  3. `set-state-in-effect` does **not** fire on `React.useEffect`. This one
 *     pins the upstream defect itself, and it is the assertion that will age:
 *     if a future `eslint-plugin-react-hooks` fixes the receiver/callee
 *     confusion, this goes red. That is the intended signal, not a failure —
 *     it says the ban has become redundant and can be reconsidered. Asserting
 *     it is the difference between "we chose to ban this" and "we can no longer
 *     remember why we banned this".
 *  4. The imported binding is **not** restricted. This is the half a ban is
 *     most likely to break, and the half whose breakage a "does it fire?" test
 *     cannot see: a selector that grew to match the direct import would leave
 *     no legal way to write an effect at all.
 *  5. The ban also fires on the spellings that evade a naive version of it — an
 *     aliased namespace, computed access in both static spellings, and
 *     destructuring off the namespace likewise. Each of those was a real hole
 *     found in review, not a hypothetical; the destructured one evaded the rule
 *     as well as the ban.
 *
 * 1, 3 and 4 run across all three hooks the ban names rather than `useEffect`
 * alone, so a regression narrowing the selectors to one hook goes red.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The three hooks the ban covers, which is exactly the set
 * `react-hooks/set-state-in-effect` inspects. All three are exercised in every
 * form rather than only `useEffect`: the selectors name all three, so a
 * regression dropping two of them would otherwise leave this file green.
 */
const EFFECT_HOOKS = ['useEffect', 'useLayoutEffect', 'useInsertionEffect'] as const

/** One fixture file: what to write, and the id its lint result is keyed by. */
interface LintCase {
  id: string
  file: string
  call: string
  prelude?: string
  imports?: string
  directive?: string
  deps?: string
}

/**
 * The directive that makes the React compiler bail on a whole function, used to
 * write the fixture below.
 *
 * Assembled from two pieces so this file's own text does not contain a
 * suppression, which would make it an offender in the scan further down. The
 * alternative was to exempt this spec from that scan, and an exemption is the
 * one thing a scan of this kind must not have — the file enforcing the policy
 * would be the file the policy could not see into.
 */
const EXHAUSTIVE_DEPS_DIRECTIVE = `eslint-disable-next-line react-hooks/exhaustive` + '-deps'

/** Every `//` line comment and `/* … *\/` block comment in a source file. */
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/**
 * A suppression naming the rule, anywhere in one comment, in any order and
 * across however many lines the comment spans.
 *
 * Unanchored on purpose. What this is guarding against is the **React compiler
 * bail** rather than an ESLint suppression, and the compiler reads the comment
 * text — so the opener may be `//`, `/*` or `/**`, the leading `*` of a
 * continuation line may sit between the words, and the rule name may be on a
 * later line than the `eslint-disable`. Which of those the compiler honours has
 * not been enumerated, and it does not need to be: none of them belongs in this
 * repo, so the scan rejects the shape rather than trying to predict the effect.
 */
const RULE_SUPPRESSION_PATTERN =
  /eslint-disable(?:-next-line|-line)?\b[\s\S]*react-hooks\/exhaustive-deps/

/**
 * A rule-**less** blanket disable — `/* eslint-disable *\/` and its relatives.
 *
 * A different mechanism with the same result, and the reason it is worth its
 * own pattern: it does not bail the compiler, it suppresses **every** rule
 * ESLint would report in that file, `set-state-in-effect` included. Measured,
 * not assumed — a file-level blanket disable is in fact the only directive form
 * that silences `set-state-in-effect` at all; every *named* next-line form
 * leaves it reporting, because the rule's report lands on a line the directive
 * does not cover.
 *
 * Anchored, unlike the pattern above, because ESLint only honours a directive
 * when the comment *begins* with it — and because an unanchored version would
 * flag ordinary prose that ends a sentence on the word. The trailing `--`
 * branch is ESLint's description syntax: a blanket disable may carry a reason
 * after `--` and still names no rule, so it is the same directive wearing an
 * explanation.
 */
const BLANKET_SUPPRESSION_PATTERN =
  /^[\s*]*eslint-disable(?:-next-line|-line)?[\s*]*(?:--[\s\S]*)?$/

/**
 * Whether a source file disarms the rule from a comment, by either route.
 *
 * Matching one spelling is the mistake this whole change document exists to
 * correct: PR 3's defect was a rule that saw `useEffect(...)` and not
 * `React.useEffect(...)`, and a scan keyed on the next-line form alone is the
 * same shape of hole — a block disable for a whole file, the `-line` suffix, a
 * multi-rule list naming some other rule first, a `/**` opener, a continuation
 * line and a rule-less blanket disable would every one read as clean.
 *
 * Scoping to comments buys the accuracy and one property besides: the patterns
 * above are *code*, so they cannot match themselves however they are written,
 * and the file needs no exemption from its own scan. The prose still may not
 * spell a suppression out — that is the intended pressure, and it is why the
 * fixture's directive is assembled at runtime rather than written here.
 */
function suppressesRuleFromAComment(source: string): boolean {
  return (source.match(COMMENT_PATTERN) ?? [])
    .map((comment) =>
      comment.startsWith('//') ? comment.slice(2) : comment.slice(2, -2).replace(/^\*/, '')
    )
    .some((body) => RULE_SUPPRESSION_PATTERN.test(body) || BLANKET_SUPPRESSION_PATTERN.test(body))
}

/**
 * Every `.ts`/`.tsx` file under `src/`, walked with Node rather than listed by
 * `git ls-files`.
 *
 * `removeFixtureDir` tolerates git being unavailable on purpose; a scan that
 * *required* a subprocess would make the merge-blocking suite unrunnable
 * wherever process creation is restricted, which is a worse failure than the
 * one it is guarding against. The throwaway fixture directory is skipped —
 * it is written by this very spec and contains a directive on purpose.
 */
function sourceFilesUnderSrc(dir = 'src'): string[] {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory())
      return entry.name === '__lint-fixture__' ? [] : sourceFilesUnderSrc(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * A component that resets state from an effect — the pattern the rule rejects.
 *
 * `prelude` is for the spellings that are established before the call rather
 * than at it: destructuring off the namespace produces a plain identifier at
 * the call site, so there is nothing there to key on. `imports` is a named
 * import list, present only for the fixtures whose call site is the imported
 * binding — the form that must stay *permitted*.
 */
function fixture({
  call,
  prelude = '',
  imports = '',
  directive = '',
  deps = ', []',
}: {
  call: string
  prelude?: string
  imports?: string
  /** A comment placed immediately above the effect call. */
  directive?: string
  /** The effect's second argument, or `''` for a dependency-free effect. */
  deps?: string
}) {
  return `import * as React from 'react'
import * as Hooks from 'react'
${imports ? `import { ${imports} } from 'react'\n` : ''}
void Hooks
${prelude}

export function Probe() {
  const [value, setValue] = React.useState<string | null>(null)
${directive ? `  ${directive}\n` : ''}  ${call}(() => {
    setValue(null)
  }${deps})
  return <div>{value}</div>
}
`
}

/*
 * The fixtures are written to real files inside the repo rather than linted as
 * strings, because the TypeScript parser is configured with `project` — it
 * resolves each file against `tsconfig.json`, and a path that is not in the
 * project is not linted the way the real sources are. So they have to live
 * under the repo root, where the recursive `.tsx` include picks them up.
 *
 * That puts deliberately lint-failing files inside the tree the merge-blocking
 * gate scans, which is handled four ways rather than trusting cleanup. The
 * path is a fixed name listed in `eslint.config.js`'s `ignores` and in
 * `.prettierignore`; it is `.gitignore`d; it is removed before it is written as
 * well as after; and the run below opts itself back in with `ignore: false`.
 *
 * Those are not four versions of one precaution. The first and third prevent
 * the directory surviving a run killed mid-flight — without them the next
 * `npm run lint` fails on files that are in nobody's diff, which is a
 * genuinely awful thing to debug. The `.gitignore` entry is the one that
 * matters most, because it is the only one that bounds the damage if the
 * directory survives anyway: untracked leftovers cannot be committed by
 * accident, so `removeFixtureDir` can never be pointed at a tracked file.
 */
const fixtureDir = join(repoRoot, 'src', '__lint-fixture__')

/**
 * Delete the fixture directory, refusing if git tracks anything inside it.
 *
 * The failure this exists for: if those files ever became tracked, a recursive
 * delete on every `npm test` would be quietly destroying real work. The guard
 * turns that into a loud failure, which is the whole of its value — it is not
 * expected to fire, and the `.gitignore` entry is what makes it unlikely to.
 *
 * A git failure (no git, no repo) is not fatal: this is the backstop to the
 * ignore entry rather than the primary protection, and refusing to clean up
 * because `git` is missing would break the suite for no safety gain.
 */
function removeFixtureDir() {
  try {
    const tracked = execFileSync('git', ['ls-files', '--', fixtureDir], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
    if (tracked !== '') {
      throw new Error(
        `Refusing to delete tracked files under ${fixtureDir}:\n${tracked}\n` +
          'This directory is meant to hold throwaway lint fixtures and to be gitignored. ' +
          'Something committed them; remove them from the index rather than letting the ' +
          'test suite delete them on every run.'
      )
    }
  } catch (error) {
    // Rethrow our own refusal; swallow git being unavailable.
    if (error instanceof Error && error.message.startsWith('Refusing to delete')) throw error
  }
  rmSync(fixtureDir, { recursive: true, force: true })
}

/** Rule ids reported at `error` for each fixture, keyed by the effect call. */
const reported = new Map<string, string[]>()

/*
 * All the linting happens once, here, for a reason worth stating: a real ESLint
 * run over this config builds a TypeScript program (the parser is configured
 * with `project`), which costs seconds. Doing that per assertion made the
 * cheapest of the three tests the slowest thing in the file and pushed it past
 * the 5 s default under full-suite load.
 *
 * So the cost is paid once and the assertions below are pure comparisons on the
 * result. The generous timeout is on this hook alone and covers *inherent*
 * cost — booting tsc — rather than covering a slow assertion or a leak; the
 * three `it`s keep the default timeout, so if any of them ever becomes slow
 * that is still a signal rather than something this number would absorb.
 */
beforeAll(async () => {
  // Before as well as after: a previous run killed mid-flight is exactly the
  // case this is protecting against, so it must not depend on that run.
  removeFixtureDir()
  mkdirSync(fixtureDir, { recursive: true })

  /*
   * Keyed by an id rather than by the call text, because the same call text now
   * appears under different hooks. Every hook gets all three core forms; the
   * exotic spellings that were each a real review finding are exercised on
   * `useEffect`, since they test the selector's shape rather than its hook set.
   */
  const cases: LintCase[] = EFFECT_HOOKS.flatMap<LintCase>((hook) => [
    { id: `member:${hook}`, file: `member-${hook}.tsx`, call: `React.${hook}` },
    // The permitted form. Asserted *not* restricted, so a selector that grew
    // to ban the direct import — which would leave no legal way to write an
    // effect — cannot pass unnoticed.
    { id: `imported:${hook}`, file: `imported-${hook}.tsx`, call: hook, imports: hook },
    {
      id: `destructured:${hook}`,
      file: `destructured-${hook}.tsx`,
      call: `scoped_${hook}`,
      prelude: `const { ${hook}: scoped_${hook} } = React`,
    },
  ])
    .concat([
      // Would slip past a ban keyed on an object literally named `React`.
      { id: 'aliased', file: 'aliased.tsx', call: 'Hooks.useEffect' },
      // Computed access, in both statically-known spellings.
      { id: 'computed-string', file: 'computed-string.tsx', call: "React['useEffect']" },
      { id: 'computed-template', file: 'computed-template.tsx', call: 'React[`useEffect`]' },
      // Destructuring with a non-identifier key, likewise in both spellings.
      {
        id: 'destructured-string-key',
        file: 'destructured-string-key.tsx',
        call: 'stringKeyed',
        prelude: "const { ['useEffect']: stringKeyed } = React",
      },
      {
        id: 'destructured-template-key',
        file: 'destructured-template-key.tsx',
        call: 'templateKeyed',
        prelude: 'const { [`useEffect`]: templateKeyed } = React',
      },
      /*
       * The whole-function bail, as a matched pair. Both are the imported
       * form with a dependency-free state-writing effect — the shape the two
       * theme-workshop hooks have — and they differ only by the comment.
       */
      {
        id: 'bail-suppressed',
        file: 'bail-suppressed.tsx',
        call: 'useEffect',
        imports: 'useEffect',
        directive: `// ${EXHAUSTIVE_DEPS_DIRECTIVE}`,
        deps: '',
      },
      {
        id: 'bail-plain',
        file: 'bail-plain.tsx',
        call: 'useEffect',
        imports: 'useEffect',
        deps: '',
      },
    ])
    .map((c) => ({ ...c, file: join(fixtureDir, c.file) }))

  for (const c of cases) writeFileSync(c.file, fixture(c))

  /*
   * One instance, one invocation: both the config and the TypeScript program
   * are then built a single time for the whole file.
   *
   * `ignore: false` is what opts the fixture directory back in — it is listed
   * in the config's `ignores` so a leftover cannot break the real gate, and
   * without this the run would skip the very files it is here to inspect and
   * every assertion would pass vacuously.
   */
  const eslint = new ESLint({ cwd: repoRoot, ignore: false })
  const results = await eslint.lintFiles(cases.map((c) => c.file))

  for (const c of cases) {
    const result = results.find((r) => r.filePath === c.file)
    if (result === undefined) throw new Error(`no lint result for ${c.file}`)
    reported.set(
      c.id,
      result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? '<fatal>')
    )
  }
}, 120_000)

afterAll(() => {
  removeFixtureDir()
})

describe('effect hooks must be called through the imported binding', () => {
  /*
   * Every hook in the ban's set, in both spellings that evade the rule. Run
   * across all three rather than on `useEffect` alone: the selectors name three
   * hooks, so a regression narrowing them to one would otherwise go unnoticed.
   */
  it.each(EFFECT_HOOKS)('rejects the React.%s member-call form', (hook) => {
    expect(reported.get(`member:${hook}`)).toContain('no-restricted-syntax')
  })

  it.each(EFFECT_HOOKS)('rejects %s destructured off the namespace', (hook) => {
    expect(reported.get(`destructured:${hook}`)).toContain('no-restricted-syntax')
  })

  /*
   * The other half of the contract, and the half a ban is most likely to break:
   * the imported binding is the form the codebase is being pushed *towards*, so
   * it must stay permitted. A selector that grew to match the direct import
   * would leave no legal way to write an effect at all, and without this
   * assertion the suite would happily report that as the gate working.
   */
  it.each(EFFECT_HOOKS)('permits the imported %s binding', (hook) => {
    expect(reported.get(`imported:${hook}`)).not.toContain('no-restricted-syntax')
  })

  it('reports a state-writing effect written in the imported form', () => {
    expect(reported.get('imported:useEffect')).toContain('react-hooks/set-state-in-effect')
  })

  it('does not report the same state write when the effect is a member call', () => {
    // The blind spot itself. If this ever contains the rule, the upstream bug
    // is fixed and the `no-restricted-syntax` ban can be revisited.
    expect(reported.get('member:useEffect')).not.toContain('react-hooks/set-state-in-effect')
  })

  /*
   * The spellings that were each a real review finding rather than a
   * hypothetical, and that a naive version of the ban let through:
   *
   *  - `aliased` — a namespace import bound to something other than `React`,
   *    which a selector pinned to that name misses;
   *  - the computed pair — `React['useEffect']` and its backtick form;
   *  - the destructured-key pair — the same two spellings as an object-pattern
   *    key.
   *
   * The destructured ones are the worst of them: the call site is a bare
   * identifier, so `set-state-in-effect` stays silent too. That fixture linted
   * completely clean, with a setState inside an effect, before the selector
   * existed.
   */
  it.each([
    'aliased',
    'computed-string',
    'computed-template',
    'destructured-string-key',
    'destructured-template-key',
  ])('rejects the %s spelling', (id) => {
    expect(reported.get(id)).toContain('no-restricted-syntax')
  })
})

/**
 * The second way an effect escapes the rule, and the one that does not need a
 * peculiar spelling: an `exhaustive-deps` suppression anywhere in the enclosing
 * function.
 *
 * The React compiler treats that directive as "the author knows they are
 * breaking the rules of React" and stops analysing the **whole function**, so
 * every compiler-backed rule goes quiet with it — `set-state-in-effect`
 * included, at `error`. The suppression is not local to the line it sits on,
 * which is what makes it dangerous: it reads as a narrow, considered exception
 * and behaves as a blanket one.
 *
 * It is also **self-concealing**. Once the rule stops reporting for a function,
 * an explicit `set-state-in-effect` suppression inside it becomes an "unused
 * eslint-disable directive" — so the very comment that proves the rule once
 * applied there afterwards reads as though it never needed to. That is the
 * shape of the defect PR 4 found in `CardConfig`'s `Modal`, where a blatant
 * planted `setLocalConfig({})` was silent while the identical violation in a
 * fresh component in the same file reported fine.
 *
 * The pair below is the mechanism in isolation. Both fixtures are the permitted
 * imported form with a dependency-free state-writing effect — the shape the two
 * theme-workshop hooks have — and they differ **only** by the comment, so the
 * comment is the only thing either assertion can be measuring.
 *
 * Scope, deliberately narrow: `exhaustive-deps` is the only directive tested as
 * a bail trigger here. `set-state-in-effect`'s own suppression does not bail —
 * which is what makes moving a suppression to the config a fix rather than a
 * rename — and `rules-of-hooks` is untested (docs/changes/0040-test-harness-
 * reliability.md, PR 7).
 */
describe('an exhaustive-deps suppression silences the rule for its whole function', () => {
  it('reports the state write when the function carries no directive', () => {
    expect(reported.get('bail-plain')).toContain('react-hooks/set-state-in-effect')
  })

  it('does not report the same state write beside an exhaustive-deps directive', () => {
    // If this ever contains the rule, the compiler has stopped bailing on the
    // directive and the config-level suppressions can go back inline.
    expect(reported.get('bail-suppressed')).not.toContain('react-hooks/set-state-in-effect')
  })

  /*
   * The policy the mechanism above forces, pinned as a source scan rather than
   * a lint run because that is what it is: the repo suppresses `exhaustive-deps`
   * from `eslint.config.js` (two files, named there) and nowhere from a comment.
   * A new inline directive would be a silent hole in an error-level rule, and
   * the file it appeared in would still lint clean — so nothing but this would
   * report it.
   */
  it('leaves no exhaustive-deps directive anywhere under src/', () => {
    /*
     * Generated files are out of scope, and `src/routeTree.gen.ts` is the one
     * that matters: TanStack Router writes it wholesale, it opens with a blanket
     * disable, and nobody edits it — a suppression there is the generator's, not
     * an author's.
     *
     * Excluded by the `.gen.ts` suffix rather than by asking
     * `ESLint#isPathIgnored`, which was tried first and answers **false** for it.
     * The config's `ignores` entry is `'*.gen.ts'`, and a bare `*` in a flat
     * config does not cross `/`, so it never matches anything under `src/`. That
     * file is lint-clean today only because of its own blanket disable. Worth
     * knowing before someone "tidies" either: the ignore entry is inert, and the
     * disable is what is actually holding.
     */
    const sources = sourceFilesUnderSrc().filter((path) => !path.endsWith('.gen.ts'))

    // Guards against passing on an empty or truncated walk, which reads exactly
    // like a clean repo. Anchored on the two files this task is about rather
    // than on a count: a count couples the scan to repo size, and these are the
    // files whose omission would matter most.
    expect(sources).toEqual(
      expect.arrayContaining(['src/theme/tokens.stories.tsx', 'src/theme/customCss.stories.tsx'])
    )

    const offenders = sources.filter((path) =>
      suppressesRuleFromAComment(readFileSync(join(repoRoot, path), 'utf8'))
    )

    expect(offenders).toEqual([])
  })

  /*
   * The other half of the same policy, and the half the scan above cannot see.
   *
   * A source scan proves the directives are gone; it says nothing about what
   * replaced them. Turning `set-state-in-effect` off for those two files in the
   * config, or dropping the override so a future author reaches for the comment
   * again, would both leave the scan green — the files carry no directive
   * either way. So the resolved config is asserted directly, per file.
   *
   * Both halves matter and for opposite reasons: `exhaustive-deps` MUST be off
   * or the deliberate dependency-free effects warn on every run, and
   * `set-state-in-effect` MUST stay at `error` or the suppression has simply
   * moved the blind spot into the config, which is the whole thing this task
   * was about.
   */
  it.each(['src/theme/tokens.stories.tsx', 'src/theme/customCss.stories.tsx'])(
    'suppresses only exhaustive-deps for %s, and keeps set-state-in-effect at error',
    async (path) => {
      const config = (await new ESLint({ cwd: repoRoot }).calculateConfigForFile(
        join(repoRoot, path)
      )) as { rules: Record<string, unknown> }

      // ESLint normalises severities to numbers in a resolved config.
      expect(config.rules['react-hooks/exhaustive-deps']).toEqual([0])
      expect(config.rules['react-hooks/set-state-in-effect']).toEqual([2])
    }
  )

  /*
   * The claim itself, on the real files rather than on a stand-in.
   *
   * Everything above is indirect: the fixture pair proves the mechanism on a
   * synthetic component, the scan proves no directive is left, and the resolved
   * config proves the severities. None of them lints `tokens.stories.tsx`. The
   * thing actually being asserted — *these two hooks are analysable again* —
   * deserves to be asserted about them, because that is what a future author
   * reading `eslint.config.js` will take the override to mean.
   *
   * `lintText` with `filePath` resolves the real file's config and lints the
   * text handed to it, so the planted violation never touches the disk. That
   * matters beyond tidiness: `stories.test.tsx` imports both of these files, and
   * mutating them mid-run would race a parallel worker.
   *
   * Both directions, so neither half can pass vacuously: the file as it stands
   * reports nothing, and the same file with one `setState` added inside the
   * effect reports at `error`.
   */
  it.each(['src/theme/tokens.stories.tsx', 'src/theme/customCss.stories.tsx'])(
    'reports a planted state write inside %s',
    async (path) => {
      const eslint = new ESLint({ cwd: repoRoot })
      const source = readFileSync(join(repoRoot, path), 'utf8')
      const withState = source.replace(
        'const ref = useRef<HTMLDivElement>(null)',
        "const ref = useRef<HTMLDivElement>(null)\n  const [, setPlanted] = useState<string>('')"
      )
      const planted = withState.replace(
        'useEffect(() => {',
        "useEffect(() => {\n    setPlanted('planted')"
      )

      /*
       * Each anchor separately, not their combined effect. If only the
       * `useRef` one lands the file gains an unused `useState` and no write
       * inside the effect — and "the rule did not report" would then read as a
       * regression in the rule rather than as a drifted anchor, which is the
       * confusion this whole change document is about.
       */
      expect(withState).not.toBe(source)
      expect(planted).not.toBe(withState)

      const errors = async (code: string) => {
        const [result] = await eslint.lintText(code, { filePath: join(repoRoot, path) })
        return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId)
      }

      expect(await errors(source)).toEqual([])
      expect(await errors(planted)).toContain('react-hooks/set-state-in-effect')
    }
  )
})
