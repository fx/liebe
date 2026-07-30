import { afterEach, describe, expect, it } from 'vitest'
import { LAYER_ORDER_STATEMENT, THEME_LAYER } from '../cssLayers'
import {
  applyThemeCss,
  applyThemeCssToRootOf,
  applyUserCss,
  applyUserCssToRootOf,
  isStyleRoot,
  THEME_STYLE_SLOT,
  USER_STYLE_SLOT,
} from '../styleInjection'

const SLOT_SELECTOR = `style[data-liebe="${THEME_STYLE_SLOT}"]`
const USER_SLOT_SELECTOR = `style[data-liebe="${USER_STYLE_SLOT}"]`

function shadowRoot(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

afterEach(() => {
  document.head
    .querySelectorAll(`${SLOT_SELECTOR}, ${USER_SLOT_SELECTOR}`)
    .forEach((style) => style.remove())
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

describe('applyUserCss', () => {
  const SANITIZED = `${LAYER_ORDER_STATEMENT}\n@layer liebe-user {\n.a { color: red }\n}\n`
  // The same sheet as `sanitizeCustomCss` rewrites it for the document — the
  // shape, not the exact text, which `customCss.test.ts` owns.
  const SCOPED = `${LAYER_ORDER_STATEMENT}\n@layer liebe-user {\n.liebe-portal-root:is(.a), .liebe-portal-root :is(.a) { color: red }\n}\n`

  it('injects the user layer into its own slot, beside the theme layer', () => {
    const root = shadowRoot()

    applyThemeCss(root, '@layer liebe-theme { .a { color: blue } }')
    applyUserCss(root, SANITIZED)

    // Separate elements: a theme switch rewrites one without touching the
    // other, and the user layer outranks whatever the theme just became.
    expect(root.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SANITIZED)
    expect(root.querySelector(SLOT_SELECTOR)?.textContent).toContain('color: blue')
  })

  it('applies exactly what the sanitizer produced', () => {
    const root = shadowRoot()

    applyUserCss(root, SANITIZED)

    // Nothing here re-wraps or repairs: the sanitizer already serialised its
    // AST inside the layer, and this module is not the one that decides what
    // may be injected as user CSS.
    expect(root.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SANITIZED)
  })

  it('clears the layer when there is nothing to apply', () => {
    const root = shadowRoot()

    applyUserCss(root, SANITIZED)
    applyUserCss(root, '')

    expect(root.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe('')
  })

  it('sends the scoped sheet outward and the authored one inward', () => {
    const root = shadowRoot()
    const child = document.createElement('div')
    root.appendChild(child)

    const style = applyUserCssToRootOf(child, SANITIZED, SCOPED)

    // The two roots get different text, which is the whole reason this takes
    // two sheets: the shadow root contains what the user wrote, and only the
    // rewritten copy is allowed into the document Home Assistant owns.
    expect(style?.parentNode).toBe(root)
    expect(root.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SANITIZED)
    expect(document.head.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SCOPED)
  })

  it('mirrors nothing from a document root, which has no boundary to cross', () => {
    // The workshop and unit tests: the document IS the panel's root, so the
    // authored sheet applies there and the scoped copy would be a second sheet
    // saying the same thing about the same elements.
    const style = applyUserCssToRootOf(document.body, SANITIZED, SCOPED)

    expect(style?.parentNode).toBe(document.head)
    expect(document.head.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SANITIZED)
  })

  it('does nothing for a node that is in no root yet', () => {
    expect(applyUserCssToRootOf(document.createElement('div'), SANITIZED, SCOPED)).toBeNull()
    expect(document.head.querySelector(USER_SLOT_SELECTOR)).toBeNull()
  })
})

describe('the mirror boundary', () => {
  const THEME_CSS = '@layer liebe-theme { .liebe-root { color: red } }'
  // What a hostile — or merely careless — imported configuration can carry: a
  // selector that matches nothing in Liebe and everything around it. The
  // sanitizer judges what a declaration may *fetch*, not what it may *match*,
  // so this survives sanitization intact and is exactly what must never reach
  // the Home Assistant document.
  const HOSTILE_USER_CSS = `${LAYER_ORDER_STATEMENT}\n@layer liebe-user {\nbody { display: none }\n}\n`
  // …and the same rule as the sanitizer rewrites it: still `display: none`, and
  // now on a subject that can only be the container or something in it.
  const SCOPED_USER_CSS = `${LAYER_ORDER_STATEMENT}\n@layer liebe-user {\n.liebe-portal-root:is(body), .liebe-portal-root :is(body) { display: none }\n}\n`

  it('mirrors the theme layer as authored, and the user layer only as rewritten', () => {
    const root = shadowRoot()
    const child = document.createElement('div')
    root.appendChild(child)

    applyThemeCssToRootOf(child, THEME_CSS)
    applyUserCssToRootOf(child, HOSTILE_USER_CSS, SCOPED_USER_CSS)

    // Theme CSS is first-party and scoped to `.liebe-root`, so the copy in the
    // owning document only ever reaches Liebe's own portalled overlays.
    expect(root.querySelector(SLOT_SELECTOR)?.textContent).toContain('color: red')
    expect(document.head.querySelector(SLOT_SELECTOR)?.textContent).toContain('color: red')

    // The user's own `body` selector reaches the whole shadow root, where the
    // boundary contains it, and reaches the document only bounded by the portal
    // container — where `body` can never be the subject, so it matches nothing.
    expect(root.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(HOSTILE_USER_CSS)
    expect(document.head.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(SCOPED_USER_CSS)
    expect(document.head.textContent).not.toContain('\nbody {')
  })
})
