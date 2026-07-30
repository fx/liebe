import { describe, it, expect } from 'vitest'
import {
  CHECKOUT_PATH,
  ENV_GO2RTC_PORT,
  ENV_HA_PORT,
  ENV_PROJECT,
  PORTS_PER_STACK,
  PORT_RANGE_END,
  PORT_RANGE_START,
  PROJECT_NAME_PATTERN,
  SLOT_COUNT,
  classifyDockerProbe,
  deriveStackIdentity,
  describePortCollision,
  describeStack,
  findPortConflicts,
  describeOwnershipConflict,
  inspectProjectOwnership,
  parseProjectListing,
  probeDocker,
  resolveStackConfig,
  runStack,
  stackEnv,
} from '../../scripts/e2eStack.mjs'

// The per-checkout e2e stack (docs/changes/0040-test-harness-reliability.md,
// PR 2). Every branch here is exercised WITHOUT a docker daemon, deliberately:
// the branches that matter most are the ones that fire when there is no daemon
// to test against, and a test that needed one could only ever run where the
// failure it pins cannot happen.

const WORKTREE_A = '/workspace/liebe'
const WORKTREE_B = '/workspace/liebe/.claude/worktrees/0040b'

/** What a `docker` invocation reports back — the shape the module classifies. */
interface DockerProbe {
  status?: number | null
  stdout?: string
  stderr?: string
  error?: { code?: string }
}

/**
 * A capture stub that answers each `docker` invocation from a table, keyed by
 * its first two arguments — `compose version`, `compose ls` and `version` are
 * three different questions with three different failure modes.
 */
function fakeCapture(answers: Record<string, DockerProbe>) {
  const calls: string[][] = []
  const capture = (_command: string, args: string[]): DockerProbe => {
    calls.push(args)
    return (
      answers[args.slice(0, 2).join(' ')] ??
      answers[args[0]] ?? { status: 0, stdout: '', stderr: '' }
    )
  }
  return { capture, calls }
}

/** A daemon that answers everything, with no compose projects on the machine. */
const healthyDocker = (projects: unknown[] = []) =>
  fakeCapture({
    'compose version': { status: 0, stdout: 'Docker Compose version v2.30.0\n', stderr: '' },
    'compose ls': { status: 0, stdout: JSON.stringify(projects), stderr: '' },
    version: { status: 0, stdout: '27.3.1\n', stderr: '' },
  })

describe('deriveStackIdentity', () => {
  it('is deterministic for a path and distinct between paths', () => {
    expect(deriveStackIdentity(WORKTREE_A)).toEqual(deriveStackIdentity(WORKTREE_A))
    expect(deriveStackIdentity(WORKTREE_A).projectName).not.toBe(
      deriveStackIdentity(WORKTREE_B).projectName
    )
  })

  it('produces a project name docker compose accepts', () => {
    for (const path of [WORKTREE_A, WORKTREE_B, '/tmp/Liebe Check.Out/', '/x/....']) {
      expect(deriveStackIdentity(path).projectName).toMatch(PROJECT_NAME_PATTERN)
    }
  })

  it('names the project after the checkout directory so a human can recognise it', () => {
    expect(deriveStackIdentity(WORKTREE_B).projectName).toMatch(/^liebe-e2e-0040b-[0-9a-f]{8}$/)
  })

  it('separates two checkouts that share a directory name', () => {
    // The readable half of the name is the directory, and worktrees named after
    // the change they implement collide on it constantly — `0040b` under two
    // different parents is the ordinary case, not a contrived one. Only the
    // path hash tells them apart, so this is what the hash is FOR.
    expect(deriveStackIdentity('/workspace/a/worktrees/0040b').projectName).not.toBe(
      deriveStackIdentity('/workspace/b/worktrees/0040b').projectName
    )
  })

  it('falls back to a placeholder slug when the directory name has nothing usable', () => {
    expect(deriveStackIdentity('/srv/___').projectName).toMatch(/^liebe-e2e-checkout-[0-9a-f]{8}$/)
  })

  it('treats a trailing separator as the same checkout', () => {
    expect(deriveStackIdentity(`${WORKTREE_B}/`)).toEqual(deriveStackIdentity(WORKTREE_B))
    expect(deriveStackIdentity(`${WORKTREE_B}///`)).toEqual(deriveStackIdentity(WORKTREE_B))
  })

  it('keeps the root path addressable rather than collapsing it to an empty string', () => {
    expect(deriveStackIdentity('/').checkoutPath).toBe('/')
  })

  it('allocates a contiguous port pair inside the declared window', () => {
    for (const path of [WORKTREE_A, WORKTREE_B, '/a', '/b', '/c/d/e']) {
      const { haPort, go2rtcPort, slot } = deriveStackIdentity(path)
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(SLOT_COUNT)
      expect(haPort).toBeGreaterThanOrEqual(PORT_RANGE_START)
      // The last slot's whole block has to fit below the end of the window.
      expect(haPort + PORTS_PER_STACK - 1).toBeLessThan(PORT_RANGE_END)
      expect(go2rtcPort).toBe(haPort + 1)
    }
  })

  it('draws the port slot from a different slice of the digest than the name', () => {
    // Two checkouts that happened to share a port slot must still have
    // unrelated project names — that independence is what confines a slot
    // collision to the ports instead of letting it reach the containers.
    const identities = Array.from({ length: 400 }, (_, i) => deriveStackIdentity(`/w/${i}`))
    const names = new Set(identities.map((identity) => identity.projectName))
    expect(names.size).toBe(identities.length)
    // …and the slots really are spread rather than constant.
    expect(new Set(identities.map((identity) => identity.slot)).size).toBeGreaterThan(300)
  })
})

describe('resolveStackConfig', () => {
  it('derives the URLs the suite talks to from the derived port', () => {
    const config = resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} })
    expect(config.hassUrl).toBe(`http://127.0.0.1:${config.haPort}`)
    expect(config.browserUrl).toBe(`http://localhost:${config.haPort}`)
    expect(config.bind).toBe('127.0.0.1')
    expect(config.overridden).toEqual({ projectName: false, haPort: false, go2rtcPort: false })
  })

  it('lets the environment override the project and both ports', () => {
    const config = resolveStackConfig({
      checkoutPath: WORKTREE_B,
      env: {
        [ENV_PROJECT]: 'my_stack-1',
        [ENV_HA_PORT]: '18123',
        [ENV_GO2RTC_PORT]: '18555',
        HA_BIND: '0.0.0.0',
      },
    })
    expect(config.projectName).toBe('my_stack-1')
    expect(config.haPort).toBe(18123)
    expect(config.go2rtcPort).toBe(18555)
    expect(config.bind).toBe('0.0.0.0')
    expect(config.hassUrl).toBe('http://127.0.0.1:18123')
    expect(config.overridden).toEqual({ projectName: true, haPort: true, go2rtcPort: true })
  })

  it('honours explicit HASS_URL / HASS_BROWSER_URL over the derivation', () => {
    const config = resolveStackConfig({
      checkoutPath: WORKTREE_B,
      env: { HASS_URL: 'http://ha.test:8123', HASS_BROWSER_URL: 'http://browser.test:8123' },
    })
    expect(config.hassUrl).toBe('http://ha.test:8123')
    expect(config.browserUrl).toBe('http://browser.test:8123')
  })

  it('ignores empty overrides rather than treating them as a value', () => {
    const derived = deriveStackIdentity(WORKTREE_B)
    const config = resolveStackConfig({
      checkoutPath: WORKTREE_B,
      env: { [ENV_PROJECT]: '', [ENV_HA_PORT]: '', [ENV_GO2RTC_PORT]: '' },
    })
    expect(config.projectName).toBe(derived.projectName)
    expect(config.haPort).toBe(derived.haPort)
  })

  it.each([
    ['not a number', 'eight-thousand'],
    ['fractional', '8123.5'],
    ['out of range', '70000'],
    ['zero', '0'],
  ])('rejects a %s port override instead of silently falling back', (_label, value) => {
    // Falling back would point `up` at one instance and the tests at another —
    // the same "two things, one name" failure the whole change removes.
    expect(() =>
      resolveStackConfig({ checkoutPath: WORKTREE_B, env: { [ENV_HA_PORT]: value } })
    ).toThrow(new RegExp(`${ENV_HA_PORT}="${value.replace('.', '\\.')}"`))
  })

  it.each([
    ['both set to one port', { [ENV_HA_PORT]: '19000', [ENV_GO2RTC_PORT]: '19000' }],
    // The subtler one: overriding a single variable ONTO the other's derived
    // value. The port pre-flight cannot see it — one free port probed twice
    // answers free twice — so it would surface as a compose bind error naming
    // neither variable.
    [
      'one set onto the other’s derived port',
      { [ENV_HA_PORT]: String(deriveStackIdentity(WORKTREE_B).go2rtcPort) },
    ],
  ])('rejects %s, which cannot bind', (_label, env) => {
    expect(() => resolveStackConfig({ checkoutPath: WORKTREE_B, env })).toThrow(
      /would both publish port/
    )
  })

  it('rejects a project override docker compose would not accept', () => {
    expect(() =>
      resolveStackConfig({ checkoutPath: WORKTREE_B, env: { [ENV_PROJECT]: 'My Stack' } })
    ).toThrow(/not a valid docker compose project name/)
  })

  it('defaults to this checkout, so an import gets the stack it belongs to', () => {
    expect(resolveStackConfig().checkoutPath).toBe(CHECKOUT_PATH)
  })
})

describe('stackEnv', () => {
  it('hands compose exactly the variables ha/docker-compose.yml interpolates', () => {
    const config = resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} })
    expect(stackEnv(config)).toEqual({
      COMPOSE_PROJECT_NAME: config.projectName,
      [ENV_HA_PORT]: String(config.haPort),
      [ENV_GO2RTC_PORT]: String(config.go2rtcPort),
      HA_BIND: '127.0.0.1',
    })
  })
})

describe('classifyDockerProbe', () => {
  it('reports a healthy daemon as no fault', () => {
    expect(classifyDockerProbe({ status: 0, stdout: '27.3.1', stderr: '' })).toBeNull()
  })

  it('names a missing docker binary', () => {
    const fault = classifyDockerProbe({ error: { code: 'ENOENT' }, status: null })
    expect(fault?.cause).toBe('docker-missing')
    expect(fault?.message).toMatch(/`docker` command was not found on PATH/)
  })

  it('names an unreachable daemon and how to start it', () => {
    const fault = classifyDockerProbe({
      status: 1,
      stderr:
        'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    })
    expect(fault?.cause).toBe('docker-daemon-down')
    expect(fault?.message).toMatch(/sudo service docker start/)
  })

  it('names a permission-denied socket, not a stopped daemon', () => {
    // The real message says BOTH things: a socket the user cannot open reports
    // "permission denied" AND "Cannot connect to the Docker daemon". Reading it
    // as a stopped daemon sends someone to restart a daemon that is running.
    const fault = classifyDockerProbe({
      status: 1,
      stderr:
        'permission denied while trying to connect to the Docker daemon socket at ' +
        'unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/version": ' +
        'dial unix /var/run/docker.sock: connect: permission denied\n' +
        'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. ' +
        'Is the docker daemon running?',
    })
    expect(fault?.cause).toBe('docker-permission')
    expect(fault?.message).toMatch(/usermod -aG docker/)
    expect(fault?.message).toMatch(/sg docker -c/)
    // The socket is root-equivalent; the workaround that "works" must stay
    // named as the one not to take (AGENTS.md).
    expect(fault?.message).toMatch(/Do NOT chmod the socket/)
    expect(fault?.message).not.toMatch(/service docker start/)
  })

  it.each([
    // Docker has shipped two wordings for the same missing plugin, and they
    // share no adjacent phrase — a pattern written from one silently
    // misclassifies the other as an unrecognised failure.
    ["docker: 'compose' is not a docker command.\nSee 'docker --help'"],
    ['docker: unknown command: docker compose\n\nRun `docker --help` for more information'],
  ])('names a missing compose v2 plugin from %j', (stderr) => {
    const fault = classifyDockerProbe({ status: 125, stderr })
    expect(fault?.cause).toBe('compose-missing')
    expect(fault?.message).toMatch(/compose v2 plugin is not installed/)
  })

  it('quotes the raw output when it recognises nothing', () => {
    const fault = classifyDockerProbe({ status: 3, stderr: 'something entirely new' })
    expect(fault?.cause).toBe('docker-unknown')
    expect(fault?.message).toMatch(/exit status 3/)
    expect(fault?.message).toMatch(/something entirely new/)
  })

  it('still says something useful when a failing probe printed nothing', () => {
    expect(classifyDockerProbe({ status: 1 })?.message).toMatch(/\(no output\)/)
  })
})

describe('probeDocker', () => {
  it('asks the offline question and the daemon question, in that order', () => {
    const { capture, calls } = healthyDocker()
    expect(probeDocker({ capture, env: {} })).toBeNull()
    expect(calls).toEqual([
      ['compose', 'version'],
      ['version', '--format', '{{.Server.Version}}'],
    ])
  })

  it('stops at the compose probe when the plugin is missing', () => {
    const { capture, calls } = fakeCapture({
      'compose version': { status: 125, stderr: "docker: 'compose' is not a docker command." },
    })
    expect(probeDocker({ capture, env: {} })?.cause).toBe('compose-missing')
    expect(calls).toHaveLength(1)
  })

  it('catches a daemon fault the offline probe cannot see', () => {
    // `docker compose version` answers without touching the socket, so it is
    // green on a machine whose daemon is dead. Only the second probe can tell.
    const { capture } = fakeCapture({
      'compose version': { status: 0, stdout: 'Docker Compose version v2.30.0' },
      version: { status: 1, stderr: 'Cannot connect to the Docker daemon at unix://…' },
    })
    expect(probeDocker({ capture, env: {} })?.cause).toBe('docker-daemon-down')
  })
})

describe('findPortConflicts', () => {
  const config = resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} })

  it('reports nothing when both ports are free', async () => {
    expect(await findPortConflicts({ config, portFree: async () => true })).toEqual([])
  })

  it('names the service behind each held port', async () => {
    const conflicts = await findPortConflicts({
      config,
      portFree: async (port: number) => port !== config.go2rtcPort,
    })
    expect(conflicts).toEqual([{ service: 'go2rtc', port: config.go2rtcPort }])
  })

  it('probes each port on the configured bind address', async () => {
    const probed: Array<[number, string]> = []
    await findPortConflicts({
      config: { ...config, bind: '0.0.0.0' },
      portFree: async (port: number, host: string) => {
        probed.push([port, host])
        return true
      },
    })
    expect(probed).toEqual([
      [config.haPort, '0.0.0.0'],
      [config.go2rtcPort, '0.0.0.0'],
    ])
  })
})

describe('describePortCollision', () => {
  it('names the ports, the slot and the way out', () => {
    const config = resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} })
    const message = describePortCollision({
      config,
      conflicts: [{ service: 'homeassistant', port: config.haPort }],
    })
    expect(message).toContain(`127.0.0.1:${config.haPort}`)
    expect(message).toContain(`slot ${config.slot} of ${SLOT_COUNT}`)
    expect(message).toContain(config.projectName)
    expect(message).toContain(config.checkoutPath)
    expect(message).toContain(ENV_HA_PORT)
    expect(message).toContain(ENV_GO2RTC_PORT)
  })
})

describe('parseProjectListing', () => {
  it('reads the project list', () => {
    expect(parseProjectListing({ status: 0, stdout: '[{"Name":"a"}]' })).toEqual([{ Name: 'a' }])
  })

  it('treats an empty answer as no projects', () => {
    expect(parseProjectListing({ status: 0, stdout: '' })).toEqual([])
  })

  it.each([
    ['the command failed', { status: 1, stdout: '', stderr: 'boom' }],
    ['the output is not JSON', { status: 0, stdout: 'not json' }],
  ])('refuses to assume ownership when %s', (_label, probe) => {
    // Degrading to "assume it is ours" here would put the hole back in the one
    // place a green tick hides it.
    expect(() => parseProjectListing(probe)).toThrow(/Refusing to start rather than assuming/)
  })
})

describe('inspectProjectOwnership', () => {
  const composePath = `${WORKTREE_B}/ha/docker-compose.yml`
  const ownName = 'liebe-e2e-0040b-015d904f'

  it('recognises this checkout’s own running stack', () => {
    expect(
      inspectProjectOwnership({
        projects: [{ Name: ownName, Status: 'running(2)', ConfigFiles: composePath }],
        projectName: ownName,
        composePath,
      })
    ).toEqual({ ours: true, conflict: null })
  })

  it('does not treat this checkout’s stopped stack as holding the ports', () => {
    expect(
      inspectProjectOwnership({
        projects: [{ Name: ownName, Status: 'exited(2)', ConfigFiles: composePath }],
        projectName: ownName,
        composePath,
      })
    ).toEqual({ ours: false, conflict: null })
  })

  it('rejects a project of our name that another checkout created', () => {
    // Reachable through the documented LIEBE_E2E_PROJECT escape hatch: two
    // checkouts pointed at one project name would have compose recreate it
    // against the second's mounts, re-entering the contamination by hand.
    const result = inspectProjectOwnership({
      projects: [
        {
          Name: ownName,
          Status: 'running(2)',
          ConfigFiles: '/workspace/liebe/ha/docker-compose.yml',
        },
      ],
      projectName: ownName,
      composePath,
    })
    expect(result).toEqual({
      ours: false,
      conflict: {
        kind: 'foreign-project',
        name: ownName,
        configFiles: '/workspace/liebe/ha/docker-compose.yml',
      },
    })
  })

  it('rejects this checkout’s stack already running under a different project name', () => {
    // What an older fixed-name stack looks like after this change: two Home
    // Assistants bind-mounting one writable ha/config. The bundle-identity
    // check cannot see it, because both serve the same dist/.
    const result = inspectProjectOwnership({
      projects: [{ Name: 'ha', Status: 'running(2)', ConfigFiles: composePath }],
      projectName: ownName,
      composePath,
    })
    expect(result.conflict).toMatchObject({ kind: 'duplicate-stack', name: 'ha' })
  })

  it('ignores an unrelated project, and a stopped stray', () => {
    expect(
      inspectProjectOwnership({
        projects: [
          { Name: 'someone-else', Status: 'running(3)', ConfigFiles: '/elsewhere/compose.yml' },
          { Name: 'ha', Status: 'exited(2)', ConfigFiles: composePath },
        ],
        projectName: ownName,
        composePath,
      })
    ).toEqual({ ours: false, conflict: null })
  })

  it('compares compose files by resolved path across a multi-file project', () => {
    expect(
      inspectProjectOwnership({
        projects: [
          {
            Name: ownName,
            Status: 'running(2)',
            ConfigFiles: `/other/compose.yml, ${WORKTREE_B}/ha/../ha/docker-compose.yml`,
          },
        ],
        projectName: ownName,
        composePath,
      })
    ).toEqual({ ours: true, conflict: null })
  })
})

describe('describeOwnershipConflict', () => {
  const config = resolveStackConfig({
    checkoutPath: WORKTREE_B,
    env: { [ENV_PROJECT]: 'shared-stack' },
  })
  const composePath = `${WORKTREE_B}/ha/docker-compose.yml`

  it('points a foreign project back at the derived name', () => {
    const message = describeOwnershipConflict({
      conflict: { kind: 'foreign-project', name: 'shared-stack', configFiles: '/elsewhere.yml' },
      config,
      composePath,
    })
    expect(message).toContain('/elsewhere.yml')
    expect(message).toContain(ENV_PROJECT)
    expect(message).toContain(config.derivedProjectName)
  })

  it('gives a duplicate stack the command that stops it', () => {
    const message = describeOwnershipConflict({
      conflict: { kind: 'duplicate-stack', name: 'ha', configFiles: composePath },
      config,
      composePath,
    })
    expect(message).toContain(`docker compose -p ha -f ${composePath} down -v`)
  })
})

describe('runStack', () => {
  const base = { checkoutPath: WORKTREE_B, env: {} as Record<string, string> }

  it('starts the stack under this checkout’s project name and ports', async () => {
    const { capture, calls } = healthyDocker()
    const inherited: Array<{ args: string[]; env: Record<string, string> }> = []
    const code = await runStack({
      ...base,
      argv: ['up'],
      capture,
      portFree: async () => true,
      inherit: (_command: string, args: string[], env: Record<string, string>) => {
        inherited.push({ args, env })
        return { status: 0 }
      },
      log: () => {},
    })

    const config = resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} })
    expect(code).toBe(0)
    expect(inherited).toHaveLength(1)
    expect(inherited[0].args).toEqual([
      'compose',
      '-f',
      `${WORKTREE_B}/ha/docker-compose.yml`,
      '-p',
      config.projectName,
      'up',
      '-d',
      '--wait',
    ])
    expect(inherited[0].env).toEqual(stackEnv(config))
    // The pre-flight asks which compose projects exist before claiming a name.
    expect(calls).toContainEqual(['compose', 'ls', '--all', '--format', 'json'])
  })

  it.each([
    ['down', ['down', '-v']],
    ['logs', ['logs', '--no-color']],
  ])('runs %s against the same project', async (command, expected) => {
    const { capture } = healthyDocker()
    const inherited: string[][] = []
    const code = await runStack({
      ...base,
      argv: [command],
      capture,
      inherit: (_command: string, args: string[]) => {
        inherited.push(args)
        return { status: 0 }
      },
      log: () => {},
    })
    expect(code).toBe(0)
    expect(inherited[0].slice(-expected.length)).toEqual(expected)
  })

  it('refuses to start and names the cause when the daemon is unreachable', async () => {
    const { capture } = fakeCapture({
      'compose version': { status: 0, stdout: 'Docker Compose version v2.30.0' },
      version: {
        status: 1,
        stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.',
      },
    })
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: ['up'],
      capture,
      portFree: async () => true,
      inherit: () => {
        throw new Error('compose must not run when the daemon is unreachable')
      },
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(1)
    expect(logged.join('\n')).toMatch(/sudo service docker start/)
  })

  it('refuses to start and names the cause when the socket is unpermitted', async () => {
    const { capture } = fakeCapture({
      'compose version': { status: 0, stdout: 'Docker Compose version v2.30.0' },
      version: {
        status: 1,
        stderr:
          'permission denied while trying to connect to the Docker daemon socket at ' +
          'unix:///var/run/docker.sock',
      },
    })
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: ['up'],
      capture,
      portFree: async () => true,
      inherit: () => {
        throw new Error('compose must not run when the socket is unpermitted')
      },
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(1)
    expect(logged.join('\n')).toMatch(/sg docker -c/)
  })

  it('fails loudly on a port collision instead of sharing the instance', async () => {
    // No compose project of ours exists: whatever holds the port is not ours.
    const { capture } = healthyDocker()
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: ['up'],
      capture,
      portFree: async () => false,
      inherit: () => {
        throw new Error('compose must not run into an occupied port')
      },
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(1)
    expect(logged.join('\n')).toMatch(/already in use/)
  })

  it('starts anyway when the ports are held by this checkout’s own stack', async () => {
    // `up` on a running stack is an ordinary re-run; the ports are busy because
    // they are ours. Treating that as a collision would make the script refuse
    // to do the one thing it is for.
    const { capture } = healthyDocker([
      {
        Name: resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} }).projectName,
        Status: 'running(2)',
        ConfigFiles: `${WORKTREE_B}/ha/docker-compose.yml`,
      },
    ])
    let started = false
    const code = await runStack({
      ...base,
      argv: ['up'],
      capture,
      portFree: async () => false,
      inherit: () => {
        started = true
        return { status: 0 }
      },
      log: () => {},
    })
    expect(code).toBe(0)
    expect(started).toBe(true)
  })

  it('propagates compose’s exit status', async () => {
    const { capture } = healthyDocker()
    const code = await runStack({
      ...base,
      argv: ['down'],
      capture,
      inherit: () => ({ status: 17 }),
      log: () => {},
    })
    expect(code).toBe(17)
  })

  it('reports a compose invocation that could not be spawned at all', async () => {
    const { capture } = healthyDocker()
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: ['down'],
      capture,
      inherit: () => ({ status: null, error: { code: 'ENOENT' } }),
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(1)
    expect(logged.join('\n')).toMatch(/was not found on PATH/)
  })

  it('treats a compose run that neither failed nor reported a status as a failure', async () => {
    const { capture } = healthyDocker()
    const code = await runStack({
      ...base,
      argv: ['down'],
      capture,
      inherit: () => ({ status: null }),
      log: () => {},
    })
    expect(code).toBe(1)
  })

  it('prints the resolved stack for `env` without touching docker', async () => {
    const written: string[] = []
    const code = await runStack({
      ...base,
      argv: ['env'],
      capture: () => {
        throw new Error('env must not shell out to docker')
      },
      write: (text: string) => written.push(text),
      log: () => {},
    })
    expect(code).toBe(0)
    expect(JSON.parse(written.join(''))).toEqual(
      describeStack(resolveStackConfig({ checkoutPath: WORKTREE_B, env: {} }))
    )
  })

  it.each([['unknown'], [undefined]])('rejects the %s command with usage', async (command) => {
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: command === undefined ? [] : [command],
      capture: () => {
        throw new Error('an unknown command must not shell out to docker')
      },
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(2)
    expect(logged.join('\n')).toMatch(/up\|down\|logs\|env/)
  })

  it('reports an unusable override as a configuration error, before docker', async () => {
    const logged: string[] = []
    const code = await runStack({
      ...base,
      argv: ['up'],
      env: { [ENV_HA_PORT]: 'nope' },
      capture: () => {
        throw new Error('a bad override must be caught before docker is probed')
      },
      log: (message: string) => logged.push(message),
    })
    expect(code).toBe(1)
    expect(logged.join('\n')).toMatch(/is not a usable TCP port/)
  })
})
