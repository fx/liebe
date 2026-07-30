import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ESLint } from 'eslint'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
}: {
  call: string
  prelude?: string
  imports?: string
}) {
  return `import * as React from 'react'
import * as Hooks from 'react'
${imports ? `import { ${imports} } from 'react'\n` : ''}
void Hooks
${prelude}

export function Probe() {
  const [value, setValue] = React.useState<string | null>(null)
  ${call}(() => {
    setValue(null)
  }, [])
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
 * gate scans, which is handled three ways rather than trusting cleanup: the
 * path is a fixed name listed in `eslint.config.js`'s `ignores` and in
 * `.prettierignore`, it is removed before it is written as well as after, and
 * the run below opts itself back in with `ignore: false`. A run killed between
 * the write and the cleanup then costs nothing — without that, the next
 * `npm run lint` fails on files that are in nobody's diff, which is a
 * genuinely awful thing to debug.
 */
const fixtureDir = join(repoRoot, 'src', '__lint-fixture__')

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
  rmSync(fixtureDir, { recursive: true, force: true })
  mkdirSync(fixtureDir, { recursive: true })

  /*
   * Keyed by an id rather than by the call text, because the same call text now
   * appears under different hooks. Every hook gets all three core forms; the
   * exotic spellings that were each a real review finding are exercised on
   * `useEffect`, since they test the selector's shape rather than its hook set.
   */
  const cases: { id: string; file: string; call: string; prelude?: string; imports?: string }[] =
    EFFECT_HOOKS.flatMap((hook) => [
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
  rmSync(fixtureDir, { recursive: true, force: true })
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
