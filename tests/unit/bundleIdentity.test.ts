import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import {
  DEV_SERVER_BUNDLE_URLS,
  assertServedBundleMatchesDist,
  classifyBundleUrl,
  readPanelModuleUrl,
  type BundleFetch,
} from '../e2e/bundleIdentity'

// The e2e harness's bundle-identity gate. Lives outside tests/e2e's
// Playwright-only exclusion so both of its branches are provable without
// bringing the shared Home Assistant stack up: the allowlisted dev-server URL
// skips, and EVERY other non-mounted URL fails closed. A gate that skipped on an
// unrecognised URL would re-admit the contamination it exists to catch.

const HASS_URL = 'http://127.0.0.1:8123'
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

/** A fetch that serves fixed bytes, so a test can serve a bundle nobody built. */
function serving(body: string, init: { ok?: boolean; status?: number } = {}) {
  const impl: BundleFetch = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    arrayBuffer: async () => {
      const view = bytes(body)
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    },
  }))
  return impl
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
    expect(classifyBundleUrl(MOUNTED_URL, HASS_URL)).toEqual({
      kind: 'mounted',
      url: `${HASS_URL}/local/dist/panel.js`,
      distFile: 'panel.js',
    })
  })

  it('resolves a nested mounted bundle', () => {
    expect(classifyBundleUrl('/local/dist/assets/panel.js', HASS_URL)).toEqual({
      kind: 'mounted',
      url: `${HASS_URL}/local/dist/assets/panel.js`,
      distFile: 'assets/panel.js',
    })
  })

  it('does not double the slash when hassUrl carries a trailing one', () => {
    expect(classifyBundleUrl(MOUNTED_URL, 'http://127.0.0.1:8123/')).toMatchObject({
      url: `${HASS_URL}/local/dist/panel.js`,
    })
  })

  // Spelled out rather than driven off DEV_SERVER_BUNDLE_URLS: a case list
  // derived from the constant under test deletes itself when an entry is
  // dropped, so it would report 21 green tests instead of a failure.
  it.each(['http://localhost:3000/panel.js', 'http://127.0.0.1:3000/panel.js'])(
    'exempts the allowlisted dev server %s',
    (url) => {
      expect(classifyBundleUrl(url, HASS_URL)).toEqual({ kind: 'dev-server', url })
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
    expect(() => classifyBundleUrl(moduleUrl, HASS_URL)).toThrow(/cannot verify module_url/)
  })
})

describe('assertServedBundleMatchesDist', () => {
  it('passes when the served bundle is byte-identical to dist/', async () => {
    const fetchImpl = serving('panel-bundle-v1')
    const log = vi.fn()

    await expect(
      assertServedBundleMatchesDist({
        moduleUrl: MOUNTED_URL,
        hassUrl: HASS_URL,
        fetchImpl,
        readLocalBundle: async () => bytes('panel-bundle-v1'),
        log,
      })
    ).resolves.toEqual({
      checked: true,
      url: `${HASS_URL}/local/dist/panel.js`,
      distFile: 'panel.js',
      sha256: sha256('panel-bundle-v1'),
      bytes: bytes('panel-bundle-v1').byteLength,
    })

    expect(fetchImpl).toHaveBeenCalledWith(`${HASS_URL}/local/dist/panel.js`, {
      signal: expect.any(AbortSignal),
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining(sha256('panel-bundle-v1')))
  })

  it('throws naming BOTH hashes when the served bundle is a stale one', async () => {
    // The contamination this gate exists to catch: HA serves another worktree's
    // build while dist/ holds ours. The two digests are the evidence that every
    // result in the run would have been measured against foreign code.
    const servedBody = 'panel-bundle-from-another-worktree'
    const builtBody = 'panel-bundle-this-checkout-just-built'

    const error = await rejectionOf(
      assertServedBundleMatchesDist({
        moduleUrl: MOUNTED_URL,
        hassUrl: HASS_URL,
        fetchImpl: serving(servedBody),
        readLocalBundle: async () => bytes(builtBody),
        log: vi.fn(),
      })
    )

    expect(error.message).toContain('bundle identity check FAILED')
    expect(error.message).toContain(sha256(servedBody))
    expect(error.message).toContain(sha256(builtBody))
    expect(error.message).toContain(`${HASS_URL}/local/dist/panel.js`)
    expect(error.message).toContain('dist/panel.js')
  })

  it('skips the allowlisted dev server without fetching anything', async () => {
    const fetchImpl = serving('irrelevant')
    const readLocalBundle = vi.fn()
    const log = vi.fn()

    await expect(
      assertServedBundleMatchesDist({
        moduleUrl: 'http://localhost:3000/panel.js',
        hassUrl: HASS_URL,
        fetchImpl,
        readLocalBundle,
        log,
      })
    ).resolves.toEqual({
      checked: false,
      reason: 'dev-server',
      url: 'http://localhost:3000/panel.js',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readLocalBundle).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
  })

  it('fails closed on an unrecognised module_url instead of skipping it', async () => {
    const fetchImpl = serving('irrelevant')
    const readLocalBundle = vi.fn()

    await expect(
      assertServedBundleMatchesDist({
        moduleUrl: 'https://fx.github.io/liebe/panel.js',
        hassUrl: HASS_URL,
        fetchImpl,
        readLocalBundle,
        log: vi.fn(),
      })
    ).rejects.toThrow(/cannot verify module_url/)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readLocalBundle).not.toHaveBeenCalled()
  })

  it('throws when Home Assistant does not serve the mounted bundle at all', async () => {
    await expect(
      assertServedBundleMatchesDist({
        moduleUrl: MOUNTED_URL,
        hassUrl: HASS_URL,
        fetchImpl: serving('', { ok: false, status: 404 }),
        readLocalBundle: async () => bytes('built'),
        log: vi.fn(),
      })
    ).rejects.toThrow(/could not fetch the served bundle .* \(HTTP 404\)/)
  })

  it('names the build command when the bundle module_url points at was never built', async () => {
    // Exercises the DEFAULT reader against the repo's own dist/, with a filename
    // that cannot exist there.
    const error = await rejectionOf(
      assertServedBundleMatchesDist({
        moduleUrl: '/local/dist/panel-never-built.js',
        hassUrl: HASS_URL,
        fetchImpl: serving('served'),
        log: vi.fn(),
      })
    )

    expect(error.message).toMatch(
      /cannot read the built bundle dist\/panel-never-built\.js.*build:ha:prod/s
    )
    // The cause must be a missing file — not a path/URL resolution failure
    // dressed up in the same message.
    expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOENT')
  })
})
