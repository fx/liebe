import { test, expect } from '@playwright/test'
import { openPanel, seedConfig, flagSwitchChecked, setFlag, E2E_FLAG } from './helpers'

test('card reacts to an external state change without reload', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedConfig())

  // Start from a known off state and confirm the switch reflects it.
  await setFlag(accessToken, false)
  await expect.poll(() => flagSwitchChecked(page), { timeout: 15_000 }).toBe('false')

  // Flip the entity via REST (an "external" change) — no page reload.
  await setFlag(accessToken, true)

  // The card must update purely from the websocket state push.
  await expect.poll(() => flagSwitchChecked(page), { timeout: 15_000 }).toBe('true')

  // Sanity: the panel's in-memory hass agrees.
  const state = await page.evaluate((id) => {
    const panel = (
      window as unknown as {
        __liebePanel?: { _hass?: { states?: Record<string, { state: string } | undefined> } }
      }
    ).__liebePanel
    return panel?._hass?.states?.[id]?.state ?? null
  }, E2E_FLAG)
  expect(state).toBe('on')
})
