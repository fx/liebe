import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  openPanel,
  openConfigurationMenu,
  overlayTokens,
  seedThemeConfig,
  storedTheme,
  themeBackgroundColor,
  themeStamp,
  themeToken,
  userLayerCss,
} from './helpers'

// The e2e obligations of the theming engine
// (docs/changes/0012-theming-engine.md): appearance switches live, a theme
// configuration survives export → import, and a portalled overlay renders on
// the active theme — the one claim about the cascade that cannot be judged
// anywhere but in a real browser, since it turns on what a portalled element
// outside the shadow root actually computes.

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

test('a portalled overlay renders on the active theme, and without user CSS', async ({ page }) => {
  // Overlays portal to `document.body`, outside the shadow root that holds the
  // layers. docs/specs/theming ("Application mechanism") requires them to render
  // with active tokens anyway, and records the user layer as deliberately
  // withheld from the mirror — this pins both halves on a real open overlay.
  await openPanel(
    page,
    seedThemeConfig({
      id: 'default',
      appearance: 'dark',
      customCss: '.liebe-root { --liebe-c-ok: #010203; }',
    })
  )
  expect(await themeToken(page, '--liebe-c-ok')).toBe('#010203')

  await openConfigurationMenu(page)
  const { outsideShadowRoot, values } = await overlayTokens(page, [
    '--liebe-c-light',
    '--liebe-c-light-text',
    '--liebe-c-ok',
  ])

  // Otherwise this test proves nothing: the menu has to have left the shadow
  // root for its tokens to be a question at all.
  expect(outsideShadowRoot, 'the open menu portals out of the shadow root').toBe(true)

  // The base layer leaves `-text` derived from its base hue; the Default theme
  // pins it to a readable step. The two differing out here is therefore the
  // mirrored THEME layer applying, not just the baseline sheet.
  expect(values['--liebe-c-light']).not.toBe('')
  expect(values['--liebe-c-light-text'], 'the theme layer reaches the portalled overlay').not.toBe(
    values['--liebe-c-light']
  )

  // The user layer stops at the shadow root, on purpose: mirroring the author's
  // own selectors into the Home Assistant document would restyle the frontend
  // around the panel.
  expect(values['--liebe-c-ok'], 'user CSS stays contained in the panel').not.toBe('#010203')
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
    // Polled, not read once — an unseeded `openPanel` waits for the websocket
    // connection, which can win the race against React's first commit.
    await expect.poll(() => themeStamp(fresh)).toEqual({ themeId: 'default', appearance: 'light' })
    expect(await themeToken(fresh, '--liebe-bg')).not.toBe('#010203')

    // Import the exported document through the real file input and confirm the
    // preview.
    await openConfigurationMenu(fresh)
    const chooser = fresh.waitForEvent('filechooser')
    await fresh.getByRole('menuitem', { name: 'Import from File (JSON/YAML)' }).click()
    await (await chooser).setFiles(exportPath)
    await fresh.getByRole('button', { name: 'Import Configuration' }).click()

    // The imported dashboard renders what was exported — including the same
    // Default fallback for the theme it cannot render.
    await expect.poll(() => themeStamp(fresh)).toEqual({ themeId: 'default', appearance: 'dark' })
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
