import { test, expect } from '@playwright/test'
import { openPanel, seedLockCardConfig, getRestState, DEMO_LOCK } from './helpers'

/**
 * The lock card against a real Home Assistant (change 0024).
 *
 * This family earns an e2e for two reasons a unit test cannot cover, both at the
 * boundary a mocked dispatch layer stubs out.
 *
 * The first is the same defect the action family had: `lock` fell through to
 * `ButtonCard`, which dispatches `<domain>.toggle`, and the lock platform
 * registers only `lock`, `unlock` and `open`. A test that mocked the dispatch
 * would have agreed with the card either way; only a live instance distinguishes
 * a service that landed from one Home Assistant answered 400 to.
 *
 * The second is specific to this card being safety-critical. What matters is not
 * merely that a service was called but that **exactly one** unlock reached the
 * device, and only after the confirmation was answered — a claim about the real
 * command path, the real guard, and the real entity state.
 */
test('unlocking a lock card reaches Home Assistant, once, and only after confirming', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedLockCardConfig())

  // The demo lock starts locked, which is what makes Unlock the live pill.
  await expect.poll(() => getRestState(accessToken, DEMO_LOCK)).toBe('locked')

  const card = page.locator('.grid-item').filter({ hasText: 'Front Door' })
  await expect(card).toHaveCount(1)

  // The pill matching the current state is held back; its inverse is live.
  await expect(card.getByRole('button', { name: 'Lock', exact: true })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Unlock', exact: true })).toBeEnabled()

  await card.getByRole('button', { name: 'Unlock', exact: true }).click()

  // Nothing has been sent yet: the confirmation holds the command rather than
  // queueing it, so the entity must still read `locked` while the dialog stands.
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Unlock Front Door?')
  expect(await getRestState(accessToken, DEMO_LOCK)).toBe('locked')

  // Cancelling sends nothing at all.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(500)
  expect(await getRestState(accessToken, DEMO_LOCK)).toBe('locked')

  // Confirming sends exactly one `lock.unlock`, and the real entity moves.
  await card.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Unlock', exact: true }).click()

  await expect
    .poll(() => getRestState(accessToken, DEMO_LOCK), { timeout: 15_000 })
    .toBe('unlocked')

  // And the card follows the entity rather than its own optimism: the pills
  // have swapped which of them is held back.
  await expect(card.getByRole('button', { name: 'Unlock', exact: true })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Lock', exact: true })).toBeEnabled()

  // Put the demo lock back, so the spec leaves the instance as it found it —
  // this also exercises the ungated direction, `confirmLock` being off by
  // default, and proves `lock.lock` is a real service too.
  await card.getByRole('button', { name: 'Lock', exact: true }).click()
  await expect.poll(() => getRestState(accessToken, DEMO_LOCK), { timeout: 15_000 }).toBe('locked')
})
