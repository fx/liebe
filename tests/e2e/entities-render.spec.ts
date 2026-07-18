import { test, expect } from '@playwright/test'
import { openPanel, seedConfig, gridItemCount, flagSwitchChecked, setFlag } from './helpers'

test('seeded dashboard renders demo entity cards', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedConfig())

  // Known starting point for the boolean helper so the switch state is stable.
  await setFlag(accessToken, false)

  // The seeded screen slug becomes the active route.
  await expect(page).toHaveURL(/\/liebe\/e2e$/)

  await expect.poll(() => gridItemCount(page), { timeout: 15_000 }).toBe(2)

  // The input_boolean card renders a switch reflecting the off state.
  await expect.poll(() => flagSwitchChecked(page), { timeout: 15_000 }).toBe('false')
})
