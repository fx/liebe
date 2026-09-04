import { test, expect, type Page } from '@playwright/test'
import {
  documentFontFamilies,
  documentFontLoaded,
  fontRegistrationCss,
  openConfigurationMenu,
  openPanel,
  seedThemeConfig,
  selectTheme,
  shadowAttribute,
  shadowComputedStyle,
  storedTheme,
  themeStamp,
} from './helpers'

// The e2e obligation of the built-in themes
// (docs/changes/0013-built-in-themes.md): "An e2e smoke MUST activate each theme
// in the real panel (shadow DOM) and assert the root stamps plus one
// theme-distinctive computed style."
//
// Both themes are activated through the picker rather than seeded, because the
// half only a real browser can judge is live application: whether the switch
// reaches the shadow root, whether a `dark-only` theme's forced appearance
// really lands, and — for LCARS — whether a face registered in Home Assistant's
// document is loaded by the shadow tree below it. None of that is visible to a
// jsdom test, which is why these two live here.

// The okudagram palette, as the theming spec's LCARS table names it. Restated
// here on purpose: this file is the outside view, so it asserts against the
// documented reference values rather than against the theme's own properties.
const LCARS_BUTTERSCOTCH = 'rgb(234, 156, 114)'
const LCARS_ALMOND = 'rgb(210, 155, 127)'

// The spec's domain remap (light→barley, heat→orange, …), plus the three hues
// the theme extends it with. Keyed by the `data-color` a card resolves to, so a
// card's cap can be checked against the hue its own state asked for.
const LCARS_DOMAIN_HUES: Record<string, string> = {
  light: 'rgb(237, 179, 120)', // barley
  heat: 'rgb(235, 148, 58)', // orange
  cool: 'rgb(136, 153, 255)', // bluey
  ok: 'rgb(186, 164, 229)', // african-violet
  alert: 'rgb(255, 34, 0)', // mars
  media: 'rgb(192, 130, 169)', // true-mauve
  vacuum: 'rgb(138, 114, 167)', // lilac
  water: 'rgb(136, 153, 255)', // bluey
  default: LCARS_BUTTERSCOTCH,
  brand: LCARS_ALMOND,
}

// Every spec here starts on Default and switches, so the switch itself is what
// is under test. The seed carries no custom CSS: what these assert is each
// theme's own computed result, with no user layer able to account for it.
async function openOnDefaultTheme(page: Page, appearance: 'dark' | 'light'): Promise<void> {
  await openPanel(page, seedThemeConfig({ id: 'default', appearance, customCss: '' }))
  expect(await themeStamp(page)).toEqual({ themeId: 'default', appearance })
}

test('Liquid Glass applies live, and in both appearances', async ({ page }) => {
  await openOnDefaultTheme(page, 'dark')

  // Baseline: the flat default card, so nothing below can pass by inheritance.
  expect(await shadowComputedStyle(page, '.liebe-card', ['backdrop-filter'])).toMatchObject({
    'backdrop-filter': 'none',
  })

  await selectTheme(page, 'Liquid Glass')
  await expect.poll(() => themeStamp(page)).toEqual({ themeId: 'liquid-glass', appearance: 'dark' })

  // The distinctive computed style: a real `backdrop-filter` on the card. It is
  // the one card property no other built-in theme turns on, and it arrives
  // through `--liebe-card-blur` alone — the theme has no rule of its own — so
  // this is the token route the theme exists to keep honest.
  await expect
    .poll(() =>
      shadowComputedStyle(page, '.liebe-card', [
        'backdrop-filter',
        'background-color',
        'border-radius',
        'border-top-width',
      ])
    )
    .toMatchObject({
      'backdrop-filter': 'blur(22px) saturate(1.6)',
      'background-color': 'rgba(255, 255, 255, 0.1)',
      'border-radius': '26px',
      'border-top-width': '1px',
    })

  // Liquid Glass declares `both`, so the appearance control stays a choice —
  // and its light variant is a different surface rather than the same one
  // re-stamped: the spec has it raise the card alpha, because a 10% white veil
  // over a pale ground is not a surface at all.
  await openConfigurationMenu(page)
  await page.getByRole('menuitemradio', { name: 'Light' }).click()

  await expect
    .poll(() => themeStamp(page))
    .toEqual({ themeId: 'liquid-glass', appearance: 'light' })
  await expect
    .poll(() => shadowComputedStyle(page, '.liebe-card', ['background-color', 'backdrop-filter']))
    .toMatchObject({
      'background-color': 'rgba(255, 255, 255, 0.58)',
      'backdrop-filter': 'blur(22px) saturate(1.6)',
    })
})

test('LCARS applies live, forces dark, and paints its console frame', async ({ page }) => {
  // Deliberately requested light: LCARS is `dark-only`, so this is what proves
  // the theme forces its appearance rather than rendering an okudagram console
  // on a white ground (docs/specs/theming — "LCARS declares dark-only").
  await openOnDefaultTheme(page, 'light')

  // Baseline for the font assertions below, taken against the REGISTRATION
  // rather than against availability. Asking whether Antonio can be loaded here
  // would be a question about the host as much as about the panel — an image
  // that ships the typeface would answer it the same way a working baseline
  // does — whereas a document that carries no `@font-face` for the family, and
  // no font `<style>` for `lcars`, can only mean the registrar has not run.
  // That is exactly the mechanism under test: shadow roots do not load
  // `@font-face` declared inside them, so document-level registration is the
  // only route by which the face below can arrive.
  expect(await documentFontFamilies(page), 'no face registered before the theme').not.toContain(
    'Antonio'
  )
  expect(await fontRegistrationCss(page, 'lcars'), 'no lcars font sheet before the theme').toBe('')

  // And the probe itself discriminates: a family nothing could plausibly
  // provide comes back false, so the positive answer it gives after the switch
  // is a finding rather than this helper's constant.
  expect(
    await documentFontLoaded(page, '16px "Liebe No Such Family"'),
    'the probe answers false for an unregistered family'
  ).toBe(false)

  await selectTheme(page, 'LCARS')
  await expect.poll(() => themeStamp(page)).toEqual({ themeId: 'lcars', appearance: 'dark' })

  // Forced, and shown as forced: the appearance items are disabled rather than
  // offering a choice the theme cannot honour.
  await openConfigurationMenu(page)
  for (const name of ['Light', 'Dark', 'System']) {
    await expect(page.getByRole('menuitemradio', { name })).toHaveAttribute('aria-disabled', 'true')
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()

  // The typeface, which is the distinctive style that cannot be faked: the face
  // is registered in Home Assistant's document (a shadow root does not load
  // `@font-face` declared inside it) and has to be LOADED, from a bundled asset
  // resolved against the base the panel published — not from a webfont host.
  const registration = await fontRegistrationCss(page, 'lcars')
  expect(registration, 'the asset base was substituted into the font sheet').not.toContain(
    '__LIEBE_ASSET_BASE_URL__'
  )
  expect(registration).toContain('/fonts/antonio/antonio-latin.woff2')
  expect(await documentFontFamilies(page), 'the switch registered the face').toContain('Antonio')
  expect(await documentFontLoaded(page, '16px Antonio'), 'the bundled woff2 loaded').toBe(true)

  const meta = await shadowComputedStyle(page, '.liebe-name', ['font-family', 'text-transform'])
  expect(meta?.['font-family'], 'card text renders in the bundled face').toMatch(/^Antonio/)
  expect(meta?.['text-transform']).toBe('uppercase')

  // The console frame, drawn entirely on the structural hooks of the stable
  // selector contract: the screen's butterscotch rail and elbow, plus a bar per
  // `liebe-section`. There is deliberately no section TITLE bar to assert —
  // `liebe-section-title` was removed from the contract without ever stamping
  // (change 0036 PR 4): nothing in the markup means "the title of a section",
  // so LCARS ships without the per-title bar, the concave inner fillet and the
  // per-title code label. The change document's acceptance scenario names the
  // frame below rather than the one that is not built.
  expect(await shadowComputedStyle(page, '.liebe-screen', ['background-color'], '::after')).toEqual(
    {
      'background-color': LCARS_BUTTERSCOTCH,
    }
  )
  expect(
    await shadowComputedStyle(page, '.liebe-section', ['background-color'], '::before')
  ).toEqual({ 'background-color': LCARS_ALMOND })

  // The card: a black block with a domain-coloured pill cap. The cap is checked
  // against the hue the card's own `data-color` maps to, so this asserts the
  // theme's domain remap rather than one hardcoded expectation.
  const dataColor = await shadowAttribute(page, '.liebe-card', 'data-color')
  expect(LCARS_DOMAIN_HUES, `data-color="${dataColor}" is a mapped triplet`).toHaveProperty(
    dataColor ?? ''
  )
  expect(
    await shadowComputedStyle(page, '.liebe-card', ['background-color', 'border-radius'])
  ).toMatchObject({
    'background-color': 'rgb(0, 0, 0)',
    'border-radius': '24px 4px 4px 24px',
  })
  expect(
    await shadowComputedStyle(page, '.liebe-card', ['background-color', 'width'], '::before')
  ).toEqual({ 'background-color': LCARS_DOMAIN_HUES[dataColor ?? ''], width: '18px' })

  // Switching away restores the requested appearance: forcing dark is a
  // rendering decision, and it never overwrote the stored preference.
  await selectTheme(page, 'Default')
  await expect.poll(() => themeStamp(page)).toEqual({ themeId: 'default', appearance: 'light' })
  await expect.poll(() => storedTheme(page)).toMatchObject({ id: 'default', appearance: 'light' })
})
