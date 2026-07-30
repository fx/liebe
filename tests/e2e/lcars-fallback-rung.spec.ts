import { test, expect, type Page } from '@playwright/test'
import { openPanel, seedThemeConfig } from './helpers'
import { contrastRatio, formatRgba, normalizeColor } from './contrast'

/**
 * Change 0035 PR 7, part 2: the fallback rung LCARS uses where
 * `contrast-color()` is unavailable.
 *
 * **The limit of this spec, stated first because it is the honest reading.**
 * Every browser this repository can test — the CI runner, a local run, the
 * workshop — supports `contrast-color()`, so the top rung always wins and the
 * fallback's `@supports` block is never live. The measured browser here is
 * Chrome 149. Nothing in this suite, and nothing in CI, can execute this rule
 * the way a browser without the function would.
 *
 * So the rung is tested by taking its declaration **out of the live stylesheet**
 * and evaluating it directly, which is what the fallback would compute. That
 * establishes the part that was actually wrong — the expression — and it does
 * not establish the `@supports` gating, which no gate here can reach. Reading
 * the rule through CSSOM rather than restating it is what keeps this a test of
 * the shipped theme rather than of a copy: a rung deleted, renamed or re-nested
 * fails the lookup instead of quietly passing against a reconstruction.
 *
 * What it is measuring against: `contrast-color()` itself, evaluated in the same
 * engine on the same inputs. The fallback's job is to reproduce the function, so
 * the function is the oracle — and an oracle is what the previous rung lacked,
 * which is how it shipped picking a different foreground for `plum` than the
 * rule it stands in for.
 */

/** The eight scales `PERSON_AVATAR_SCALES` draws an identity colour from. */
const IDENTITY_SCALES = [
  'plum',
  'purple',
  'violet',
  'iris',
  'bronze',
  'gold',
  'brown',
  'pink',
] as const

/**
 * The same twelve bulb colours the icon-tile sweep resolves to, because the disc
 * this rung colours takes a live light hue as readily as an identity colour.
 */
const BULB_HUES = [
  'rgb(255, 0, 0)',
  'rgb(0, 255, 0)',
  'rgb(0, 0, 255)',
  'rgb(0, 255, 255)',
  'rgb(255, 0, 255)',
  'rgb(255, 255, 0)',
  'rgb(255, 179, 0)',
  'rgb(128, 0, 255)',
  'rgb(0, 128, 255)',
  'rgb(178, 255, 153)',
  'rgb(115, 115, 255)',
  'rgb(255, 255, 255)',
] as const

/** The floor an avatar's initials answer to: they are text, not a glyph. */
const TEXT_FLOOR = 4.5

/**
 * The rung's **whole declaration block**, read out of the stylesheet the panel
 * is actually using.
 *
 * CSSOM exposes the inside of an `@supports` block whether or not its condition
 * matches, which is the only reason this is possible at all — the rule is
 * unreachable by the cascade in this browser and still readable as text.
 *
 * The whole block rather than its `color` alone, because the rung factors its
 * luminance into two custom properties of its own. Lifting only the `color` and
 * pasting a hue into it leaves those undefined on the probe, the declaration is
 * dropped as invalid, and the probe reports the inherited text colour — which on
 * this page is `rgb(20, 20, 20)`, a plausible near-black that looks like an
 * answer. That is what the first run of this spec measured, and the reason it
 * takes the rule entire and binds the hue by setting the token rather than by
 * editing the text.
 */
async function fallbackRungDeclaration(page: Page): Promise<string> {
  const found = await page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } }).__liebePanel
    const root = panel?.shadowRoot
    if (!root) return { error: 'no panel shadow root' }

    const sheets: CSSStyleSheet[] = [
      ...root.adoptedStyleSheets,
      ...[...root.querySelectorAll('style')]
        .map((element) => element.sheet)
        .filter((sheet): sheet is CSSStyleSheet => sheet !== null),
    ]

    const matches: string[] = []
    const walk = (rules: CSSRuleList, insideNotContrastColor: boolean): void => {
      for (const rule of rules) {
        if (rule instanceof CSSSupportsRule) {
          const negatesContrastColor = /not\s*\(\s*color\s*:\s*contrast-color/.test(
            rule.conditionText
          )
          walk(rule.cssRules, insideNotContrastColor || negatesContrastColor)
          continue
        }
        if (rule instanceof CSSGroupingRule) {
          walk(rule.cssRules, insideNotContrastColor)
          continue
        }
        if (
          insideNotContrastColor &&
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes('.liebe-icon[data-active]') &&
          rule.style.getPropertyValue('color').trim()
        ) {
          matches.push(rule.style.cssText)
        }
      }
    }

    for (const sheet of sheets) {
      try {
        walk(sheet.cssRules, false)
      } catch {
        // A cross-origin sheet throws on cssRules; none of the panel's are, and
        // skipping one silently is safe because the assertion below requires a
        // hit rather than tolerating none.
      }
    }
    return { matches }
  })

  const matches = 'matches' in found ? found.matches : undefined
  expect(matches, `could not read the panel's stylesheets: ${JSON.stringify(found)}`).toBeDefined()
  expect(
    matches,
    'exactly one rule under `@supports not (contrast-color)` should colour the active glyph — the fallback rung'
  ).toHaveLength(1)

  const [declaration] = matches ?? []
  if (declaration === undefined) {
    throw new Error(`the fallback rung was not found: ${JSON.stringify(found)}`)
  }
  return declaration
}

test('the fallback rung reproduces contrast-color() for every hue a part can take', async ({
  page,
}) => {
  await openPanel(page, seedThemeConfig({ id: 'lcars', appearance: 'dark', customCss: '' }))

  const rungBlock = await fallbackRungDeclaration(page)
  expect(
    rungBlock,
    'the rung should derive the foreground from the published part colour'
  ).toContain('var(--liebe-part-color)')

  // The identity colours are Radix scale references, so their values come from
  // the panel's own resolved tokens rather than from a list restated here.
  const hues: Array<{ name: string; value: string }> = []
  for (const scale of IDENTITY_SCALES) {
    const value = await page.evaluate((name) => {
      const panel = (window as unknown as { __liebePanel?: { shadowRoot?: ShadowRoot } })
        .__liebePanel
      const root = panel?.shadowRoot?.querySelector('.liebe-root')
      return root ? getComputedStyle(root).getPropertyValue(`--${name}-9`).trim() : ''
    }, scale)
    expect(value, `the ${scale} identity scale should resolve to a colour`).not.toBe('')
    hues.push({ name: scale, value })
  }
  for (const value of BULB_HUES) hues.push({ name: value, value })

  const measured: Array<{
    hue: string
    ground: string
    fallback: string
    reference: string
    ratio: number
  }> = []

  for (const { name, value } of hues) {
    const ground = await normalizeColor(page, value)

    /*
     * The rung's own block, with the token it reads bound to this hue by
     * DECLARING it — no string surgery, so the rule resolves exactly as it would
     * on a real part. A probe element rather than the part itself, because the
     * part cannot take this rule in a browser that has `contrast-color()`.
     *
     * A colour that fails to parse falls back to the inherited one and looks
     * like a result, so every reading below goes through `normalizeColor`, whose
     * two-sentinel probe throws on anything the browser refuses, and the
     * `reference` column is measured the same way through the same probe.
     */
    const paint = async (style: string): Promise<string> =>
      page.evaluate((styleText) => {
        const probe = document.createElement('div')
        probe.setAttribute('style', styleText)
        document.body.appendChild(probe)
        const computed = getComputedStyle(probe).color
        probe.remove()
        return computed
      }, style)

    const fallback = await normalizeColor(
      page,
      await paint(`--liebe-part-color: ${value}; ${rungBlock}`)
    )
    const reference = await normalizeColor(page, await paint(`color: contrast-color(${value})`))

    measured.push({
      hue: name,
      ground: formatRgba(ground),
      fallback: formatRgba(fallback),
      reference: formatRgba(reference),
      ratio: Number(contrastRatio(fallback, ground).toFixed(2)),
    })
  }

  await test.info().attach('fallback-rung-composites', {
    body: JSON.stringify(measured, null, 2),
    contentType: 'application/json',
  })

  /*
   * The oracle assertion, and the one that would have caught the rung that
   * shipped: the fallback must choose what the function chooses. A rung that is
   * merely "good enough on the hues someone happened to try" passes a floor test
   * and fails this one.
   */
  const diverged = measured.filter((row) => row.fallback !== row.reference)
  expect(
    diverged,
    `the fallback picked a different foreground than contrast-color() — ${JSON.stringify(diverged, null, 2)}`
  ).toEqual([])

  const below = measured.filter((row) => row.ratio < TEXT_FLOOR)
  expect(
    below,
    `these hues leave the fallback's foreground under ${TEXT_FLOOR}:1 — ${JSON.stringify(measured, null, 2)}`
  ).toEqual([])

  // A run where every probe silently failed to parse would agree with itself and
  // prove nothing, so the sweep is required to have covered its inputs.
  expect(measured, 'the sweep should cover every identity scale and bulb hue').toHaveLength(
    IDENTITY_SCALES.length + BULB_HUES.length
  )
})
