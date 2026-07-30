import { ensureOnboarded, BROWSER_URL, HASS_URL } from '../../scripts/onboard.mjs'
import { assertServedArtifactsMatchDist, readPanelModuleUrl } from './bundleIdentity'

// Runs once before the suite: wait for HA to be reachable, onboard it (or
// confirm it is already onboarded), then prove the instance is serving THIS
// checkout's build. Doing onboarding here avoids a race between parallel tests
// all trying to create the first user.
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      // Per-attempt timeout so a stalled connection can't consume the whole
      // 120s deadline in a single hung fetch.
      const res = await fetch(`${HASS_URL}/manifest.json`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (res.ok) break
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Home Assistant not reachable at ${HASS_URL}. Start it first: npm run e2e:ha:up`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  await ensureOnboarded()

  // Gate the whole suite on bundle identity: if HA is serving another
  // checkout's build, every assertion below measures foreign code and a failure
  // is indistinguishable from a real one. Throwing here aborts the run instead
  // of scoring it. BROWSER_URL rather than HASS_URL: the browser resolves the
  // relative module_url against the origin PLAYWRIGHT loads, so that is the
  // origin whose artifacts are under test when the two differ.
  await assertServedArtifactsMatchDist({ moduleUrl: readPanelModuleUrl(), origin: BROWSER_URL })
}
