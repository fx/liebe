import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import {
  DEV_SERVER_BUNDLE_URLS,
  assertServedArtifactsMatchDist,
  classifyBundleUrl,
  readPanelModuleUrl,
  type BundleFetch,
} from '../e2e/bundleIdentity'

// The e2e harness's bundle-identity gate. Lives outside tests/e2e's
// Playwright-only exclusion so every branch is provable without bringing the
// shared Home Assistant stack up: the allowlisted dev-server URL skips, EVERY
// other non-mounted URL fails closed, and a divergence in any served artifact —
// not only module_url's bundle — is fatal. A gate that skipped on an unrecognised
// URL, or that watched panel.js alone, would re-admit the contamination it exists
// to catch.

const ORIGIN = 'http://localhost:8123'
const MOUNTED_URL = '/local/dist/panel.js'
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const bytes = (text: string) => new TextEncoder().encode(text)

/** Resolves with the thrown Error, and fails the test if nothing was thrown. */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(Error)
    return thrown as Error
  }
  throw new Error('expected the bundle identity check to reject, but it resolved')
}

/**
 * A stack serving the given bodies per `/local/dist/` path, so a test can serve
 * artifacts nobody built. A path mapped to `null` answers 404.
 */
function serving(bodies: Record<string, string | null>) {
  const impl: BundleFetch = vi.fn(async (url: string) => {
    const path = url.replace(`${ORIGIN}/local/dist/`, '')
    const body = bodies[path]
    if (body === undefined || body === null) {
      return {
        ok: false,
        status: body === null ? 404 : 500,
        arrayBuffer: async () => new ArrayBuffer(0),
      }
    }
    const view = bytes(body)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer,
    }
  })
  return impl
}

/** A `dist/` holding the given bodies. */
function built(bodies: Record<string, string>) {
  return {
    listLocalArtifacts: async () => Object.keys(bodies).sort(),
    readLocalArtifact: async (path: string) => bytes(bodies[path]),
  }
}

describe('readPanelModuleUrl', () => {
  it('reads the module_url the e2e stack is actually configured with', () => {
    // Parsed rather than hardcoded: the harness must keep one source of truth
    // about where the bundle lives.
    expect(readPanelModuleUrl()).toBe(MOUNTED_URL)
  })

  it('throws when configuration.yaml declares no panel_custom module_url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liebe-bundle-identity-'))
    const file = join(dir, 'configuration.yaml')
    writeFileSync(file, 'frontend:\ndemo:\n')
    expect(() => readPanelModuleUrl(file)).toThrow(/Could not read panel_custom\[0\]\.module_url/)
  })
})

describe('classifyBundleUrl', () => {
  it('resolves the mounted bundle to its served URL and its dist/ file', () => {
    expect(classifyBundleUrl(MOUNTED_URL, ORIGIN)).toEqual({
      kind: 'mounted',
      url: `${ORIGIN}/local/dist/panel.js`,
      distFile: 'panel.js',
      origin: ORIGIN,
    })
  })

  it('resolves a nested mounted bundle', () => {
    expect(classifyBundleUrl('/local/dist/assets/panel.js', ORIGIN)).toMatchObject({
      kind: 'mounted',
      url: `${ORIGIN}/local/dist/assets/panel.js`,
      distFile: 'assets/panel.js',
    })
  })

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(classifyBundleUrl(MOUNTED_URL, 'http://localhost:8123/')).toMatchObject({
      url: `${ORIGIN}/local/dist/panel.js`,
      origin: ORIGIN,
    })
  })

  // Spelled out rather than driven off DEV_SERVER_BUNDLE_URLS: a case list
  // derived from the constant under test deletes itself when an entry is
  // dropped, so it would report green tests instead of a failure.
  it.each(['http://localhost:3000/panel.js', 'http://127.0.0.1:3000/panel.js'])(
    'exempts the allowlisted dev server %s',
    (url) => {
      expect(classifyBundleUrl(url, ORIGIN)).toEqual({ kind: 'dev-server', url })
    }
  )

  it('exempts nothing beyond the two dev-server spellings', () => {
    // Widening the exemption is what would silently reopen the hole, so it has
    // to be a deliberate act that shows up as a failing test.
    expect([...DEV_SERVER_BUNDLE_URLS]).toEqual([
      'http://localhost:3000/panel.js',
      'http://127.0.0.1:3000/panel.js',
    ])
  })

  // Fail closed. Each of these is "not the mounted bundle" exactly as the dev
  // server is, which is why the exemption has to be an allowlist: skipping on
  // "not mounted" would wave all of them through with a green tick.
  it.each([
    ['a foreign host', 'http://192.168.1.50:8123/local/dist/panel.js'],
    ['the dev server on another port', 'http://localhost:3001/panel.js'],
    ['a dev-server URL with a different path', 'http://localhost:3000/dist/panel.js'],
    ['a stale mount path', '/local/dist-old/panel.js'],
    ['a bundle outside the mount', '/local/panel.js'],
    ['a remote bundle', 'https://fx.github.io/liebe/panel.js'],
    ['a traversal out of the mount', '/local/dist/../../etc/passwd'],
    ['a query-string variant', '/local/dist/panel.js?v=2'],
    ['an empty module_url', ''],
  ])('fails closed on %s', (_label, moduleUrl) => {
    expect(() => classifyBundleUrl(moduleUrl, ORIGIN)).toThrow(/cannot verify module_url/)
  })
})

describe('assertServedArtifactsMatchDist', () => {
  const clean = { 'panel.js': 'bundle-v1', 'liebe.css': 'styles-v1', 'fonts/a.woff2': 'font-v1' }

  it('passes when every served artifact is byte-identical to dist/', async () => {
    const fetchImpl = serving(clean)
    const log = vi.fn()

    await expect(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        fetchImpl,
        ...built(clean),
        log,
      })
    ).resolves.toEqual({
      checked: true,
      url: `${ORIGIN}/local/dist/panel.js`,
      distFile: 'panel.js',
      sha256: sha256('bundle-v1'),
      artifacts: 3,
    })

    // Every artifact is hashed, not only module_url's bundle.
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    for (const path of Object.keys(clean)) {
      expect(fetchImpl).toHaveBeenCalledWith(`${ORIGIN}/local/dist/${path}`, {
        signal: expect.any(AbortSignal),
      })
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining(sha256('bundle-v1')))
  })

  it('throws naming BOTH hashes when the served bundle is a stale one', async () => {
    // The contamination this gate exists to catch: HA serves another worktree's
    // build while dist/ holds ours. The two digests are the evidence that every
    // result in the run would have been measured against foreign code.
    const error = await rejectionOf(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        fetchImpl: serving({ ...clean, 'panel.js': 'bundle-from-another-worktree' }),
        ...built(clean),
        log: vi.fn(),
      })
    )

    expect(error.message).toContain('bundle identity check FAILED')
    expect(error.message).toContain(sha256('bundle-from-another-worktree'))
    expect(error.message).toContain(sha256('bundle-v1'))
    expect(error.message).toContain(`${ORIGIN}/local/dist/panel.js`)
    expect(error.message).toContain('dist/panel.js')
  })

  it('catches a divergence in a served artifact panel.js cannot reveal', async () => {
    // AGENTS.md's artifact-identity rule names this case: panel.js is
    // byte-identical for a CSS-only change, so a check watching only the bundle
    // is unguarded for exactly the probes that motivated it.
    const error = await rejectionOf(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        fetchImpl: serving({ ...clean, 'liebe.css': 'styles-from-another-worktree' }),
        ...built(clean),
        log: vi.fn(),
      })
    )

    expect(error.message).toContain('1 of 3 panel artifact(s)')
    expect(error.message).toContain('dist/liebe.css')
    expect(error.message).toContain(sha256('styles-from-another-worktree'))
    expect(error.message).toContain(sha256('styles-v1'))
    // The bundle itself matched, so its hash has no business in the report.
    expect(error.message).not.toContain(sha256('bundle-v1'))
  })

  it('reports every diverging artifact, not just the first', async () => {
    const error = await rejectionOf(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        fetchImpl: serving({ 'panel.js': 'other', 'liebe.css': 'other', 'fonts/a.woff2': 'other' }),
        ...built(clean),
        log: vi.fn(),
      })
    )

    expect(error.message).toContain('3 of 3 panel artifact(s)')
    expect(error.message).toContain('dist/fonts/a.woff2')
  })

  it('treats an artifact the mount does not serve as a mismatch', async () => {
    const error = await rejectionOf(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        fetchImpl: serving({ ...clean, 'liebe.css': null }),
        ...built(clean),
        log: vi.fn(),
      })
    )

    expect(error.message).toContain('answered HTTP 404')
    expect(error.message).toContain('dist/liebe.css')
    expect(error.message).toContain(sha256('styles-v1'))
  })

  it('skips the allowlisted dev server without fetching or reading anything', async () => {
    const fetchImpl = serving(clean)
    const listLocalArtifacts = vi.fn()
    const log = vi.fn()

    await expect(
      assertServedArtifactsMatchDist({
        moduleUrl: 'http://localhost:3000/panel.js',
        origin: ORIGIN,
        fetchImpl,
        listLocalArtifacts,
        log,
      })
    ).resolves.toEqual({
      checked: false,
      reason: 'dev-server',
      url: 'http://localhost:3000/panel.js',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(listLocalArtifacts).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
  })

  it('fails closed on an unrecognised module_url instead of skipping it', async () => {
    const fetchImpl = serving(clean)
    const listLocalArtifacts = vi.fn()

    await expect(
      assertServedArtifactsMatchDist({
        moduleUrl: 'https://fx.github.io/liebe/panel.js',
        origin: ORIGIN,
        fetchImpl,
        listLocalArtifacts,
        log: vi.fn(),
      })
    ).rejects.toThrow(/cannot verify module_url/)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(listLocalArtifacts).not.toHaveBeenCalled()
  })

  it('names the build command when module_url points at a bundle dist/ does not hold', async () => {
    await expect(
      assertServedArtifactsMatchDist({
        moduleUrl: '/local/dist/panel-never-built.js',
        origin: ORIGIN,
        fetchImpl: serving(clean),
        ...built(clean),
        log: vi.fn(),
      })
    ).rejects.toThrow(/cannot find the built bundle dist\/panel-never-built\.js.*build:ha:prod/s)
  })

  it('walks a real mount directory through its default readers', async () => {
    // The defaults are what run in CI, and they are the part injection hides:
    // this exercises the recursive listing and the on-disk reads against a real
    // directory tree. A nested file must be enumerated too, or whole subtrees
    // (fonts/, weather-backgrounds/) go unchecked while the gate reports green.
    const dir = mkdtempSync(join(tmpdir(), 'liebe-dist-'))
    mkdirSync(join(dir, 'fonts'))
    writeFileSync(join(dir, 'panel.js'), 'bundle-v1')
    writeFileSync(join(dir, 'liebe.css'), 'styles-v1')
    writeFileSync(join(dir, 'fonts/a.woff2'), 'font-v1')

    const seen: string[] = []
    const fetchImpl = serving(clean)

    const result = await assertServedArtifactsMatchDist({
      moduleUrl: MOUNTED_URL,
      origin: ORIGIN,
      localDir: dir,
      fetchImpl: (url, init) => {
        seen.push(url.replace(`${ORIGIN}/local/dist/`, ''))
        return fetchImpl(url, init)
      },
      log: vi.fn(),
    })

    expect(result).toMatchObject({ checked: true, artifacts: 3, sha256: sha256('bundle-v1') })
    expect(seen).toEqual(['fonts/a.woff2', 'liebe.css', 'panel.js'])
  })

  it('names the build command when the mount directory does not exist', async () => {
    const error = await rejectionOf(
      assertServedArtifactsMatchDist({
        moduleUrl: MOUNTED_URL,
        origin: ORIGIN,
        localDir: join(tmpdir(), 'liebe-dist-never-built'),
        fetchImpl: serving(clean),
        log: vi.fn(),
      })
    )

    expect(error.message).toMatch(/cannot read .*liebe-dist-never-built.*build:ha:prod/s)
    expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOENT')
  })
})
