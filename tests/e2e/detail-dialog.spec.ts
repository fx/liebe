import { test, expect } from '@playwright/test'
import {
  E2E_FLAG,
  E2E_SECRET,
  E2E_SECRET_VALUE,
  getRestState,
  holdCardTitle,
  openPanel,
  readHassState,
  seedDetailDialogConfig,
  setFlag,
  setSecret,
} from './helpers'

/**
 * Press-and-hold → detail dialog, in the real panel.
 *
 * Worth an e2e of its own because the gesture is the part jsdom cannot vouch
 * for: the press happens inside HA's shadow DOM, while the dialog it opens is
 * portalled out to the host document, and the two halves have to meet.
 */
test('holding a card opens the detail dialog instead of firing its tap action', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedDetailDialogConfig())

  await setFlag(accessToken, false)
  expect(await getRestState(accessToken, E2E_FLAG)).toBe('off')

  await holdCardTitle(page, 'E2E Flag')

  // The dialog is Liebe's own and names the entity it is for.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('E2E Flag')
  await expect(dialog).toContainText(E2E_FLAG)

  // ...and the hold did NOT also toggle the helper — the contract's scenario:
  // hold opens details while tap toggles, never both.
  expect(await getRestState(accessToken, E2E_FLAG)).toBe('off')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('the detail dialog never reveals a password helper’s value', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedDetailDialogConfig())

  // Put the secret there FIRST. The assertion below is an absence, and an
  // absence proves nothing about a value nobody set: `initial:` only applies on
  // a fresh restore, and this suite shares one HA instance whose helpers other
  // specs mutate (#208). Both the REST state and the panel's in-memory copy are
  // confirmed, so the dialog is known to be rendering the fixture value.
  await setSecret(accessToken, E2E_SECRET_VALUE)
  expect(await getRestState(accessToken, E2E_SECRET)).toBe(E2E_SECRET_VALUE)
  await expect
    .poll(() => readHassState(page, E2E_SECRET), { timeout: 15_000 })
    .toBe(E2E_SECRET_VALUE)

  // The card masks it; the dialog a hold opens must mask it too, or the mask is
  // one gesture from being pointless (docs/specs/entity-cards/options/
  // input-helpers.md — the per-value masking guarantee).
  await holdCardTitle(page, 'E2E Secret')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(E2E_SECRET)
  await expect(dialog).toContainText('••••••••')

  // Nowhere in the document, not merely nowhere in the state line: the
  // attribute list renders the same entity and could carry the value too.
  const documentText = await page.evaluate(() => document.documentElement.innerHTML)
  expect(documentText).not.toContain(E2E_SECRET_VALUE)
})
