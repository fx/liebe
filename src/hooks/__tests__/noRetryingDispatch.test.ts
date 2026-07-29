import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * No card may dispatch through the retrying path.
 *
 * `docs/specs/entity-cards/options/common.md` declares the dispatch guarantees
 * **"normative for every action and every embedded control, on every card"** —
 * non-retrying and at-most-once per gesture, "never routed through a retrying
 * wrapper, since retried commands press buttons twice, skip tracks, re-run
 * scripts, and repeat physical movement".
 *
 * That rule was already written, already agreed, and still violated by ten
 * cards for months (#230), because nothing checked it. Migrating the last card
 * fixes today; this fixes tomorrow. `useServiceCall` hands out both a guarded
 * dispatcher and a retrying one, and the retrying one is one autocomplete away
 * from any card that already destructures the hook — which is exactly how the
 * original violation spread.
 *
 * The check is deliberately about **invocation**, not import or destructuring.
 * A file may legitimately mention `callService` in a comment or type; what it
 * may not do is call it. Naming what is forbidden rather than enumerating who
 * is compliant is what makes this survive a card being added tomorrow.
 *
 * **What this does NOT cover**, stated so nobody reads it as more than it is:
 * a violation living inside `useServiceCall.ts` itself, which the allowlist
 * must permit for the hook to expose anything at all. That is exactly the shape
 * of #230's last remaining instance — a convenience wrapper on the hook quietly
 * routing to the retrying path while every card looked compliant. Nothing
 * structural can catch that from outside; the behavioural tests in
 * `useServiceCall.test.tsx` are what pin it, by asserting each wrapper reaches
 * the guarded path and that the retrying one is never touched.
 */

/**
 * Indirected through a parameter, as `store/__tests__/configSchema.keyCollisions.test.ts`
 * does and for the same reason: Vite rewrites a LITERAL
 * `new URL('./x', import.meta.url)` into an asset reference, which is no longer
 * a `file:` URL and cannot be read from disk.
 */
function resolve(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

const SRC = resolve('../../')

/** The dispatchers that retry. `dispatchGuarded` is the sanctioned one. */
const RETRYING = ['callService', 'callServiceWithRetry']

/**
 * Files allowed to name the retrying path.
 *
 * The service layer defines it and the hook exposes it; both are the mechanism
 * rather than a consumer of it. Tests are excluded wholesale — a test asserting
 * that the retrying path is NOT used has to be able to say its name.
 */
const ALLOWED = new Set([
  'services/hassService.ts',
  'hooks/useServiceCall.ts',
  'hooks/__tests__/noRetryingDispatch.test.ts',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Every source file that could dispatch, excluding tests and stories. */
function dispatchableFiles(): { rel: string; text: string }[] {
  return walk(SRC)
    .map((full) => ({ rel: full.slice(SRC.length), text: readFileSync(full, 'utf8') }))
    .filter(({ rel }) => !/__tests__|\.test\.|\.stories\./.test(rel))
    .filter(({ rel }) => !ALLOWED.has(rel))
}

/**
 * Call sites of a retrying dispatcher, in the two shapes a consumer can write.
 *
 *  - **bare** `callService(...)` — a card that destructured the hook;
 *  - **`hassService.callService(...)`** — a card that imported the service
 *    singleton and skipped the hook entirely. Named specifically rather than as
 *    any `.callService(`, because the latter would flag the service layer
 *    calling itself; `hassService` is the only receiver a consumer can reach,
 *    and the file that defines it is on the allowlist.
 */
function retryingCallSites(text: string): string[] {
  const hits: string[] = []
  const patterns = RETRYING.flatMap((name) => [
    { name, re: new RegExp(String.raw`(^|[^\w.])${name}\s*\(`) },
    { name: `hassService.${name}`, re: new RegExp(String.raw`hassService\s*\.\s*${name}\s*\(`) },
  ])

  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue
    /*
     * One hit per offending LINE, not per matching pattern. `hassService .
     * callService(` satisfies both the qualified pattern and the bare one —
     * the space before the method makes it look bare — and reporting it twice
     * would overstate the count in the failure message for a single violation.
     */
    const matched = patterns.find(({ re }) => re.test(line))
    if (matched) hits.push(`${matched.name}: ${line.trim().slice(0, 80)}`)
  }
  return hits
}

describe('the dispatch contract', () => {
  it('has files to check', () => {
    // A guard that silently examined nothing would pass forever.
    const files = dispatchableFiles()
    expect(files.length).toBeGreaterThan(50)
    expect(files.some(({ rel }) => rel.startsWith('components/'))).toBe(true)
  })

  it('is not violated by any card or component', () => {
    const offenders = dispatchableFiles()
      .map(({ rel, text }) => ({ rel, hits: retryingCallSites(text) }))
      .filter(({ hits }) => hits.length > 0)

    const report = offenders
      .map(({ rel, hits }) => `  ${rel}\n${hits.map((h) => `    ${h}`).join('\n')}`)
      .join('\n\n')

    expect(
      offenders,
      `\n\nThese dispatch through the RETRYING path, which the dispatch guarantees forbid\n` +
        `for every embedded control on every card. Use \`dispatchGuarded\` instead:\n\n${report}\n`
    ).toEqual([])
  })

  it('detects a violation when one exists', () => {
    // The guard itself, exercised — a checker nobody has seen fail is a checker
    // nobody knows works.
    expect(retryingCallSites('const x = callService({ domain: "lock" })')).toHaveLength(1)
    expect(retryingCallSites('await callServiceWithRetry(options)')).toHaveLength(1)
  })

  it('detects a component reaching the service singleton directly', () => {
    // The second shape: skip the hook, import `hassService`, call the retrying
    // method on it. The bare-invocation pattern alone does not see this.
    expect(retryingCallSites('await hassService.callService(options)')).toHaveLength(1)
    expect(retryingCallSites('void hassService . callService( options )')).toHaveLength(1)
  })

  it('does not flag the guarded dispatcher or an unrelated mention', () => {
    expect(retryingCallSites('await dispatchGuarded({ domain: "lock" })')).toEqual([])
    // A comment explaining the rule is not a violation of it.
    expect(retryingCallSites('// callService(x) retries; do not use it here')).toEqual([])
    expect(retryingCallSites(' * `callService` retries three times.')).toEqual([])
  })
})
