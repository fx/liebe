import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  openPanel,
  openConfigurationMenu,
  seedThemeConfig,
  storedTheme,
  themeBackgroundColor,
  themeStamp,
  themeToken,
  userLayerCss,
} from './helpers'

// The two e2e obligations of the theming engine
// (docs/changes/0012-theming-engine.md — Testing Requirements): appearance
// switches live, and a theme configuration survives export → import.

test('appearance switches live, without a reload', async ({ page }) => {
  await openPanel(page, seedThemeConfig({ id: 'default', appearance: 'light', customCss: '' }))

  expect(await themeStamp(page)).toEqual({ themeId: 'default', appearance: 'light' })
  const lightGround = await themeBackgroundColor(page)

  // A marker on the live document: a reload would replace the window and wipe
  // it, so its survival at the end is what proves the switch applied in place.
  await page.evaluate(() => {
    ;(window as unknown as { __e2eNoReload?: boolean }).__e2eNoReload = true
  })

  await openConfigurationMenu(page)
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()

  await expect.poll(async () => (await themeStamp(page)).appearance).toBe('dark')

  // The stamp alone would also be satisfied by an attribute nobody styles off:
  // the painted ground has to have changed with it.
  const darkGround = await themeBackgroundColor(page)
  expect(darkGround, 'panel ground repaints on the appearance switch').not.toBe(lightGround)

  // The choice is a portable configuration change, so it persists.
  await expect
    .poll(() => storedTheme(page))
    .toMatchObject({ id: 'default', appearance: 'dark', customCss: '' })

  const noReload = await page.evaluate(
    () => (window as unknown as { __e2eNoReload?: boolean }).__e2eNoReload === true
  )
  expect(noReload, 'appearance applied without a page reload').toBe(true)
})

test('theme configuration survives YAML export into a fresh dashboard', async ({
  page,
  browser,
}, testInfo) => {
  // Deliberately a configuration from *another* build: `starship-nine` is a
  // theme this one has no CSS for. It must render as Default and still export
  // as `starship-nine` — the round-trip invariant in
  // docs/specs/dashboard-config ("Forward Compatibility").
  const customCss = '.liebe-root { --liebe-bg: #010203; }'
  await openPanel(page, seedThemeConfig({ id: 'starship-nine', appearance: 'dark', customCss }))

  // Unregistered id renders Default; the requested appearance still applies.
  expect(await themeStamp(page)).toEqual({ themeId: 'default', appearance: 'dark' })
  // Authored by the user, so this value is exact: reading it back off the root
  // proves the user layer both injected AND outranked the theme layer, which
  // declares `--liebe-bg` too.
  expect(await themeToken(page, '--liebe-bg')).toBe('#010203')
  expect(await themeBackgroundColor(page)).toBe('rgb(1, 2, 3)')
  expect(await userLayerCss(page)).toContain('liebe-user')

  const download = page.waitForEvent('download')
  await openConfigurationMenu(page)
  await page.getByRole('menuitem', { name: 'Download as YAML' }).click()
  const exportPath = testInfo.outputPath('liebe-export.yaml')
  await (await download).saveAs(exportPath)

  const exported = await readFile(exportPath, 'utf8')
  expect(exported).toContain('id: starship-nine')
  expect(exported).toContain('appearance: dark')

  // A fresh Liebe instance: its own browser context, so nothing of the first
  // dashboard's localStorage reaches it.
  const freshContext = await browser.newContext({ colorScheme: 'light' })
  try {
    const fresh = await freshContext.newPage()
    await openPanel(fresh)

    // Baseline: unthemed defaults, so nothing below can pass by inheritance.
    expect(await themeStamp(fresh)).toEqual({ themeId: 'default', appearance: 'light' })
    expect(await themeToken(fresh, '--liebe-bg')).not.toBe('#010203')

    // Import the exported document through the real file input and confirm the
    // preview.
    await openConfigurationMenu(fresh)
    const chooser = fresh.waitForEvent('filechooser')
    await fresh.getByRole('menuitem', { name: 'Import from File (JSON/YAML)' }).click()
    await (await chooser).setFiles(exportPath)
    await fresh.getByRole('button', { name: 'Import Configuration' }).click()

    // The imported dashboard renders what was exported.
    await expect.poll(async () => (await themeStamp(fresh)).appearance).toBe('dark')
    await expect.poll(() => themeToken(fresh, '--liebe-bg')).toBe('#010203')
    expect(await themeBackgroundColor(fresh)).toBe('rgb(1, 2, 3)')

    // …and the theme this build cannot render came through untouched, so the
    // build that can render it still gets its dashboard back.
    expect(await storedTheme(fresh)).toMatchObject({
      id: 'starship-nine',
      appearance: 'dark',
      customCss,
    })
  } finally {
    await freshContext.close()
  }
})
