import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The missing-artifact branch, pointed at a path that cannot exist. */
function panelMissingForTests(): string | null {
  const missing = join(repoRoot, 'dist', 'no-such-panel.js')
  if (!existsSync(missing)) {
    if (process.env.LIEBE_REQUIRE_PANEL_ARTIFACT === '1') {
      throw new Error(`prod-bundle diet gate: ${missing} is missing`)
    }
    return null
  }
  return readFileSync(missing, 'utf8')
}

/**
 * PR 3 artifact assertion: the production panel bundle MUST NOT contain the
 * dev routes' content.
 *
 * Asserting the artifact, not the source: excluding a route from source proves
 * nothing about the file-based router, which is what puts the module into the
 * bundle. The served-vs-built identity pattern (`tests/e2e/bundleIdentity.ts`)
 * is the model — here the built artifact itself is the thing under test.
 *
 * The assertion runs against `dist/panel.js`. A missing artifact fails loudly
 * when `LIEBE_REQUIRE_PANEL_ARTIFACT=1` (set by the CI step that builds the
 * artifact before testing) and skips otherwise, so local unit runs without a
 * build stay green. Gating on bare `CI=true` would go red in CI itself: the
 * Test job runs `test:coverage` without building `dist/` (only the e2e and
 * deploy workflows run `build:ha:prod`), so the flag — not the CI environment —
 * is what says the artifact must be there. A gate that goes green when the
 * build stops producing the artifact is worse than no gate.
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

let panelCache: string | null | undefined
/**
 * The built artifact, read once: the tests share one ~1.3MB read, miss cached
 * too. Safe to cache: the flag test reads a different path
 * (`panelMissingForTests`), so a cached hit/miss here never masks it.
 */
function panel(): string | null {
  if (panelCache !== undefined) return panelCache
  panelCache = readPanel()
  return panelCache
}

function readPanel(): string | null {
  return readPanelAt(ARTIFACT)
}

/** The missing-artifact branch, directly callable with any path. */
export function readPanelAt(artifactPath: string): string | null {
  if (!existsSync(artifactPath)) {
    // Fail-closed when the flag says the artifact must exist, skip locally:
    // the CI step builds `dist/` before testing, so a missing artifact there
    // means the build stopped producing what this gate asserts about — not
    // "nothing to check". Locally, unit runs without a build stay green.
    if (process.env.LIEBE_REQUIRE_PANEL_ARTIFACT === '1') {
      throw new Error(
        `prod-bundle diet gate: ${artifactPath} is missing — the CI pipeline builds it before testing, so this means the build regressed, not that there is nothing to assert`
      )
    }
    return null
  }
  return readFileSync(artifactPath, 'utf8')
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

  it('fails loudly when the artifact is missing and the flag requires it', () => {
    const previous = process.env.LIEBE_REQUIRE_PANEL_ARTIFACT
    process.env.LIEBE_REQUIRE_PANEL_ARTIFACT = '1'
    // A path that cannot exist, without touching the real `dist/`.
    const missing = join(repoRoot, 'dist', 'no-such-panel.js')
    try {
      expect(() => readPanelAt(missing)).toThrow(/missing/)
    } finally {
      if (previous === undefined) delete process.env.LIEBE_REQUIRE_PANEL_ARTIFACT
      else process.env.LIEBE_REQUIRE_PANEL_ARTIFACT = previous
    }
  })

  it('skips a missing artifact locally (no flag)', () => {
    const previous = process.env.LIEBE_REQUIRE_PANEL_ARTIFACT
    delete process.env.LIEBE_REQUIRE_PANEL_ARTIFACT
    try {
      expect(readPanelAt(join(repoRoot, 'dist', 'no-such-panel.js'))).toBeNull()
    } finally {
      if (previous !== undefined) process.env.LIEBE_REQUIRE_PANEL_ARTIFACT = previous
    }
  })

  it('keeps the dev-only route modules render-gated in source', () => {
    for (const route of ['src/routes/test-store.tsx', 'src/routes/__root.test.performance.tsx']) {
      const source = readFileSync(join(repoRoot, route), 'utf8')
      expect(source).toContain('import.meta.env.DEV')
    }
  })
})
