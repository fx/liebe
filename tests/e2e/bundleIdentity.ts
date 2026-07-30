import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

// Bundle identity for the e2e harness: proves that the panel artifacts Home
// Assistant is SERVING are byte-identical to the ones this checkout BUILT.
//
// Why this exists: the local stack is one fixed compose project per machine, so
// its `../dist` bind mount points at whichever worktree last ran `up`. Two
// checkouts running e2e silently serve each other's build, and a contaminated
// run looks exactly like a clean one — this repo has already published a green
// 9/9 that executed entirely against another branch's code. A test that fails
// because the served artifact lacks the feature is indistinguishable from a
// mutation being caught, so a mismatch must INVALIDATE the run rather than be
// scored by it (AGENTS.md, "Probing a test" rule 4).
//
// The whole mounted tree is hashed, not only `module_url`'s bundle: the same rule
// warns that `panel.js` is byte-identical for a CSS-only change, so a check
// guarded on that one hash is unguarded for exactly the probes that motivated it.
// `panel.js` links `liebe.css` into the shadow root and resolves weather
// backgrounds and fonts off the same base URL (`src/panel.ts`), so all of them
// are artifacts under test.
//
// The check is deliberately HTTP-only: asserting mount sources with
// `docker inspect` would be unavailable in exactly the environment where the
// contamination happened, since the runner there cannot reach the docker socket
// without `sudo`. Hashing what the server returns needs no privileges and is
// conclusive on its own. Its one blind spot follows from that: HTTP offers no
// directory listing, so an artifact the served mount has and `dist/` does not is
// invisible here.
//
// Lives outside a `*.spec.ts` so every branch is unit-testable from tests/unit
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

/**
 * Served path of the compose bind mount `../dist:/config/www/dist:ro` — Home
 * Assistant publishes `/config/www/*` as `/local/*`. The mount contract itself is
 * asserted in tests/e2e/panel-loads.spec.ts.
 */
export const MOUNT_SERVED_PREFIX = '/local/dist/'
const MOUNT_LOCAL_DIR = 'dist'

const REBUILD_HINT =
  'Rebuild and recreate the stack from this checkout: ' +
  'npm run build:ha:prod && npm run e2e:ha:down && npm run e2e:ha:up'

/** Where `module_url` says the bundle comes from, once recognised. */
export type BundleSource =
  /** The allowlisted dev server: nothing to compare against. */
  | { kind: 'dev-server'; url: string }
  /** The bundle compose mounts from `dist/`, served by HA under /local/dist/. */
  | { kind: 'mounted'; url: string; distFile: string; origin: string }

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
  /**
   * The origin the BROWSER loads the panel from. A relative `module_url` resolves
   * against it, so it — not the server-to-server `HASS_URL` — identifies the
   * artifacts actually under test when the two differ (a reverse proxy, a remote
   * instance; see `scripts/onboard.mjs`).
   */
  origin: string
  fetchImpl?: BundleFetch
  /** The directory the stack mounts. Defaults to this checkout's `dist/`. */
  localDir?: string
  /** Artifact paths relative to `localDir`, e.g. `['panel.js', 'fonts/x.woff2']`. */
  listLocalArtifacts?: () => Promise<string[]>
  readLocalArtifact?: (relativePath: string) => Promise<Uint8Array>
  log?: (message: string) => void
}

export type BundleIdentityResult =
  | { checked: false; reason: 'dev-server'; url: string }
  | { checked: true; url: string; distFile: string; sha256: string; artifacts: number }

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
export function classifyBundleUrl(moduleUrl: string, origin: string): BundleSource {
  if ((DEV_SERVER_BUNDLE_URLS as readonly string[]).includes(moduleUrl)) {
    return { kind: 'dev-server', url: moduleUrl }
  }

  const pattern = new RegExp(`^${MOUNT_SERVED_PREFIX}([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*)$`)
  const distFile = pattern.exec(moduleUrl)?.[1]
  const trimmedOrigin = origin.replace(/\/$/, '')
  if (distFile !== undefined && !distFile.split('/').includes('..')) {
    return { kind: 'mounted', url: `${trimmedOrigin}${moduleUrl}`, distFile, origin: trimmedOrigin }
  }

  throw new Error(
    `E2E bundle identity check cannot verify module_url "${moduleUrl}". It is neither the ` +
      `mounted bundle (${MOUNT_SERVED_PREFIX}<file>) nor the allowlisted dev server ` +
      `(${DEV_SERVER_BUNDLE_URLS.join(' or ')}), so the harness cannot tell whose build Home ` +
      `Assistant would serve. Failing closed: an unverifiable bundle is how a run passes ` +
      `against another checkout's code. Point module_url at ${MOUNT_SERVED_PREFIX}panel.js, or ` +
      `add this endpoint to DEV_SERVER_BUNDLE_URLS if it is genuinely exempt.`
  )
}

interface ArtifactMismatch {
  relativePath: string
  url: string
  served?: { sha256: string; bytes: number }
  status?: number
  built: { sha256: string; bytes: number }
}

/**
 * Hash every artifact of the mounted build — served and built — and require them
 * to be equal. Throws naming BOTH hashes of every artifact that differs: the
 * digests are the evidence that the run would have been measured against foreign
 * code.
 */
export async function assertServedArtifactsMatchDist({
  moduleUrl,
  origin,
  fetchImpl = (url, init) => fetch(url, init),
  localDir = repoPath(MOUNT_LOCAL_DIR),
  listLocalArtifacts = () => listFiles(localDir),
  readLocalArtifact = (relativePath) => readFile(join(localDir, relativePath)),
  log = (message) => console.error('[bundle-identity]', message),
}: BundleIdentityOptions): Promise<BundleIdentityResult> {
  const source = classifyBundleUrl(moduleUrl, origin)
  if (source.kind === 'dev-server') {
    log(`skipped: module_url ${source.url} is the allowlisted dev server, which has no dist/ twin`)
    return { checked: false, reason: 'dev-server', url: source.url }
  }

  const artifacts = await listLocalArtifacts()
  if (!artifacts.includes(source.distFile)) {
    throw new Error(
      `E2E bundle identity check cannot find the built bundle ` +
        `${MOUNT_LOCAL_DIR}/${source.distFile}, which module_url points at. Build it first: ` +
        `npm run build:ha:prod`
    )
  }

  const mismatches: ArtifactMismatch[] = []
  let bundleHash = ''

  for (const relativePath of artifacts) {
    const url = `${source.origin}${MOUNT_SERVED_PREFIX}${relativePath}`
    const built = await readLocalArtifact(relativePath)
    const builtDigest = { sha256: sha256(built), bytes: built.byteLength }
    if (relativePath === source.distFile) bundleHash = builtDigest.sha256

    const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      mismatches.push({ relativePath, url, status: res.status, built: builtDigest })
      continue
    }
    const servedBytes = new Uint8Array(await res.arrayBuffer())
    const servedDigest = { sha256: sha256(servedBytes), bytes: servedBytes.byteLength }
    if (servedDigest.sha256 !== builtDigest.sha256) {
      mismatches.push({ relativePath, url, served: servedDigest, built: builtDigest })
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `E2E bundle identity check FAILED: Home Assistant is serving ${mismatches.length} of ` +
        `${artifacts.length} panel artifact(s) that are not the ones this checkout built, so ` +
        `every result in this run would be measured against foreign code.\n` +
        mismatches.map(describeMismatch).join('\n') +
        `\nThe stack is almost certainly mounting another worktree's ${MOUNT_LOCAL_DIR}/. ` +
        REBUILD_HINT
    )
  }

  log(
    `ok: all ${artifacts.length} served artifacts match ${MOUNT_LOCAL_DIR}/ ` +
      `(${source.distFile} is sha256 ${bundleHash})`
  )
  return {
    checked: true,
    url: source.url,
    distFile: source.distFile,
    sha256: bundleHash,
    artifacts: artifacts.length,
  }
}

function describeMismatch({ relativePath, url, served, status, built }: ArtifactMismatch): string {
  const servedLine =
    served === undefined
      ? `    served ${url} answered HTTP ${status} — the mount does not have this file`
      : `    served ${url}\n      sha256 ${served.sha256} (${served.bytes} bytes)`
  return (
    `  ${MOUNT_LOCAL_DIR}/${relativePath}\n` +
    `${servedLine}\n` +
    `    built  ${MOUNT_LOCAL_DIR}/${relativePath}\n` +
    `      sha256 ${built.sha256} (${built.bytes} bytes)`
  )
}

/** Every file under `dir`, as paths relative to it, sorted for determinism. */
async function listFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch (cause) {
    throw new Error(
      `E2E bundle identity check cannot read ${dir}, the directory the e2e stack mounts. ` +
        `Build it first: npm run build:ha:prod`,
      { cause }
    )
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort()
}
