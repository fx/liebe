import { test, expect } from '@playwright/test'
import {
  openPanel,
  seedConfig,
  gridItemCount,
  flagCardActive,
  flagSwitchPresent,
  setFlag,
} from './helpers'

test('seeded dashboard renders demo entity cards', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedConfig())

  // Known starting point for the boolean helper so its state is stable.
  await setFlag(accessToken, false)

  // The seeded screen slug becomes the active route.
  await expect(page).toHaveURL(/\/liebe\/e2e$/)

  await expect.poll(() => gridItemCount(page), { timeout: 15_000 }).toBe(2)

  // The input_boolean card reflects the off state on the tile itself.
  await expect.poll(() => flagCardActive(page), { timeout: 15_000 }).toBe(false)

  // And renders no discrete control, which is the shipped default the unit
  // suites can no longer observe: they configure `controlStyle` explicitly, so
  // this is the one place still watching what an unconfigured card does
  // (docs/specs/entity-cards/options/input-helpers.md — `controlStyle: tile`).
  expect(await flagSwitchPresent(page)).toBe(false)
})
