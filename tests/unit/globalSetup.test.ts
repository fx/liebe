import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The e2e global setup's wiring. The check itself is covered in
// bundleIdentity.test.ts; what this file pins is that global setup actually
// CALLS it and lets it abort the run — a gate nothing invokes is the same
// silent pass the gate exists to prevent.

const ensureOnboarded = vi.fn()
const assertServedArtifactsMatchDist = vi.fn()
const readPanelModuleUrl = vi.fn(() => '/local/dist/panel.js')

// The two origins are deliberately different: server-to-server probes go to
// HASS_URL, while the browser resolves the relative module_url against
// BROWSER_URL, so only the latter identifies the artifacts under test.
vi.mock('../../scripts/onboard.mjs', () => ({
  HASS_URL: 'http://ha.test:8123',
  BROWSER_URL: 'http://browser.test:8123',
  ensureOnboarded: () => ensureOnboarded(),
}))

vi.mock('../e2e/bundleIdentity', () => ({
  readPanelModuleUrl: () => readPanelModuleUrl(),
  assertServedArtifactsMatchDist: (options: unknown) => assertServedArtifactsMatchDist(options),
}))

const { default: globalSetup } = await import('../e2e/global-setup')

describe('e2e global setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Home Assistant answers the reachability probe immediately.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gates the suite on the artifacts the browser will load', async () => {
    assertServedArtifactsMatchDist.mockResolvedValue({ checked: true })

    await globalSetup()

    expect(ensureOnboarded).toHaveBeenCalled()
    // The reachability probe belongs to the server-to-server origin...
    expect(fetch).toHaveBeenCalledWith('http://ha.test:8123/manifest.json', expect.anything())
    // ...and the identity check to the one Playwright opens.
    expect(assertServedArtifactsMatchDist).toHaveBeenCalledWith({
      moduleUrl: '/local/dist/panel.js',
      origin: 'http://browser.test:8123',
    })
  })

  it('aborts the run when the served bundle is not the one this checkout built', async () => {
    assertServedArtifactsMatchDist.mockRejectedValue(new Error('bundle identity check FAILED'))

    await expect(globalSetup()).rejects.toThrow('bundle identity check FAILED')
  })
})
