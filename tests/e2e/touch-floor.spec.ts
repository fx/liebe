import { expect, test, type Page } from '@playwright/test'
import { openConfigurationMenu, openPanel, seedConfig } from './helpers'

/**
 * The 44px coarse-pointer touch floor over Radix's own control sizing
 * (docs/changes/0036-theming-contract-gaps.md, PR 1).
 *
 * This is the assertion that cannot be made anywhere else. The floor is a bare
 * `button` / `input` / `textarea` selector in `liebe-base`; Radix's `.rt-reset`
 * declares `min-height: 0` on the same elements with a class selector, so within
 * one layer the vendor sheet wins on specificity and the floor applies to
 * nothing it was written for. Whether it applies now turns on `liebe-base.vendor`
 * sorting below `liebe-base` — a cascade fact rather than a text fact, so a unit
 * test reading a stylesheet cannot observe it at all (docs/specs/theming —
 * "Application mechanism").
 *
 * Computed `min-height` is asserted alongside the measured height because the
 * two failures look different: `auto` or `0px` means the declaration is not
 * winning at all, while `44px` on a shorter box would mean something overrode
 * the result it produced.
 */

test.use({ hasTouch: true })

interface ControlBox {
  height: number
  minHeight: string
  paddingInline: string
}

/**
 * Every control matching `selector`, from both roots a Liebe control can render
 * in: the taskbar and the grid are inside the panel's shadow root, while an open
 * dialog and the entity browser portal out of it. Collecting both rather than
 * picking one keeps the assertion unambiguous about which element it measured —
 * all of them, so a second match cannot be the one that is floored.
 *
 * Elements that generate no box are dropped: a `display: none` control (a
 * collapsed sidebar, an inactive tab panel) measures zero however well the floor
 * applies to it, so measuring one would fail the height assertion for a reason
 * that has nothing to do with the cascade.
 */
async function controlBoxes(page: Page, selector: string): Promise<ControlBox[]> {
  return page.evaluate((sel) => {
    const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } }).__liebePanel
    const roots: Array<Document | ShadowRoot> = [document]
    if (panel?.shadowRoot) roots.push(panel.shadowRoot)

    return roots
      .flatMap((root) => Array.from(root.querySelectorAll(sel)))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({
        height: element.getBoundingClientRect().height,
        minHeight: getComputedStyle(element).minHeight,
        paddingInline: getComputedStyle(element).paddingLeft,
      }))
  }, selector)
}

/** Asserts the floor reached every control of a kind, by both of its halves. */
async function expectFloored(page: Page, selector: string, what: string): Promise<void> {
  const boxes = await controlBoxes(page, selector)

  // Otherwise the loop below is vacuous: a selector that stopped matching would
  // read as a pass.
  expect(boxes.length, `${what} renders`).toBeGreaterThan(0)

  for (const box of boxes) {
    expect(box.minHeight, `${what} computes the floor`).toBe('44px')
    expect(box.height, `${what} measures at least the floor`).toBeGreaterThanOrEqual(44)
  }
}

test('the touch floor reaches Radix controls in the taskbar, a config modal and the entity browser', async ({
  page,
}) => {
  await openPanel(page, seedConfig())

  // Without this the whole spec is vacuous: the floor lives in
  // `@media (pointer: coarse)`, so a fine-pointer context satisfies nothing.
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  expect(coarse, 'the context emulates a coarse pointer').toBe(true)

  // The taskbar, inside the shadow root.
  await expectFloored(page, 'button[aria-label="Toggle sidebar"]', 'taskbar button')

  // A config modal: the custom-CSS editor, whose textarea is one of the two
  // control kinds whose computed `min-height` read `auto` — the tell that the
  // declaration was not winning rather than being overridden.
  await openConfigurationMenu(page)
  await page.getByRole('menuitem', { name: 'Custom CSS' }).click()
  await expect(page.getByRole('textbox', { name: 'Custom CSS' })).toBeVisible()

  await expectFloored(page, 'textarea.rt-TextAreaInput', 'config modal textarea')
  // Scoped to the dialog on purpose. A few Liebe controls override the floor
  // inline and are meant to — the pencil on a screen tab is 2px of padding in a
  // corner — so "every Radix button in the panel" is not the rule and asserting
  // it would pin the exceptions rather than the floor.
  await expectFloored(page, '[role="dialog"] button.rt-Button', 'config modal buttons')

  // The other boundary in the same tiering, and the one nothing else can see:
  // the universal reset sits BELOW the vendored sheets, so Radix keeps the
  // padding it declares. Level with them, `* { padding: 0 }` won and every
  // Radix button, table cell and inline code lost its padding — a regression
  // that left every measurement above passing.
  const savePadding = await page
    .getByRole('button', { name: 'Save' })
    .evaluate((element) => getComputedStyle(element).paddingLeft)
  expect(
    Number.parseFloat(savePadding),
    "the modal's Save button keeps Radix's own inline padding"
  ).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Cancel' }).click()

  // The entity browser, reached the way a user reaches it.
  await page.locator('[aria-label="Edit Mode"]').click()
  await page.locator('[aria-label="Add Item"]').click()
  await expect(page.getByPlaceholder('Search entities...')).toBeVisible()

  await expectFloored(page, 'input.rt-TextFieldInput', 'entity browser search field')
})
