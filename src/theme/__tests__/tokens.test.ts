import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isFullyLayered } from '../cssLayers'
import {
  domainColorTokens,
  domainColors,
  listRootDeclaredTokenNames,
  listUseDefaultedTokenNames,
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

/**
 * How many `@layer … { … }` blocks a sheet opens at the TOP level.
 *
 * Depth-aware rather than a count of the word, because a nested layer is not a
 * second block: `app.css` nests `@layer reset` inside its base block, since the
 * universal reset has to sit below the vendored sheets to keep losing to them
 * (docs/specs/theming — "Application mechanism").
 *
 * One block is what the assertions below require, and they pair it with
 * `isFullyLayered` because neither is sufficient alone: this counts blocks and
 * cannot see a rule sitting outside one, while `isFullyLayered` accepts any
 * number of layered blocks. A sheet needs both — everything inside a layer, and
 * one layer per sheet so nothing can later be added between two of them.
 */
function topLevelLayerBlocks(css: string): number {
  let depth = 0
  let blocks = 0
  let pending = ''

  for (const character of css) {
    if (character === '{') {
      if (depth === 0 && pending.trim().startsWith('@layer')) blocks += 1
      depth += 1
      pending = ''
    } else if (character === '}') {
      depth -= 1
      pending = ''
    } else if (depth === 0) {
      pending += character
    }
  }

  return blocks
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

/**
 * The selector both sheets open their dark-appearance block with. Radix's
 * classless default is light, so light is the unconditional value and dark is
 * the override.
 *
 * Whitespace is optional everywhere CSS allows it, because the assertions below
 * are about the selector list — `.dark` and `.dark-theme`, in that order, inside
 * `:where()` on `.liebe-root`, with the trailing comma that makes the nested
 * branch follow it — and not about how it happens to be formatted. Pinning the
 * single space after the comma would fail on a cosmetic reflow that changes no
 * selector, and a test that fails on formatting teaches the next reader to edit
 * the assertion, which is how a real contract check gets hollowed out. It stays
 * strict about everything that is semantic: no whitespace is tolerated between
 * `.liebe-root` and `:where(`, where CSS would read it as a descendant
 * combinator and mean something else entirely.
 */
const DARK_SELECTOR = /\.liebe-root:where\(\s*\.dark\s*,\s*\.dark-theme\s*\)\s*,/

/**
 * The same selector as a sheet writes it, for the failure messages below. The
 * pattern's own `source` is what a reader would otherwise be shown, and with the
 * whitespace classes in it that is a wall of backslashes naming nothing —
 * `\.liebe-root:where\(\s*\.dark\s*,\s*…`. A test that has just failed should
 * say which selector it went looking for, in the language of the file it was
 * looking in.
 */
const DARK_SELECTOR_CSS = '.liebe-root:where(.dark, .dark-theme),'

/**
 * The Default theme pins `-text` per appearance, so its sheet has to be read as
 * two blocks. A single whole-file `declarations()` map would return the dark
 * value for any token both blocks declare and silently stop checking the light
 * one — the appearance the defect was in.
 */
const [themeLightRules, themeDarkRules = ''] = themeRules.split(DARK_SELECTOR)
const themeLight = declarations(themeLightRules)
const themeDark = declarations(themeDarkRules)

/**
 * The hues whose Radix step 11 measures under the 4.5:1 text floor on the light
 * card surface, with the step the Default theme pins them to there instead.
 *
 * Measured on rendered pixels against `--liebe-card-bg` (`--gray-1`, #fcfcfd):
 * amber-11 4.497:1, orange-11 4.398:1, teal-11 4.450:1. Step 11 is calibrated
 * against steps 1–2 of its own scale rather than against a neutral, which is
 * why only the warm and warm-leaning hues fall short. Every other hue clears
 * the floor at step 11 in light and stays there: pulling the passing hues
 * darker would change the state line's weight on every card to fix a defect
 * three hues have (change 0035).
 */
const LIGHT_TEXT_STEPS = new Map([
  ['light', 12],
  ['heat', 12],
  ['vacuum', 12],
])

describe('token stylesheet', () => {
  it('declares exactly the tokens the contract catalogues as root-declared', () => {
    // Both directions: a token catalogued but not declared, and a token
    // declared but not catalogued, each fail here. The `defaultedAtUse` few are
    // the deliberate exception and are checked by the test below instead — the
    // two together still cover the whole contract.
    expect([...base.keys()].sort()).toEqual([...listRootDeclaredTokenNames()].sort())
  })

  it('leaves the use-defaulted tokens undeclared, which is what makes them inert', () => {
    // Declaring one here would defeat its own default. These are the tokens
    // whose default is another token that components resolve LOCALLY — the
    // label pair's `--liebe-muted` / `--liebe-fg` — and a custom property is
    // substituted at the element that declares it, so an alias on the root
    // resolves the neutral once at the root and inherits the answer. The rule
    // it replaced read the neutral at the label, honouring anything set
    // between; the fallback form keeps that and the root alias would not
    // (docs/changes/0036-theming-contract-gaps.md PR 3, whose whole claim is
    // that the tokens change nothing until a theme sets one).
    const useDefaulted = listUseDefaultedTokenNames()
    expect(useDefaulted.length).toBeGreaterThan(0)
    for (const name of useDefaulted) {
      expect(base.has(name), `${name} is declared on the root`).toBe(false)
    }
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
    expect(
      baseRules,
      `base sheet does not open its dark block with \`${DARK_SELECTOR_CSS}\` (whitespace-insensitive)`
    ).toMatch(DARK_SELECTOR)

    const [, darkBlock] = baseRules.split(DARK_SELECTOR)
    expect([...declarations(darkBlock).keys()]).toEqual([
      '--liebe-bg',
      '--liebe-card-bg',
      '--liebe-card-shadow',
    ])
  })
})

describe('default theme stylesheet', () => {
  it('opens its dark block with the same selector the base sheet uses', () => {
    // Without this the split above yields one block, `themeDark` is empty, and
    // the per-appearance assertions below would read as "dark declares nothing
    // extra" rather than "the dark block went missing".
    expect(
      themeRules,
      `default theme sheet does not open its dark block with \`${DARK_SELECTOR_CSS}\` (whitespace-insensitive)`
    ).toMatch(DARK_SELECTOR)
  })

  it('carries a complete palette, so switching back to it restores every hue', () => {
    for (const { name, scale } of domainColors) {
      const { base: baseToken, text } = domainColorTokens(name)
      // Step 9 is the solid hue, in both appearances; the text step is the one
      // that varies, asserted per appearance below.
      expect(themeLight.get(baseToken)).toBe(`var(--${scale}-9)`)
      expect(themeLight.has(text)).toBe(true)
    }
  })

  it('pins every text companion to the step that measures on the light card', () => {
    for (const { name, scale } of domainColors) {
      const step = LIGHT_TEXT_STEPS.get(name) ?? 11
      expect(themeLight.get(domainColorTokens(name).text)).toBe(`var(--${scale}-${step})`)
    }
  })

  it('restores step 11 in dark for exactly the hues light darkens', () => {
    // Dark measures 8.3:1 at worst on step 11, so it has no defect to fix and
    // change 0035 puts it out of scope. Asserting the dark block's full key list
    // is what makes an unasked-for dark-appearance change fail: any other token
    // appearing here moves a figure this change promised not to touch.
    const darkened = domainColors.filter(({ name }) => LIGHT_TEXT_STEPS.has(name))
    expect([...themeDark.keys()]).toEqual(darkened.map(({ name }) => domainColorTokens(name).text))
    for (const { name, scale } of darkened) {
      expect(themeDark.get(domainColorTokens(name).text)).toBe(`var(--${scale}-11)`)
    }
  })

  it('leaves the tints derived, so remapping a base recolours them', () => {
    for (const { name } of domainColors) {
      const { tint } = domainColorTokens(name)
      expect(themeLight.has(tint)).toBe(false)
      expect(themeDark.has(tint)).toBe(false)
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
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    expect(rules).toContain(statement)

    // Nothing may sit outside the layer block: an unlayered author declaration
    // outranks every cascade layer and would defeat theme and user overrides.
    const body = rules.replace(statement, '').trim()
    expect(body.startsWith(`@layer ${layer} {`)).toBe(true)
    expect(isFullyLayered(body)).toBe(true)
    expect(topLevelLayerBlocks(body)).toBe(1)
  })
})

describe('style set', () => {
  it('gives the workshop preview the same stylesheets the panel injects', () => {
    // The panel links the bundled sheet into its shadow root; the preview
    // imports the same files at document level. Drifting apart means the
    // workshop stops being evidence for what the panel renders.
    expect(cssImports(previewSource)).toEqual(cssImports(panelSource))
  })

  it('imports the base token layer', () => {
    expect(cssImports(panelSource)).toEqual(expect.arrayContaining(['~/styles/tokens.css']))
  })

  it('imports no theme sheet, because the theme layer is injected', () => {
    // A statically imported theme would apply whichever themes are registered,
    // all at once and permanently. The active theme comes from the registry
    // and is injected into the root instead (src/theme/styleInjection.ts), so
    // it can be swapped live.
    for (const source of [panelSource, previewSource]) {
      expect(cssImports(source).filter((specifier) => specifier.startsWith('~/theme/'))).toEqual([])
    }
  })
})

describe('baseline stylesheets', () => {
  // Every sheet the panel injects, not just the token sheets: an unlayered
  // author rule outranks every cascade layer, so one sheet left outside
  // `liebe-base` is one component a theme and user CSS cannot restyle
  // (docs/specs/theming — "Application mechanism"). The vendored sheets cannot
  // be authored, and are wrapped at build time by vite/baselineCssPlugin.ts.
  //
  // Document-level font registrations are the one exception, and not an
  // exemption: they are never injected into a layered root at all. A theme's
  // `@font-face` rules go into the OWNING document (a shadow root does not load
  // a face declared inside it), where there is no `liebe-base` to belong to and
  // nothing for a layer to order them against — see
  // `src/theme/fontRegistration.ts`.
  const FONT_SHEETS = ['src/theme/themes/lcars.fonts.css']
  const allSheets = globSync('src/**/*.css', { cwd: process.cwd() }).sort()
  const sheets = allSheets.filter((sheet) => !FONT_SHEETS.includes(sheet))

  it('finds the sheets to check', () => {
    // Guards the assertion below against a glob that silently matches nothing.
    expect(sheets.length).toBeGreaterThan(5)
    // And against the exclusion list drifting: every name on it has to be a
    // sheet that actually exists, or it is quietly exempting nothing — or, if
    // one is deleted and the entry stays, quietly exempting the wrong thing
    // later.
    expect(allSheets).toEqual(expect.arrayContaining(FONT_SHEETS))
  })

  /**
   * `@property` registrations, which are lifted out before a sheet is judged.
   *
   * The second exception, and no more an exemption than the font one: the rule
   * is about *overridable declarations*, and a registration declares no style
   * at all — it gives a custom property a syntax, an inherit flag and an
   * initial value, none of which a theme could want to outrank. What it does
   * is make the property animatable, which is why it cannot be layered:
   * `@property` is a TOP-LEVEL at-rule, and a parser is entitled to ignore a
   * nested one, leaving the property unregistered and any transition on it
   * inert (`src/components/GridCard.css` — the icon-only tile's tint colour).
   *
   * So the carve-out is the narrowest shape that admits it: only `@property`
   * blocks, only where they are already outside every layer, and the sheet's
   * remaining body still has to be wholly layered.
   */
  const PROPERTY_RULE = /@property\s+[^{]+\{[^}]*\}/g

  it.each(sheets)('%s puts all of its CSS inside a cascade layer', (sheet) => {
    const rules = stripComments(read(`../../../${sheet}`)).trim()
    const statement =
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'

    expect(rules).toContain(statement)

    const body = rules.replace(statement, '').replace(PROPERTY_RULE, '').trim()
    expect(body.startsWith('@layer ')).toBe(true)
    expect(isFullyLayered(body)).toBe(true)
    expect(topLevelLayerBlocks(body)).toBe(1)
  })

  it.each(sheets)('%s keeps any @property registration outside every layer', (sheet) => {
    // The other half of the carve-out above, and the half that makes it safe:
    // stripping `@property` unconditionally would also hide one NESTED inside
    // the layer — the exact defect that silently unregisters the property and
    // kills the fade. So every registration a sheet has must appear before the
    // layer block opens.
    //
    // Sheets with none pass vacuously and that is correct; the registrations
    // that exist are pinned in the sheet's own test as well
    // (`cardShellStyles.test.ts`), where the count is not vacuous.
    const rules = stripComments(read(`../../../${sheet}`)).trim()
    const layerBlock = rules.indexOf('@layer liebe-base {')

    for (const match of rules.matchAll(PROPERTY_RULE)) {
      expect(match.index, `${sheet}: @property is nested inside a layer`).toBeLessThan(layerBlock)
    }
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

  it('states that the control height is a maximum, not a size a theme can pin', () => {
    /*
     * The re-pin change 0042 made: same name, same 42px default, and what
     * setting it states is a MAXIMUM. "A theme MUST NOT assume a slider measures
     * that value at `tall`, and cannot obtain a thicker track there from this
     * token alone — the content region is what bounds it"
     * (docs/specs/design-system/index.md — "Cross-axis fit", migration note).
     *
     * Asserted on the catalogue because the catalogue is what a theme author
     * reads: the token panel is the documentation surface, and a purpose still
     * reading "Embedded slider height" would tell them the one thing this change
     * made untrue. The value itself is unchanged and is pinned above with the
     * rest of the geometry.
     */
    const geometry = tokenGroups.find((group) => group.id === 'geometry')
    const control = geometry?.tokens.find((token) => token.name === '--liebe-control-height')

    expect(control, 'the geometry group must still catalogue the control height').toBeDefined()
    expect(control!.purpose).toMatch(/maximum/i)
    /*
     * Both halves, because "maximum" alone still reads as a size a theme sets
     * and gets: what the re-pin actually says is that the tile narrows the
     * control below it. A purpose that dropped the second half would document
     * a token this build does not have.
     */
    expect(control!.purpose).toMatch(/narrow/i)
    expect(control!.purpose).not.toMatch(/^Embedded slider height$/)
  })

  it('references only surface tokens the contract declares', () => {
    for (const surface of surfaceReferences) {
      expect(base.has(surface.name)).toBe(true)
    }
  })
})
