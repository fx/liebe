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

  it("keys two panels' mirrors to their own slots and their own containers", () => {
    // `panel_custom` lets the production and dev panels mount side by side in
    // one Home Assistant document. Keyed by slot NAME alone, the last panel to
    // render wins for both — and the mirrored rules match on `.liebe-root`,
    // which both panels' containers carry, so one panel's theme styles the
    // other's overlays (change 0036 PR 7). Both halves have to land together:
    // a slot alone leaves both sheets matching both containers, and a scope
    // alone leaves them overwriting one element.
    const first = shadowRoot()
    const second = shadowRoot()
    const firstChild = document.createElement('div')
    const secondChild = document.createElement('div')
    first.appendChild(firstChild)
    second.appendChild(secondChild)

    applyThemeCssToRootOf(
      firstChild,
      '@layer liebe-theme { :where(.liebe-root) { --liebe-bg: red } }',
      'panel-a'
    )
    applyThemeCssToRootOf(
      secondChild,
      '@layer liebe-theme { :where(.liebe-root) { --liebe-bg: blue } }',
      'panel-b'
    )

    // Two mirror elements, not one rewritten twice: each panel owns its slot.
    const mirrors = [...document.head.querySelectorAll(SLOT_SELECTOR)]
    expect(mirrors).toHaveLength(2)
    const texts = mirrors.map((style) => style.textContent ?? '')
    expect(texts.some((text) => text.includes('--liebe-bg: red'))).toBe(true)
    expect(texts.some((text) => text.includes('--liebe-bg: blue'))).toBe(true)

    // …and each copy is scoped to its own container, so neither sheet matches
    // the other's overlays.
    const red = texts.find((text) => text.includes('--liebe-bg: red')) ?? ''
    const blue = texts.find((text) => text.includes('--liebe-bg: blue')) ?? ''
    expect(red).toContain('.liebe-root[data-liebe-instance="panel-a"]')
    expect(red).not.toContain('panel-b')
    expect(blue).toContain('.liebe-root[data-liebe-instance="panel-b"]')
    expect(blue).not.toContain('panel-a')

    // The in-root sheets stay as authored: that root belongs to exactly one
    // panel, so there is nothing to tell apart in it.
    expect(first.querySelector(SLOT_SELECTOR)?.textContent).toContain(':where(.liebe-root)')
    expect(first.querySelector(SLOT_SELECTOR)?.textContent).not.toContain('data-liebe-instance')
  })

  it("re-renders one panel's mirror without touching the other's", () => {
    const first = shadowRoot()
    const second = shadowRoot()
    const firstChild = document.createElement('div')
    const secondChild = document.createElement('div')
    first.appendChild(firstChild)
    second.appendChild(secondChild)

    applyThemeCssToRootOf(firstChild, '@layer liebe-theme { .a { color: red } }', 'panel-a')
    applyThemeCssToRootOf(secondChild, '@layer liebe-theme { .a { color: blue } }', 'panel-b')
    applyThemeCssToRootOf(firstChild, '@layer liebe-theme { .a { color: green } }', 'panel-a')

    const texts = [...document.head.querySelectorAll(SLOT_SELECTOR)].map(
      (style) => style.textContent ?? ''
    )
    expect(texts).toHaveLength(2)
    expect(texts.some((text) => text.includes('color: green'))).toBe(true)
    expect(texts.some((text) => text.includes('color: blue'))).toBe(true)
  })

  it('keys the :where() root exactly once, however often it re-renders', () => {
    // The bare `.liebe-root` replacement must not run again inside the
    // rewritten `:where(.liebe-root[…])` and stack a second attribute
    // (`:where(.liebe-root[…][…])`) — the selector would still match, but the
    // contract says one key per subject, and a doubled key is the tell that
    // the rewrite is prefix-blind.
    const root = shadowRoot()
    const child = document.createElement('div')
    root.appendChild(child)

    applyThemeCssToRootOf(
      child,
      '@layer liebe-theme { :where(.liebe-root) { --liebe-bg: red } }',
      'panel-a'
    )

    const text = document.head.querySelector(SLOT_SELECTOR)?.textContent ?? ''
    expect(text).toContain(':where(.liebe-root[data-liebe-instance="panel-a"])')
    expect(text).not.toContain('[data-liebe-instance="panel-a"][data-liebe-instance')
    // Re-keying the mirror output is a no-op: no unkeyed subject remains.
    applyThemeCssToRootOf(child, text, 'panel-a')
    expect(document.head.querySelector(SLOT_SELECTOR)?.textContent).toBe(text)
  })

  it('names the per-instance font family in the mirror, and the global one at home', () => {
    // The theme payload names the global family (`--liebe-font-family:
    // 'Antonio', …`) while each panel's `@font-face` registers its own
    // (`fontRegistration.ts`): the mirrored copy must name the instance
    // family, or the overlay resolves the other panel's file.
    const root = shadowRoot()
    const child = document.createElement('div')
    root.appendChild(child)

    applyThemeCssToRootOf(
      child,
      "@layer liebe-theme { :where(.liebe-root) { --liebe-font-family: 'Antonio', sans-serif; } }",
      'panel-a'
    )

    expect(document.head.querySelector(SLOT_SELECTOR)?.textContent).toContain(
      "--liebe-font-family: 'Antonio__panel-a'"
    )
    expect(root.querySelector(SLOT_SELECTOR)?.textContent).toContain(
      "--liebe-font-family: 'Antonio'"
    )
    expect(root.querySelector(SLOT_SELECTOR)?.textContent).not.toContain('Antonio__panel-a')
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

  it("keys the user mirror to one panel's container", () => {
    // The same two-panel setup as the theme mirror above, for the user layer:
    // one panel's custom CSS must not style the other's overlays, and the
    // containment bound still holds — the key narrows WHICH container, never
    // WHAT the selectors may match.
    const first = shadowRoot()
    const second = shadowRoot()
    const firstChild = document.createElement('div')
    const secondChild = document.createElement('div')
    first.appendChild(firstChild)
    second.appendChild(secondChild)

    const firstScoped = SCOPED_USER_CSS.replaceAll(
      '.liebe-portal-root',
      '.liebe-portal-root[data-liebe-instance="panel-a"]'
    )
    const secondScoped = SCOPED_USER_CSS.replaceAll(
      '.liebe-portal-root',
      '.liebe-portal-root[data-liebe-instance="panel-b"]'
    )

    applyUserCssToRootOf(firstChild, HOSTILE_USER_CSS, firstScoped, 'panel-a')
    applyUserCssToRootOf(secondChild, HOSTILE_USER_CSS, secondScoped, 'panel-b')

    const mirrors = [...document.head.querySelectorAll(USER_SLOT_SELECTOR)]
    expect(mirrors).toHaveLength(2)
    const texts = mirrors.map((style) => style.textContent ?? '')
    expect(texts.some((text) => text.includes('panel-a'))).toBe(true)
    expect(texts.some((text) => text.includes('panel-b'))).toBe(true)
    for (const text of texts) {
      expect(text).toContain('display: none')
      expect(text).not.toContain('\nbody {')
    }

    // The in-root sheets stay as authored: the shadow boundary contains them.
    expect(first.querySelector(USER_SLOT_SELECTOR)?.textContent).toBe(HOSTILE_USER_CSS)
  })
})
