import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BASE_LAYER,
  LAYER_ORDER_STATEMENT,
  RESET_LAYER,
  VENDOR_LAYER,
  isFullyLayered,
  isThemableProperty,
  isDemotedVendorSheet,
  prepareBaselineCss,
  prepareVendorCss,
  stripThemableImportance,
  wrapInLayer,
} from '../cssLayers'

/**
 * The layer contract, asserted on the text the panel actually ships: the
 * transforms are what stand between a vendored stylesheet and a theme that
 * cannot override it, and between one and a baseline rule it out-specifies
 * (docs/specs/theming — "Application mechanism").
 *
 * What these cannot reach is whether the resulting layer order actually decides
 * a declaration, which is a property of the cascade rather than of the text —
 * `tests/e2e/touch-floor.spec.ts` measures that in a browser.
 */

const require = createRequire(import.meta.url)

/** A vendored stylesheet exactly as the panel imports it. */
function readVendored(specifier: string): string {
  return readFileSync(require.resolve(specifier), 'utf8')
}

const vendoredSheets = {
  '@radix-ui/themes/styles.css': readVendored('@radix-ui/themes/styles.css'),
  'react-grid-layout/css/styles.css': readVendored('react-grid-layout/css/styles.css'),
  'react-resizable/css/styles.css': readVendored('react-resizable/css/styles.css'),
}

/** Every `property: value !important` declaration left in a sheet. */
function importantProperties(css: string): string[] {
  return [...css.matchAll(/([;{]\s*|^\s*)(--[\w-]+|[-\w]+)\s*:[^;{}]*?!\s*important/gi)].map(
    ([, , property]) => property.toLowerCase()
  )
}

describe('themable properties', () => {
  it.each([
    'color',
    'background',
    'background-image',
    'border',
    'border-top-color',
    'border-radius',
    'box-shadow',
    'font',
    'font-family',
    'letter-spacing',
    'text-transform',
    'outline',
    'all',
    // The token channel itself: an important token in the baseline would pin a
    // value beyond the reach of both later layers.
    '--liebe-card-bg',
  ])('counts %s as governed by the token contract', (property) => {
    expect(isThemableProperty(property)).toBe(true)
  })

  it.each([
    'display',
    'visibility',
    'pointer-events',
    'user-select',
    '-webkit-user-select',
    'cursor',
    'animation',
    'box-decoration-break',
    'width',
    'position',
    // Prefix families must not match a merely similar name.
    'bordering',
    'fontastic',
  ])('leaves %s to the component', (property) => {
    expect(isThemableProperty(property)).toBe(false)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(isThemableProperty(' Color ')).toBe(true)
  })
})

describe('stripThemableImportance', () => {
  it('drops importance from themable declarations', () => {
    const css = '.a { color: red !important; background: blue !important; }'

    expect(stripThemableImportance(css)).toBe('.a { color: red; background: blue; }')
  })

  it('keeps importance on behavioural declarations', () => {
    // Radix's ScrollArea and Skeleton rules: nothing a theme overrides, and
    // stripping them breaks scroll layout and loading states.
    const css = '.rt-ScrollAreaViewport > * { display: block !important; }'

    expect(stripThemableImportance(css)).toBe(css)
  })

  it('handles a themable declaration first in its rule and odd spellings', () => {
    const css = '.a{COLOR: red ! IMPORTANT;display:block !important}'

    expect(stripThemableImportance(css)).toBe('.a{COLOR: red;display:block !important}')
  })

  it('leaves a declaration in a following rule alone', () => {
    const css = '.a { width: 1px } .b { display: flex !important }'

    expect(stripThemableImportance(css)).toBe(css)
  })

  /*
   * `!important` is a priority only at the end of its own declaration.
   * Anywhere else — inside a quoted string, inside a `url()` — it is ordinary
   * text, and rewriting it corrupts CSS that never asked for importance. Each
   * of these is on a THEMABLE property, so the stripper does reach the
   * declaration and the assertion is about what it does once there. It stops
   * being hypothetical the moment the custom-CSS editor feeds user input
   * through here.
   */
  it.each([
    ['a double-quoted custom-property value', '.a { --label: "not !important"; }'],
    ['a single-quoted custom-property value', ".a { --label: 'not !important'; }"],
    ['a quoted url()', '.a { background-image: url("not-!important.png"); }'],
    ['an unquoted url()', '.a { background: url(not-!important.png) no-repeat; }'],
    ['a quoted font family', '.a { font-family: "Not !important", sans-serif; }'],
  ])('leaves !important inside %s alone', (_case, css) => {
    expect(stripThemableImportance(css)).toBe(css)
  })

  it('still strips a real priority from a value that quotes the word first', () => {
    const css = '.a { background-image: url("not-!important.png") !important; }'

    expect(stripThemableImportance(css)).toBe('.a { background-image: url("not-!important.png"); }')
  })

  it('strips a priority the sheet ends on, with no terminator after it', () => {
    expect(stripThemableImportance('.a { color: red !important')).toBe('.a { color: red')
  })
})

describe('isFullyLayered', () => {
  it('accepts a sheet whose every rule is inside a layer', () => {
    expect(
      isFullyLayered(`${LAYER_ORDER_STATEMENT}\n@layer liebe-base {\n.a { color: red }\n}\n`)
    ).toBe(true)
  })

  it('accepts a leading @charset ahead of the layer', () => {
    expect(isFullyLayered('@charset "utf-8";@layer liebe-base { .a { color: red } }')).toBe(true)
  })

  it.each([
    // The order statement alone declares an order and layers nothing.
    ['an order statement with unlayered rules', `${LAYER_ORDER_STATEMENT}\n.a { color: red }`],
    ['a partially layered sheet', '@layer liebe-base { .a { color: red } }\n.b { color: blue }'],
    ['a comment that merely mentions @layer', '/* @layer liebe-base */\n.a { color: red }'],
    ['a top-level at-rule that is not a layer', '@media print { .a { color: red } }'],
    ['a statement that is neither @layer nor @charset', "@import url('x.css');"],
    ['an unbalanced closing brace', '@layer liebe-base { .a { color: red } } }'],
    ['an unclosed rule', '@layer liebe-base { .a { color: red }'],
    ['a declaration floating at the top level', 'color: red'],
  ])('rejects %s', (_case, css) => {
    expect(isFullyLayered(css)).toBe(false)
  })
})

describe('wrapInLayer', () => {
  it('wraps an unlayered sheet and declares the layer order', () => {
    const wrapped = wrapInLayer('.a { color: red }', BASE_LAYER)

    expect(wrapped).toContain(LAYER_ORDER_STATEMENT)
    expect(wrapped).toContain(`@layer ${BASE_LAYER} {\n.a { color: red }\n}`)
  })

  it('wraps a sheet that declares the layer order but layers nothing', () => {
    // Mentioning `@layer` is not being layered: these rules would still
    // outrank every layer.
    const wrapped = wrapInLayer(`${LAYER_ORDER_STATEMENT}\n.a { color: red }`, BASE_LAYER)

    expect(wrapped).toContain(`@layer ${BASE_LAYER} {`)
  })

  it('gives a layered sheet the order statement it is missing', () => {
    // Layered but silent about the order: injected into a root where nothing
    // else declares it, the layer would sort by first use instead.
    const wrapped = wrapInLayer('@layer liebe-theme { .a { color: red } }', BASE_LAYER)

    expect(wrapped.startsWith(LAYER_ORDER_STATEMENT)).toBe(true)
    expect(wrapped).toContain('@layer liebe-theme { .a { color: red } }')
    expect(wrapped).not.toContain(`@layer ${BASE_LAYER} {`)
  })

  it('leaves a sheet that declares its own layers untouched', () => {
    // Liebe's own sheets are authored inside their layer; re-wrapping would
    // nest them (`liebe-base.liebe-theme`) and break the order.
    const authored = `${LAYER_ORDER_STATEMENT}\n@layer liebe-theme {\n.a { color: red }\n}\n`

    expect(wrapInLayer(authored, BASE_LAYER)).toBe(authored)
  })

  it('keeps a leading @charset ahead of the wrapper', () => {
    // `@charset` is only honoured as the very first thing in a sheet.
    const wrapped = wrapInLayer('@charset "utf-8";\n.a { color: red }', BASE_LAYER)

    expect(wrapped.startsWith('@charset "utf-8";')).toBe(true)
    expect(wrapped).toContain(`@layer ${BASE_LAYER} {`)
    expect(wrapped).not.toContain('@charset "utf-8";\n.a')
  })
})

describe('prepareBaselineCss', () => {
  it('layers and de-emphasises in one pass', () => {
    const prepared = prepareBaselineCss('.a { color: red !important; display: block !important }')

    expect(prepared).toContain(`@layer ${BASE_LAYER} {`)
    expect(prepared).toContain('color: red;')
    expect(prepared).toContain('display: block !important')
  })
})

describe('@property registrations', () => {
  /**
   * `@property` is a top-level at-rule. Nested inside `@layer`, a parser is
   * entitled to ignore it — the property is then unregistered and any
   * transition on it silently does not run, which is the whole reason a sheet
   * registers one (`src/components/GridCard.css` — the icon-only tile's tint
   * fades because its colour is registered).
   *
   * That makes the SHIPPED shape the thing worth asserting rather than the
   * authored one: a registration written correctly at the top of a sheet is
   * still wrapped by the baseline transform unless this module hoists it, so
   * source placement alone proves nothing about what reaches the browser.
   */
  const REGISTRATION = '@property --x { syntax: "<color>"; inherits: false; initial-value: red }'

  /** Brace depth at `needle`; 0 is top level, anything more is nested. */
  function depthAt(css: string, needle: string): number {
    const index = css.indexOf(needle)
    expect(index, `not found: ${needle}`).toBeGreaterThan(-1)

    let depth = 0
    for (const character of css.slice(0, index)) {
      if (character === '{') depth += 1
      else if (character === '}') depth -= 1
    }
    return depth
  }

  it('reads a sheet with one as fully layered, so it passes through', () => {
    const sheet = `${LAYER_ORDER_STATEMENT}\n${REGISTRATION}\n@layer ${BASE_LAYER} { .a { color: red } }`

    expect(isFullyLayered(sheet)).toBe(true)
    expect(wrapInLayer(sheet, BASE_LAYER)).toBe(sheet)
  })

  it('hoists one out of the wrapper it adds to an unlayered sheet', () => {
    const wrapped = wrapInLayer(`${REGISTRATION}\n.a { color: red }`, BASE_LAYER)

    expect(depthAt(wrapped, '@property')).toBe(0)
    // And the rule beside it is still enclosed — hoisting the registration must
    // not carry ordinary CSS out with it.
    expect(depthAt(wrapped, '.a {')).toBe(1)
  })

  it('leaves the card shell’s own registration at top level as it ships', () => {
    // The real sheet through the real transform, which is the only form of this
    // that could have caught the defect: the authored file had the registration
    // at top level and the baseline wrapper put it back inside the layer.
    // The specifier goes through a variable deliberately: Vite rewrites a
    // *literal* `new URL('./x', import.meta.url)` into an asset URL, which is
    // no longer a `file:` URL and cannot be read from disk.
    const sheetPath = '../../components/GridCard.css'
    const sheet = readFileSync(fileURLToPath(new URL(sheetPath, import.meta.url)), 'utf8')
    const prepared = prepareBaselineCss(sheet)

    expect(depthAt(prepared, '@property --liebe-icon-tile-tint')).toBe(0)
  })
})

describe('prepareVendorCss', () => {
  it('layers a vendored sheet below the baseline and de-emphasises it', () => {
    const prepared = prepareVendorCss(
      '.rt-reset { min-height: 0 !important; color: red !important }'
    )

    expect(prepared).toContain(`@layer ${VENDOR_LAYER} {`)
    // `min-height` is the component's own geometry and keeps its importance;
    // `color` is a token-contract property and loses it.
    expect(prepared).toContain('min-height: 0 !important')
    expect(prepared).toContain('color: red }')
  })

  it('orders the baseline as reset, then vendored, then Liebe’s own rules', () => {
    // The order of these three is the whole fix, and every one of the three
    // positions is load-bearing:
    //
    //   - the reset below the vendored sheets, because `* { padding: 0 }` is
    //     written to lose and would otherwise zero every padding Radix declares
    //   - the vendored sheets below `liebe-base`, because that is what lets the
    //     touch floor's bare `button` beat Radix's `.rt-reset` class selector
    //   - all three below `liebe-theme` and `liebe-user`, unchanged
    //
    // Spelled out as one literal rather than composed from the constants,
    // because composing it would assert nothing: the statement and the layer
    // names would move together and the test would pass on any order at all.
    expect(LAYER_ORDER_STATEMENT).toBe(
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    )
    expect(RESET_LAYER).toBe(`${BASE_LAYER}.reset`)
    expect(VENDOR_LAYER).toBe(`${BASE_LAYER}.vendor`)
  })

  it('wraps a vendored sheet that already declares its own layer', () => {
    // `wrapInLayer` hands an already-layered sheet back, which is right for
    // Liebe's own sheets and wrong for a dependency: the layer a dependency
    // authored is ITS layer, registered wherever it was first seen — after
    // `liebe-user` in the common case — so its ordinary declarations would
    // outrank the theme and the user. Nesting it keeps its internal order and
    // contains the lot.
    const prepared = prepareVendorCss('@layer their-name { .a { color: red } }')

    expect(prepared).toContain(`@layer ${VENDOR_LAYER} {`)
    expect(prepared).toContain('@layer their-name { .a { color: red } }')
  })
})

describe('isDemotedVendorSheet', () => {
  it.each([
    '/repo/node_modules/@radix-ui/themes/styles.css',
    'C:\\repo\\node_modules\\@radix-ui\\themes\\styles.css',
    // A transitive copy, which is where a hoisting-defeated install puts it.
    '/repo/node_modules/a/node_modules/@radix-ui/themes/styles.css',
  ])('demotes %s', (id) => {
    expect(isDemotedVendorSheet(id)).toBe(true)
  })

  /*
   * The grid packages, which this test used to pin the other way round.
   *
   * They stayed in `liebe-base` for as long as nothing needed to outrank them,
   * because demoting a sheet activates every first-party rule that was losing to
   * it — and `GridLayoutSection.css` was full of handle rules nobody had seen
   * render. [0036](../../../docs/changes/0036-theming-contract-gaps.md) PR 5 did
   * the reconciliation those rules needed and demoted both: the coarse-pointer
   * touch floor `grid-layout` states as a MUST is one of the rules that was
   * losing, so something does need to outrank them now.
   *
   * Both packages rather than one. `react-resizable` styles
   * `.react-resizable-handle` and `react-grid-layout` styles
   * `.react-grid-item > .react-resizable-handle`, so demoting either alone
   * leaves the other unlayered and still winning — which would look like a
   * partial fix and behave like none.
   */
  it.each([
    '/repo/node_modules/react-grid-layout/css/styles.css',
    '/repo/node_modules/react-resizable/css/styles.css',
  ])('demotes the grid package %s', (id) => {
    expect(isDemotedVendorSheet(id)).toBe(true)
  })

  /*
   * A vendored package that is NOT on the list, so the discriminator is still
   * exercised. Without this the suite could not tell "demotes what it should"
   * from "demotes everything under node_modules", which is the rule the list
   * exists to avoid being.
   */
  it('leaves a vendored package nothing needs to outrank in the baseline layer', () => {
    expect(isDemotedVendorSheet('/repo/node_modules/react-markdown/styles.css')).toBe(false)
  })

  it.each([
    '/repo/src/styles/app.css',
    '/repo/src/components/anatomy/anatomy.css',
    // The package name outside node_modules is a first-party file.
    '/repo/src/vendor/@radix-ui/themes/styles.css',
  ])('leaves first-party %s in the baseline layer', (id) => {
    expect(isDemotedVendorSheet(id)).toBe(false)
  })
})

describe('the vendored stylesheets as they ship', () => {
  // The transform is asserted against all three sheets as they ship, because it
  // has to survive whatever text a dependency emits — which of them the build
  // actually routes through it is `isDemotedVendorSheet`'s decision, above.
  it.each(Object.entries(vendoredSheets))(
    '%s survives the vendor treatment with no themable importance',
    (_specifier, css) => {
      const prepared = prepareVendorCss(css)

      expect(prepared).toContain(LAYER_ORDER_STATEMENT)
      expect(prepared).toContain(`@layer ${VENDOR_LAYER} {`)
      expect(importantProperties(prepared).filter(isThemableProperty)).toEqual([])
    }
  )

  it('preserves the behavioural importance Radix depends on', () => {
    const prepared = prepareVendorCss(vendoredSheets['@radix-ui/themes/styles.css'])

    // The ScrollArea viewport and the Skeleton mask: overriding these is not
    // theming, it is breaking the component.
    expect(prepared).toContain('display: block !important')
    expect(prepared).toContain('visibility: hidden !important')
    expect(prepared).toContain('pointer-events: none !important')
  })

  it.each(Object.entries(vendoredSheets))(
    '%s contains no @import, which a layer wrapper would invalidate',
    (_specifier, css) => {
      // `@import` is only valid at the top of a sheet, so a dependency that
      // starts using one would break silently inside the wrapper. Fail here
      // instead, where the fix (hoisting it as `@import … layer(liebe-base)`)
      // is obvious.
      expect(css).not.toMatch(/@import\b/)
    }
  )
})
