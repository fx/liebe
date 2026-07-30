import { ensureOnboarded, HASS_URL } from '../../scripts/onboard.mjs'
import { assertServedBundleMatchesDist, readPanelModuleUrl } from './bundleIdentity'

// Runs once before the suite: wait for HA to be reachable, onboard it (or
// confirm it is already onboarded), then prove the instance is serving THIS
// checkout's bundle. Doing onboarding here avoids a race between parallel tests
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
  // checkout's panel.js, every assertion below measures foreign code and a
  // failure is indistinguishable from a real one. Throwing here aborts the run
  // instead of scoring it.
  await assertServedBundleMatchesDist({ moduleUrl: readPanelModuleUrl(), hassUrl: HASS_URL })
}
