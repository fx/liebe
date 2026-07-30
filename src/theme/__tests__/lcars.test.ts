import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ASSET_BASE_PLACEHOLDER } from '../fontRegistration'
import { domainColorTokens, domainColors } from '../tokens'
import { getTheme, resolveAppearance, supportsAppearanceChoice } from '../themeRegistry'

/**
 * LCARS is the *stress test* of the stable selector contract, and this file is
 * what keeps that claim honest.
 *
 * Liquid Glass is gated on declaring no selectors at all; LCARS is allowed
 * selectors — it is the theme the contract exists for — so what is gated here
 * is that every one of them names something the contract actually promises
 * (docs/specs/theming/index.md, "Stable selector contract": "Themes MUST NOT
 * rely on any selector outside this contract"). A rule that reached for an
 * internal class would still render today and break silently the next time a
 * card is refactored, which is precisely the failure this theme is supposed to
 * detect rather than commit.
 *
 * Source-level assertions, like `liquidGlass.test.ts` and for the same reason:
 * jsdom resolves neither `var()` chains nor `color-mix()`, and what matters
 * here is a property of the declarations rather than of a computed value.
 */

/**
 * Indirected through a parameter on purpose, as in `tokens.test.ts`: Vite
 * rewrites a literal `new URL('./x.css', import.meta.url)` into an asset
 * reference, which is no longer a `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const themeCss = read('../themes/lcars.css')
const fontCss = read('../themes/lcars.fonts.css')

/** Source with block comments removed — prose is not a declaration. */
const rules = themeCss.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Every selector in the sheet, one per rule.
 *
 * The layer wrapper is stripped first, then each `… { … }` is matched
 * non-greedily; the sheet is flat inside its layer, so no nested at-rule can
 * confuse the scan.
 */
function selectors(css: string): string[] {
  const body = css
    .replace('@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;', '')
    .trim()
    .replace(/^@layer liebe-theme\s*\{/, '')
    .replace(/\}\s*$/, '')

  return [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(([, selector]) =>
    selector.split(',').map((part) => part.trim().replace(/\s+/g, ' '))
  )
}

/**
 * The classes a theme is allowed to name: the nine anatomy classes, the three
 * structural hooks, and the Liebe root the token contract declares on.
 * `liebe-section-title` is in the contract but not yet in any markup, so it is
 * permitted rather than required.
 */
const CONTRACT_CLASSES = new Set([
  'liebe-root',
  'liebe-card',
  'liebe-icon',
  'liebe-name',
  'liebe-state',
  'liebe-slider',
  'liebe-pill',
  'liebe-chip',
  'liebe-value',
  'liebe-spark',
  'liebe-screen',
  'liebe-section',
  'liebe-section-title',
])

/** The data attributes the contract promises are stamped (or will be). */
const CONTRACT_ATTRIBUTES = new Set([
  'data-domain',
  'data-active',
  'data-color',
  'data-tier',
  // Stamped by change 0033; the theme needs it to reach the icon-only tile,
  // whose treatment its own icon rules would otherwise undo.
  'data-icon-tile',
])

const sheetSelectors = selectors(rules)

/**
 * The declarations of the rule written with exactly this selector list.
 *
 * Matched on the selector as the sheet writes it — Prettier normalises the
 * formatting, so the newline-and-two-spaces between the parts of a list is
 * stable — and asserted to exist, so a rule that is renamed or split fails here
 * rather than silently satisfying a `not.toContain` somewhere below.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = rules.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`))
  expect(match, `no rule for ${selector}`).not.toBeNull()
  return match![1]
}

describe('LCARS stylesheet', () => {
  it('is the registered theme’s payload', () => {
    // Reading the file and reading the registry must be the same thing, or
    // every assertion below is about a sheet nothing ships.
    expect(getTheme('lcars')?.css).toBe(themeCss)
    expect(getTheme('lcars')?.fontFaces).toBe(fontCss)
  })

  it('names nothing outside the stable selector contract', () => {
    // THE constraint for this theme. Every class in every selector has to be a
    // contract class — an internal one (`liebe-meta`, `liebe-chip-label`,
    // `grid-card`) means the theme is relying on markup nobody promised to
    // keep.
    for (const selector of sheetSelectors) {
      const classes = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(([, name]) => name)
      expect(
        classes.filter((name) => !CONTRACT_CLASSES.has(name)),
        `non-contract class in ${selector}`
      ).toEqual([])

      const attributes = [...selector.matchAll(/\[([\w-]+)/g)].map(([, name]) => name)
      expect(
        attributes.filter((name) => !CONTRACT_ATTRIBUTES.has(name)),
        `non-contract attribute in ${selector}`
      ).toEqual([])
    }
  })

  it('anchors every selector on a class or a contract attribute', () => {
    // A bare type selector or a `*` would reach parts of the markup the
    // contract says nothing about, and the class scan above would not see it.
    for (const selector of sheetSelectors) {
      expect(selector, `unanchored selector: ${selector}`).toMatch(/^(:where\(\.|\.|\[)/)
      expect(selector, `universal selector: ${selector}`).not.toContain('*')
    }
  })

  it('reads no internal custom property of the anatomy', () => {
    // `--part-color` and its companions are the anatomy's own plumbing, which
    // its sheet reserves the right to rename. `--liebe-part-color` is the
    // published name for the same answer and is what this theme reads — the
    // assertion is on the `--part-` prefix precisely because the two look alike
    // and only one of them is contract.
    expect(rules).not.toContain('--part-')
  })

  it('takes the resolved hue from the contract token instead of remapping it', () => {
    // Ten `[data-color='…'] { --lcars-hue: … }` rules used to sit here,
    // mirroring the base layer's mapping, because the base layer's own answer
    // was only reachable under an internal name. Publishing it retired them
    // (docs/changes/0036-theming-contract-gaps.md PR 3), and a theme that went
    // back to restating the mapping would be carrying a copy that drifts the
    // next time a domain colour is added.
    // Asserted as the absence of the RESTATEMENT rather than of the selector
    // form it happened to take. `data-color` is contract and a theme is free to
    // key off it; what may not come back is a rule pinned to one of its values
    // whose job is to park the hue under a private name — and pinning the
    // written form (`[data-color='light'] { --lcars-hue: … }`) would miss
    // `.liebe-pill[data-color='light']` doing the same thing.
    expect(rules).not.toContain('--lcars-hue')
    const valuePinned = sheetSelectors.filter((selector) => /\[data-color=/.test(selector))
    for (const selector of valuePinned) {
      expect(ruleBody(selector), `${selector} declares a property per domain colour`).not.toMatch(
        /--[\w-]+\s*:/
      )
    }

    // Both consumers of the retired property, asserted where they are rather
    // than as one `toContain` over the file: the card's colour cap used to
    // carry its own `var(--lcars-hue, …)` fallback for a card that resolved no
    // domain colour, and the token's own default is what replaced it.
    expect(ruleBody('.liebe-card::before')).toContain('background: var(--liebe-part-color);')
  })

  it('fills an active control solid and darkens the label on it', () => {
    // The spec's LCARS treatment is "solid color fills with black glyphs/
    // labels", and the label half was unreachable until the token existed: the
    // base layer's `.liebe-pill[data-active] .liebe-pill-label` names an
    // internal class, so this sheet could neither recolour the label nor safely
    // saturate the ground under it, and shipped a dark 38% block instead.
    //
    // Asserted on one rule covering all three parts, because the point of the
    // completion is that the pill and the chip now take the same treatment the
    // icon circle already had rather than a compromise beside it.
    const active = ruleBody(
      '.liebe-icon[data-active],\n  .liebe-pill[data-active],\n  .liebe-chip[data-active]'
    )
    expect(active).toContain('background: var(--liebe-part-color);')
    expect(active).toContain('color: var(--lcars-black);')
    expect(ruleBody(':where(.liebe-root)')).toContain(
      '--liebe-part-label-active: var(--lcars-black);'
    )

    // The 38% compromise is gone rather than left beside the fill.
    expect(rules).not.toContain('38%')
  })

  it('declares every token on the root rule and nowhere else', () => {
    // A token declared on a descendant is the value that descendant uses
    // however the cascade went above it, so a theme setting one on a pill
    // would beat a user's `.liebe-root { … }` in the LAST layer — inverting
    // the precedence the layer model exists to deliver. The rule already
    // existed ("Configuration & selection": the root is the element themes and
    // user CSS MUST declare token overrides on); nothing enforced it, and the
    // first draft of the label fix broke it.
    //
    // EXCLUSIVITY, not membership, and the distinction is the whole test. The
    // first version of this assertion collected every declared name and every
    // name on the root and required the first set to be contained in the
    // second — which passes when a token sits on the root AND on a part,
    // because the root copy answers for the name. That is exactly the
    // regression this exists to catch: the part copy still wins over an
    // inherited user override, and the root copy is what makes it invisible.
    // So the check is on the text OUTSIDE the root rule, where a declaration
    // has no root copy to hide behind.
    const rootBlock = ruleBody(':where(.liebe-root)')
    const outsideRoot = rules.replace(rootBlock, '')
    const strays = [...outsideRoot.matchAll(/(--liebe-[\w-]+)\s*:/g)].map(([, name]) => name)
    expect(strays, 'declared outside the root rule').toEqual([])
  })

  it('leaves the inactive label neutral', () => {
    // An inactive part is a dark block here, so its label wants the base
    // layer's neutral and nothing else. Overriding `--liebe-part-label` too
    // would put black on near-black.
    expect(rules).not.toContain('--liebe-part-label:')
  })

  it('declares its tokens on the theme root, in every appearance', () => {
    // `.liebe-root` is the element the base layer declares tokens on, and the
    // only element an override may use: a derived `-tint` re-derives only where
    // its base is overridden on the SAME element. Unqualified by appearance on
    // purpose — LCARS is dark-only, so a nested light `Theme` must not put the
    // base layer's light surfaces back under this palette.
    expect(sheetSelectors[0]).toBe(':where(.liebe-root)')
    expect(rules).not.toContain('.dark')
    expect(rules).not.toContain('.light')
  })

  it('uses no `!important`, which is reversed across layers', () => {
    // An important declaration in `liebe-theme` would outrank important
    // declarations in `liebe-user`, inverting the promised precedence.
    expect(rules).not.toMatch(/!\s*important/i)
  })

  it('fetches nothing itself, and fetches its font from the bundle', () => {
    // Home Assistant installs are frequently LAN-only. The theme payload
    // references no asset at all; the font sheet references two, and both
    // resolve against the directory the panel was served from rather than
    // against a webfont CDN.
    expect(rules).not.toMatch(/url\(|image-set\(|@import/i)

    const fontUrls = [...fontCss.matchAll(/url\('([^']+)'\)/g)].map(([, url]) => url)
    expect(fontUrls).toHaveLength(2)
    for (const url of fontUrls) {
      expect(url.startsWith(ASSET_BASE_PLACEHOLDER)).toBe(true)
    }
    expect(fontCss).not.toMatch(/@import|https?:/)
  })

  it('wraps everything in the theme layer, with the order declared', () => {
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    expect(rules).toContain(statement)

    const body = rules.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-theme {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('remaps every domain base and pins every `-text` companion', () => {
    // Pinning `-text` is a MUST for every theme: the base layer derives it from
    // the base hue, which carries no text contrast on any ground
    // (docs/specs/design-system — "The derived `-text` default is not usable as
    // rendered"). Remapping every base is this theme's own promise — a Radix
    // step 9 left over in an okudagram palette would be both off-palette and,
    // for `default` (`--blue-9`, 4.08:1 on black), under the contrast floor a
    // label on it needs.
    for (const { name } of domainColors) {
      const { base, text } = domainColorTokens(name)
      expect(rules, `${base} is not remapped`).toContain(`${base}: var(--lcars-`)
      expect(rules, `${text} is not pinned`).toContain(`${text}: var(--lcars-`)
    }
  })

  it('leaves every tint derived, so a user remap still recolours surfaces', () => {
    // Same reasoning as Liquid Glass: an explicitly set companion stops
    // following its base, and nothing about LCARS needs the tints pinned.
    for (const { name } of domainColors) {
      expect(rules).not.toContain(`${domainColorTokens(name).tint}:`)
    }
  })

  it('gives way on an icon-only tile, where the tile is the tint surface', () => {
    // The one place this theme has to answer for a base-layer rule rather than
    // simply outranking it. `liebe-theme` beats `liebe-base` wholesale, so
    // LCARS's okudagram icon block — a solid fill of the hue with a black
    // glyph — would land back on top of a tile that has just been tinted with
    // the same hue (docs/specs/design-system — "Card anatomy", the icon-only
    // exception). That is the doubled tint the base rule drops the disc to
    // avoid, plus a black glyph on a ground calibrated for a saturated one.
    const iconOnlyRules = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }))
      .filter(({ selector }) => selector.includes('[data-icon-tile]'))

    expect(
      iconOnlyRules.some(
        ({ selector, declarations }) =>
          selector.includes('.liebe-icon[data-active]') &&
          declarations.includes('background: none;')
      )
    ).toBe(true)
    expect(
      iconOnlyRules.some(({ declarations }) =>
        declarations.includes('color: var(--liebe-part-color);')
      )
    ).toBe(true)

    // …and gives way in turn to the person card, whose anchor IS a disc. The
    // base layer keeps that one's background; a theme rule clearing every
    // `.liebe-icon` would win across layers and leave bare initials on the
    // tinted tile. The exception is by domain because that is the vocabulary a
    // theme is allowed — `data-domain` is contract, an avatar class is not.
    expect(
      iconOnlyRules.every(({ selector }) => selector.includes(":not([data-domain='person'])"))
    ).toBe(true)
  })

  it('renders in the bundled typeface, uppercase', () => {
    // The typographic reskin goes through the tokens rather than through rules
    // on text elements, which is what makes it reach portalled overlays too
    // (docs/specs/design-system — "Typography").
    expect(rules).toMatch(/--liebe-font-family:\s*'Antonio'/)
    expect(rules).toContain('--liebe-text-transform: uppercase;')
  })
})

describe('LCARS appearance', () => {
  const lcars = getTheme('lcars')

  it('is registered as dark-only', () => {
    expect(lcars?.appearances).toBe('dark-only')
  })

  it('forces dark whatever the configuration asked for', () => {
    // The scenario in the spec: appearance `auto` on a light-mode OS resolves to
    // light, and activating LCARS must still render the black ground rather
    // than a half-applied theme (docs/specs/theming — "Scenario: LCARS declares
    // dark-only").
    expect(resolveAppearance(lcars, 'light')).toBe('dark')
    expect(resolveAppearance(lcars, 'dark')).toBe('dark')
  })

  it('shows the appearance control as forced', () => {
    // Not merely ignored: the control is disabled with the forced value
    // applied, so the panel never offers a choice it will not honour.
    expect(supportsAppearanceChoice(lcars)).toBe(false)
  })
})
