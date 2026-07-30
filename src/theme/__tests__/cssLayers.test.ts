import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BASE_LAYER,
  LAYER_ORDER_STATEMENT,
  VENDOR_LAYER,
  isFullyLayered,
  isThemableProperty,
  isVendoredSheet,
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

  it('nests that layer inside the baseline rather than beside it', () => {
    // Not a spelling detail. A sibling `liebe-vendor` would have to be named in
    // the order statement, and a layer's position is fixed by the FIRST
    // statement a root sees — so in any root where a sheet carrying the
    // three-layer statement loaded first, the new name would sort AFTER
    // `liebe-user` and the vendored sheet would outrank everything. A sub-layer
    // is ordered by its parent and needs no statement, which is why the
    // statement below still names three layers.
    expect(VENDOR_LAYER).toBe(`${BASE_LAYER}.vendor`)
    expect(LAYER_ORDER_STATEMENT).toBe(`@layer ${BASE_LAYER}, liebe-theme, liebe-user;`)
  })
})

describe('isVendoredSheet', () => {
  it.each([
    '/repo/node_modules/@radix-ui/themes/styles.css',
    '/repo/node_modules/react-grid-layout/css/styles.css',
    'C:\\repo\\node_modules\\react-resizable\\css\\styles.css',
    // A nested dependency, which is where a transitive sheet arrives from.
    '/repo/node_modules/a/node_modules/b/styles.css',
  ])('reads %s as vendored', (id) => {
    expect(isVendoredSheet(id)).toBe(true)
  })

  it.each([
    '/repo/src/styles/app.css',
    '/repo/src/components/anatomy/anatomy.css',
    // The name without the path separators around it is a first-party file.
    '/repo/src/styles/node_modules-notes.css',
  ])('reads %s as first-party', (id) => {
    expect(isVendoredSheet(id)).toBe(false)
  })
})

describe('the vendored stylesheets as they ship', () => {
  it.each(Object.entries(vendoredSheets))(
    '%s lands in the vendor sub-layer with no themable importance',
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
