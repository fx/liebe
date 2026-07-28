import { test, expect } from '@playwright/test'
import {
  openPanel,
  seedActionCardConfig,
  clickCardTitle,
  getRestState,
  DEMO_BUTTON,
} from './helpers'

/**
 * The action card family against a real Home Assistant (change 0027).
 *
 * This one is worth an e2e where most card behaviour is not, because the defect
 * it fixes lives exactly at the boundary a unit test stubs out. Before this
 * change these domains fell through to `ButtonCard`, which dispatches
 * `<domain>.toggle` — and `button.toggle` is not a registered service, so Home
 * Assistant answers 400 and the entity never moves. A test that mocked the
 * dispatch layer would have agreed with the card either way.
 *
 * `button.push` carries its last press as its own state, so the proof is simply
 * that the state advances.
 */
test('pressing a button card fires button.press against Home Assistant', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedActionCardConfig())

  const before = await getRestState(accessToken, DEMO_BUTTON)

  await clickCardTitle(page, 'Push')

  // The state is a timestamp, so any change at all is a press that landed.
  await expect
    .poll(() => getRestState(accessToken, DEMO_BUTTON), { timeout: 15_000 })
    .not.toBe(before)

  // And it really is a timestamp rather than an error placeholder.
  const after = await getRestState(accessToken, DEMO_BUTTON)
  expect(Number.isNaN(Date.parse(after))).toBe(false)
})
