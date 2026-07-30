import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ESLint } from 'eslint'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
 * The three assertions are deliberately different in kind:
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
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** A component that resets state from an effect — the pattern the rule rejects. */
function fixture(effectCall: string) {
  return `import * as React from 'react'
import * as Hooks from 'react'
import { useEffect } from 'react'

void Hooks

export function Probe() {
  const [value, setValue] = React.useState<string | null>(null)
  ${effectCall}(() => {
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
 * project is not linted the way the real sources are. Under a temp directory
 * inside the repo so the recursive `.tsx` include in `tsconfig.json` picks them
 * up, and removed afterwards so a crashed run cannot leave a file that fails
 * the gate it is testing.
 */
let fixtureDir: string

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
  fixtureDir = mkdtempSync(join(repoRoot, 'src', '__lint-fixture-'))

  const cases = [
    ['React.useEffect', join(fixtureDir, 'member.tsx')],
    ['useEffect', join(fixtureDir, 'imported.tsx')],
    // The two spellings that would slip past a ban keyed on an object literally
    // named `React` — an aliased namespace import, and computed access.
    ['Hooks.useEffect', join(fixtureDir, 'aliased.tsx')],
    ["React['useEffect']", join(fixtureDir, 'computed.tsx')],
  ] as const

  for (const [effectCall, file] of cases) writeFileSync(file, fixture(effectCall))

  // One instance, one invocation: both the config and the TypeScript program
  // are then built a single time for the whole file.
  const eslint = new ESLint({ cwd: repoRoot })
  const results = await eslint.lintFiles(cases.map(([, file]) => file))

  for (const [effectCall, file] of cases) {
    const result = results.find((r) => r.filePath === file)
    if (result === undefined) throw new Error(`no lint result for ${file}`)
    reported.set(
      effectCall,
      result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? '<fatal>')
    )
  }
}, 120_000)

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

describe('effect hooks must be called through the imported binding', () => {
  it('rejects the React.useEffect member-call form', () => {
    expect(reported.get('React.useEffect')).toContain('no-restricted-syntax')
  })

  it('reports a state-writing effect written in the imported form', () => {
    expect(reported.get('useEffect')).toContain('react-hooks/set-state-in-effect')
  })

  it('does not report the same state write when the effect is a member call', () => {
    // The blind spot itself. If this ever contains the rule, the upstream bug
    // is fixed and the `no-restricted-syntax` ban can be revisited.
    expect(reported.get('React.useEffect')).not.toContain('react-hooks/set-state-in-effect')
  })

  /*
   * The ban is keyed on the property rather than on an object named `React`,
   * because the blind spot follows the member call and not the receiver's name.
   * These two spellings are what a selector pinned to `React` would have let
   * through — and both are ordinary things to write, not contrivances: aliasing
   * a namespace import is legal and `Hooks.useEffect(...)` reads fine.
   */
  it.each(['Hooks.useEffect', "React['useEffect']"])('rejects %s too', (effectCall) => {
    expect(reported.get(effectCall)).toContain('no-restricted-syntax')
  })
})
