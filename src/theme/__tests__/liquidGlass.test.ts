import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { domainColorTokens, domainColors } from '../tokens'
import { getTheme } from '../themeRegistry'

/**
 * Liquid Glass is a *token-only* theme, and this file is what makes that a gate
 * rather than a review convention.
 *
 * docs/changes/0013-built-in-themes.md: "a diff adding any selector to that
 * file fails review. If Liquid Glass turns out to need a rule, the token
 * contract is incomplete — fix the contract, not the theme." A reviewer can
 * miss that; a test cannot.
 *
 * Source-level assertions, like `tokens.test.ts` and for the same reason: jsdom
 * resolves neither `var()` chains nor `color-mix()`, and what matters here is a
 * property of the declarations (is there a selector? is every declaration a
 * token?), not of a computed value.
 */

/**
 * Indirected through a parameter on purpose, as in `tokens.test.ts`: Vite
 * rewrites a literal `new URL('./x.css', import.meta.url)` into an asset
 * reference, which is no longer a `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const themeCss = read('../themes/liquidGlass.css')

/** Source with block comments removed — prose is not a declaration. */
const rules = themeCss.replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of every rule in the sheet, keyed by its selector. */
function ruleBlocks(css: string): Map<string, string> {
  // The sheet is two flat rules inside one `@layer` block, so the layer wrapper
  // is stripped first and the rest matched non-greedily. A nested at-rule would
  // break this — and that is intentional: it would also be a rule, which the
  // "declares nothing but tokens" assertion below already forbids.
  const inner = css
    .replace(/@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;/, '')
    .trim()
  const body = inner.replace(/^@layer liebe-theme\s*\{/, '').replace(/\}\s*$/, '')

  const blocks = new Map<string, string>()
  for (const [, selector, block] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.set(selector.trim().replace(/\s+/g, ' '), block)
  }
  return blocks
}

/** Declared property names in a rule body, in source order. */
function declaredProperties(block: string): string[] {
  return [...block.matchAll(/([\w-]+)\s*:/g)]
    .map(([, name]) => name)
    .filter((name) => name.startsWith('--'))
}

const blocks = ruleBlocks(rules)

describe('Liquid Glass stylesheet', () => {
  it('is the registered theme’s payload', () => {
    // Reading the file and reading the registry must be the same thing, or
    // every assertion below is about a sheet nothing ships.
    expect(getTheme('liquid-glass')?.css).toBe(themeCss)
  })

  it('declares on the theme root only, in both appearances', () => {
    // `.radix-themes` is the element the base layer declares tokens on, and the
    // only element an override may use: a derived `-tint` re-derives only where
    // its base is overridden on the SAME element, so an override on a
    // descendant would leave the companions on the old hue
    // (docs/specs/design-system — "Design").
    expect([...blocks.keys()]).toEqual([
      ':where(.radix-themes)',
      '.radix-themes:where(.dark, .dark-theme), :is(.dark, .dark-theme) :where(.radix-themes:not(.light, .light-theme))',
    ])
  })

  it('declares nothing but `--liebe-*` tokens', () => {
    // THE constraint. A single ordinary property here — one `background` on
    // `.liebe-card`, one `text-transform` — would make Liquid Glass a theme
    // with a code path, and it would stop being evidence that the token
    // contract is complete.
    for (const [selector, block] of blocks) {
      const properties = [...block.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map(([, name]) => name)
      expect(properties, `non-token declaration under ${selector}`).toEqual(
        properties.filter((name) => name.startsWith('--liebe-'))
      )
      expect(properties.length).toBeGreaterThan(0)
    }
  })

  it('uses no `!important`, which is reversed across layers', () => {
    // An important declaration in `liebe-theme` would outrank important
    // declarations in `liebe-user`, inverting the promised precedence.
    expect(rules).not.toMatch(/!\s*important/i)
  })

  it('fetches nothing, so it works on a LAN-only install', () => {
    // Home Assistant installs are frequently offline; a theme that referenced a
    // webfont or a wallpaper image would simply fail for those users
    // (docs/changes/0013 — "Both themes MUST work offline with no external
    // fetches").
    expect(rules).not.toMatch(/url\(|image-set\(|@import/i)
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

  it('paints the ground with a gradient mesh in both appearances', () => {
    // The distinctive token, and the one the base sheet's `background` (rather
    // than `background-color`) exists to allow. Both appearances get their own
    // mesh — the light variant is not the dark one lightened.
    for (const [selector, block] of blocks) {
      expect(block, `${selector} declares no wallpaper`).toMatch(
        /--liebe-bg:\s*[\s\S]*radial-gradient\(/
      )
    }
  })

  it('leaves every domain base and tint to the base layer', () => {
    // Liquid Glass recolours the ground, not the state palette. Leaving the
    // bases alone — and the tints derived — is what keeps the contract's
    // promise alive under this theme: user CSS remapping `--liebe-c-light`
    // recolours glyph and tint together.
    for (const { name } of domainColors) {
      const { base, tint } = domainColorTokens(name)
      expect(rules).not.toContain(`${base}:`)
      expect(rules).not.toContain(`${tint}:`)
    }
  })

  it('pins every `-text` companion, because glass is not a Radix step 1–3 ground', () => {
    // The base layer derives `-text` from the base hue (raw step 9, no text
    // contrast anywhere), and the Default theme's step-11 pin is calibrated
    // against the scale's low steps. A glass card is not one: leaving `-text`
    // unset here would put unreadable state text on every card. Pinned as a
    // complete set, so no domain is left behind.
    for (const { name, scale } of domainColors) {
      expect(declaredProperties(blocks.get(':where(.radix-themes)')!)).toContain(
        domainColorTokens(name).text
      )
      expect(rules).toContain(`${domainColorTokens(name).text}: var(--${scale}-12);`)
    }
  })
})
