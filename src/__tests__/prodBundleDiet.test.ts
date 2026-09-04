import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * PR 3 artifact assertion: the production panel bundle MUST NOT contain the
 * dev routes' content.
 *
 * Asserting the artifact, not the source: excluding a route from source proves
 * nothing about the file-based router, which is what puts the module into the
 * bundle. The served-vs-built identity pattern (`tests/e2e/bundleIdentity.ts`)
 * is the model — here the built artifact itself is the thing under test.
 *
 * The assertion runs against `dist/panel.js` when it exists (a prod build ran
 * in this checkout) and skips otherwise, so unit runs without a build stay
 * green. CI builds before testing, so the gate is live where it matters.
 *
 * What counts as "dev content" is chosen for stability, not precision:
 * - `EntityBrowser open time` — the perf harness's log line. Present in the
 *   base-tree artifact, absent after the diet. This is the gate.
 * - `Add Grid Item` — the store test page's button label. Present in base,
 *   absent after the diet. Second gate.
 * - `test-store` / `test/performance` — the route PATHS. These STAY in the
 *   artifact by design (the route modules still register; they render
 *   `NotFound` in prod), so they are asserted present, pinning the mechanism:
 *   exclusion by render-gate, not by route deletion.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARTIFACT = join(repoRoot, 'dist', 'panel.js')

function panel(): string | null {
  if (!existsSync(ARTIFACT)) return null
  return readFileSync(ARTIFACT, 'utf8')
}

describe('prod-bundle diet', () => {
  it('ships no dev-route content in panel.js', () => {
    const bundle = panel()
    if (bundle === null) return

    expect(bundle).not.toContain('EntityBrowser open time')
    expect(bundle).not.toContain('Add Grid Item')
  })

  it('keeps the dev route paths registered (render-gated, not deleted)', () => {
    const bundle = panel()
    if (bundle === null) return

    expect(bundle).toContain('test-store')
    expect(bundle).toContain('test/performance')
  })

  it('keeps the dev-only route modules render-gated in source', () => {
    for (const route of ['src/routes/test-store.tsx', 'src/routes/__root.test.performance.tsx']) {
      const source = readFileSync(join(repoRoot, route), 'utf8')
      expect(source).toContain('import.meta.env.DEV')
    }
  })
})
