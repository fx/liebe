#!/usr/bin/env node
// Per-checkout Home Assistant e2e stack: derives the compose project name and
// the published ports from the absolute path of the checkout that runs it, and
// refuses to start when the docker daemon is unreachable, unpermitted, or
// missing its compose plugin.
//
// Why this exists: `docker compose -f ha/docker-compose.yml up` resolves to one
// fixed project per machine, so its `../dist` and `./config` bind mounts point
// at whichever worktree last ran `up`. Two checkouts running e2e concurrently
// silently serve each other's panel bundle and Home Assistant configuration —
// this repo has already published a green 9/9 that executed entirely against
// another branch's code (docs/changes/0040-test-harness-reliability.md). Naming
// the project after the checkout gives every worktree its own containers,
// volumes and mounts, so the runs no longer meet. The bundle-identity check in
// tests/e2e/bundleIdentity.ts stays as the fail-closed backstop.
//
// Two derivations, two different guarantees, and the difference matters:
//   - The PROJECT NAME carries 32 bits of the path's sha256, so distinct
//     checkouts effectively never share one. Containers and mounts cannot
//     collide.
//   - The PORTS come from a bounded 5000-slot space, so two checkouts CAN land
//     on the same slot. That collision is made loud rather than silent: `up`
//     refuses to start on a port something else already holds, names the slot
//     and offers the override. Sharing a port would mean sharing an instance,
//     which is the failure this whole change removes.
//
// Usable two ways, same arrangement as scripts/onboard.mjs:
//   1. CLI:    `node scripts/e2eStack.mjs up|down|logs|env`
//   2. Import: playwright.config.ts and scripts/onboard.mjs read the derived
//              port so the suite talks to the stack this checkout started.

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** This checkout's root — the directory whose path every derivation keys on. */
export const CHECKOUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const COMPOSE_FILE = 'ha/docker-compose.yml'

/**
 * The port window the stacks draw from. Below the Linux ephemeral range
 * (32768+) so a derived port is never handed out to an outbound connection
 * first, and above the privileged range so no stack needs root.
 */
export const PORT_RANGE_START = 20000
export const PORT_RANGE_END = 30000
/** Home Assistant, then go2rtc's WebRTC media port. */
export const PORTS_PER_STACK = 2
export const SLOT_COUNT = (PORT_RANGE_END - PORT_RANGE_START) / PORTS_PER_STACK

/** Compose's own constraint on a project name (compose v2). */
export const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Compose reads these out of the environment (ha/docker-compose.yml). They are
 * also the documented manual override: set one and this module hands it through
 * unchanged, which is how a port collision gets resolved.
 */
export const ENV_PROJECT = 'LIEBE_E2E_PROJECT'
export const ENV_HA_PORT = 'LIEBE_E2E_HA_PORT'
export const ENV_GO2RTC_PORT = 'LIEBE_E2E_GO2RTC_PORT'

/**
 * @typedef {{ error?: { code?: string }, status?: number | null, stdout?: string,
 *   stderr?: string }} DockerProbe
 * @typedef {(command: string, args: string[], env: Record<string, string>) => DockerProbe} Capture
 * @typedef {{ status?: number | null, error?: { code?: string } }} Spawned
 * @typedef {{ checkoutPath: string, slug: string, hash: string, slot: number,
 *   projectName: string, haPort: number, go2rtcPort: number }} StackIdentity
 * @typedef {StackIdentity & { derivedProjectName: string, bind: string, hassUrl: string,
 *   browserUrl: string,
 *   overridden: { projectName: boolean, haPort: boolean, go2rtcPort: boolean } }} StackConfig
 */

/** Turn a path's last segment into something compose will accept in a name. */
function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '')
  return slug || 'checkout'
}

/**
 * Derive the stack's identity from a checkout path. Pure and deterministic: the
 * same path always yields the same project and ports, so `up`, `down`, `logs`
 * and the Playwright run all address the same containers without any state on
 * disk to get out of sync.
 *
 * The project name and the port slot read DIFFERENT slices of the digest, so
 * neither derivation can be inferred from the other — two checkouts sharing a
 * port slot still have unrelated project names, which is what keeps the
 * collision confined to the ports.
 *
 * @param {string} checkoutPath
 * @returns {StackIdentity}
 */
export function deriveStackIdentity(checkoutPath) {
  // Normalise only the trailing separator: on Linux the rest of the path is
  // case- and byte-significant, and two paths differing anywhere else really
  // are two checkouts.
  const normalized = checkoutPath.replace(/\/+$/, '') || '/'
  const digest = createHash('sha256').update(normalized).digest('hex')
  const hash = digest.slice(0, 8)
  const slot = parseInt(digest.slice(8, 16), 16) % SLOT_COUNT
  const haPort = PORT_RANGE_START + slot * PORTS_PER_STACK
  const slug = slugify(basename(normalized))
  return {
    checkoutPath: normalized,
    slug,
    hash,
    slot,
    projectName: `liebe-e2e-${slug}-${hash}`,
    haPort,
    go2rtcPort: haPort + 1,
  }
}

function readPortOverride(env, name) {
  const raw = env[name]
  if (raw === undefined || raw === '') return undefined
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name}="${raw}" is not a usable TCP port. Set it to an integer between 1 and 65535, ` +
        `or unset it to use the port derived from this checkout's path.`
    )
  }
  return port
}

/**
 * The derived identity with environment overrides applied, plus the URLs the
 * suite talks to. Throws on an unusable override rather than falling back to
 * the derived value: silently ignoring an override would point `up` at one
 * instance and the tests at another.
 *
 * @param {{ checkoutPath?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {StackConfig}
 */
export function resolveStackConfig({ checkoutPath = CHECKOUT_PATH, env = process.env } = {}) {
  const derived = deriveStackIdentity(checkoutPath)

  const projectOverride = env[ENV_PROJECT]
  if (projectOverride !== undefined && projectOverride !== '') {
    if (!PROJECT_NAME_PATTERN.test(projectOverride)) {
      throw new Error(
        `${ENV_PROJECT}="${projectOverride}" is not a valid docker compose project name. ` +
          `It must match ${PROJECT_NAME_PATTERN} — lowercase letters, digits, dashes and ` +
          `underscores, starting with a letter or digit.`
      )
    }
  }

  const haPort = readPortOverride(env, ENV_HA_PORT) ?? derived.haPort
  const go2rtcPort = readPortOverride(env, ENV_GO2RTC_PORT) ?? derived.go2rtcPort
  // Reachable by overriding one port onto the other's derived value, not only
  // by setting both the same. The pre-flight cannot see it — one free port
  // probed twice answers free twice — so it would surface as a compose bind
  // error naming neither variable.
  if (haPort === go2rtcPort) {
    throw new Error(
      `Home Assistant and go2rtc would both publish port ${haPort}, which cannot bind. ` +
        `Check ${ENV_HA_PORT} and ${ENV_GO2RTC_PORT}: they must differ from each other, and ` +
        `an override of one has to clear the other's derived port too.`
    )
  }
  const projectName = projectOverride || derived.projectName
  const bind = env.HA_BIND || '127.0.0.1'

  return {
    ...derived,
    projectName,
    /** What the path alone would have chosen, for messages about an override. */
    derivedProjectName: derived.projectName,
    haPort,
    go2rtcPort,
    bind,
    overridden: {
      projectName: projectName !== derived.projectName,
      haPort: haPort !== derived.haPort,
      go2rtcPort: go2rtcPort !== derived.go2rtcPort,
    },
    // Server-to-server probes go to the loopback address; the browser gets the
    // hostname the auth codes are bound to (scripts/onboard.mjs).
    hassUrl: env.HASS_URL || `http://127.0.0.1:${haPort}`,
    browserUrl: env.HASS_BROWSER_URL || `http://localhost:${haPort}`,
  }
}

/**
 * The environment `docker compose` interpolates ha/docker-compose.yml with.
 *
 * @param {StackConfig} config
 * @returns {Record<string, string>}
 */
export function stackEnv(config) {
  return {
    COMPOSE_PROJECT_NAME: config.projectName,
    [ENV_HA_PORT]: String(config.haPort),
    [ENV_GO2RTC_PORT]: String(config.go2rtcPort),
    HA_BIND: config.bind,
  }
}

/**
 * What went wrong when the `docker` probe did not answer, as a cause the caller
 * can print. Returns `null` when the daemon answered.
 *
 * The order of the branches is load-bearing: a socket the user cannot open
 * reports BOTH "permission denied" and "Cannot connect to the Docker daemon",
 * so testing for the daemon first would tell someone whose daemon is running
 * perfectly well to start it.
 *
 * @param {DockerProbe} probe
 * @returns {{ cause: string, message: string } | null}
 */
export function classifyDockerProbe({ error, status, stderr = '' } = {}) {
  if (error && error.code === 'ENOENT') {
    return {
      cause: 'docker-missing',
      message:
        'The `docker` command was not found on PATH, so the e2e stack cannot be started. ' +
        'Install Docker Engine (with the compose v2 plugin) and try again.',
    }
  }
  if (status === 0) return null

  const text = `${stderr}`.trim()
  if (/permission denied/i.test(text) && /docker/i.test(text)) {
    return {
      cause: 'docker-permission',
      message:
        'The docker daemon refused the connection: permission denied on its socket. The ' +
        'invoking user is not in the `docker` group. Add it once:\n' +
        '  sudo usermod -aG docker "$USER"\n' +
        'That takes effect on the next login, so wrap commands in already-running shells:\n' +
        "  sg docker -c 'npm run e2e:ha:up'\n" +
        'Do NOT chmod the socket: /var/run/docker.sock is root-equivalent, and widening it ' +
        'trades a two-word prefix for a real privilege change.',
    }
  }
  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(text)) {
    return {
      cause: 'docker-daemon-down',
      message:
        'The docker daemon is not reachable, so the e2e stack cannot be started. A fresh ' +
        'workspace often has no daemon running yet:\n' +
        '  sudo service docker start',
    }
  }
  // Two spellings in the wild for the same missing plugin, and they share no
  // adjacent phrase: `docker: 'compose' is not a docker command.` and
  // `docker: unknown command: docker compose`.
  if (/is not a docker command|unknown (docker )?command/i.test(text)) {
    return {
      cause: 'compose-missing',
      message:
        'The docker CLI has no `compose` subcommand: the compose v2 plugin is not installed. ' +
        'Install docker-compose-plugin (compose v1 `docker-compose` is not supported here).',
    }
  }
  return {
    cause: 'docker-unknown',
    message:
      `The docker probe failed with exit status ${status} and an unrecognised error, so the ` +
      `e2e stack was not started. Raw output:\n${text || '(no output)'}`,
  }
}

/** True when nothing is listening on `host:port`. */
export function isPortFree(port, host) {
  return new Promise((resolvePromise) => {
    const server = createServer()
    server.once('error', () => resolvePromise(false))
    server.once('listening', () => server.close(() => resolvePromise(true)))
    server.listen({ port, host, exclusive: true })
  })
}

/**
 * Which of the stack's ports something else already holds. Checked before `up`
 * so a slot collision surfaces as this message rather than as a compose bind
 * error that names a port and not a reason.
 *
 * Only the TCP side is probed; go2rtc also publishes UDP on the same number,
 * and a UDP-only holder still fails loudly — at compose, one layer later.
 *
 * @param {{ config: StackConfig, portFree?: (port: number, host: string) => Promise<boolean> }} options
 * @returns {Promise<{ service: string, port: number }[]>}
 */
export async function findPortConflicts({ config, portFree = isPortFree }) {
  const conflicts = []
  for (const [service, port] of [
    ['homeassistant', config.haPort],
    ['go2rtc', config.go2rtcPort],
  ]) {
    if (!(await portFree(port, config.bind))) conflicts.push({ service, port })
  }
  return conflicts
}

/**
 * The message a port collision exits with. Names the cause and the way out.
 *
 * @param {{ config: StackConfig, conflicts: { service: string, port: number }[] }} options
 * @returns {string}
 */
export function describePortCollision({ config, conflicts }) {
  const held = conflicts.map(({ service, port }) => `  ${service} → ${config.bind}:${port}`)
  return (
    `The e2e stack cannot start: ${conflicts.length} of its published port(s) are already in ` +
    `use by something that is not this checkout's stack.\n` +
    held.join('\n') +
    `\n\nThis checkout (${config.checkoutPath}) derives project ${config.projectName} and port ` +
    `slot ${config.slot} of ${SLOT_COUNT}. The project name carries 32 bits of the path hash and ` +
    `is effectively unique, but the port slot is not: another checkout can hash to the same ` +
    `slot, and an unrelated service can simply be listening there. Refusing to start rather ` +
    `than sharing — two checkouts on one instance is the contamination this stack exists to ` +
    `prevent (docs/changes/0040-test-harness-reliability.md).\n\n` +
    `Either stop what holds the port, or pick your own:\n` +
    `  ${ENV_HA_PORT}=<port> ${ENV_GO2RTC_PORT}=<port> npm run e2e:ha:up\n` +
    `and export the same values for the test run so it talks to that instance.`
  )
}

/**
 * Ask the docker CLI two separate questions, because they have two separate
 * failure modes and only one of them mentions the daemon:
 *   - `docker compose version` answers offline, so it isolates a missing binary
 *     and a missing compose v2 plugin.
 *   - `docker version` has to reach the daemon, so it is the one that reports an
 *     unreachable socket or a permission-denied one.
 *
 * Returns the first fault found, or `null` when both answered.
 *
 * @param {{ capture: Capture, env: Record<string, string> }} options
 * @returns {{ cause: string, message: string } | null}
 */
export function probeDocker({ capture, env }) {
  const composeProbe = capture('docker', ['compose', 'version'], env)
  const composeFault = classifyDockerProbe(composeProbe)
  if (composeFault) return composeFault
  return classifyDockerProbe(capture('docker', ['version', '--format', '{{.Server.Version}}'], env))
}

/** Run a command, capturing output. Injected in tests. */
function execCapture(command, args, env) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}

/** Run a command with the caller's stdio. Injected in tests. */
function execInherit(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return { status: result.status, error: result.error }
}

const COMMANDS = {
  up: ['up', '-d', '--wait'],
  down: ['down', '-v'],
  logs: ['logs', '--no-color'],
}

/**
 * Parse `docker compose ls --all --format json`. Throws rather than degrading:
 * this listing is what proves the project about to be started is this
 * checkout's, and skipping the proof when it is unavailable would put the hole
 * back exactly where a green tick hides it.
 *
 * @param {DockerProbe} probe
 * @returns {{ Name?: string, Status?: string, ConfigFiles?: string }[]}
 */
export function parseProjectListing({ status, stdout = '', stderr = '' } = {}) {
  if (status !== 0) {
    throw new Error(
      `Could not list docker compose projects (\`docker compose ls\` exited ${status}), so the ` +
        `e2e stack cannot confirm that the project it is about to start belongs to this ` +
        `checkout. Refusing to start rather than assuming.\n${`${stderr}`.trim() || '(no output)'}`
    )
  }
  let parsed
  try {
    parsed = JSON.parse(stdout || '[]')
  } catch (cause) {
    throw new Error(
      `Could not parse \`docker compose ls --format json\` output, so the e2e stack cannot ` +
        `confirm project ownership. Refusing to start rather than assuming.`,
      { cause }
    )
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `\`docker compose ls --format json\` returned ${typeof parsed} rather than a list of ` +
        `projects, so the e2e stack cannot confirm project ownership. Refusing to start rather ` +
        `than assuming there are none.`
    )
  }
  return parsed
}

/**
 * Compose states that release a project's containers, ports and mounts. Every
 * other state — running, paused, restarting, removing, or one this does not
 * recognise — still owns them, so the predicate is written as "not released"
 * rather than "running": an unrecognised status must count as active, or the
 * stack it belongs to becomes invisible to the ownership check.
 */
const RELEASED_STATES = new Set(['exited', 'created', 'dead'])

const holdsResources = (entry) => {
  const states = `${entry.Status ?? ''}`.match(/[a-z]+/gi) ?? []
  return states.length === 0 || states.some((state) => !RELEASED_STATES.has(state.toLowerCase()))
}
const usesComposeFile = (entry, composePath) =>
  `${entry.ConfigFiles ?? ''}`
    .split(',')
    .map((file) => resolve(file.trim()))
    .includes(composePath)

/**
 * Decide whether an existing compose project is this checkout's, and catch the
 * two ways it can fail to be. Both are reachable despite the path derivation:
 *
 *   - **A foreign project under our name.** `LIEBE_E2E_PROJECT` is documented, so
 *     two checkouts can be pointed at one project by hand. Compose would then
 *     recreate that project against the second checkout's mounts, and both
 *     suites would address one instance — the contamination, re-entered through
 *     the escape hatch.
 *   - **This checkout's stack running under a DIFFERENT project name.** Upgrading
 *     across this change leaves the old fixed-name project up; starting the new
 *     one gives two Home Assistants bind-mounting one writable `ha/config`, so
 *     they share `.storage` and the recorder database. The bundle-identity check
 *     cannot see that: both serve the same `dist/`.
 *
 * @param {{ projects: { Name?: string, Status?: string, ConfigFiles?: string }[],
 *   projectName: string, composePath: string }} options
 */
export function inspectProjectOwnership({ projects, projectName, composePath }) {
  const named = projects.find((entry) => entry.Name === projectName)
  if (named && !usesComposeFile(named, composePath)) {
    return {
      ours: false,
      conflict: { kind: 'foreign-project', name: projectName, configFiles: named.ConfigFiles },
    }
  }

  const strays = projects.filter(
    (entry) =>
      entry.Name !== projectName && holdsResources(entry) && usesComposeFile(entry, composePath)
  )
  if (strays.length > 0) {
    return {
      ours: false,
      conflict: {
        kind: 'duplicate-stack',
        name: strays[0].Name,
        configFiles: strays[0].ConfigFiles,
      },
    }
  }

  return { ours: Boolean(named && holdsResources(named)), conflict: null }
}

/**
 * Quote a value for a shell command a human is expected to paste back. A
 * checkout path may legally contain a space, and an unquoted one turns the
 * recovery command in the message below into a command that does not run — the
 * one place a message must be right, since it is offered as the way out.
 *
 * @param {string} value
 */
export function shellQuote(value) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/** The message an ownership conflict exits with. */
export function describeOwnershipConflict({ conflict, config, composePath }) {
  if (conflict.kind === 'foreign-project') {
    return (
      `Compose project "${conflict.name}" already exists and was created from ` +
      `${conflict.configFiles}, not from this checkout's ${composePath}. Starting it would ` +
      `recreate another checkout's stack against this one's mounts, and both suites would then ` +
      `address one instance — the contamination the per-checkout stack exists to prevent.\n` +
      `${ENV_PROJECT} is almost certainly set to a name another checkout also uses. Unset it to ` +
      `use this checkout's derived name (${config.derivedProjectName}), or pick one nobody else has.`
    )
  }
  return (
    `A stack for this checkout is already running under compose project "${conflict.name}", ` +
    `which is not the project this checkout now uses (${config.projectName}). That is what an ` +
    `older fixed-name stack looks like after this change. Starting a second one would give two ` +
    `Home Assistants bind-mounting one writable ha/config, sharing .storage and the recorder ` +
    `database — and the bundle-identity check cannot see it, because both serve the same dist/.\n` +
    `Stop the old one first:\n` +
    `  docker compose -p ${shellQuote(conflict.name)} -f ${shellQuote(composePath)} down -v`
  )
}

/**
 * The CLI, with every side effect injected so each branch is testable without a
 * docker daemon — which is the point: the branches that matter are the ones
 * that fire when there is no daemon to test against.
 *
 * Resolves to the process exit code.
 *
 * @param {{
 *   argv?: string[],
 *   env?: Record<string, string | undefined>,
 *   checkoutPath?: string,
 *   capture?: Capture,
 *   inherit?: (command: string, args: string[], env: Record<string, string>) => Spawned,
 *   portFree?: (port: number, host: string) => Promise<boolean>,
 *   log?: (message: string) => void,
 *   write?: (text: string) => void,
 * }} [options]
 * @returns {Promise<number>}
 */
export async function runStack({
  argv = [],
  env = process.env,
  checkoutPath = CHECKOUT_PATH,
  capture = execCapture,
  inherit = execInherit,
  portFree = isPortFree,
  log = (message) => console.error('[e2e-stack]', message),
  write = (text) => process.stdout.write(text),
} = {}) {
  const command = argv[0]
  if (command !== 'env' && !(command in COMMANDS)) {
    log(`Unknown command "${command ?? ''}". Usage: e2eStack.mjs up|down|logs|env`)
    return 2
  }

  let config
  try {
    config = resolveStackConfig({ checkoutPath, env })
  } catch (thrown) {
    log(thrown.message)
    return 1
  }

  if (command === 'env') {
    write(`${JSON.stringify(describeStack(config), null, 2)}\n`)
    return 0
  }

  const composeEnv = stackEnv(config)
  const fault = probeDocker({ capture, env: composeEnv })
  if (fault) {
    log(fault.message)
    return 1
  }

  // Absolute rather than relative, so compose resolves the file and its bind
  // mounts identically whatever the caller's cwd is — and so the path can be
  // compared against what `docker compose ls` reports for existing projects.
  const composePath = resolve(checkoutPath, COMPOSE_FILE)

  if (command === 'up') {
    let ownership
    try {
      ownership = inspectProjectOwnership({
        projects: parseProjectListing(
          capture('docker', ['compose', 'ls', '--all', '--format', 'json'], composeEnv)
        ),
        projectName: config.projectName,
        composePath,
      })
    } catch (thrown) {
      log(thrown.message)
      return 1
    }
    if (ownership.conflict) {
      log(describeOwnershipConflict({ conflict: ownership.conflict, config, composePath }))
      return 1
    }
    // An already-running stack of OUR project legitimately holds these ports;
    // only a foreign holder is a collision.
    if (!ownership.ours) {
      const conflicts = await findPortConflicts({ config, portFree })
      if (conflicts.length > 0) {
        log(describePortCollision({ config, conflicts }))
        return 1
      }
    }
    log(
      `project ${config.projectName} → Home Assistant on ${config.bind}:${config.haPort}, ` +
        `go2rtc on ${config.bind}:${config.go2rtcPort} (derived from ${config.checkoutPath})`
    )
  }

  const run = inherit(
    'docker',
    ['compose', '-f', composePath, '-p', config.projectName, ...COMMANDS[command]],
    composeEnv
  )
  if (run.error) {
    log(classifyDockerProbe({ error: run.error, status: run.status }).message)
    return 1
  }
  return run.status ?? 1
}

/**
 * The resolved stack as plain data — what `e2eStack.mjs env` prints.
 *
 * @param {StackConfig} config
 */
export function describeStack(config) {
  return {
    checkoutPath: config.checkoutPath,
    projectName: config.projectName,
    slot: config.slot,
    slotCount: SLOT_COUNT,
    bind: config.bind,
    haPort: config.haPort,
    go2rtcPort: config.go2rtcPort,
    hassUrl: config.hassUrl,
    browserUrl: config.browserUrl,
    overridden: config.overridden,
  }
}

// Run only when executed directly (not when imported), compared via
// pathToFileURL so relative or special-character argv paths resolve correctly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStack({ argv: process.argv.slice(2) }).then((code) => {
    process.exitCode = code
  })
}
