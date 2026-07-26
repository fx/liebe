import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  domainColorTokens,
  domainColors,
  listTokenNames,
  surfaceReferences,
  tokenGroups,
} from '../tokens'

/**
 * The token contract is CSS, so these are source-level assertions rather than
 * DOM ones: jsdom resolves neither `var()` chains nor `color-mix()`, and the
 * properties that matter here (is a companion derived? is anything pinned to a
 * literal?) are properties of the declarations, not of a computed value.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const baseCss = read('../../styles/tokens.css')
const defaultThemeCss = read('../themes/default.css')
const panelSource = read('../../panel.ts')
const previewSource = read('../../../.storybook/preview.tsx')

/**
 * Source with its block comments removed. Every text-level assertion below runs
 * on this rather than the raw file, so documentation prose can neither satisfy
 * an assertion nor break one: these sheets explain themselves with reference
 * hexes and counter-examples, and a comment is not a declaration.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Declared `--liebe-*` values in a sheet, keyed by token name. */
function declarations(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const [, name, value] of css.matchAll(/(--liebe-[\w-]+)\s*:\s*([^;]+);/g)) {
    declared.set(name, value.trim())
  }
  return declared
}

/** CSS `import '…'` specifiers, in source order. */
function cssImports(source: string): string[] {
  // Line comments go too, so a commented-out import cannot pass for a real one.
  const code = stripComments(source).replace(/^[ \t]*\/\/.*$/gm, '')
  return [...code.matchAll(/^import '([^']+\.css)'$/gm)].map(([, specifier]) => specifier)
}

const baseRules = stripComments(baseCss)
const themeRules = stripComments(defaultThemeCss)
const base = declarations(baseRules)
const theme = declarations(themeRules)

describe('token stylesheet', () => {
  it('declares every token the contract catalogues', () => {
    expect([...base.keys()].sort()).toEqual([...listTokenNames()].sort())
  })

  it('pins no literal colour, so every value flows from a Radix scale', () => {
    // A hex literal in the base layer would not flip with the appearance and
    // would survive a Radix upgrade unchanged — the spec requires aliasing.
    expect(baseRules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(baseRules).not.toMatch(/\brgba?\(/i)
  })

  it('derives every domain companion from its base token', () => {
    for (const { name } of domainColors) {
      const { base: baseToken, tint, text } = domainColorTokens(name)
      // A fixed alias here (`var(--amber-a4)`) would survive a theme that
      // remaps only the base, leaving tint and text on the old hue.
      expect(base.get(tint)).toBe(`color-mix(in srgb, var(${baseToken}) 20%, transparent)`)
      expect(base.get(text)).toBe(`var(${baseToken})`)
    }
  })

  it('defaults every domain base so a partial theme still resolves', () => {
    for (const { name, scale } of domainColors) {
      expect(base.get(domainColorTokens(name).base)).toBe(`var(--${scale}-9)`)
    }
  })

  it('overrides only the tokens whose value differs in dark', () => {
    // Assert the delimiter before splitting on it: reformatting or renaming the
    // dark selector would otherwise leave `darkBlock` undefined and surface as a
    // TypeError inside `declarations`, hiding which selector went missing.
    const darkSelector = /\.radix-themes:where\(\.dark, \.dark-theme\),/
    expect(
      baseRules,
      `base sheet does not open its dark block with ${darkSelector.source}`
    ).toMatch(darkSelector)

    const [, darkBlock] = baseRules.split(darkSelector)
    expect([...declarations(darkBlock).keys()]).toEqual([
      '--liebe-bg',
      '--liebe-card-bg',
      '--liebe-card-shadow',
    ])
  })
})

describe('default theme stylesheet', () => {
  it('carries a complete palette, so switching back to it restores every hue', () => {
    for (const { name, scale } of domainColors) {
      const { base: baseToken, text } = domainColorTokens(name)
      expect(theme.get(baseToken)).toBe(`var(--${scale}-9)`)
      // Step 9 is the solid hue; step 11 is the readable text step.
      expect(theme.get(text)).toBe(`var(--${scale}-11)`)
    }
  })

  it('leaves the tints derived, so remapping a base recolours them', () => {
    for (const { name } of domainColors) {
      expect(theme.has(domainColorTokens(name).tint)).toBe(false)
    }
  })
})

describe('cascade layers', () => {
  it.each([
    ['base', baseRules, 'liebe-base'],
    ['default theme', themeRules, 'liebe-theme'],
  ])('wraps the %s sheet in its layer, with the layer order declared', (_name, rules, layer) => {
    // The order statement is repeated per sheet so whichever the bundler emits
    // first still establishes base → theme → user.
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
    expect(rules).toContain(statement)

    // Nothing may sit outside the layer block: an unlayered author declaration
    // outranks every cascade layer and would defeat theme and user overrides.
    const body = rules.replace(statement, '').trim()
    expect(body.startsWith(`@layer ${layer} {`)).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })
})

describe('style set', () => {
  it('gives the workshop preview the same stylesheets the panel injects', () => {
    // The panel links the bundled sheet into its shadow root; the preview
    // imports the same files at document level. Drifting apart means the
    // workshop stops being evidence for what the panel renders.
    expect(cssImports(previewSource)).toEqual(cssImports(panelSource))
  })

  it('injects both token layers', () => {
    expect(cssImports(panelSource)).toEqual(
      expect.arrayContaining(['~/styles/tokens.css', '~/theme/themes/default.css'])
    )
  })
})

describe('token catalogue', () => {
  it('documents a purpose for every catalogued token', () => {
    for (const group of tokenGroups) {
      for (const token of group.tokens) {
        expect(token.name.startsWith('--liebe-')).toBe(true)
        expect(token.purpose.length).toBeGreaterThan(0)
      }
    }
  })

  it('references only surface tokens the contract declares', () => {
    for (const surface of surfaceReferences) {
      expect(base.has(surface.name)).toBe(true)
    }
  })
})
