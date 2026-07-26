import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { LiebeThemeProvider } from '../LiebeThemeProvider'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
} from '~/store/cameraFullscreenStore'
import { THEME_STYLE_SLOT } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID, getTheme } from '~/theme/themeRegistry'

const THEME_STYLE_SELECTOR = `style[data-liebe="${THEME_STYLE_SLOT}"]`

function getRootTheme(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-is-root-theme="true"]') as HTMLElement
}

describe('LiebeThemeProvider', () => {
  beforeEach(() => {
    cameraFullscreenStore.setState(() => 0)
  })

  afterEach(() => {
    document.head.querySelectorAll(THEME_STYLE_SELECTOR).forEach((style) => style.remove())
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
      <LiebeThemeProvider appearance="dark" themeId="lcars">
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
    expect(theme.getAttribute('data-liebe-theme')).toBe('lcars')
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

  it('renders an unregistered theme id with the default theme’s CSS', () => {
    // An imported configuration naming a theme this build does not have must
    // still be styled, not fall back to bare base tokens.
    render(
      <LiebeThemeProvider themeId="from-a-newer-liebe">
        <span />
      </LiebeThemeProvider>
    )

    const style = document.head.querySelector(THEME_STYLE_SELECTOR)
    expect(style?.textContent).toBe(getTheme(DEFAULT_THEME_ID)!.css)
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
