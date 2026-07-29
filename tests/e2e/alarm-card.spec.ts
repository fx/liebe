import { test, expect } from '@playwright/test'
import {
  openPanel,
  seedAlarmCardConfig,
  getRestState,
  DEMO_ALARM,
  DEMO_ALARM_CODE,
} from './helpers'

/**
 * The alarm card against a real Home Assistant (change 0024).
 *
 * The demo panel is a `manual` platform panel with the code `1234`,
 * `code_arm_required: true` and a five-second arming time — which makes it the
 * one place three claims can actually be checked rather than mocked:
 *
 *  - the keypad's code reaches the service call, and the panel accepts it
 *    (a wrong payload shape would simply be refused, and a mocked dispatch
 *    would have agreed with the card either way);
 *  - the panel really does pass through `arming` on the way to `armed_away`;
 *  - **Disarm stays usable during that countdown**, which is the requirement
 *    the change doc states twice and the one a blanket busy-flag would break.
 */
test('arming and disarming a code-protected panel, through the keypad', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedAlarmCardConfig())

  await expect.poll(() => getRestState(accessToken, DEMO_ALARM)).toBe('disarmed')

  const card = page.locator('.grid-item').filter({ hasText: 'Security' })
  await expect(card).toHaveCount(1)

  // Disarmed: the arm modes are offered and there is nothing to disarm.
  await expect(card.getByRole('button', { name: 'Arm away', exact: true })).toBeEnabled()
  await expect(card.getByRole('button', { name: 'Disarm', exact: true })).toHaveCount(0)

  await card.getByRole('button', { name: 'Arm away', exact: true }).click()

  // A code is required, so the keypad opens rather than a confirmation.
  const keypad = page.getByTestId('alarm-keypad')
  await expect(keypad).toBeVisible()
  expect(await getRestState(accessToken, DEMO_ALARM)).toBe('disarmed')

  for (const digit of DEMO_ALARM_CODE.split('')) {
    await keypad.getByRole('button', { name: digit, exact: true }).click()
  }
  // Masked while it is being entered — never the digits themselves.
  await expect(page.getByTestId('alarm-keypad-readout')).toHaveText('••••')

  await keypad.getByRole('button', { name: 'Arm away', exact: true }).click()

  /*
   * The five-second exit delay. Disarm has to be reachable throughout it, so
   * this is asserted while the panel is still counting down rather than after.
   */
  await expect.poll(() => getRestState(accessToken, DEMO_ALARM), { timeout: 10_000 }).toBe('arming')
  await expect(card.getByRole('button', { name: 'Disarm', exact: true })).toBeEnabled()
  await expect(card.getByRole('button', { name: 'Arm away', exact: true })).toHaveCount(0)

  // And the panel really does arm at the end of it.
  await expect
    .poll(() => getRestState(accessToken, DEMO_ALARM), { timeout: 20_000 })
    .toBe('armed_away')

  // Disarm, which needs the code too — and leaves the instance as it was found.
  await card.getByRole('button', { name: 'Disarm', exact: true }).click()
  await expect(page.getByTestId('alarm-keypad')).toBeVisible()

  for (const digit of DEMO_ALARM_CODE.split('')) {
    await page.getByTestId('alarm-keypad').getByRole('button', { name: digit, exact: true }).click()
  }
  await page
    .getByTestId('alarm-keypad')
    .getByRole('button', { name: 'Disarm', exact: true })
    .click()

  await expect
    .poll(() => getRestState(accessToken, DEMO_ALARM), { timeout: 15_000 })
    .toBe('disarmed')
})

test('a wrong code is refused by the panel and changes nothing', async ({ page }) => {
  // The card never validates a code — that is the panel's job, and a rejection
  // has to surface rather than be swallowed or retried.
  const { accessToken } = await openPanel(page, seedAlarmCardConfig())

  await expect.poll(() => getRestState(accessToken, DEMO_ALARM)).toBe('disarmed')

  const card = page.locator('.grid-item').filter({ hasText: 'Security' })
  await card.getByRole('button', { name: 'Arm home', exact: true }).click()

  const keypad = page.getByTestId('alarm-keypad')
  await expect(keypad).toBeVisible()
  for (const digit of ['9', '9', '9', '9']) {
    await keypad.getByRole('button', { name: digit, exact: true }).click()
  }
  await keypad.getByRole('button', { name: 'Arm home', exact: true }).click()

  // The panel refuses it, so nothing moves.
  await page.waitForTimeout(2000)
  expect(await getRestState(accessToken, DEMO_ALARM)).toBe('disarmed')
})
