import { describe, expect, it, vi } from 'vitest'
import { sanitizeCustomCss, scanValue, unescapeCss } from '../customCss'
import { isFullyLayered, USER_LAYER } from '../cssLayers'

/**
 * The sanitizer's acceptance bar.
 *
 * Every case below is an attack on the invariant the theming spec states —
 * *no reference may resolve off-origin, and no declaration may import external
 * CSS* — and each was written to get past a plausible implementation of it: a
 * regex over `url(`, a one-hop `var()` check, a list of "fetch-capable"
 * properties. The suite is the deliverable, not the rule text: when a new
 * vector turns up, it belongs here, because the invariant already forbids it.
 */

/** A stable origin to resolve against, so no test depends on the jsdom URL. */
const BASE = 'https://ha.example/local/liebe/'
const OFF_ORIGIN = 'https://evil.example/pixel.png'

function sanitize(css: string, baseUrl = BASE) {
  return sanitizeCustomCss(css, { baseUrl })
}

/** The declarations that survived, as flat text. */
function applied(css: string, baseUrl = BASE): string {
  return sanitize(css, baseUrl).css
}

describe('unescapeCss', () => {
  it('resolves hex escapes, zero-padded and with or without the terminator', () => {
    expect(unescapeCss('\\75 rl')).toBe('url')
    expect(unescapeCss('\\75rl')).toBe('url')
    expect(unescapeCss('\\000075rl')).toBe('url')
    expect(unescapeCss('\\2192')).toBe('→')
  })

  it('resolves single-character escapes', () => {
    expect(unescapeCss('\\/\\/evil.example')).toBe('//evil.example')
  })

  it('maps null, surrogate and out-of-range escapes to the replacement character', () => {
    expect(unescapeCss('\\0')).toBe('\uFFFD')
    expect(unescapeCss('\\D800')).toBe('\uFFFD')
    expect(unescapeCss('\\110000')).toBe('\uFFFD')
  })

  it('leaves a trailing backslash, which escapes nothing', () => {
    expect(unescapeCss('a\\')).toBe('a\\')
  })
})

describe('scanValue', () => {
  // postcss refuses most malformed values before they reach the scanner, so
  // these go straight at it: the scanner is the judge of what a value can
  // reach, and it has to hold on input no parser vouched for.
  it('reads escapes inside strings without ending them early', () => {
    expect(scanValue('url("a\\")b")').resources).toEqual(['a")b'])
  })

  it('splits var() on its own comma, not one inside a string or nested call', () => {
    expect(scanValue('var(--a, url("x,y"))').resources).toEqual(['x,y'])
    expect(scanValue('var(--a, rgb(1, 2, 3))').variables).toEqual(['--a'])
    expect(scanValue('var(--a\\,b, red)').variables).toEqual(['--a,b'])
    // Defensive, since nothing stops untrusted input putting these first: a
    // comma inside a nested call or a string is not the argument separator.
    expect(scanValue('var(rgb(1,2,3), red)').variables).toEqual(['rgb(1,2,3)'])
    expect(scanValue('var("a,b", red)').variables).toEqual(['"a,b"'])
  })

  it('marks an unterminated string opaque', () => {
    expect(scanValue('"unterminated').opaque).toBe(true)
    expect(scanValue('image-set("unterminated').opaque).toBe(true)
  })

  it('marks an unclosed function opaque', () => {
    expect(scanValue('url(/local/a.png').opaque).toBe(true)
  })

  it('ignores a trailing backslash rather than looping on it', () => {
    expect(scanValue('red\\')).toEqual({
      resources: [],
      variables: [],
      opaque: false,
      tooDeep: false,
    })
  })
})

describe('sanitizeCustomCss — what it lets through', () => {
  it('returns nothing for empty input', () => {
    expect(sanitize('')).toEqual({ css: '', notices: [], rejected: false })
    expect(sanitize('   \n  ')).toEqual({ css: '', notices: [], rejected: false })
  })

  it('wraps surviving rules in the user layer', () => {
    const result = sanitize('.liebe-card { color: red; }')

    expect(result.rejected).toBe(false)
    expect(result.notices).toEqual([])
    expect(result.css).toContain(`@layer ${USER_LAYER} {`)
    expect(result.css).toContain('color: red')
    expect(isFullyLayered(result.css)).toBe(true)
  })

  it('keeps same-origin, relative and data references', () => {
    const css = applied(`.a {
      background-image: url(./tile.png);
      border-image: url("/local/frame.png");
      list-style-image: url(https://ha.example/local/dot.png);
      mask-image: url(data:image/svg+xml;base64,PHN2Zy8+);
    }`)

    expect(css).toContain('./tile.png')
    expect(css).toContain('/local/frame.png')
    expect(css).toContain('https://ha.example/local/dot.png')
    expect(css).toContain('data:image/svg+xml')
  })

  it('keeps ordinary strings, which are only URLs by accident of resolving', () => {
    const css = applied('.a { font-family: "Segoe UI", sans-serif; content: "→ done"; }')

    expect(css).toContain('"Segoe UI"')
    expect(css).toContain('"→ done"')
  })

  it('keeps user importance, which is what makes user CSS the last word', () => {
    expect(applied('.a { color: red !important; }')).toContain('!important')
  })

  it('keeps references to Liebe tokens and to properties the sheet defines', () => {
    const css = applied(`.liebe-root {
      --brand: var(--liebe-c-light);
      --brand-tint: var(--brand);
      --liebe-card-bg: var(--brand-tint);
    }`)

    expect(css).toContain('--brand: var(--liebe-c-light)')
    expect(css).toContain('--brand-tint: var(--brand)')
    expect(css).toContain('--liebe-card-bg: var(--brand-tint)')
  })

  it('keeps at-rules whose preludes reference nothing remote', () => {
    const css = applied('@media (min-width: 40em) { .a { color: red; } }')

    expect(css).toContain('@media (min-width: 40em)')
    expect(css).toContain('color: red')
  })

  it('keeps a statement at-rule, which is not an emptied block', () => {
    expect(applied('@layer mine, theirs;\n.a { color: red; }')).toContain('@layer mine, theirs')
  })

  it('keeps an empty url(), which resolves to the document itself', () => {
    expect(applied('.a { background-image: url(); }')).toContain('url()')
  })

  it('descends into nested rules rather than trusting them', () => {
    const result = sanitize(`.a { color: red; .b { background: url(${OFF_ORIGIN}); } }`)

    expect(result.css).toContain('color: red')
    expect(result.css).not.toContain('evil.example')
  })
})

describe('sanitizeCustomCss — imports', () => {
  it('removes @import in any case, quoted or not, same-origin or not', () => {
    const result = sanitize(`@import url(${OFF_ORIGIN});
      @import "theme.css";
      @IMPORT url(/local/also.css);
      .a { color: red; }`)

    expect(result.css.toLowerCase()).not.toContain('@import')
    expect(result.css).toContain('color: red')
    expect(result.notices.join(' ')).toContain('may not load external stylesheets')
  })

  it('rejects a sheet whose at-rule name is CSS-escaped', () => {
    // `@\69 mport` is `@import` to a browser. postcss will not name that
    // at-rule at all, so the sheet is rejected wholesale rather than parsed
    // into something whose meaning this module cannot vouch for — the same
    // fail-closed answer the layer-escape payload gets.
    const result = sanitize(`@\\69 mport url(${OFF_ORIGIN});`)

    expect(result.rejected).toBe(true)
    expect(result.css).toBe('')
  })

  it('removes an @import hidden inside another at-rule', () => {
    const result = sanitize(`@media screen { @import url(${OFF_ORIGIN}); }`)

    expect(result.css).not.toContain('evil.example')
    expect(result.notices).toHaveLength(1)
  })
})

describe('sanitizeCustomCss — off-origin references', () => {
  const vectors: Array<[string, string]> = [
    ['a scheme-full URL', `background-image: url(${OFF_ORIGIN})`],
    ['a protocol-relative URL', 'background-image: url(//evil.example/pixel.png)'],
    ['a quoted protocol-relative URL', 'background-image: url("//evil.example/pixel.png")'],
    ['CSS-escaped slashes', 'background-image: url(\\/\\/evil.example/pixel.png)'],
    ['a CSS-escaped function name', 'background-image: \\75 rl(//evil.example/pixel.png)'],
    ['an upper-case function name', 'background-image: URL(//evil.example/pixel.png)'],
    ['image-set with a bare string', 'background-image: image-set("//evil.example/a.png" 1x)'],
    [
      'a vendor-prefixed image-set',
      'background-image: -webkit-image-set(url(//evil.example/a.png) 1x)',
    ],
    ['src()', 'background-image: src("//evil.example/a.png")'],
    ['image()', 'background-image: image("//evil.example/a.png")'],
    ['cross-fade()', 'background-image: cross-fade(url(//evil.example/a.png), red)'],
    ['a filter reference', 'filter: url(//evil.example/f.svg#blur)'],
    ['a cursor', 'cursor: url(//evil.example/c.cur), auto'],
    ['a shorthand', 'background: red url(//evil.example/a.png) no-repeat'],
    ['a var() fallback', 'background-image: var(--brand, url(//evil.example/a.png))'],
    ['a non-http scheme', 'background-image: url(ftp://evil.example/a.png)'],
  ]

  it.each(vectors)('drops %s', (_name, declaration) => {
    const result = sanitize(`.a { ${declaration}; color: red; }`)

    expect(result.css).not.toMatch(/evil\.example/i)
    expect(result.css).toContain('color: red')
    expect(result.notices).not.toHaveLength(0)
  })

  it('drops a remote @font-face source while keeping the local one', () => {
    const result = sanitize(`@font-face {
      font-family: Antonio;
      src: local("Antonio"), url(//evil.example/antonio.woff2) format("woff2");
    }`)

    expect(result.css).not.toContain('evil.example')
    expect(result.css).toContain('font-family: Antonio')
  })

  it('drops an at-rule whose prelude names a remote resource', () => {
    const result = sanitize(`@supports (background: url(${OFF_ORIGIN})) { .a { color: red; } }`)

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('@supports')
  })

  it('treats an unresolvable base as resolving nothing', () => {
    // A caller with no document supplies no usable base, so even a relative
    // reference fails closed rather than being trusted.
    expect(applied('.a { background-image: url(./tile.png); }', 'about:blank')).toBe('')
  })

  it('treats an opaque origin as off-origin', () => {
    // Under a `file:` base every origin is "null", which would make a
    // cross-host reference compare equal to the base.
    expect(applied('.a { background-image: url(//evil.example/a.png); }', 'file:///c/ha/')).toBe('')
  })
})

describe('sanitizeCustomCss — laundering through custom properties', () => {
  it('drops an unclean definition and every property that reads it', () => {
    const result = sanitize(`.liebe-root {
      --wallpaper: url(${OFF_ORIGIN});
      background-image: var(--wallpaper);
    }`)

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('--wallpaper')
  })

  it('drops an unclean definition with no consumer at all', () => {
    // Base and theme CSS already consume `--liebe-*` in fetch-capable
    // positions, so the definition alone is enough to fetch.
    const result = sanitize(`.liebe-root { --liebe-card-bg: url(${OFF_ORIGIN}); }`)

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('--liebe-card-bg')
  })

  it('follows delegated indirection through a second user-defined property', () => {
    const result = sanitize(`.liebe-root {
      --one: var(--two);
      --two: url(${OFF_ORIGIN});
      background-image: var(--one);
    }`)

    expect(result.css).toBe('')
  })

  it('treats a reference cycle as unclean', () => {
    const result = sanitize(`.liebe-root {
      --one: var(--two);
      --two: var(--one);
      background-image: var(--one);
    }`)

    expect(result.css).toBe('')
  })

  it('treats a property supplied by the surrounding document as unclean', () => {
    const result = sanitize('.liebe-root { background-image: var(--ha-card-background-image); }')

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('--ha-card-background-image')
  })

  it('treats an undefined property as unclean even behind a clean fallback', () => {
    // The fallback only applies when the property is unset; if the surrounding
    // document sets it, its value wins.
    expect(applied('.a { background-image: var(--ha-image, none); }')).toBe('')
  })

  it('keeps a property whose clean definition survives alongside an unclean one', () => {
    const result = sanitize(`.a { --brand: red; }
      .b { --brand: url(${OFF_ORIGIN}); }
      .c { color: var(--brand); }`)

    expect(result.css).toContain('--brand: red')
    expect(result.css).toContain('color: var(--brand)')
    expect(result.css).not.toContain('evil.example')
  })

  it('recognises an escaped var() spelling', () => {
    expect(applied('.a { background-image: \\76 ar(--ha-image); }')).toBe('')
  })
})

describe('sanitizeCustomCss — laundering through selector scope', () => {
  it('pins every property the sheet defines at the panel roots', () => {
    // Cleanliness is a property of a NAME, but a definition is scoped to the
    // elements its selector matches: `--brand` is clean, and yet at
    // `.liebe-root` it is undefined and would inherit whatever the Home
    // Assistant document supplies.
    const css = applied('.never { --brand: red; } .liebe-root { background: var(--brand); }')

    expect(css).toContain(':host { --brand: initial; }')
    expect(css).toContain(':where(.liebe-root) { --brand: initial; }')
    // The guard comes first, so the sheet's own definitions still win where
    // they apply — `:where()` costs no specificity.
    expect(css.indexOf('--brand: initial')).toBeLessThan(css.indexOf('--brand: red'))
  })

  it('leaves the engine tokens unpinned at the theme root', () => {
    // `--liebe-*` is declared by the base token sheet on that very element; a
    // user-layer `initial` would beat the entire token contract.
    const css = applied('.never { --liebe-card-bg: red; }')

    expect(css).toContain(':host { --liebe-card-bg: initial; }')
    expect(css).not.toContain(':where(.liebe-root) { --liebe-card-bg')
  })

  it('pins a name whose only definition was dropped', () => {
    // That name is exactly the one that would otherwise fall back to an
    // inherited value.
    const css = applied(`.a { --wallpaper: url(${OFF_ORIGIN}); } .b { color: red; }`)

    expect(css).toContain(':where(.liebe-root) { --wallpaper: initial; }')
    expect(css).not.toContain('evil.example')
  })

  it('emits no guard for a sheet that defines nothing', () => {
    expect(applied('.a { color: red; }')).not.toContain('initial')
  })

  it('writes a hostile property name back in its authored spelling', () => {
    // `--x\\7d` IS the property `--x}`. The guard is the one fragment this
    // module composes as text rather than serialising, so emitting the
    // unescaped name would close the rule and then the layer block — the
    // layer escape, rebuilt from the inside.
    const result = sanitize('.a { --x\\7d : red; }')

    expect(result.css).toContain('--x\\7d : initial;')
    expect(result.css).not.toContain('--x}')
    expect(isFullyLayered(result.css)).toBe(true)
  })

  it('keeps the guards inside the user layer', () => {
    expect(isFullyLayered(applied('.a { --brand: red; }'))).toBe(true)
  })
})

describe('sanitizeCustomCss — values laundered in from outside', () => {
  const keywords = ['inherit', 'unset', 'revert', 'revert-layer']

  it.each(keywords)('drops a fetch-capable property set to %s', (keyword) => {
    expect(applied(`.a { background-image: ${keyword}; }`)).toBe('')
  })

  it.each(keywords)('drops a custom property set to %s', (keyword) => {
    // `--x: inherit` and `background-image: inherit` are the same defect:
    // neither contains a URL and both can resolve to one.
    const result = sanitize(`.liebe-root { --wallpaper: ${keyword}; }`)

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('outside the dashboard')
  })

  it('drops `all`, whatever it is set to', () => {
    const result = sanitize('.a { all: revert-layer; color: red; }')

    expect(result.css).not.toContain('all:')
    expect(result.css).toContain('color: red')
    expect(result.notices.join(' ')).toContain('resets every property')
  })

  it('keeps `initial`, which resolves to nothing outside the declaration', () => {
    expect(applied('.a { background-image: initial; }')).toContain('initial')
  })

  it('drops a value it cannot read to the end', () => {
    // An unterminated string or function does not mean what it reads, so it is
    // opaque rather than repaired.
    expect(applied('.a { background-image: url(/local/a.png; }')).toBe('')
    expect(applied('.a { content: "unterminated; }')).toBe('')
    expect(applied('.a { font-family: Antonio\\; }')).toContain('Antonio')
  })
})

describe('sanitizeCustomCss — structure', () => {
  it('rejects a layer-escape payload rather than injecting it', () => {
    // Concatenating this into `@layer liebe-user { … }` would close the
    // generated block and leave an unlayered rule outranking every layer.
    const result = sanitize('} .liebe-card { --liebe-card-radius: 0 } /*')

    expect(result.rejected).toBe(true)
    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('was not applied')
  })

  it('re-serialises balanced input inside the layer, whatever it declared', () => {
    // Even input that opens its own layer lands nested inside `liebe-user`.
    const result = sanitize('@layer mine { .a { color: red; } }')

    expect(result.rejected).toBe(false)
    expect(isFullyLayered(result.css)).toBe(true)
    expect(result.css.indexOf(`@layer ${USER_LAYER} {`)).toBeLessThan(
      result.css.indexOf('@layer mine')
    )
  })

  it('prunes rules its removals emptied', () => {
    const result = sanitize(`@media screen { .a { background-image: url(${OFF_ORIGIN}); } }`)

    expect(result.css).toBe('')
  })

  it('names every distinct removal once', () => {
    const result = sanitize(`.a { background-image: url(${OFF_ORIGIN}); }
      .b { background-image: url(${OFF_ORIGIN}); }
      .c { color: inherit; }`)

    expect(result.notices).toHaveLength(2)
  })
})

describe('sanitizeCustomCss — input that would not terminate', () => {
  /**
   * How long the sanitizer takes and how deep it recurses are part of what it
   * has to get right, not performance trivia. It runs synchronously inside the
   * panel's render, on CSS an imported dashboard supplies and applies
   * immediately, so input that overflows the stack or blocks the thread does
   * not get *rejected* — the throw escapes into the `useMemo` that called it
   * and the panel renders nothing at all, which is a worse outcome than the
   * remote fetch the sanitizer exists to stop.
   *
   * Every case here failed before the cap: the first two overflowed the stack,
   * the third and fourth parsed cleanly (postcss's parser is iterative) and
   * then overflowed on the first walk over the result, and the last blocked for
   * 27 seconds.
   */
  const PATHOLOGICAL = 20000

  /** A value nesting `open` `depth` times around `red`. */
  const nestValue = (open: string, depth: number) =>
    `.a { color: ${open.repeat(depth)}red${')'.repeat(depth)}; }`

  /** A sheet nesting `depth` blocks, the innermost rule included. */
  const nestBlocks = (depth: number) =>
    `${'@media screen {'.repeat(depth - 1)}.a { color: red; }${'}'.repeat(depth - 1)}`

  it('names a value nested past the cap instead of overflowing the stack', () => {
    const result = sanitize(nestValue('a(', PATHOLOGICAL))

    expect(result.css).toBe('')
    expect(result.notices).toEqual([
      'Removed `color`: it nests functions more than 32 levels deep, so it was not read to the end.',
    ])
  })

  it('caps var() fallbacks, which descend by the same route', () => {
    const result = sanitize(nestValue('var(--x, ', PATHOLOGICAL))

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('nests functions more than 32 levels deep')
  })

  it('reads a value nested as deeply as any real one, and stops one past that', () => {
    // The deepest values CSS is actually written with — a gradient over a
    // `color-mix` over a `var()` fallback — reach four or five.
    expect(applied(nestValue('a(', 32))).toContain('red')
    expect(sanitize(nestValue('a(', 33)).notices).toHaveLength(1)
  })

  it('leaves an ordinarily nested value alone', () => {
    const css = applied(`.a {
      background: linear-gradient(color-mix(in srgb, var(--liebe-c-light, rgb(1 2 3)), white), red);
    }`)

    expect(css).toContain('color-mix(in srgb, var(--liebe-c-light, rgb(1 2 3)), white)')
  })

  it('rejects a sheet nested past the cap rather than walking into it', () => {
    const result = sanitize(nestBlocks(PATHOLOGICAL))

    expect(result.rejected).toBe(true)
    expect(result.css).toBe('')
    expect(result.notices).toEqual([
      'Custom CSS was not applied: it nests rules more than 32 levels deep.',
    ])
  })

  it('applies a sheet nested as deeply as any real one, and stops one past that', () => {
    expect(sanitize(nestBlocks(32)).rejected).toBe(false)
    expect(sanitize(nestBlocks(33)).rejected).toBe(true)
  })

  it('terminates on a self-referential var()', () => {
    const result = sanitize('.liebe-root { --loop: var(--loop); background-image: var(--loop); }')

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('--loop')
  })

  it('terminates on mutually referential var()s', () => {
    const result = sanitize(`.liebe-root {
      --ping: var(--pong);
      --pong: var(--ping);
      background-image: var(--ping);
    }`)

    expect(result.css).toBe('')
    expect(result.notices.join(' ')).toContain('--ping')
  })

  it('releases every definition waiting on the same name', () => {
    const css = applied(`.liebe-root {
      --one: var(--ground);
      --two: var(--ground);
      --ground: red;
    }`)

    expect(css).toContain('--one: var(--ground)')
    expect(css).toContain('--two: var(--ground)')
  })

  it('closes a long var() chain written back to front', () => {
    // Definitions in source order, each waiting on the next — what any
    // generator emitting a token set produces, and the worst case for a closure
    // computed by repeated sweeps: one pass per link, quadratic overall. This
    // sheet took 27 seconds that way; the test's own timeout is the assertion.
    const links = 24000
    const chain = Array.from({ length: links }, (_, i) => `--v${i}: var(--v${i + 1});`).join(' ')

    const result = sanitize(`.liebe-root { ${chain} --v${links}: red; }`)

    expect(result.notices).toEqual([])
    expect(result.css).toContain('--v0: var(--v1)')
  })
})

describe('sanitizeCustomCss — default base', () => {
  it('resolves against the document when no base is given', () => {
    expect(sanitizeCustomCss(`.a { background-image: url(${OFF_ORIGIN}); }`).css).toBe('')
    expect(sanitizeCustomCss('.a { background-image: url(./tile.png); }').css).toContain(
      './tile.png'
    )
  })

  it('fails closed outside a document', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(sanitizeCustomCss('.a { background-image: url(./tile.png); }').css).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
