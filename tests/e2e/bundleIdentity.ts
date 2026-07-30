import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

// Bundle identity for the e2e harness: proves that the panel bundle Home
// Assistant is SERVING is byte-identical to the one this checkout BUILT.
//
// Why this exists: the local stack is one fixed compose project per machine, so
// its `../dist` bind mount points at whichever worktree last ran `up`. Two
// checkouts running e2e silently serve each other's bundle, and a contaminated
// run looks exactly like a clean one — this repo has already published a green
// 9/9 that executed entirely against another branch's code. A test that fails
// because the served bundle lacks the feature is indistinguishable from a
// mutation being caught, so a mismatch must INVALIDATE the run rather than be
// scored by it (AGENTS.md, "Probing a test" rule 4).
//
// The check is deliberately HTTP-only: asserting mount sources with
// `docker inspect` would be unavailable in exactly the environment where the
// contamination happened, since the runner there cannot reach the docker socket
// without `sudo`. Hashing what the server returns needs no privileges and is
// conclusive on its own.
//
// Lives outside a `*.spec.ts` so the logic is unit-testable from tests/unit
// without Playwright and without bringing the stack up — same arrangement as
// safeStringify.ts.

/**
 * The ONLY bundle URLs exempt from the check, both spellings of the one
 * documented dev-server endpoint (AGENTS.md, "Development Setup"). Pointing e2e
 * at the live-rebuilding dev server is a legitimate workflow whose bundle
 * honestly differs from `dist/`.
 *
 * This is an allowlist rather than "anything that is not the mounted bundle" on
 * purpose: a stale path, a foreign host or an unexpectedly remote bundle is also
 * "not the mounted bundle", and skipping on that basis would re-admit the exact
 * contamination this check exists to catch — silently, with a green tick.
 */
export const DEV_SERVER_BUNDLE_URLS = [
  'http://localhost:3000/panel.js',
  'http://127.0.0.1:3000/panel.js',
] as const

const REBUILD_HINT =
  'Rebuild and recreate the stack from this checkout: ' +
  'npm run build:ha:prod && npm run e2e:ha:down && npm run e2e:ha:up'

/** Where `module_url` says the bundle comes from, once recognised. */
export type BundleSource =
  /** The allowlisted dev server: nothing to compare against. */
  | { kind: 'dev-server'; url: string }
  /** The bundle compose mounts from `dist/`, served by HA under /local/dist/. */
  | { kind: 'mounted'; url: string; distFile: string }

/** A response shape narrow enough that a unit test can hand one over. */
export interface BundleResponse {
  ok: boolean
  status: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export type BundleFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<BundleResponse>

export interface BundleIdentityOptions {
  /** `panel_custom[0].module_url` from ha/config/configuration.yaml. */
  moduleUrl: string
  /** Origin the harness reaches Home Assistant on, e.g. http://127.0.0.1:8123. */
  hassUrl: string
  fetchImpl?: BundleFetch
  readLocalBundle?: (distFile: string) => Promise<Uint8Array>
  log?: (message: string) => void
}

export type BundleIdentityResult =
  | { checked: false; reason: 'dev-server'; url: string }
  | { checked: true; url: string; distFile: string; sha256: string; bytes: number }

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

// Repo-relative paths, resolved as plain filesystem paths. Two reasons not to
// use the `new URL(<path>, import.meta.url)` form the e2e specs use:
//   - node:fs rejects a URL object minted by jsdom's URL implementation ("The
//     URL must be of scheme file"), and jsdom is what the unit tests run under.
//   - Vite REWRITES that expression into an asset reference, so under Vitest a
//     static path becomes a dev-server URL and a template literal with a dynamic
//     segment resolves to `undefined` — silently reading the wrong file.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoPath = (relative: string): string => resolve(REPO_ROOT, relative)

/**
 * Read the module_url the e2e stack's Home Assistant is configured with. Parsed
 * from configuration.yaml rather than hardcoded, so the harness keeps one source
 * of truth about where the bundle lives (tests/e2e/panel-loads.spec.ts parses
 * the same file for its own parity assertion).
 */
export function readPanelModuleUrl(
  configPath: string = repoPath('ha/config/configuration.yaml')
): string {
  const parsed = load(readFileSync(configPath, 'utf8')) as {
    panel_custom?: Array<{ module_url?: string }>
  }
  const moduleUrl = parsed.panel_custom?.[0]?.module_url
  if (!moduleUrl) {
    throw new Error(
      `Could not read panel_custom[0].module_url from ${configPath}. The e2e bundle identity ` +
        `check needs it to know which bundle Home Assistant serves.`
    )
  }
  return moduleUrl
}

/**
 * Classify a `module_url`, or throw. Fails CLOSED: anything that is neither the
 * mounted bundle nor an allowlisted dev-server URL is rejected rather than
 * skipped.
 */
export function classifyBundleUrl(moduleUrl: string, hassUrl: string): BundleSource {
  if ((DEV_SERVER_BUNDLE_URLS as readonly string[]).includes(moduleUrl)) {
    return { kind: 'dev-server', url: moduleUrl }
  }

  const distFile = /^\/local\/dist\/([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/.exec(moduleUrl)?.[1]
  if (distFile !== undefined && !distFile.split('/').includes('..')) {
    return { kind: 'mounted', url: `${hassUrl.replace(/\/$/, '')}${moduleUrl}`, distFile }
  }

  throw new Error(
    `E2E bundle identity check cannot verify module_url "${moduleUrl}". It is neither the ` +
      `mounted bundle (/local/dist/<file>) nor the allowlisted dev server ` +
      `(${DEV_SERVER_BUNDLE_URLS.join(' or ')}), so the harness cannot tell whose bundle Home ` +
      `Assistant would serve. Failing closed: an unverifiable bundle is how a run passes ` +
      `against another checkout's code. Point module_url at /local/dist/panel.js, or add this ` +
      `endpoint to DEV_SERVER_BUNDLE_URLS if it is genuinely exempt.`
  )
}

/**
 * Hash the served bundle and the built one and require them to be equal. Throws
 * naming BOTH hashes on a mismatch — the two digests are the evidence that the
 * run would have been measured against foreign code.
 */
export async function assertServedBundleMatchesDist({
  moduleUrl,
  hassUrl,
  fetchImpl = (url, init) => fetch(url, init),
  readLocalBundle = defaultReadLocalBundle,
  log = (message) => console.error('[bundle-identity]', message),
}: BundleIdentityOptions): Promise<BundleIdentityResult> {
  const source = classifyBundleUrl(moduleUrl, hassUrl)
  if (source.kind === 'dev-server') {
    log(`skipped: module_url ${source.url} is the allowlisted dev server, which has no dist/ twin`)
    return { checked: false, reason: 'dev-server', url: source.url }
  }

  const res = await fetchImpl(source.url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    throw new Error(
      `E2E bundle identity check could not fetch the served bundle ${source.url} ` +
        `(HTTP ${res.status}). Home Assistant is not serving the mounted bundle at all — ` +
        `rebuild and recreate the stack from this checkout: ${REBUILD_HINT}`
    )
  }
  const servedBytes = new Uint8Array(await res.arrayBuffer())
  const localBytes = await readLocalBundle(source.distFile)

  const served = sha256(servedBytes)
  const local = sha256(localBytes)
  if (served !== local) {
    throw new Error(
      `E2E bundle identity check FAILED: Home Assistant is serving a different panel bundle ` +
        `than this checkout built, so every result in this run would be measured against ` +
        `foreign code.\n` +
        `  served ${source.url}\n` +
        `    sha256 ${served} (${servedBytes.byteLength} bytes)\n` +
        `  built  dist/${source.distFile}\n` +
        `    sha256 ${local} (${localBytes.byteLength} bytes)\n` +
        `The stack is almost certainly mounting another worktree's dist/. ${REBUILD_HINT}`
    )
  }

  log(`ok: ${source.url} and dist/${source.distFile} are both sha256 ${served}`)
  return {
    checked: true,
    url: source.url,
    distFile: source.distFile,
    sha256: served,
    bytes: servedBytes.byteLength,
  }
}

async function defaultReadLocalBundle(distFile: string): Promise<Uint8Array> {
  try {
    return await readFile(repoPath(`dist/${distFile}`))
  } catch (cause) {
    throw new Error(
      `E2E bundle identity check cannot read the built bundle dist/${distFile}, which ` +
        `module_url points at. Build it first: npm run build:ha:prod`,
      { cause }
    )
  }
}
