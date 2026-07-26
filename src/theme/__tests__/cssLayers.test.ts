import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BASE_LAYER,
  LAYER_ORDER_STATEMENT,
  isFullyLayered,
  isThemableProperty,
  prepareBaselineCss,
  stripThemableImportance,
  wrapInLayer,
} from '../cssLayers'

/**
 * The layer contract, asserted on the text the panel actually ships: the
 * transforms are what stand between an unlayered vendored stylesheet and a
 * theme that cannot override it (docs/specs/theming — "Application mechanism").
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

describe('the vendored stylesheets as they ship', () => {
  it.each(Object.entries(vendoredSheets))(
    '%s lands in the base layer with no themable importance',
    (_specifier, css) => {
      const prepared = prepareBaselineCss(css)

      expect(prepared).toContain(LAYER_ORDER_STATEMENT)
      expect(prepared).toContain(`@layer ${BASE_LAYER} {`)
      expect(importantProperties(prepared).filter(isThemableProperty)).toEqual([])
    }
  )

  it('preserves the behavioural importance Radix depends on', () => {
    const prepared = prepareBaselineCss(vendoredSheets['@radix-ui/themes/styles.css'])

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
