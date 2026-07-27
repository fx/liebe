import { afterEach, describe, expect, it } from 'vitest'
import { ASSET_BASE_PLACEHOLDER, FONT_STYLE_SLOT, registerThemeFonts } from '../fontRegistration'
import { getTheme, type ThemeDefinition } from '../themeRegistry'

/**
 * Document-level font registration — the one part of a theme that cannot live
 * in the panel's shadow root, because a shadow root does not load `@font-face`
 * declared inside it (docs/specs/theming — "Application mechanism").
 *
 * What is asserted here is what the change document requires of it: that it
 * lands at the document level, that the bundled file is resolved against the
 * published asset base rather than a CDN, and that it is idempotent across
 * panel remounts.
 */

const FONT_SELECTOR = `style[data-liebe="${FONT_STYLE_SLOT}"]`

const lcars = getTheme('lcars')!

/** A theme with a font sheet whose whole body is the placeholder's use. */
const stubTheme: ThemeDefinition = {
  id: 'stub',
  label: 'Stub',
  appearances: 'both',
  css: '',
  fontFaces: `@font-face { font-family: 'Stub'; src: url('${ASSET_BASE_PLACEHOLDER}fonts/stub.woff2'); }`,
}

function registrations(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>(FONT_SELECTOR)]
}

afterEach(() => {
  registrations().forEach((style) => style.remove())
  delete window.__LIEBE_ASSET_BASE_URL__
})

describe('registerThemeFonts', () => {
  it('registers the theme’s faces in the document head', () => {
    const style = registerThemeFonts(lcars, document)

    // In the document, not in the root the theme layer goes into: this is the
    // whole reason the registration is a separate mechanism.
    expect(style?.parentElement).toBe(document.head)
    expect(style?.getAttribute('data-liebe-theme')).toBe('lcars')
    expect(style?.textContent).toContain('@font-face')
    expect(style?.textContent).toContain('Antonio')
  })

  it('resolves the bundled file against the published asset base', () => {
    // The panel is served from a different directory in dev, in the workshop
    // and in a Home Assistant install, so the URL cannot be baked into the
    // sheet — and a relative one would resolve against Home Assistant's
    // document rather than against the panel's directory.
    window.__LIEBE_ASSET_BASE_URL__ = 'https://ha.example/local/liebe/'

    const css = registerThemeFonts(lcars, document)!.textContent!

    expect(css).toContain("url('https://ha.example/local/liebe/fonts/antonio/antonio-latin.woff2')")
    expect(css).not.toContain(ASSET_BASE_PLACEHOLDER)
  })

  it('falls back to the origin root when no base was published', () => {
    // A tree rendered outside the panel bootstrap has no published base; `/` is
    // the same guess `WeatherCard` makes for its background images.
    const css = registerThemeFonts(stubTheme, document)!.textContent!

    expect(css).toContain("url('/fonts/stub.woff2')")
  })

  it('is idempotent across remounts', () => {
    // The panel remounts its React tree on reconnect. A second `<style>` per
    // remount would re-declare the face — and, in engines that do not dedupe an
    // identical `src`, re-fetch the file — every time.
    const first = registerThemeFonts(lcars, document)
    const second = registerThemeFonts(lcars, document)

    expect(second).toBe(first)
    expect(registrations()).toHaveLength(1)
  })

  it('rewrites an existing registration when the asset base moves', () => {
    registerThemeFonts(stubTheme, document)

    window.__LIEBE_ASSET_BASE_URL__ = 'https://ha.example/local/liebe-2/'
    const style = registerThemeFonts(stubTheme, document)

    expect(registrations()).toHaveLength(1)
    expect(style?.textContent).toContain("url('https://ha.example/local/liebe-2/fonts/stub.woff2')")
  })

  it('keeps one registration per theme', () => {
    // Two themes bundling different faces must not overwrite each other's
    // sheet — the marker carries the theme id for exactly that.
    registerThemeFonts(lcars, document)
    registerThemeFonts(stubTheme, document)

    expect(registrations().map((style) => style.getAttribute('data-liebe-theme'))).toEqual([
      'lcars',
      'stub',
    ])
  })

  it('registers nothing for a theme that bundles no font', () => {
    expect(registerThemeFonts(getTheme('default')!, document)).toBeNull()
    expect(registrations()).toHaveLength(0)
  })

  it('registers nothing when the tree is in no document', () => {
    // `ownerDocument` is `null` for a node that has not been created by a
    // document — the caller's ref before mount. Returning null keeps that a
    // non-event; the next render registers.
    expect(registerThemeFonts(lcars, null)).toBeNull()
    expect(registrations()).toHaveLength(0)
  })
})
