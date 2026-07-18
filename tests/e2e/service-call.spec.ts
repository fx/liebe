import { test, expect } from '@playwright/test'
import { openPanel, seedConfig, clickCardTitle, getRestState, setFlag, E2E_FLAG } from './helpers'

test('clicking a card calls a service that changes HA state', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedConfig())

  // Deterministic starting point.
  await setFlag(accessToken, false)
  expect(await getRestState(accessToken, E2E_FLAG)).toBe('off')

  // Click the card body (single toggle) — this issues input_boolean.toggle.
  await clickCardTitle(page, 'E2E Flag')

  // HA state, read straight from REST, must reflect the service call.
  await expect.poll(() => getRestState(accessToken, E2E_FLAG), { timeout: 15_000 }).toBe('on')
})
