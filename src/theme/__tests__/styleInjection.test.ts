import { afterEach, describe, expect, it } from 'vitest'
import { LAYER_ORDER_STATEMENT, THEME_LAYER } from '../cssLayers'
import {
  applyThemeCss,
  applyThemeCssToRootOf,
  isStyleRoot,
  THEME_STYLE_SLOT,
} from '../styleInjection'

const SLOT_SELECTOR = `style[data-liebe="${THEME_STYLE_SLOT}"]`

function shadowRoot(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

afterEach(() => {
  document.head.querySelectorAll(SLOT_SELECTOR).forEach((style) => style.remove())
  document.body.replaceChildren()
})

describe('isStyleRoot', () => {
  it('accepts the roots a Liebe tree can be mounted in', () => {
    expect(isStyleRoot(document)).toBe(true)
    expect(isStyleRoot(shadowRoot())).toBe(true)
  })

  it('rejects anything else', () => {
    // What `getRootNode()` returns for a detached tree — there is nowhere to
    // inject a theme, and the panel must not throw over it.
    expect(isStyleRoot(document.createElement('div'))).toBe(false)
    expect(isStyleRoot(null)).toBe(false)
  })
})

describe('applyThemeCss', () => {
  it('injects the theme layer into a shadow root', () => {
    const root = shadowRoot()

    applyThemeCss(root, '@layer liebe-theme { .a { color: red } }')

    const style = root.querySelector(SLOT_SELECTOR)
    expect(style?.parentNode).toBe(root)
    expect(style?.textContent).toContain('@layer liebe-theme { .a { color: red } }')
  })

  it('injects into the head of a document root', () => {
    applyThemeCss(document, '@layer liebe-theme { .a { color: red } }')

    expect(document.head.querySelector(SLOT_SELECTOR)).not.toBeNull()
  })

  it('rewrites the same element on a theme switch', () => {
    const root = shadowRoot()

    const first = applyThemeCss(root, '@layer liebe-theme { .a { color: red } }')
    const second = applyThemeCss(root, '@layer liebe-theme { .a { color: blue } }')

    // Stacking sheets would make precedence depend on insertion order, and
    // would leave the outgoing theme's rules in the root.
    expect(second).toBe(first)
    expect(root.querySelectorAll(SLOT_SELECTOR)).toHaveLength(1)
    expect(first.textContent).toContain('color: blue')
    expect(first.textContent).not.toContain('color: red')
  })

  it('leaves the element alone when the CSS has not changed', () => {
    const root = shadowRoot()
    const css = '@layer liebe-theme { .a { color: red } }'

    const style = applyThemeCss(root, css)
    const before = style.textContent
    applyThemeCss(root, css)

    expect(style.textContent).toBe(before)
  })

  it('finds the root of a node inside a shadow tree, and mirrors it for portals', () => {
    const root = shadowRoot()
    const child = document.createElement('div')
    root.appendChild(child)

    const style = applyThemeCssToRootOf(child, '@layer liebe-theme { .a { color: red } }')

    expect(style?.parentNode).toBe(root)
    // Radix dialogs portal to `document.body`, outside the shadow root and its
    // layers; without the mirror they would render off the active palette.
    expect(document.head.querySelector(SLOT_SELECTOR)?.textContent).toBe(style?.textContent)
  })

  it('does not mirror when the tree already lives in the document', () => {
    const child = document.createElement('div')
    document.body.appendChild(child)

    applyThemeCssToRootOf(child, '@layer liebe-theme { .a { color: red } }')

    expect(document.head.querySelectorAll(SLOT_SELECTOR)).toHaveLength(1)
  })

  it('does nothing for a node that is in no root yet', () => {
    // A tree rendered into a detached container, or one mid-mount: there is
    // nowhere to hold a stylesheet, and that must not throw.
    expect(applyThemeCssToRootOf(document.createElement('div'), '.a {}')).toBeNull()
    expect(applyThemeCssToRootOf(null, '.a {}')).toBeNull()
    expect(document.head.querySelector(SLOT_SELECTOR)).toBeNull()
  })

  it('layers a theme payload that forgot its own layer', () => {
    const root = shadowRoot()

    applyThemeCss(root, '.a { color: red }')

    const css = root.querySelector(SLOT_SELECTOR)?.textContent ?? ''
    expect(css).toContain(LAYER_ORDER_STATEMENT)
    expect(css).toContain(`@layer ${THEME_LAYER} {`)
  })
})
