import { ensureOnboarded, HASS_URL } from '../../scripts/onboard.mjs'

// Runs once before the suite: wait for HA to be reachable, then onboard it (or
// confirm it is already onboarded). Doing onboarding here avoids a race between
// parallel tests all trying to create the first user.
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      const res = await fetch(`${HASS_URL}/manifest.json`)
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
}
