import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { LiebeThemeProvider } from '../LiebeThemeProvider'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
} from '~/store/cameraFullscreenStore'
import { FONT_STYLE_SLOT } from '~/theme/fontRegistration'
import { THEME_STYLE_SLOT, USER_STYLE_SLOT } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID, getTheme } from '~/theme/themeRegistry'

const THEME_STYLE_SELECTOR = `style[data-liebe="${THEME_STYLE_SLOT}"]`
const USER_STYLE_SELECTOR = `style[data-liebe="${USER_STYLE_SLOT}"]`
const FONT_STYLE_SELECTOR = `style[data-liebe="${FONT_STYLE_SLOT}"]`

function getRootTheme(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-is-root-theme="true"]') as HTMLElement
}

describe('LiebeThemeProvider', () => {
  beforeEach(() => {
    cameraFullscreenStore.setState(() => 0)
  })

  afterEach(() => {
    document.head
      .querySelectorAll(`${THEME_STYLE_SELECTOR}, ${USER_STYLE_SELECTOR}, ${FONT_STYLE_SELECTOR}`)
      .forEach((style) => style.remove())
  })

  it('renders children inside the root Radix Theme', () => {
    const { container, getByTestId } = render(
      <LiebeThemeProvider>
        <span data-testid="child" />
      </LiebeThemeProvider>
    )

    expect(getRootTheme(container)).toBeInTheDocument()
    expect(getByTestId('child')).toBeInTheDocument()
  })

  it('leaves the appearance to the surrounding document when none is given', () => {
    const { container } = render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )

    // Radix stamps the resolved appearance as a class; with no explicit
    // appearance the panel inherits, so neither class is forced.
    const theme = getRootTheme(container)
    expect(theme.classList.contains('dark')).toBe(false)
    expect(theme.classList.contains('light')).toBe(false)
  })

  it('applies an explicit appearance to the root Theme', () => {
    const { container } = render(
      <LiebeThemeProvider appearance="light">
        <span />
      </LiebeThemeProvider>
    )

    expect(getRootTheme(container).classList.contains('light')).toBe(true)
  })

  it('stamps the theming contract on the element the tokens are declared on', () => {
    const { container } = render(
      <LiebeThemeProvider appearance="dark" themeId={DEFAULT_THEME_ID}>
        <span />
      </LiebeThemeProvider>
    )

    // The stamps and the `--liebe-*` declarations have to meet on one element:
    // a derived companion only re-derives where its base is overridden on the
    // same element, so a theme rule keyed off a stamp anywhere else would leave
    // tint and text behind on the old hue.
    const theme = getRootTheme(container)
    expect(theme.classList.contains('radix-themes')).toBe(true)
    expect(theme.classList.contains('liebe-root')).toBe(true)
    expect(theme.getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
    expect(theme.getAttribute('data-appearance')).toBe('dark')
  })

  it('claims no appearance when none is given', () => {
    const { container } = render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )

    const theme = getRootTheme(container)
    expect(theme.hasAttribute('data-appearance')).toBe(false)
    expect(theme.getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
  })

  it('injects the active theme as the theme layer of its root', () => {
    render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )

    const style = document.head.querySelector(THEME_STYLE_SELECTOR)
    expect(style?.textContent).toBe(getTheme(DEFAULT_THEME_ID)!.css)
  })

  it('renders an unregistered theme id as the default theme', () => {
    // An imported configuration naming a theme this build does not have must
    // still be styled, not fall back to bare base tokens — and must not stamp
    // a theme nothing is rendering.
    const { container } = render(
      <LiebeThemeProvider themeId="from-a-newer-liebe">
        <span />
      </LiebeThemeProvider>
    )

    const style = document.head.querySelector(THEME_STYLE_SELECTOR)
    expect(style?.textContent).toBe(getTheme(DEFAULT_THEME_ID)!.css)
    expect(getRootTheme(container).getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
  })

  it('registers a bundled typeface at the document level', () => {
    // The theme layer goes into the tree's own root — a shadow root in the
    // panel — and a shadow root does not load `@font-face` declared inside it.
    // So the face has to be registered in the owning document instead, which is
    // the provider's job because it is the only place that knows both which
    // theme is active and which document the tree is in.
    const { rerender } = render(
      <LiebeThemeProvider themeId={DEFAULT_THEME_ID}>
        <span />
      </LiebeThemeProvider>
    )

    // The Default theme bundles nothing, so nothing is registered for it.
    expect(document.head.querySelector(FONT_STYLE_SELECTOR)).toBeNull()

    rerender(
      <LiebeThemeProvider themeId="lcars">
        <span />
      </LiebeThemeProvider>
    )

    const registration = document.head.querySelector(FONT_STYLE_SELECTOR)
    expect(registration?.getAttribute('data-liebe-theme')).toBe('lcars')
    expect(registration?.textContent).toContain('Antonio')

    // Switching away leaves it: an unused face costs nothing, while removing
    // and re-adding one would drop the loaded font and fetch it again.
    rerender(
      <LiebeThemeProvider themeId={DEFAULT_THEME_ID}>
        <span />
      </LiebeThemeProvider>
    )
    expect(document.head.querySelectorAll(FONT_STYLE_SELECTOR)).toHaveLength(1)
  })

  it('injects sanitized custom CSS as the user layer', () => {
    const { rerender } = render(
      <LiebeThemeProvider customCss=".liebe-card { --liebe-card-radius: 0; }">
        <span />
      </LiebeThemeProvider>
    )

    const style = document.head.querySelector(USER_STYLE_SELECTOR)
    expect(style?.textContent).toContain('@layer liebe-user {')
    expect(style?.textContent).toContain('--liebe-card-radius: 0')

    // Editing applies live, without a reload.
    rerender(
      <LiebeThemeProvider customCss=".liebe-card { --liebe-card-radius: 24px; }">
        <span />
      </LiebeThemeProvider>
    )
    expect(document.head.querySelector(USER_STYLE_SELECTOR)?.textContent).toContain('24px')
  })

  it('strips a remote reference before it reaches the DOM', () => {
    // The sanitizer runs HERE, not in the editor: imported YAML applies its
    // custom CSS immediately, so a warning would arrive after the request.
    render(
      <LiebeThemeProvider customCss=".liebe-card { background: url(https://evil.example/p.png); }">
        <span />
      </LiebeThemeProvider>
    )

    expect(document.head.querySelector(USER_STYLE_SELECTOR)?.textContent).not.toContain(
      'evil.example'
    )
  })

  it('keeps the last good user CSS when the new input cannot be parsed', () => {
    const { rerender } = render(
      <LiebeThemeProvider customCss=".liebe-card { --liebe-card-radius: 0; }">
        <span />
      </LiebeThemeProvider>
    )

    // A half-typed rule in the editor must not strip the styling the dashboard
    // is already wearing.
    rerender(
      <LiebeThemeProvider customCss="} .liebe-card { --liebe-card-radius: 99px } /*">
        <span />
      </LiebeThemeProvider>
    )

    const css = document.head.querySelector(USER_STYLE_SELECTOR)?.textContent
    expect(css).toContain('--liebe-card-radius: 0')
    expect(css).not.toContain('99px')
  })

  it('mounts the portal container at the document level, stamped like the root', () => {
    // The container is where every overlay lands, and a theme's scoped rules
    // have to select it exactly as they select the dashboard — including the
    // appearance, since the token sheets declare a dark block keyed off it.
    // Stamped from the theme that ACTUALLY rendered: an unregistered id falls
    // back to Default here as it does on the root.
    const { container } = render(
      <LiebeThemeProvider appearance="dark" themeId="from-a-newer-liebe">
        <span />
      </LiebeThemeProvider>
    )

    const portalRoot = document.querySelector('.liebe-portal-root') as HTMLElement
    expect(portalRoot.parentElement).toBe(document.body)
    expect(portalRoot.classList.contains('liebe-root')).toBe(true)
    expect(portalRoot.getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
    expect(portalRoot.getAttribute('data-appearance')).toBe('dark')
    expect(portalRoot.classList.contains('dark')).toBe(true)

    // Outside the provider's own subtree, and not the root theme — a second
    // root theme would bring Radix's `position: relative; z-index: 0` with it.
    expect(container.contains(portalRoot)).toBe(false)
    expect(portalRoot.getAttribute('data-is-root-theme')).toBe('false')
  })

  it('lifts the root Theme stacking while a camera overlay is open', () => {
    const { container } = render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )
    const theme = getRootTheme(container)

    expect(theme.style.zIndex).toBe('')

    act(() => enterCameraFullscreen())
    expect(theme.style.position).toBe('relative')
    expect(theme.style.zIndex).toBe('99999')

    act(() => exitCameraFullscreen())
    expect(theme.style.zIndex).toBe('')
  })
})
